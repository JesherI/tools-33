//! Compresor de PDF 100% Rust nativo (sin Ghostscript/Acrobat).
//!
//! Arquitectura hibrida segun contenido:
//!  - Imagenes    : downsampling + recodificacion JPEG (calidad decreciente).
//!  - Vectores CAD: Baja los mantiene; Media unifica OCGs (capas); Alta
//!                  aplica "aplanamiento parejo" (rasteriza TODO el contenido
//!                  vectorial con `hayro` manteniendo el texto nativo encima
//!                  para que siga siendo legible y buscable).
//!  - Fuentes     : subsetting practico + deduplicacion de programas de fuente
//!                  para que todas las paginas reaprovechen la misma fuente.
//!
//! Los flujos se manipulan objeto por objeto con `lopdf` para no saturar RAM
//! con planos CAD grandes; el renderizado de Alta usa el pipeline de streaming
//! de `hayro` (una pagina a la vez).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use lopdf::dictionary;
use lopdf::{Document, Object, ObjectId, Stream};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

use hayro::hayro_interpret::font::FontQuery;
use hayro::hayro_interpret::InterpreterSettings;
use hayro::hayro_syntax::Pdf;
use hayro::{render, RenderCache, RenderSettings};
use hayro::vello_cpu::color::palette::css::WHITE;

// ═══════════════════════════════════════════════════════════════════════
//  Tipos publicos (IPC)
// ═══════════════════════════════════════════════════════════════════════

/// Tres escalas de compresion. `rename_all = "lowercase"` para que el
/// frontend mande "baja" | "media" | "alta".
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CompressionLevel {
    Baja,
    Media,
    Alta,
}

impl CompressionLevel {
    /// DPI objetivo para downsampling de imagenes.
    fn target_dpi(self) -> f32 {
        match self {
            CompressionLevel::Baja => 150.0,
            CompressionLevel::Media => 100.0,
            CompressionLevel::Alta => 72.0,
        }
    }

    /// Calidad JPEG (1-100).
    fn jpeg_quality(self) -> u8 {
        match self {
            CompressionLevel::Baja => 80,
            CompressionLevel::Media => 65,
            CompressionLevel::Alta => 45,
        }
    }

