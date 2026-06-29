use lopdf::{Document, Object, ObjectId};
use lopdf::dictionary;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct PdfInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub page_count: u32,
}

#[tauri::command]
pub async fn get_pdf_info(paths: Vec<String>) -> Result<Vec<PdfInfo>, String> {
    let mut result = Vec::with_capacity(paths.len());

    for path in paths {
        let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        let page_count = match Document::load(&path) {
            Ok(doc) => doc.get_pages().len() as u32,
            Err(e) => {
                eprintln!("Error loading PDF {}: {}", path, e);
                1
            }
        };
        let name = std::path::Path::new(&path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown.pdf")
            .to_string();

        result.push(PdfInfo {
            path,
            name,
            size,
            page_count,
        });
    }

    Ok(result)
}

#[tauri::command]
pub async fn merge_pdfs(input_paths: Vec<String>, output_path: String) -> Result<(), String> {
    let mut documents: Vec<Document> = Vec::with_capacity(input_paths.len());
    for path in &input_paths {
        let doc = Document::load(path)
            .map_err(|e| format!("Error loading {}: {}", path, e))?;
        documents.push(doc);
    }

    if documents.is_empty() {
        return Err("No documents to merge".to_string());
    }

    let mut merged = Document::with_version("1.7");
    let mut max_id = 1;
    let mut page_parent_ids: Vec<ObjectId> = Vec::new();

    for mut doc in documents {
        doc.renumber_objects_with(max_id);

        if let Some((max_obj_id, _)) = doc.objects.keys().max() {
            max_id = *max_obj_id + 1;
        }

        let pages: Vec<ObjectId> = doc.get_pages().into_values().collect();

        // Copy all objects
        for (id, obj) in doc.objects {
            merged.objects.insert(id, obj);
        }

        // Create parent page tree for this document's pages
        let kids: Vec<Object> = pages.iter().map(|pid| Object::Reference(*pid)).collect();
        let kids_len = kids.len() as i64;

        let pages_dict = dictionary! {
            "Type" => "Pages",
            "Kids" => kids,
            "Count" => kids_len,
        };

        let parent_id = merged.add_object(pages_dict);
        page_parent_ids.push(parent_id);

        // Update each page to point to the new parent
        let page_refs: Vec<ObjectId> = pages;
        for page_id in page_refs {
            if let Some(obj) = merged.objects.get_mut(&page_id) {
                if let Ok(dict) = obj.as_dict_mut() {
                    dict.set("Parent", Object::Reference(parent_id));
                }
            }
        }
    }

    // Build final catalog
    let catalog_pages_kids: Vec<Object> = page_parent_ids.iter().map(|pid| Object::Reference(*pid)).collect();
    let total_pages = merged.get_pages().len() as i64;

    let catalog_pages = dictionary! {
        "Type" => "Pages",
        "Kids" => catalog_pages_kids,
        "Count" => total_pages,
    };

    let catalog_pages_id = merged.add_object(catalog_pages);

    let catalog = dictionary! {
        "Type" => "Catalog",
        "Pages" => Object::Reference(catalog_pages_id),
    };

    let catalog_id = merged.add_object(catalog);
    merged.trailer.set("Root", Object::Reference(catalog_id));

    merged.renumber_objects();
    merged.delete_zero_length_streams();

    merged.save(&output_path)
        .map_err(|e| format!("Error saving merged PDF: {}", e))?;

    Ok(())
}
