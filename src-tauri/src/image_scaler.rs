use image::RgbaImage;
use rayon::prelude::*;
use std::io::BufWriter;
use tauri::Emitter;
use base64::Engine;

use super::gpu_scaler;

const LANCZOS_A: f64 = 3.0;

// ── Safety limits to prevent OOM ─────────────────────────────────────
const MAX_INPUT_BYTES: u64 = 300 * 1024 * 1024;   // 300 MB (base64 payload)
const MAX_SOURCE_PIXELS: u64 = 100_000_000;       // 100 MP (~10000×10000)
const MAX_TARGET_PIXELS: u64 = 100_000_000;       // 100 MP (prevents insane upscales)
const MAX_DIMENSION: u32 = 16_000;                 // 16000px any side

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleInput {
    pub image_data: String,
    pub method: String,
    pub scale_factor: f64,
    pub target_width: u32,
    pub target_height: u32,
    pub target_dpi: u32,
    pub sharpen_amount: f64,
    pub gpu_index: i32,
}

#[tauri::command]
pub async fn scale_image(
    input: ScaleInput,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    // ── 1. Validate base64 payload size ─────────────────────────────
    let base64_str = if let Some(pos) = input.image_data.find(',') {
        &input.image_data[pos + 1..]
    } else {
        &input.image_data
    };

    let input_len = base64_str.len() as u64;
    if input_len > MAX_INPUT_BYTES {
        return Err(format!(
            "La imagen es demasiado grande ({} MB). Máximo permitido: {} MB.",
            input_len / (1024 * 1024),
            MAX_INPUT_BYTES / (1024 * 1024),
        ));
    }

    let _ = app_handle.emit("scale-progress", 5u8);

    // ── 2. Decode base64 ────────────────────────────────────────────
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_str)
        .map_err(|e| format!("Error al decodificar la imagen: datos corruptos ({})", e))?;

    let _ = app_handle.emit("scale-progress", 10u8);

    // ── 3. Validate & decode image ──────────────────────────────────
    let img = image::load_from_memory(&bytes).map_err(|e| {
        format!("No se pudo leer la imagen. Formato no soportado o archivo corrupto: {}", e)
    })?;

    let (src_w, src_h) = (img.width(), img.height());
    let src_pixels = src_w as u64 * src_h as u64;

    if src_w > MAX_DIMENSION || src_h > MAX_DIMENSION {
        return Err(format!(
            "La imagen mide {}×{}px. La dimensión máxima permitida es {}px.",
            src_w, src_h, MAX_DIMENSION,
        ));
    }

    if src_pixels > MAX_SOURCE_PIXELS {
        return Err(format!(
            "La imagen tiene {:.1} megapíxeles. Máximo permitido: {} MP.",
            src_pixels as f64 / 1_000_000.0,
            MAX_SOURCE_PIXELS / 1_000_000,
        ));
    }

    let rgba = img.to_rgba8();

    let _ = app_handle.emit("scale-progress", 15u8);

    // ── 4. Calculate & validate target dimensions ───────────────────
    let (dst_w, dst_h) = if input.target_width > 0 && input.target_height > 0 {
        (input.target_width, input.target_height)
    } else {
        let w = (rgba.width() as f64 * input.scale_factor).round() as u32;
        let h = (rgba.height() as f64 * input.scale_factor).round() as u32;
        (w.max(1), h.max(1))
    };

    if dst_w > MAX_DIMENSION || dst_h > MAX_DIMENSION {
        return Err(format!(
            "La imagen de salida mediría {}×{}px. La dimensión máxima permitida es {}px. Reduce el factor de escala o usa dimensiones personalizadas más pequeñas.",
            dst_w, dst_h, MAX_DIMENSION,
        ));
    }

    let dst_pixels = dst_w as u64 * dst_h as u64;
    if dst_pixels > MAX_TARGET_PIXELS {
        return Err(format!(
            "La imagen de salida ocuparía {:.1} megapíxeles. Máximo: {} MP. Reduce el factor de escala o las dimensiones.",
            dst_pixels as f64 / 1_000_000.0,
            MAX_TARGET_PIXELS / 1_000_000,
        ));
    }

    // ── 5. Estimate total memory and warn if risky ──────────────────
    let estimated_mib = (src_pixels as u64 * 4 + dst_pixels as u64 * 4 * 2) / (1024 * 1024);
    if estimated_mib > 2048 {
        let _ = app_handle.emit("scale-progress", 15u8);
        // Continue anyway, the user has a powerful machine
    }

    let _ = app_handle.emit("scale-progress", 20u8);

    // ── 6. Resolve GPU selection (-2 = auto, -1 = CPU, 0+ = specific GPU)
    let resolved_gpu: i32 = if input.gpu_index == -2 {
        let gpus = gpu_scaler::detect_gpus();
        gpu_scaler::auto_select_gpu(&gpus)
    } else {
        input.gpu_index
    };

    let use_gpu = resolved_gpu >= 0;
    if use_gpu {
        let gpus = gpu_scaler::detect_gpus();
        let name = gpus.iter().find(|g| g.index == resolved_gpu as usize)
            .map(|g| g.name.clone())
            .unwrap_or_else(|| format!("GPU {}", resolved_gpu));
        println!("[image_scaler] Escalando con GPU: {} (índice: {})", name, resolved_gpu);
    } else {
        println!("[image_scaler] Escalando con CPU (rayon)");
    }

    let final_img = process_with_catch_unwind(
        input.method.as_str(),
        &rgba,
        dst_w,
        dst_h,
        input.sharpen_amount as f32,
        use_gpu,
        resolved_gpu,
        &app_handle,
    )?;

    let _ = app_handle.emit("scale-progress", 85u8);

    // ── 7. Encode PNG with DPI ──────────────────────────────────────
    let png_bytes = encode_png_with_dpi(&final_img, input.target_dpi)
        .map_err(|e| format!("Error al codificar PNG: {}", e))?;

    let _ = app_handle.emit("scale-progress", 95u8);

    // ── 8. Return base64 ────────────────────────────────────────────
    let result = base64::engine::general_purpose::STANDARD.encode(&png_bytes);

    let _ = app_handle.emit("scale-progress", 100u8);

    Ok(result)
}

