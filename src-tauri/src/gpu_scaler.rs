use image::RgbaImage;
use rayon::prelude::*;
use std::sync::OnceLock;

// ── Shared wgpu Instance (singleton) ──────────────────────────────────
// Must be shared between detect_gpus and create_engine_for_gpu so
// adapter enumeration order is IDENTICAL on both calls.
fn get_instance() -> &'static wgpu::Instance {
    static INSTANCE: OnceLock<wgpu::Instance> = OnceLock::new();
    INSTANCE.get_or_init(|| wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: wgpu::Backends::all(),
        ..Default::default()
    }))
}

// ── WGSL Lanczos compute shader ─────────────────────────────────────
const LANCZOS_SHADER: &str = r#"
struct Params {
    src_w: u32,
    src_h: u32,
    dst_w: u32,
    dst_h: u32,
    scale_x: f32,
    scale_y: f32,
};

@group(0) @binding(0) var<storage, read> input_data: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> output_data: array<vec4<f32>>;
@group(0) @binding(2) var<uniform> params: Params;

fn lanczos(x: f32, a: f32) -> f32 {
    if (x == 0.0) { return 1.0; }
    if (abs(x) >= a) { return 0.0; }
    let pi = 3.14159265358979323846;
    let pix = pi * x;
    return a * sin(pix) * sin(pix / a) / (pix * pix);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let dx = id.x;
    let dy = id.y;

    if (dx >= params.dst_w || dy >= params.dst_h) {
        return;
    }

    let src_x = (f32(dx) + 0.5) * params.scale_x - 0.5;
    let src_y = (f32(dy) + 0.5) * params.scale_y - 0.5;

    let a = 3.0;
    let sx_start = i32(floor(src_x - a + 1.0));
    let sx_end = i32(ceil(src_x + a));
    let sy_start = i32(floor(src_y - a + 1.0));
    let sy_end = i32(ceil(src_y + a));

    var r: f32 = 0.0;
    var g: f32 = 0.0;
    var b: f32 = 0.0;
    var a_ch: f32 = 0.0;
    var total_weight: f32 = 0.0;

    for (var sy = sy_start; sy < sy_end; sy++) {
        if (sy < 0 || sy >= i32(params.src_h)) { continue; }
        let wy = lanczos(f32(sy) - src_y, a);
        let row_offset = u32(sy) * params.src_w;

        for (var sx = sx_start; sx < sx_end; sx++) {
            if (sx < 0 || sx >= i32(params.src_w)) { continue; }
            let wx = lanczos(f32(sx) - src_x, a);
            let w = wx * wy;

            let input_idx = row_offset + u32(sx);
            let pixel = input_data[input_idx];

            r += pixel.x * w;
            g += pixel.y * w;
            b += pixel.z * w;
            a_ch += pixel.w * w;
            total_weight += w;
        }
    }

    if (total_weight > 0.0) {
        let inv = 1.0 / total_weight;
        let output_idx = dy * params.dst_w + dx;
        output_data[output_idx] = vec4<f32>(
            clamp(r * inv, 0.0, 255.0),
            clamp(g * inv, 0.0, 255.0),
            clamp(b * inv, 0.0, 255.0),
            clamp(a_ch * inv, 0.0, 255.0),
        );
    }
}
"#;

// ── GPU info for frontend ────────────────────────────────────────────
#[derive(serde::Serialize, Clone, Debug)]
pub struct GpuInfo {
    pub name: String,
    pub device_type: String,
    pub index: usize,
    pub available: bool,
}

pub fn detect_gpus() -> Vec<GpuInfo> {
    let instance = get_instance();
    let adapters = instance.enumerate_adapters(wgpu::Backends::all());
    if adapters.is_empty() {
        return vec![];
    }

    let mut seen = std::collections::HashSet::new();
    adapters
        .into_iter()
        .enumerate()
        .filter_map(|(i, adapter)| {
            let info = adapter.get_info();
            // Skip duplicates: same GPU exposed by different backends (DX12, Vulkan, etc.)
            if !seen.insert(info.name.clone()) {
                return None;
            }
            let dtype = match info.device_type {
                wgpu::DeviceType::DiscreteGpu => "Dedicada",
                wgpu::DeviceType::IntegratedGpu => "Integrada",
                wgpu::DeviceType::Cpu => "CPU",
                wgpu::DeviceType::VirtualGpu => "Virtual",
                _ => "Otra",
            };
            Some(GpuInfo {
                name: info.name,
                device_type: dtype.to_string(),
                index: i,
                available: true,
            })
        })
        .collect()
}

/// Pick the best GPU automatically: discrete > integrated > CPU
/// Returns -1 if no suitable GPU found.
pub fn auto_select_gpu(gpus: &[GpuInfo]) -> i32 {
    gpus.iter()
        .find(|g| g.device_type == "Dedicada")
        .or_else(|| gpus.iter().find(|g| g.device_type == "Integrada"))
        .map(|g| g.index as i32)
        .unwrap_or(-1)
}

// ── Per-GPU engine (created fresh per call) ─────────────────────────
#[repr(C)]
struct Params {
    src_w: u32,
    src_h: u32,
    dst_w: u32,
    dst_h: u32,
    scale_x: f32,
    scale_y: f32,
}

struct GpuEngine {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,
}

