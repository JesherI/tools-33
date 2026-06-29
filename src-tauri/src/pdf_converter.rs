use hayro::hayro_interpret::font::FontQuery;
use hayro::hayro_interpret::InterpreterSettings;
use hayro::hayro_syntax::Pdf;
use hayro::{render, RenderCache, RenderSettings};
use hayro::vello_cpu::color::palette::css::WHITE;
use rayon::prelude::*;
use serde::Serialize;
use std::io::{BufWriter, Cursor, Write};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::Emitter;
use zip::write::FileOptions;
use zip::CompressionMethod;
use zip::ZipWriter;

#[derive(Debug, Clone, Serialize)]
pub struct PdfProgress {
    pub current: usize,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct PdfConversionResult {
    pub total_pages: usize,
    pub zip_size_bytes: u64,
    pub format: String,
    pub renderer: String,
    pub gpu_available: bool,
}

struct RenderedPage {
    index: usize,
    data: Vec<u8>,
}

#[tauri::command]
pub async fn convert_pdf_to_zip(
    app: tauri::AppHandle,
    pdf_path: String,
    output_path: String,
    format: String,
) -> Result<PdfConversionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        execute_conversion(app, pdf_path, output_path, format)
    })
    .await
    .map_err(|e| format!("Error en la ejecucion del hilo: {}", e))?
}