/// Wraps the heavy processing in catch_unwind to prevent OOM panics
/// from crashing the app.
fn process_with_catch_unwind(
    method: &str,
    rgba: &RgbaImage,
    dst_w: u32,
    dst_h: u32,
    sharpen_amount: f32,
    use_gpu: bool,
    gpu_index: i32,
    app_handle: &tauri::AppHandle,
) -> Result<RgbaImage, String> {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        run_processing(method, rgba, dst_w, dst_h, sharpen_amount, use_gpu, gpu_index, app_handle)
    }));

    match result {
        Ok(Ok(img)) => Ok(img),
        Ok(Err(e)) => Err(e),
        Err(panic) => {
            let msg = if let Some(s) = panic.downcast_ref::<String>() {
                format!("Error crítico: {}", s)
            } else if let Some(s) = panic.downcast_ref::<&str>() {
                format!("Error crítico: {}", s)
            } else {
                "Memoria insuficiente: la imagen es demasiado grande para procesar con los recursos disponibles.".to_string()
            };
            Err(msg)
        }
    }
}

fn run_processing(
    method: &str,
    rgba: &RgbaImage,
    dst_w: u32,
    dst_h: u32,
    sharpen_amount: f32,
    use_gpu: bool,
    gpu_index: i32,
    app_handle: &tauri::AppHandle,
) -> Result<RgbaImage, String> {
    // GPU path (only for Lanczos methods, bicubic/bilinear/nearest stay on CPU)
    let is_lanczos = matches!(method, "lanczos-sharp" | "lanczos");

    let resized = if use_gpu && is_lanczos {
        match gpu_scaler::resize_lanczos_gpu(rgba, dst_w, dst_h, gpu_index as usize) {
            Ok(img) => {
                println!("GPU resize successful ({}x{} -> {}x{})", rgba.width(), rgba.height(), dst_w, dst_h);
                img
            }
            Err(e) => {
                println!("GPU resize failed, falling back to CPU: {}", e);
                let _ = app_handle.emit("scale-progress", 40u8);
                resize_lanczos_parallel(rgba, dst_w, dst_h)
            }
        }
    } else {
        match method {
            "lanczos-sharp" | "lanczos" => resize_lanczos_parallel(rgba, dst_w, dst_h),
            "bicubic" => image::imageops::resize(rgba, dst_w, dst_h, image::imageops::FilterType::CatmullRom),
            "bilinear" => image::imageops::resize(rgba, dst_w, dst_h, image::imageops::FilterType::Triangle),
            "nearest" => image::imageops::resize(rgba, dst_w, dst_h, image::imageops::FilterType::Nearest),
            _ => return Err(format!("Método desconocido: {}", method)),
        }
    };

    let _ = app_handle.emit("scale-progress", 60u8);

    let final_img = match method {
        "lanczos-sharp" => {
            let sharpened = unsharp_mask_parallel(&resized, sharpen_amount, 1, 5);
            let _ = app_handle.emit("scale-progress", 75u8);
            sharpen_parallel(&sharpened, 0.5)
        }
        "lanczos" => unsharp_mask_parallel(&resized, 0.8, 1, 10),
        _ => resized,
    };

    Ok(final_img)
}