fn create_engine_for_gpu(gpu_index: usize) -> Result<GpuEngine, String> {
    // Use the SAME instance as detect_gpus so adapter order is identical
    let instance = get_instance();

    let adapters: Vec<_> = instance.enumerate_adapters(wgpu::Backends::all());
    let adapter = adapters.into_iter().nth(gpu_index).ok_or_else(|| {
        format!("GPU índice {} no encontrada", gpu_index)
    })?;

    let info = adapter.get_info();
    println!(
        "[gpu_scaler] Usando GPU #{}: {} (tipo: {:?})",
        gpu_index, info.name, info.device_type
    );

    let (device, queue) = pollster::block_on(adapter.request_device(
        &wgpu::DeviceDescriptor {
            label: Some("TOOLS-33 GPU Scaler"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::default(),
        },
        None,
    ))
    .map_err(|e| format!("Error al crear dispositivo GPU: {}", e))?;

    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("lanczos compute"),
        source: wgpu::ShaderSource::Wgsl(LANCZOS_SHADER.into()),
    });

    let bind_group_layout =
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("lanczos bind group layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

    let pipeline_layout =
        device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("lanczos pipeline layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

    let pipeline =
        device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("lanczos compute pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: "main",
            compilation_options: wgpu::PipelineCompilationOptions::default(),
        });

    Ok(GpuEngine {
        device,
        queue,
        pipeline,
        bind_group_layout,
    })
}

// ── GPU Lanczos resize ──────────────────────────────────────────────
pub fn resize_lanczos_gpu(
    src: &RgbaImage,
    dst_w: u32,
    dst_h: u32,
    gpu_index: usize,
) -> Result<RgbaImage, String> {
    let engine = create_engine_for_gpu(gpu_index)?;

    let src_w = src.width();
    let src_h = src.height();
    let src_pixels = (src_w * src_h) as usize;
    let dst_pixels = (dst_w * dst_h) as usize;
    let dst_bytes = dst_pixels * 4;

    // Convert u8 RGBA → f32 RGBA for GPU
    let mut src_f32 = vec![0f32; src_pixels * 4];
    let src_raw = src.as_raw();
    src_f32
        .par_chunks_exact_mut(4)
        .enumerate()
        .for_each(|(i, pixel)| {
            let si = i * 4;
            pixel[0] = src_raw[si] as f32;
            pixel[1] = src_raw[si + 1] as f32;
            pixel[2] = src_raw[si + 2] as f32;
            pixel[3] = src_raw[si + 3] as f32;
        });

    let input_size = (src_f32.len() * 4) as wgpu::BufferAddress;
    let output_size = (dst_bytes * 4) as wgpu::BufferAddress;

    // Create GPU buffers
    let input_buffer = engine.device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("input pixels"),
        size: input_size,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    let output_buffer = engine.device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("output pixels"),
        size: output_size,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
        mapped_at_creation: false,
    });

    let staging_buffer = engine.device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("staging"),
        size: output_size,
        usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    let params = Params {
        src_w,
        src_h,
        dst_w,
        dst_h,
        scale_x: src_w as f32 / dst_w as f32,
        scale_y: src_h as f32 / dst_h as f32,
    };

    let params_bytes = unsafe {
        std::slice::from_raw_parts(
            &params as *const Params as *const u8,
            std::mem::size_of::<Params>(),
        )
    };

    let params_buffer = engine.device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("params"),
        size: params_bytes.len() as wgpu::BufferAddress,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    // Upload data to GPU
    let src_f32_bytes = unsafe {
        std::slice::from_raw_parts(
            src_f32.as_ptr() as *const u8,
            src_f32.len() * 4,
        )
    };
    engine.queue.write_buffer(&input_buffer, 0, src_f32_bytes);
    engine.queue.write_buffer(&params_buffer, 0, params_bytes);

    // Create bind group
    let bind_group = engine.device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("lanczos bind group"),
        layout: &engine.bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: input_buffer.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: output_buffer.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: params_buffer.as_entire_binding(),
            },
        ],
    });

    // Dispatch compute
    let mut encoder = engine
        .device
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("lanczos encoder"),
        });

    {
        let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("lanczos pass"),
            timestamp_writes: None,
        });
        pass.set_pipeline(&engine.pipeline);
        pass.set_bind_group(0, &bind_group, &[]);
        let dispatch_x = (dst_w + 15) / 16;
        let dispatch_y = (dst_h + 15) / 16;
        pass.dispatch_workgroups(dispatch_x, dispatch_y, 1);
    }

    encoder.copy_buffer_to_buffer(&output_buffer, 0, &staging_buffer, 0, output_size);
    engine.queue.submit(Some(encoder.finish()));

    // Read back
    let buffer_slice = staging_buffer.slice(..);
    buffer_slice.map_async(wgpu::MapMode::Read, |_| {});
    engine.device.poll(wgpu::Maintain::Wait);

    let mapped = buffer_slice.get_mapped_range();
    let f32_data: &[f32] = unsafe {
        std::slice::from_raw_parts(mapped.as_ptr() as *const f32, mapped.len() / 4)
    };
    let f32_len = f32_data.len();
    drop(mapped);
    staging_buffer.unmap();

    // Convert f32 → u8 (parallel)
    let mut dst_buf = vec![0u8; dst_bytes];
    dst_buf
        .par_chunks_exact_mut(4)
        .enumerate()
        .for_each(|(i, pixel)| {
            let fi = i * 4;
            if fi + 3 < f32_len {
                pixel[0] = f32_data[fi].round().clamp(0.0, 255.0) as u8;
                pixel[1] = f32_data[fi + 1].round().clamp(0.0, 255.0) as u8;
                pixel[2] = f32_data[fi + 2].round().clamp(0.0, 255.0) as u8;
                pixel[3] = f32_data[fi + 3].round().clamp(0.0, 255.0) as u8;
            }
        });

    Ok(RgbaImage::from_raw(dst_w, dst_h, dst_buf).unwrap())
}