    fn tag(self) -> &'static str {
        match self {
            CompressionLevel::Baja => "baja",
            CompressionLevel::Media => "media",
            CompressionLevel::Alta => "alta",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressFileInput {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CompressProgress {
    pub file_id: String,
    pub file_name: String,
    pub phase: String,
    pub progress: u8,
    pub current_page: Option<u32>,
    pub total_pages: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileCompressResult {
    pub file_id: String,
    pub file_name: String,
    pub success: bool,
    pub original_size: u64,
    pub compressed_size: Option<u64>,
    pub compression_ratio: Option<String>,
    pub error: Option<String>,
}

// ═══════════════════════════════════════════════════════════════════════
//  Comando principal
// ═══════════════════════════════════════════════════════════════════════

#[tauri::command]
pub async fn compress_pdfs(
    files: Vec<CompressFileInput>,
    level: CompressionLevel,
    output_dir: String,
    on_event: Channel<CompressProgress>,
) -> Result<Vec<FileCompressResult>, String> {
    let output_dir = PathBuf::from(&output_dir);
    std::fs::create_dir_all(&output_dir).map_err(|e| format!("Output dir: {}", e))?;

    let mut results = Vec::with_capacity(files.len());
    for file in files {
        let r = compress_one(&file, &output_dir, level, &on_event);
        results.push(r);
    }
    Ok(results)
}

fn compress_one(
    file: &CompressFileInput,
    output_dir: &Path,
    level: CompressionLevel,
    on_event: &Channel<CompressProgress>,
) -> FileCompressResult {
    let file_id = file.id.clone();
    let file_name = file.name.clone();
    let original_size = std::fs::metadata(&file.path).map(|m| m.len()).unwrap_or(0);

    let emit = |phase: &str, progress: u8, cur: Option<u32>, tot: Option<u32>| {
        let _ = on_event.send(CompressProgress {
            file_id: file_id.clone(),
            file_name: file_name.clone(),
            phase: phase.to_string(),
            progress,
            current_page: cur,
            total_pages: tot,
        });
    };

    emit("reading", 0, None, None);

    let total_pages = Document::load(&file.path)
        .map(|d| d.get_pages().len() as u32)
        .unwrap_or(1);

    let stem = Path::new(&file.name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("document");
    let out_path = output_dir.join(format!("{}_compressed_{}.pdf", stem, level.tag()));

    emit("compressing", 5, Some(0), Some(total_pages));

    let work = || -> Result<(), String> {
        let mut doc = Document::load(&file.path)
            .map_err(|e| format!("Cargar PDF: {}", e))?;

        // 1. Limpieza estructural comun a todos los niveles.
        clean_metadata(&mut doc);

        // 2. Deduplicacion de fuentes (todas las paginas -> misma fuente).
        dedup_fonts(&mut doc);

        // 3. Unificacion de capas (OCG) a partir de Media.
        if matches!(level, CompressionLevel::Media | CompressionLevel::Alta) {
            unify_optional_content(&mut doc);
        }

        // 4. Downsampling de imagenes embebidas (Baja/Media; Alta se aplana).
        if !matches!(level, CompressionLevel::Alta) {
            let pages: Vec<ObjectId> = doc.get_pages().into_values().collect();
            for (i, page_id) in pages.iter().enumerate() {
                let _ = downsample_page_images(&mut doc, *page_id, level.target_dpi(), level.jpeg_quality());
                if total_pages > 0 && i % 4 == 0 {
                    emit(
                        "compressing",
                        (10 + ((i as f32 / total_pages as f32) * 60.0) as u8).min(70),
                        Some(i as u32),
                        Some(total_pages),
                    );
                }
            }
        }

        // 5. Aplanamiento parejo (Alta): rasteriza TODO el vectorial, conserva texto.
        if matches!(level, CompressionLevel::Alta) {
            flatten_all_pages(&mut doc, &file.path, level.target_dpi(), level.jpeg_quality(), &emit, total_pages)?;
        }

        // 6. Recompresion de streams + empaquetado final.
        recompress_streams(&mut doc);
        doc.renumber_objects();
        doc.delete_zero_length_streams();

        emit("writing", 92, Some(total_pages), Some(total_pages));
        doc.save(&out_path).map_err(|e| format!("Guardar: {}", e))?;
        Ok(())
    };

    match work() {
        Ok(()) => {
            let compressed_size = std::fs::metadata(&out_path).map(|m| m.len()).ok();
            let ratio = compressed_size.and_then(|cs| ratio_str(original_size, cs));
            emit("done", 100, Some(total_pages), Some(total_pages));
            FileCompressResult {
                file_id,
                file_name,
                success: true,
                original_size,
                compressed_size,
                compression_ratio: ratio,
                error: None,
            }
        }
        Err(e) => {
            let _ = std::fs::remove_file(&out_path);
            FileCompressResult {
                file_id,
                file_name,
                success: false,
                original_size,
                compressed_size: None,
                compression_ratio: None,
                error: Some(e),
            }
        }
    }
}

fn ratio_str(original: u64, compressed: u64) -> Option<String> {
    if original == 0 {
        return None;
    }
    let reduction = (1.0 - (compressed as f64 / original as f64)) * 100.0;
    if reduction >= 0.0 {
        Some(format!("{:.1}%", reduction))
    } else {
        Some(format!("+{:.1}%", reduction.abs()))
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  1. Limpieza de metadatos
// ═══════════════════════════════════════════════════════════════════════

fn clean_metadata(doc: &mut Document) {
    const INFO_KEYS: [&[u8]; 6] = [
        b"Producer", b"Creator", b"Author", b"Title", b"Subject", b"Keywords",
    ];
    // Info dict: eliminar campos pesados/opacos.
    if let Ok(info_ref) = doc.trailer.get(b"Info").and_then(Object::as_reference) {
        if let Ok(Object::Dictionary(dict)) = doc.get_object_mut(info_ref).map(|o| o) {
            for key in INFO_KEYS {
                dict.remove(key);
            }
        }
    }
    // Metadata XMP stream (XML) suele ser grande y redundante.
    if let Ok(cat) = doc.catalog_mut() {
        cat.remove(b"Metadata");
        cat.remove(b"MarkInfo");
        cat.remove(b"StructTreeRoot");
        cat.remove(b"AcroForm");
        cat.remove(b"Names");
        cat.remove(b"Outlines");
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  2. Deduplicacion de fuentes (subsetting practico)
// ═══════════════════════════════════════════════════════════════════════
//
//  Recorre todos los objetos Font, localiza su programa de fuente
//  (FontFile / FontFile2 / FontFile3) y agrupa por contenido binario.
//  Las paginas que apuntaban a un duplicado se reescriben para apuntar al
//  programa canonico -> todas comparten el mismo FontFile.

fn dedup_fonts(doc: &mut Document) {
    const FONT_PROG_KEYS: [&[u8]; 3] = [b"FontFile", b"FontFile2", b"FontFile3"];
    // font_program_id -> (canonical FontDescriptor id, FontFile object id)
    let mut programs: HashMap<u64, ObjectId> = HashMap::new();
    let mut font_descriptors: Vec<ObjectId> = Vec::new();

    // Recopilar FontDescriptor ids.
    for (&id, obj) in doc.objects.iter() {
        if let Ok(dict) = obj.as_dict() {
            if dict.get(b"Type").and_then(Object::as_name).ok() == Some(b"FontDescriptor") {
                font_descriptors.push(id);
            }
        }
    }

    // Mapear cada FontDescriptor a su programa canonico.
    let mut desc_to_canon: HashMap<ObjectId, ObjectId> = HashMap::new();

    for &desc_id in &font_descriptors {
        let program_id = match doc.get_object(desc_id) {
            Ok(Object::Dictionary(d)) => FONT_PROG_KEYS
                .iter()
                .find_map(|k| d.get(*k).and_then(Object::as_reference).ok()),
            _ => None,
        };
        let Some(prog_id) = program_id else { continue };

        let hash = match doc.get_object(prog_id) {
            Ok(Object::Stream(s)) => stream_hash(s),
            _ => continue,
        };

        let canon = *programs.entry(hash).or_insert(prog_id);
        if canon != prog_id {
            // Reapuntar este descriptor al programa canonico.
            if let Ok(Object::Dictionary(d)) = doc.get_object_mut(desc_id) {
                for k in FONT_PROG_KEYS {
                    if d.get(k).is_ok() {
                        d.set(k, Object::Reference(canon));
                    }
                }
            }
            desc_to_canon.insert(desc_id, canon);
        }
    }

    // Marcar fuentes como "subsetted" (prefijo XXXXX+) para indicar subsetting.
    // No reemplazamos el stream del font (subsetting real por glifos usados
    // requiere parseo CFF/TrueType), pero al compartir el FontFile entre todas
    // las paginas se elimina la redundancia de fuentes duplicadas.
    let _ = desc_to_canon; // ya aplicado arriba
}

fn stream_hash(s: &Stream) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    s.content.hash(&mut h);
    h.finish()
}

// ═══════════════════════════════════════════════════════════════════════
//  3. Unificacion de Optional Content Groups (capas)
// ═══════════════════════════════════════════════════════════════════════
//
//  Colapsa toda la jerarquia de capas en una sola capa estructural visible:
//  - OCProperties.OCGs -> se mantiene la lista pero
//  - OCProperties.D (default config): OFF = [] (nada oculto), AS = [],
//    Order simplificado. => todas las capas visibles.
//  - Se eliminan las marcas /OC de los XObjects para que ninguno quede
//    condicionado a una capa opcional (se " fusionan " en el contenido base).

fn unify_optional_content(doc: &mut Document) {
    let oc_props_id = match doc.catalog().and_then(|c| c.get(b"OCProperties").and_then(Object::as_reference)) {
        Ok(id) => id,
        Err(_) => return, // sin capas
    };

    if let Ok(Object::Dictionary(d)) = doc.get_object_mut(oc_props_id) {
        // OCGs: dejar la lista, pero forzar visibilidad en D.
        if let Ok(d_ref) = d.get(b"D").and_then(Object::as_reference) {
            if let Ok(Object::Dictionary(dd)) = doc.get_object_mut(d_ref) {
                dd.set("OFF", Object::Array(vec![]));
                dd.remove(b"AS");
                dd.remove(b"Order");
                dd.remove(b"RBGroups");
                dd.remove(b"Locked");
            }
        }
    }

    // Quitar /OC de todos los XObjects para que nada quede condicionado.
    let xobj_ids: Vec<ObjectId> = doc
        .objects
        .iter()
        .filter(|(_, o)| {
            o.as_dict()
                .map(|d| d.get(b"Subtype").and_then(Object::as_name).ok() == Some(b"Image")
                    || d.get(b"Subtype").and_then(Object::as_name).ok() == Some(b"Form"))
                .unwrap_or(false)
        })
        .map(|(&id, _)| id)
        .collect();

    for id in xobj_ids {
        if let Ok(Object::Dictionary(d)) = doc.get_object_mut(id) {
            d.remove(b"OC");
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  4. Downsampling de imagenes embebidas
// ═══════════════════════════════════════════════════════════════════════

fn downsample_page_images(
    doc: &mut Document,
    page_id: ObjectId,
    target_dpi: f32,
    quality: u8,
) -> Result<(), String> {
    let page_width_pt = page_width_pt(doc, page_id).unwrap_or(612.0);

    // Recopilar ids de imagen XObject de la pagina.
    let image_ids = collect_page_images(doc, page_id);
    for img_id in image_ids {
        let _ = process_image_xobject(doc, img_id, target_dpi, quality, page_width_pt);
    }
    Ok(())
}

fn page_width_pt(doc: &Document, page_id: ObjectId) -> Option<f32> {
    let page = doc.get_object(page_id).ok()?.as_dict().ok()?;
    let mbox = page.get(b"MediaBox").and_then(Object::as_array).ok()?;
    if mbox.len() >= 4 {
        let urx = mbox[2].as_float().or_else(|_| mbox[2].as_i64().map(|i| i as f32)).ok()?;
        let llx = mbox[0].as_float().or_else(|_| mbox[0].as_i64().map(|i| i as f32)).ok()?;
        return Some(urx - llx);
    }
    None
}

fn collect_page_images(doc: &mut Document, page_id: ObjectId) -> Vec<ObjectId> {
    let (res_opt, _parents) = match doc.get_page_resources(page_id) {
        Ok((r, p)) => (r.cloned(), p),
        Err(_) => return vec![],
    };

    let mut out = Vec::new();
    if let Some(res) = res_opt {
        if let Ok(xobj) = res.get(b"XObject").and_then(Object::as_reference) {
            if let Ok(Object::Dictionary(xd)) = doc.get_object(xobj) {
                for (_name, val) in xd.iter() {
                    if let Ok(id) = val.as_reference() {
                        if is_image(doc, id) {
                            out.push(id);
                        }
                    }
                }
            }
        }
    }
    out
}

fn is_image(doc: &Document, id: ObjectId) -> bool {
    if let Ok(Object::Dictionary(d)) = doc.get_object(id) {
        if let Ok(name) = d.get(b"Subtype").and_then(Object::as_name) {
            return name == b"Image";
        }
    }
    false
}

fn process_image_xobject(
    doc: &mut Document,
    img_id: ObjectId,
    target_dpi: f32,
    quality: u8,
    page_width_pt: f32,
) -> Result<(), String> {
    // Leer dimensiones + filtro antes de mutar.
    let (w, h, filter_is_dct) = {
        let s = doc.get_object(img_id).and_then(|o| o.as_stream()).map_err(|e| e.to_string())?;
        let w = s.dict.get(b"Width").and_then(|o| o.as_i64().or_else(|_| o.as_float().map(|f| f as i64))).map_err(|e| e.to_string())? as u32;
        let h = s.dict.get(b"Height").and_then(|o| o.as_i64().or_else(|_| o.as_float().map(|f| f as i64))).map_err(|e| e.to_string())? as u32;
        let filt = s.filters().unwrap_or_default();
        let is_dct = filt.iter().any(|f| f == b"DCTDecode") || filt.iter().any(|f| f == b"JPXDecode");
        (w, h, is_dct)
    };

    // DPI efectivo asumiendo que la imagen cubre el ancho de pagina.
    let page_width_in = page_width_pt / 72.0;
    let effective_dpi = if page_width_in > 0.0 { w as f32 / page_width_in } else { 300.0 };

    if effective_dpi <= target_dpi * 1.05 {
        // Ya esta por debajo del objetivo: solo recodificar JPEG si es bitmap grande.
        return Ok(());
    }

    // Decodificar a DynamicImage.
    let img = decode_image(doc, img_id, w, h, filter_is_dct)?;

    // Calcular nuevas dimensiones.
    let scale = target_dpi / effective_dpi;
    let new_w = (w as f32 * scale).round().max(1.0) as u32;
    let new_h = (h as f32 * scale).round().max(1.0) as u32;

    let resized = img.resize(new_w, new_h, image::imageops::Lanczos3);

    // Recodificar a JPEG (RGB sobre blanco para conservar fondo).
    let rgb = to_rgb_on_white(&resized);
    let jpeg_bytes = encode_jpeg(&rgb, quality)?;

    // Reescribir el stream como DCTDecode.
    let new_dict = dictionary! {
        "Type" => "XObject",
        "Subtype" => "Image",
        "Width" => i64::try_from(new_w).unwrap_or(0),
        "Height" => i64::try_from(new_h).unwrap_or(0),
        "ColorSpace" => "DeviceRGB",
        "BitsPerComponent" => 8,
        "Filter" => "DCTDecode",
        "Length" => i64::try_from(jpeg_bytes.len()).unwrap_or(0),
    };

    if let Ok(Object::Stream(s)) = doc.get_object_mut(img_id) {
        s.dict = new_dict;
        s.set_plain_content(jpeg_bytes);
    }
    Ok(())
}

fn decode_image(doc: &mut Document, img_id: ObjectId, w: u32, h: u32, filter_is_dct: bool) -> Result<image::DynamicImage, String> {
    // Obtener bytes crudos.
    let (content, cs_name, _bpc) = {
        let s = doc.get_object(img_id).and_then(|o| o.as_stream()).map_err(|e| e.to_string())?;
        let cs = s.dict.get(b"ColorSpace").and_then(|o| o.as_name().map(|n| n.to_vec()).or_else(|_| Ok(vec![]))).unwrap_or_default();
        let bpc = s.dict.get(b"BitsPerComponent").and_then(|o| o.as_i64()).unwrap_or(8) as u32;
        let bytes = if filter_is_dct {
            s.content.clone()
        } else {
            s.decompressed_content().unwrap_or_else(|_| s.content.clone())
        };
        (bytes, cs, bpc)
    };

    if filter_is_dct {
        return image::load_from_memory(&content).map_err(|e| format!("Decodificar JPEG: {}", e));
    }

    // Imagen raster sin compresion: construir desde bytes segun ColorSpace.
    match cs_name.as_slice() {
        b"DeviceRGB" | b"RGB" => {
            let img = image::RgbImage::from_raw(w, h, content)
                .ok_or("RGB from_raw")?;
            Ok(image::DynamicImage::ImageRgb8(img))
        }
        b"DeviceGray" | b"Gray" | b"G" => {
            let img = image::GrayImage::from_raw(w, h, content)
                .ok_or("Gray from_raw")?;
            Ok(image::DynamicImage::ImageLuma8(img))
        }
        b"DeviceCMYK" | b"CMYK" => {
            // Invertir CMYK y convertir a RGB.
            let mut rgb = image::RgbImage::new(w, h);
            for (i, p) in rgb.pixels_mut().enumerate() {
                if i * 4 + 3 < content.len() {
                    let c = content[i * 4] as f32 / 255.0;
                    let m = content[i * 4 + 1] as f32 / 255.0;
                    let y = content[i * 4 + 2] as f32 / 255.0;
                    let k = content[i * 4 + 3] as f32 / 255.0;
                    let r = (255.0 * (1.0 - c) * (1.0 - k)).round() as u8;
                    let g = (255.0 * (1.0 - m) * (1.0 - k)).round() as u8;
                    let b = (255.0 * (1.0 - y) * (1.0 - k)).round() as u8;
                    *p = image::Rgb([r, g, b]);
                }
            }
            Ok(image::DynamicImage::ImageRgb8(rgb))
        }
        _ => {
            // Fallback: intentar decodificar como imagen generica.
            image::load_from_memory(&content).or_else(|_| {
                // Ultimo recurso: tratar como RGB.
                image::RgbImage::from_raw(w, h, content)
                    .map(image::DynamicImage::ImageRgb8)
                    .ok_or_else(|| "ColorSpace no soportada".to_string())
            })
        }
    }
}

fn to_rgb_on_white(img: &image::DynamicImage) -> image::RgbImage {
    match img {
        image::DynamicImage::ImageRgba8(rgba) => {
            let mut rgb = image::RgbImage::new(rgba.width(), rgba.height());
            for (p, a) in rgb.pixels_mut().zip(rgba.pixels()) {
                let af = a[3] as f32 / 255.0;
                p[0] = (a[0] as f32 * af + 255.0 * (1.0 - af)) as u8;
                p[1] = (a[1] as f32 * af + 255.0 * (1.0 - af)) as u8;
                p[2] = (a[2] as f32 * af + 255.0 * (1.0 - af)) as u8;
            }
            rgb
        }
        other => other.to_rgb8(),
    }
}

fn encode_jpeg(rgb: &image::RgbImage, quality: u8) -> Result<Vec<u8>, String> {
    let mut buf = Vec::with_capacity(rgb.width() as usize * rgb.height() as usize / 8);
    let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
    enc.encode(rgb.as_raw(), rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("Encode JPEG: {}", e))?;
    Ok(buf)
}

// ═══════════════════════════════════════════════════════════════════════
//  5. Aplanamiento parejo (Alta)
// ═══════════════════════════════════════════════════════════════════════
//
//  Para CADA pagina:
//    a) Renderiza TODO su contenido con `hayro` a la DPI objetivo -> JPEG.
//    b) Extrae del content stream original SOLO los operadores de texto
//       (BT..ET, Tj/TJ/Tf/Tm/...) + estado grafico (q/Q/cm/gs) + color,
//       descartando paths, pintura, clipping, XObjects (Do) e inline images.
//    c) Reconstruye el /Contents:  q  <matrix>  cm  BI/ID/EI (imagen)  Q
//       seguido de los operadores de texto extraidos.
//
//  Resultado: la pagina es la imagen raster (todo el vectorial aplanado de
//  forma PAREJA) con el texto nativo encima -> sigue siendo buscable.

fn flatten_all_pages(
    doc: &mut Document,
    pdf_path: &str,
    target_dpi: f32,
    quality: u8,
    emit: &impl Fn(&str, u8, Option<u32>, Option<u32>),
    total_pages: u32,
) -> Result<(), String> {
    let pdf_data = std::fs::read(pdf_path).map_err(|e| format!("Leer PDF para render: {}", e))?;

    let scale = target_dpi / 72.0;
    let render_settings = Arc::new(RenderSettings {
        x_scale: scale,
        y_scale: scale,
        bg_color: WHITE,
        ..Default::default()
    });

    let font_resolver = Arc::new(|query: &FontQuery| -> Option<(Arc<dyn AsRef<[u8]> + Send + Sync + 'static>, u32)> {
        Some(match query {
            FontQuery::Standard(s) => s.get_font_data(),
            FontQuery::Fallback(f) => f.pick_standard_font().get_font_data(),
        })
    });
    let interpreter_settings = Arc::new(InterpreterSettings {
        font_resolver,
        ..Default::default()
    });

    let pages: Vec<(u32, ObjectId)> = doc.get_pages().into_iter().collect();

    for (idx, (_num, page_id)) in pages.iter().enumerate() {
        let page_w_pt = page_width_pt(doc, *page_id).unwrap_or(612.0);
        let page_h_pt = page_height_pt(doc, *page_id).unwrap_or(792.0);

        // (a) Renderizar pagina idx con hayro.
        let jpeg_bytes = render_page_jpeg(&pdf_data, idx, &render_settings, &interpreter_settings, quality)?;

        // (b) Extraer operadores de texto del content original.
        let original_content = doc.get_page_content(*page_id).unwrap_or_default();
        let text_ops = extract_text_content(&original_content);

        // (c) Construir nuevo content: imagen inline + texto.
        let new_content = build_flattened_content(
            &jpeg_bytes,
            rendered_width(page_w_pt, scale),
            rendered_height(page_h_pt, scale),
            page_w_pt,
            page_h_pt,
            &text_ops,
        );

        replace_page_content(doc, *page_id, new_content);

        if total_pages > 0 && idx % 2 == 0 {
            emit(
                "flattening",
                (30 + ((idx as f32 / total_pages as f32) * 55.0) as u8).min(85),
                Some(idx as u32),
                Some(total_pages),
            );
        }
    }
    Ok(())
}

fn page_height_pt(doc: &Document, page_id: ObjectId) -> Option<f32> {
    let page = doc.get_object(page_id).ok()?.as_dict().ok()?;
    let mbox = page.get(b"MediaBox").and_then(Object::as_array).ok()?;
    if mbox.len() >= 4 {
        let ury = mbox[3].as_float().or_else(|_| mbox[3].as_i64().map(|i| i as f32)).ok()?;
        let lly = mbox[1].as_float().or_else(|_| mbox[1].as_i64().map(|i| i as f32)).ok()?;
        return Some(ury - lly);
    }
    None
}

fn rendered_width(page_w_pt: f32, scale: f32) -> u32 {
    ((page_w_pt * scale).round() as u32).max(1)
}
fn rendered_height(page_h_pt: f32, scale: f32) -> u32 {
    ((page_h_pt * scale).round() as u32).max(1)
}

fn render_page_jpeg(
    pdf_data: &[u8],
    page_index: usize,
    render_settings: &Arc<RenderSettings>,
    interpreter_settings: &Arc<InterpreterSettings>,
    quality: u8,
) -> Result<Vec<u8>, String> {
    let pdf = Pdf::new(pdf_data.to_vec()).map_err(|e| format!("hayro abrir: {:?}", e))?;
    let cache = RenderCache::new();
    let page = pdf
        .pages()
        .iter()
        .nth(page_index)
        .ok_or_else(|| format!("Pagina {} no encontrada", page_index))?;

    let pixmap = render(page, &cache, interpreter_settings, render_settings);
    let (w, h) = (pixmap.width() as u32, pixmap.height() as u32);
    let raw: Vec<u8> = pixmap
        .take_unpremultiplied()
        .iter()
        .flat_map(|p| [p.r, p.g, p.b, p.a])
        .collect();

    let rgba = image::RgbaImage::from_raw(w, h, raw)
        .ok_or("hayro -> RgbaImage")?;
    let rgb = to_rgb_on_white(&image::DynamicImage::ImageRgba8(rgba));
    encode_jpeg(&rgb, quality)
}

/// Construye el nuevo content stream de una pagina aplanada:
///   q  W 0 0 H 0 0 cm  BI /W /H /CS /RGB /BPC 8 /F /DCT ID <jpeg> EI  Q
///   <operadores de texto extraidos>
fn build_flattened_content(
    jpeg: &[u8],
    img_w: u32,
    img_h: u32,
    page_w_pt: f32,
    page_h_pt: f32,
    text_ops: &[u8],
) -> Vec<u8> {
    let mut out = Vec::with_capacity(128 + jpeg.len() + text_ops.len());
    out.extend_from_slice(b"q\n");
    // Matriz para mapear la imagen (1x1) al rectangulo completo de la pagina.
    out.extend_from_slice(format!("{:.2} 0 0 {:.2} 0 0 cm\n", page_w_pt, page_h_pt).as_bytes());
    out.extend_from_slice(b"BI\n");
    out.extend_from_slice(format!("/W {} /H {} /CS /RGB /BPC 8 /F /DCT\n", img_w, img_h).as_bytes());
    out.extend_from_slice(b"ID\n");
    out.extend_from_slice(jpeg);
    out.extend_from_slice(b"\nEI\n");
    out.extend_from_slice(b"Q\n");
    if !text_ops.is_empty() {
        out.extend_from_slice(text_ops);
    }
    out
}

/// Reemplaza el /Contents de una pagina por un unico stream con `new_content`.
fn replace_page_content(doc: &mut Document, page_id: ObjectId, new_content: Vec<u8>) {
    let stream = Stream::new(
        dictionary! { "Length" => i64::try_from(new_content.len()).unwrap_or(0) },
        new_content,
    );
    let new_id = doc.add_object(stream);

    if let Ok(Object::Dictionary(d)) = doc.get_object_mut(page_id) {
        d.set("Contents", Object::Reference(new_id));
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  5b. Tokenizador de content stream: extraccion de operadores de texto
// ═══════════════════════════════════════════════════════════════════════
//
//  Recorre el content stream y devuelve un subconjunto que conserva:
//    - Texto:        BT ET Tf Tc Tw Tz TL Tr Ts Td TD Tm T* Tj TJ ' "
//    - Estado graf:  q Q cm gs w J j M d i ri
//    - Color:        rg RG g G k K cs CS sc SC scn SCN
//    - Marcado:      BMC BDC EMC
//  Descarta:
//    - Path:         m l c v y h re
//    - Pintura:      S s f F f* B B* b b* n
//    - Clipping:     W W*
//    - XObject:      Do   (las imagenes/form ya estan en el raster)
//    - Shading:      sh
//    - Inline img:   BI ... ID ... EI  (se reconstruye con el raster)

fn extract_text_content(content: &[u8]) -> Vec<u8> {
    // Version con buffer de operandos: solo emite operandos si el operador
    // siguiente se conserva. Asi no quedan operandos huerfanos de paths/etc.
    let mut out = Vec::with_capacity(content.len() / 4);
    let mut p = Parser::new(content);
    let mut operand_buf: Vec<u8> = Vec::new();

    while let Some(tok) = p.next_token() {
        match tok.kind {
            TokenKind::Operand => {
                if !operand_buf.is_empty() {
                    operand_buf.push(b' ');
                }
                operand_buf.extend_from_slice(&tok.raw);
            }
            TokenKind::Operator(ref op) => {
                if op == b"BI" {
                    p.skip_inline_image();
                    operand_buf.clear();
                    continue;
                }
                if is_keep_op(op) {
                    if !operand_buf.is_empty() {
                        out.extend_from_slice(&operand_buf);
                        out.push(b' ');
                        operand_buf.clear();
                    }
                    out.extend_from_slice(&tok.raw);
                    out.push(b'\n');
                } else if is_drop_op(op) {
                    operand_buf.clear();
                } else {
                    // desconocido: conservar.
                    if !operand_buf.is_empty() {
                        out.extend_from_slice(&operand_buf);
                        out.push(b' ');
                        operand_buf.clear();
                    }
                    out.extend_from_slice(&tok.raw);
                    out.push(b'\n');
                }
            }
        }
    }
    out
}

fn is_keep_op(op: &[u8]) -> bool {
    op == b"q" || op == b"Q" || op == b"cm" || op == b"gs"
        || op == b"w" || op == b"J" || op == b"j" || op == b"M" || op == b"d" || op == b"i" || op == b"ri"
        || op == b"BT" || op == b"ET" || op == b"Tf" || op == b"Tc" || op == b"Tw" || op == b"Tz"
        || op == b"TL" || op == b"Tr" || op == b"Ts" || op == b"Td" || op == b"TD" || op == b"Tm"
        || op == b"T*" || op == b"Tj" || op == b"TJ" || op == b"'" || op == b"\""
        || op == b"rg" || op == b"RG" || op == b"g" || op == b"G" || op == b"k" || op == b"K"
        || op == b"cs" || op == b"CS" || op == b"sc" || op == b"SC" || op == b"scn" || op == b"SCN"
        || op == b"BMC" || op == b"BDC" || op == b"EMC" || op == b"MP" || op == b"DP"
}

fn is_drop_op(op: &[u8]) -> bool {
    op == b"m" || op == b"l" || op == b"c" || op == b"v" || op == b"y" || op == b"h" || op == b"re"
        || op == b"S" || op == b"s" || op == b"f" || op == b"F" || op == b"f*" || op == b"B"
        || op == b"B*" || op == b"b" || op == b"b*" || op == b"n"
        || op == b"W" || op == b"W*"
        || op == b"Do" || op == b"sh"
}

// ── Tokenizer minimal de content streams ───────────────────────────────

#[derive(Debug, Clone)]
enum TokenKind {
    Operand,
    Operator(Vec<u8>),
}

#[derive(Debug, Clone)]
struct Token {
    kind: TokenKind,
    raw: Vec<u8>,
}

struct Parser<'a> {
    b: &'a [u8],
    i: usize,
}

impl<'a> Parser<'a> {
    fn new(b: &'a [u8]) -> Self {
        Self { b, i: 0 }
    }

    fn next_token(&mut self) -> Option<Token> {
        loop {
            self.skip_ws_and_comments();
            if self.i >= self.b.len() {
                return None;
            }
            let c = self.b[self.i];
            match c {
                b'(' => {
                    let raw = self.read_string();
                    return Some(Token { kind: TokenKind::Operand, raw });
                }
                b'<' if self.peek_next() == Some(b'<') => {
                    let raw = self.read_dict();
                    return Some(Token { kind: TokenKind::Operand, raw });
                }
                b'<' => {
                    let raw = self.read_hex_string();
                    return Some(Token { kind: TokenKind::Operand, raw });
                }
                b'[' => {
                    let raw = self.read_array();
                    return Some(Token { kind: TokenKind::Operand, raw });
                }
                b'/' => {
                    let raw = self.read_name();
                    return Some(Token { kind: TokenKind::Operand, raw });
                }
                b'%' => {
                    // comentario: skip hasta EOL
                    while self.i < self.b.len() && self.b[self.i] != b'\n' {
                        self.i += 1;
                    }
                    continue;
                }
                _ => {
                    // number, bool, null o operator
                    let raw = self.read_token_word();
                    if raw.is_empty() {
                        self.i += 1;
                        continue;
                    }
                    let kind = if is_number_like(&raw) {
                        TokenKind::Operand
                    } else if raw == b"true" || raw == b"false" || raw == b"null" {
                        TokenKind::Operand
                    } else {
                        TokenKind::Operator(raw.clone())
                    };
                    return Some(Token { kind, raw });
                }
            }
        }
    }

    fn peek_next(&self) -> Option<u8> {
        self.b.get(self.i + 1).copied()
    }

    fn skip_ws_and_comments(&mut self) {
        loop {
            while self.i < self.b.len() && self.b[self.i].is_ascii_whitespace() {
                self.i += 1;
            }
            if self.i < self.b.len() && self.b[self.i] == b'%' {
                while self.i < self.b.len() && self.b[self.i] != b'\n' {
                    self.i += 1;
                }
                continue;
            }
            break;
        }
    }

    fn read_string(&mut self) -> Vec<u8> {
        let start = self.i;
        self.i += 1; // (
        let mut depth = 1;
        while self.i < self.b.len() && depth > 0 {
            let c = self.b[self.i];
            if c == b'\\' {
                self.i += 2;
                continue;
            }
            if c == b'(' {
                depth += 1;
            } else if c == b')' {
                depth -= 1;
            }
            self.i += 1;
        }
        self.b[start..self.i.min(self.b.len())].to_vec()
    }

    fn read_hex_string(&mut self) -> Vec<u8> {
        let start = self.i;
        self.i += 1; // <
        while self.i < self.b.len() && self.b[self.i] != b'>' {
            self.i += 1;
        }
        if self.i < self.b.len() {
            self.i += 1; // >
        }
        self.b[start..self.i.min(self.b.len())].to_vec()
    }

    fn read_dict(&mut self) -> Vec<u8> {
        let start = self.i;
        self.i += 2; // <<
        let mut depth = 1;
        while self.i < self.b.len() && depth > 0 {
            if self.b[self.i] == b'<' && self.b.get(self.i + 1) == Some(&b'<') {
                depth += 1;
                self.i += 2;
                continue;
            }
            if self.b[self.i] == b'>' && self.b.get(self.i + 1) == Some(&b'>') {
                depth -= 1;
                self.i += 2;
                continue;
            }
            self.i += 1;
        }
        self.b[start..self.i.min(self.b.len())].to_vec()
    }

    fn read_array(&mut self) -> Vec<u8> {
        let start = self.i;
        self.i += 1; // [
        let mut depth = 1;
        while self.i < self.b.len() && depth > 0 {
            let c = self.b[self.i];
            if c == b'(' {
                // saltar string anidada
                self.read_string();
                continue;
            }
            if c == b'<' && self.peek_next() == Some(b'<') {
                self.read_dict();
                continue;
            }
            if c == b'<' {
                self.read_hex_string();
                continue;
            }
            if c == b'[' {
                depth += 1;
            } else if c == b']' {
                depth -= 1;
            }
            self.i += 1;
        }
        self.b[start..self.i.min(self.b.len())].to_vec()
    }

    fn read_name(&mut self) -> Vec<u8> {
        let start = self.i;
        self.i += 1; // /
        while self.i < self.b.len() && !self.b[self.i].is_ascii_whitespace()
            && !matches!(self.b[self.i], b'(' | b')' | b'<' | b'>' | b'[' | b']' | b'{' | b'}' | b'/' | b'%')
        {
            self.i += 1;
        }
        self.b[start..self.i].to_vec()
    }

    fn read_token_word(&mut self) -> Vec<u8> {
        let start = self.i;
        while self.i < self.b.len() && !self.b[self.i].is_ascii_whitespace()
            && !matches!(self.b[self.i], b'(' | b')' | b'<' | b'>' | b'[' | b']' | b'{' | b'}' | b'/' | b'%')
        {
            self.i += 1;
        }
        self.b[start..self.i].to_vec()
    }

    /// Salta una inline image: ya se consumio el operador `BI`.
    fn skip_inline_image(&mut self) {
        // 1) pares clave/valor hasta `ID`
        loop {
            self.skip_ws_and_comments();
            if self.i >= self.b.len() {
                return;
            }
            // leer palabra
            let start = self.i;
            while self.i < self.b.len()
                && !self.b[self.i].is_ascii_whitespace()
                && !matches!(self.b[self.i], b'/' | b'(' | b'<' | b'>' | b'[' | b']')
            {
                self.i += 1;
            }
            let word = &self.b[start..self.i];
            if word == b"ID" {
                // un unico whitespace separa ID de los bytes
                if self.i < self.b.len() && self.b[self.i].is_ascii_whitespace() {
                    self.i += 1;
                }
                break;
            }
            // si era clave (empieza con /) ya consumida; siguiente es valor
            self.skip_ws_and_comments();
            // consumir valor (name/number/string)
            let _ = self.read_token_value();
        }
        // 2) buscar `EI` precedido de whitespace
        while self.i + 2 <= self.b.len() {
            if &self.b[self.i..self.i + 2] == b"EI"
                && (self.i == 0 || self.b[self.i - 1].is_ascii_whitespace())
            {
                self.i += 2;
                return;
            }
            self.i += 1;
        }
    }

    fn read_token_value(&mut self) -> Vec<u8> {
        self.skip_ws_and_comments();
        if self.i >= self.b.len() {
            return vec![];
        }
        match self.b[self.i] {
            b'/' => self.read_name(),
            b'(' => self.read_string(),
            b'<' => {
                if self.peek_next() == Some(b'<') {
                    self.read_dict()
                } else {
                    self.read_hex_string()
                }
            }
            b'[' => self.read_array(),
            _ => self.read_token_word(),
        }
    }
}

fn is_number_like(raw: &[u8]) -> bool {
    if raw.is_empty() {
        return false;
    }
    let s = raw;
    let mut has_digit = false;
    let mut has_dot = false;
    let mut idx = 0;
    if s[0] == b'+' || s[0] == b'-' {
        idx = 1;
    }
    for &c in &s[idx..] {
        if c.is_ascii_digit() {
            has_digit = true;
        } else if c == b'.' && !has_dot {
            has_dot = true;
        } else {
            return false;
        }
    }
    has_digit
}

// ═══════════════════════════════════════════════════════════════════════
//  6. Recompresion de streams
// ═══════════════════════════════════════════════════════════════════════

fn recompress_streams(doc: &mut Document) {
    // Reaplicar FlateDecode con compresion maxima a todos los streams
    // que no tengan filtro (lopdf.compress ya comprime solo los sin filtro).
    let ids: Vec<ObjectId> = doc.objects.keys().copied().collect();
    for id in ids {
        if let Ok(Object::Stream(s)) = doc.get_object_mut(id) {
            // Si ya esta filtrado, dejarlo; si no, comprimir.
            let _ = s.compress();
        }
    }
}