// ── Parallel Lanczos Resize ──────────────────────────────────────────

fn lanczos_kernel(x: f64) -> f64 {
    if x == 0.0 {
        return 1.0;
    }
    let ax = x.abs();
    if ax >= LANCZOS_A {
        return 0.0;
    }
    let pix = std::f64::consts::PI * x;
    LANCZOS_A * pix.sin() * (pix / LANCZOS_A).sin() / (pix * pix)
}

fn resize_lanczos_parallel(src: &RgbaImage, dst_w: u32, dst_h: u32) -> RgbaImage {
    let (src_w, src_h) = (src.width() as f64, src.height() as f64);
    let scale_x = src_w / dst_w as f64;
    let scale_y = src_h / dst_h as f64;
    let src_raw = src.as_raw();
    let src_w_usize = src.width() as usize;
    let a = LANCZOS_A;
    let dst_row_bytes = (dst_w * 4) as usize;

    let mut dst_buf = vec![0u8; (dst_w * dst_h * 4) as usize];

    dst_buf
        .par_chunks_exact_mut(dst_row_bytes)
        .enumerate()
        .for_each(|(y, row)| {
            let sy = (y as f64 + 0.5) * scale_y - 0.5;
            let y_start = (sy - a + 1.0).floor().max(0.0) as u32;
            let y_end = (sy + a).ceil().min(src_h) as u32;

            for x in 0..dst_w as usize {
                let sx = (x as f64 + 0.5) * scale_x - 0.5;
                let x_start = (sx - a + 1.0).floor().max(0.0) as u32;
                let x_end = (sx + a).ceil().min(src_w) as u32;

                let mut r = 0.0f64;
                let mut g = 0.0f64;
                let mut b = 0.0f64;
                let mut a_sum = 0.0f64;
                let mut total_weight = 0.0f64;

                for src_y in y_start..y_end {
                    let wy = lanczos_kernel(src_y as f64 - sy);
                    let src_base = (src_y as usize) * src_w_usize * 4;

                    for src_x in x_start..x_end {
                        let wx = lanczos_kernel(src_x as f64 - sx);
                        let w = wx * wy;
                        let idx = src_base + (src_x as usize) * 4;

                        r += src_raw[idx] as f64 * w;
                        g += src_raw[idx + 1] as f64 * w;
                        b += src_raw[idx + 2] as f64 * w;
                        a_sum += src_raw[idx + 3] as f64 * w;
                        total_weight += w;
                    }
                }

                if total_weight > 0.0 {
                    let inv = 1.0 / total_weight;
                    let di = x * 4;
                    row[di] = (r * inv).round().clamp(0.0, 255.0) as u8;
                    row[di + 1] = (g * inv).round().clamp(0.0, 255.0) as u8;
                    row[di + 2] = (b * inv).round().clamp(0.0, 255.0) as u8;
                    row[di + 3] = (a_sum * inv).round().clamp(0.0, 255.0) as u8;
                }
            }
        });

    RgbaImage::from_raw(dst_w, dst_h, dst_buf).unwrap()
}