fn execute_conversion(
    app: tauri::AppHandle,
    pdf_path: String,
    output_path: String,
    format: String,
) -> Result<PdfConversionResult, String> {
    let pdf_data = std::fs::read(&pdf_path)
        .map_err(|e| format!("Error al leer el archivo PDF: {}", e))?;

    let pdf = Pdf::new(pdf_data.clone())
        .map_err(|e| format!("Error al mapear el PDF: {:?}", e))?;

    let total_pages = pdf.pages().len();
    if total_pages == 0 {
        return Err("El PDF no contiene paginas.".to_string());
    }

    let (img_format, ext) = match format.as_str() {
        "jpg" | "jpeg" => (image::ImageFormat::Jpeg, "jpg"),
        "png" => (image::ImageFormat::Png, "png"),
        "webp" => (image::ImageFormat::WebP, "webp"),
        _ => return Err(format!("Formato no soportado: {}. Usa jpg, png o webp.", format)),
    };

    let dpi: f32 = 150.0;
    let scale = dpi / 72.0;

    let font_resolver = Arc::new(|query: &FontQuery| -> Option<(Arc<dyn AsRef<[u8]> + Send + Sync + 'static>, u32)> {
        Some(match query {
            FontQuery::Standard(s) => s.get_font_data(),
            FontQuery::Fallback(f) => f.pick_standard_font().get_font_data(),
        })
    });

    let interpreter_settings = InterpreterSettings {
        font_resolver,
        ..Default::default()
    };

    let render_settings = Arc::new(RenderSettings {
        x_scale: scale,
        y_scale: scale,
        bg_color: WHITE,
        ..Default::default()
    });

    let gpu_available = detect_dedicated_gpu();
    let renderer_type = if gpu_available { "cpu+gpu-detected" } else { "cpu" };

    let completed = Arc::new(AtomicUsize::new(0));
    let is_finished = Arc::new(std::sync::atomic::AtomicBool::new(false));

    let progress_comp = Arc::clone(&completed);
    let progress_finished = Arc::clone(&is_finished);
    let progress_app = app.clone();

    let progress_handle = thread::spawn(move || {
        loop {
            let count = progress_comp.load(Ordering::Relaxed);
            let _ = progress_app.emit("pdf-progress", PdfProgress {
                current: count,
                total: total_pages,
            });
            if count >= total_pages || progress_finished.load(Ordering::Relaxed) {
                break;
            }
            thread::sleep(std::time::Duration::from_millis(200));
        }
    });

    let _progress_guard = scopeguard::guard(is_finished, |finished| {
        finished.store(true, Ordering::Relaxed);
    });

    // === STREAMING PIPELINE ===
    // Canal con buffer acotado (8 paginas) para backpressure: si el hilo ZIP
    // es mas lento que los renderizadores, estos se bloquean en vez de acumular RAM.
    let (tx, rx) = mpsc::sync_channel::<RenderedPage>(8);
    let tx = Arc::new(Mutex::new(tx));

    // Hilo consumidor: escribe el ZIP en disco conforme llegan las paginas
    let zip_output_path = output_path.clone();
    let zip_handle = thread::spawn(move || -> Result<(), String> {
        let file = std::fs::File::create(&zip_output_path)
            .map_err(|e| format!("Error al crear archivo ZIP: {}", e))?;
        let mut zip = ZipWriter::new(BufWriter::new(file));
        let options: FileOptions<'_, ()> = FileOptions::default()
            .compression_method(CompressionMethod::Deflated);

        while let Ok(page) = rx.recv() {
            let name = format!("{}.{}", page.index, ext);
            zip.start_file(&name, options)
                .map_err(|e| format!("Error al agregar {} al ZIP: {}", name, e))?;
            zip.write_all(&page.data)
                .map_err(|e| format!("Error al escribir {} en el ZIP: {}", name, e))?;
        }

        zip.finish()
            .map_err(|e| format!("Error al finalizar el ZIP: {}", e))?;
        Ok(())
    });

    // Hilo productor: renderiza paginas en paralelo y envia por canal
    let interpreter_settings = Arc::new(interpreter_settings);
    let render_result = (0..total_pages)
        .into_par_iter()
        .try_for_each(|i| {
            let pdf = Pdf::new(pdf_data.clone())
                .map_err(|e| format!("Error en hilo al abrir PDF: {:?}", e))?;
            let cache = RenderCache::new();
            let page = pdf.pages().iter().nth(i)
                .ok_or_else(|| format!("Pagina {} no encontrada", i))?;

            let buf = if img_format == image::ImageFormat::Png {
                let pixmap = render(&page, &cache, &interpreter_settings, &render_settings);
                pixmap.into_png()
                    .map_err(|e| format!("Error al codificar pagina {} a PNG: {}", i, e))?
            } else {
                let pixmap = render(&page, &cache, &interpreter_settings, &render_settings);
                let (w, h) = (pixmap.width() as u32, pixmap.height() as u32);
                let raw: Vec<u8> = pixmap.take_unpremultiplied()
                    .iter()
                    .flat_map(|p| [p.r, p.g, p.b, p.a])
                    .collect();
                let img = image::DynamicImage::ImageRgba8(
                    image::RgbaImage::from_raw(w, h, raw)
                        .ok_or_else(|| format!("Error al crear imagen para pagina {}", i))?
                );
                let mut buf = Vec::new();
                let mut cursor = Cursor::new(&mut buf);
                if img_format == image::ImageFormat::Jpeg {
                    img.to_rgb8()
                        .write_to(&mut cursor, img_format)
                        .map_err(|e| format!("Error al codificar pagina {}: {}", i, e))?;
                } else {
                    img.write_to(&mut cursor, img_format)
                        .map_err(|e| format!("Error al codificar pagina {}: {}", i, e))?;
                }
                buf
            };

            tx.lock().unwrap()
                .send(RenderedPage { index: i, data: buf })
                .map_err(|_| "Error critico: canal ZIP cerrado.".to_string())?;

            completed.fetch_add(1, Ordering::SeqCst);
            Ok::<(), String>(())
        });

    // Cerrar el canal: senala al hilo ZIP que no vienen mas paginas
    drop(tx);

    // Esperar a que el hilo ZIP termine
    let zip_result = match zip_handle.join() {
        Ok(inner) => inner,
        Err(_) => {
            let _ = std::fs::remove_file(&output_path);
            return Err("Hilo ZIP colapso.".to_string());
        }
    };

    // Manejar errores de renderizado o escritura
    if let Err(e) = &render_result {
        let _ = std::fs::remove_file(&output_path);
        return Err(e.clone());
    }
    if let Err(e) = &zip_result {
        let _ = std::fs::remove_file(&output_path);
        return Err(e.clone());
    }

    drop(_progress_guard);
    let _ = progress_handle.join();

    let zip_size = std::fs::metadata(&output_path)
        .map(|m| m.len())
        .unwrap_or(0);

    Ok(PdfConversionResult {
        total_pages,
        zip_size_bytes: zip_size,
        format: format.to_string(),
        renderer: renderer_type.to_string(),
        gpu_available,
    })
}

/// Detecta si hay una GPU dedicada disponible en el sistema.
/// En Windows usa PowerShell + WMI; en otros SO devuelve false por ahora.
#[cfg(target_os = "windows")]
fn detect_dedicated_gpu() -> bool {
    use std::process::Command;
    let ps_script = "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name";
    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", ps_script])
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_lowercase();
            stdout.contains("nvidia")
                || stdout.contains("radeon")
                || stdout.contains("amd radeon")
                || stdout.contains("arc") // Intel Arc
        }
        Err(_) => false,
    }
}

#[cfg(not(target_os = "windows"))]
fn detect_dedicated_gpu() -> bool {
    false
}

#[tauri::command]
pub fn get_pdf_page_count(pdf_path: String) -> Result<usize, String> {
    let pdf_data = std::fs::read(&pdf_path)
        .map_err(|e| format!("Error al leer el archivo PDF: {}", e))?;
    let pdf = Pdf::new(pdf_data)
        .map_err(|e| format!("Error al cargar el PDF: {:?}", e))?;
    Ok(pdf.pages().len())
}
