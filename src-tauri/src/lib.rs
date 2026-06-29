mod pdf_converter;
mod system_info;
mod version;
mod image_scaler;
mod gpu_scaler;
mod pdf_compress;
mod pdf_merge;

use image_scaler::scale_image;
use pdf_compress::compress_pdfs;
use pdf_merge::{get_pdf_info, merge_pdfs};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            system_info::get_system_info,
            version::get_app_version,
            pdf_converter::convert_pdf_to_zip,
            pdf_converter::get_pdf_page_count,
            scale_image,
            compress_pdfs,
            get_pdf_info,
            merge_pdfs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