// ── Parallel Box Blur (separable) ────────────────────────────────────

fn box_blur_horizontal(src: &[u8], w: u32, _h: u32, radius: u32) -> Vec<u8> {
    let w_usize = w as usize;
    let mut dst = vec![0u8; src.len()];

    dst.par_chunks_exact_mut(w_usize * 4)
        .enumerate()
        .for_each(|(y, row)| {
            let row_base = y * w_usize * 4;
            for x in 0..w_usize {
                let mut r_acc = 0i64;
                let mut g_acc = 0i64;
                let mut b_acc = 0i64;
                let mut a_acc = 0i64;
                let mut count = 0i64;

                let r = radius as i32;
                for kx in -r..=r {
                    let px = (x as i32 + kx).clamp(0, w as i32 - 1) as usize;
                    let idx = row_base + px * 4;
                    r_acc += src[idx] as i64;
                    g_acc += src[idx + 1] as i64;
                    b_acc += src[idx + 2] as i64;
                    a_acc += src[idx + 3] as i64;
                    count += 1;
                }

                let di = x * 4;
                row[di] = (r_acc / count) as u8;
                row[di + 1] = (g_acc / count) as u8;
                row[di + 2] = (b_acc / count) as u8;
                row[di + 3] = (a_acc / count) as u8;
            }
        });

    dst
}

fn box_blur_vertical(src: &[u8], w: u32, h: u32, radius: u32) -> Vec<u8> {
    let w_usize = w as usize;
    let h_usize = h as usize;
    let mut dst = vec![0u8; src.len()];

    dst.par_chunks_exact_mut(w_usize * 4)
        .enumerate()
        .for_each(|(y, row)| {
            for x in 0..w_usize {
                let mut r_acc = 0i64;
                let mut g_acc = 0i64;
                let mut b_acc = 0i64;
                let mut a_acc = 0i64;
                let mut count = 0i64;

                let r = radius as i32;
                for ky in -r..=r {
                    let py = (y as i32 + ky).clamp(0, h_usize as i32 - 1) as usize;
                    let idx = py * w_usize * 4 + x * 4;
                    r_acc += src[idx] as i64;
                    g_acc += src[idx + 1] as i64;
                    b_acc += src[idx + 2] as i64;
                    a_acc += src[idx + 3] as i64;
                    count += 1;
                }

                let di = x * 4;
                row[di] = (r_acc / count) as u8;
                row[di + 1] = (g_acc / count) as u8;
                row[di + 2] = (b_acc / count) as u8;
                row[di + 3] = (a_acc / count) as u8;
            }
        });

    dst
}

fn box_blur_parallel(img: &RgbaImage, radius: u32) -> RgbaImage {
    let (w, h) = (img.width(), img.height());
    let src = img.as_raw();
    let temp = box_blur_horizontal(src, w, h, radius);
    let dst = box_blur_vertical(&temp, w, h, radius);
    RgbaImage::from_raw(w, h, dst).unwrap()
}

// ── Parallel Unsharp Mask ────────────────────────────────────────────

fn unsharp_mask_parallel(img: &RgbaImage, amount: f32, radius: u32, threshold: u8) -> RgbaImage {
    if amount <= 0.0 || radius == 0 {
        return img.clone();
    }

    let blurred = box_blur_parallel(img, radius);
    let src = img.as_raw();
    let blur = blurred.as_raw();
    let mut dst = src.to_vec();

    let thresh = threshold as i32 * 3;

    dst.par_chunks_exact_mut(4)
        .enumerate()
        .for_each(|(i, pixel)| {
            let idx = i * 4;
            let r_diff = src[idx] as i16 - blur[idx] as i16;
            let g_diff = src[idx + 1] as i16 - blur[idx + 1] as i16;
            let b_diff = src[idx + 2] as i16 - blur[idx + 2] as i16;

            if r_diff.abs() as i32 + g_diff.abs() as i32 + b_diff.abs() as i32 > thresh {
                pixel[0] = (src[idx] as i16 + (r_diff as f32 * amount) as i16)
                    .clamp(0, 255) as u8;
                pixel[1] = (src[idx + 1] as i16 + (g_diff as f32 * amount) as i16)
                    .clamp(0, 255) as u8;
                pixel[2] = (src[idx + 2] as i16 + (b_diff as f32 * amount) as i16)
                    .clamp(0, 255) as u8;
            } else {
                pixel[0] = src[idx];
                pixel[1] = src[idx + 1];
                pixel[2] = src[idx + 2];
            }
            pixel[3] = src[idx + 3];
        });

    RgbaImage::from_raw(img.width(), img.height(), dst).unwrap()
}

// ── Parallel Sharpen (convolution 3×3) ───────────────────────────────

fn sharpen_parallel(img: &RgbaImage, strength: f32) -> RgbaImage {
    if strength <= 0.0 {
        return img.clone();
    }

    let (w, h) = (img.width() as i32, img.height() as i32);
    let src = img.as_raw();
    let w_usize = w as usize;
    let dst_row_bytes = w_usize * 4;
    let mut dst = vec![0u8; src.len()];

    let s = strength;
    let kc = 1.0 + 4.0 * s;

    dst.par_chunks_exact_mut(dst_row_bytes)
        .enumerate()
        .for_each(|(y, row)| {
            for x in 0..w_usize {
                let mut r = 0.0f32;
                let mut g = 0.0f32;
                let mut b = 0.0f32;

                for ky in -1i32..=1 {
                    let py = (y as i32 + ky).clamp(0, h - 1) as usize * dst_row_bytes;
                    for kx in -1i32..=1 {
                        let px = (x as i32 + kx).clamp(0, w - 1) as usize * 4;
                        let idx = py + px;

                        let kv = match (ky, kx) {
                            (-1, 0) | (1, 0) | (0, -1) | (0, 1) => -s,
                            (0, 0) => kc,
                            _ => 0.0,
                        };

                        r += src[idx] as f32 * kv;
                        g += src[idx + 1] as f32 * kv;
                        b += src[idx + 2] as f32 * kv;
                    }
                }

                let di = x * 4;
                row[di] = r.round().clamp(0.0, 255.0) as u8;
                row[di + 1] = g.round().clamp(0.0, 255.0) as u8;
                row[di + 2] = b.round().clamp(0.0, 255.0) as u8;
                row[di + 3] = src[y * dst_row_bytes + di + 3];
            }
        });

    RgbaImage::from_raw(w as u32, h as u32, dst).unwrap()
}

// ── PNG Encoding with DPI ────────────────────────────────────────────

fn encode_png_with_dpi(img: &RgbaImage, dpi: u32) -> Result<Vec<u8>, String> {
    let mut png_bytes = Vec::new();
    {
        let writer = BufWriter::new(&mut png_bytes);
        let mut encoder = png::Encoder::new(writer, img.width(), img.height());
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);

        let dpm = (dpi as f64 * (100.0 / 2.54)).round() as u32;
        encoder.set_pixel_dims(Some(png::PixelDimensions {
            xppu: dpm,
            yppu: dpm,
            unit: png::Unit::Meter,
        }));

        let mut png_writer = encoder
            .write_header()
            .map_err(|e| format!("PNG header: {}", e))?;
        png_writer
            .write_image_data(img.as_raw())
            .map_err(|e| format!("PNG write: {}", e))?;
    }
    Ok(png_bytes)
}
