use axum::{
    extract::{multipart::Multipart, Path, State},
    http::StatusCode,
    response::{Html, IntoResponse, Json},
    routing::{get, post},
    Router,
};
use golem_base_sdk::{
    entity::{Annotation, Create},
    GolemBaseClient, PrivateKeySigner, Url,
};
use bytes::Bytes;
use golem_base_sdk::Hash;
use alloy_primitives::B256;
use hex::FromHex;
use image::{imageops::FilterType, ImageFormat};
use serde_json::json;
use std::{/*fs,*/ sync::Arc};
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use std::io::{Cursor };
use dirs::config_dir;

/// We'll use this struct to hold our shared state, including the GolemBase client.
/// For now it only has one member but this way we can add additional state later if necessary.
struct AppState {
    client: GolemBaseClient,
}

pub struct ImageResult {
    pub id: Hash,
    pub image_data: Vec<u8>, // Using Vec<u8> since Bytes will be created at the end for the response
    pub filename: String,
    pub mimetype: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("A");
    dotenvy::dotenv().ok();

    println!("B");
    let password = std::env::var("GOLEMDB_PASS")?;

    println!("C");
    let keypath = config_dir()
        .ok_or("Failed to get config directory")?
        .join("golembase")
        .join("wallet.json");
    let signer = PrivateKeySigner::decrypt_keystore(keypath, password.trim_end())?;

    let rpc_url_str = "http://localhost:8545";
    let rpc_url = Url::parse(rpc_url_str).unwrap();

    // The GolemBaseClient is now part of our application's shared state.
    // It's wrapped in an Arc for thread-safe access from multiple request handlers.
    println!("Here");
    let shared_state = Arc::new(AppState {
        client: GolemBaseClient::builder()
            .wallet(signer.clone())
            .rpc_url(rpc_url.clone())
            .build(),
    });

    println!(
        "Successfully loaded signer with address: {}",
        signer.address()
    );

    // Set up the Axum router and routes.
    let app = Router::new()
        // The "/" route serves the HTML form, replicating the TS app's front end.
        .route("/", get(serve_html))
        // The "/upload" route handles the image upload.
        .route("/upload", post(upload_handler))
        // The "/thumbnails" route. Note: This handler is a placeholder.
        .route("/thumbnails", get(get_thumbnails))
        // The "/parent/:thumbid" route. Note: This handler is a placeholder.
        .route("/parent/:thumbid", get(get_parent))
        // The "/image/:id" route. Note: This handler is a placeholder.
        .route("/image/:id", get(get_full_image))
        // The "/add-resize/:id" route. Note: This handler is a placeholder.
        .route("/add-resize/:id", post(add_resize))
        // The "/query/:search" route. Note: This handler is a placeholder.
        .route("/query/:search", get(query_entities))
        // We add our state to the router so it's available to all handlers.
        .with_state(shared_state)
        // Add a CORS layer for development to allow cross-origin requests from a frontend.
        .layer(CorsLayer::permissive());

    // Start the server.
    let listener = TcpListener::bind("127.0.0.1:3000").await?;
    println!("listening on http://127.0.0.1:3000");
    axum::serve(listener, app).await?;

    Ok(())
}

/// Helper function for converting string entity_key to hex

fn parse_b256(thumbid: &str) -> B256 {
    let hex_str = thumbid.strip_prefix("0x").unwrap_or(thumbid);
    let bytes: [u8; 32] = <[u8; 32]>::from_hex(hex_str)
        .expect("Invalid hex string for B256");
    B256::from(bytes)
}

/// Helper function to retrieve all image data and combine chunks.
async fn get_full_image_data(
    client: &GolemBaseClient,
    id: Hash,
) -> Result<ImageResult, Box<dyn std::error::Error>> {
    let metadata = client.get_entity_metadata(id).await?;
    
    // --- 1. EXTRACT METADATA ---
    let mut filename = "image".to_string();
    let mut mime_type = "application/octet-stream".to_string();
    let mut part_of: u64 = 1;

    for annot in metadata.string_annotations {
        if annot.key == "filename" {
            filename = annot.value;
        } else if annot.key == "mime-type" {
            mime_type = annot.value;
        }
    }
    for annot in metadata.numeric_annotations {
        if annot.key == "part-of" {
            part_of = annot.value;
        }
    }

    println!("Fetching raw data for {} (MIME: {})", filename, mime_type);

    // --- 2. FETCH FIRST CHUNK (Storage Value) ---
    // The main entity hash contains the first chunk of data.
    //let first_chunk = client.get_storage_value(id).await?.to_vec();
    let first_chunk = client.get_storage_value::<Vec<u8>>(id).await?.to_vec();
    let mut all_chunks = vec![first_chunk];

    // --- 3. FETCH REMAINING CHUNKS IF NECESSARY ---
    if part_of > 1 {
        for i in 2..=(part_of as usize) {
            // Build the query to find the next chunk entity key
            let query = format!(
                "parent=\"{}\" && type=\"image_chunk\" && app=\"golem-images-0.1\" && part={}",
                id, i
            );
            println!("Querying for chunk {}: {}", i, query);

            let chunk_info = client.query_entities(&query).await?;
            
            if let Some(chunk_entity) = chunk_info.first() {
                // Fetch the storage value (the chunk data) using the found entity key
                //let chunk_data = client.get_storage_value(chunk_entity.entity_key).await?.to_vec();
                let chunk_data = client.get_storage_value::<Vec<u8>>(chunk_entity.key).await?.to_vec();
                all_chunks.push(chunk_data);
            } else {
                eprintln!("Warning: Expected chunk {} not found.", i);
                // In a real app, you might return an error here, but we'll continue.
            }
        }
        println!("Combined {} chunks.", all_chunks.len());
    }

    // --- 4. COMBINE AND RETURN ---
    // Flatten the vector of Vec<u8> chunks into a single Vec<u8>.
    let image_data = all_chunks.into_iter().flatten().collect::<Vec<u8>>();

    Ok(ImageResult {
        id,
        image_data,
        filename,
        mimetype: mime_type,
    })
}


/// A handler that serves a simple HTML page for image upload.
async fn serve_html() -> Html<&'static str> {
    Html(r#"
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Rust Image Uploader</title>
            <style>
                body { font-family: sans-serif; max-width: 600px; margin: 2em auto; }
                form { display: flex; flex-direction: column; gap: 1em; }
                input, button { padding: 0.5em; }
            </style>
        </head>
        <body>
            <h1>Upload an Image</h1>
            <form action="http://localhost:3000/upload" method="POST" enctype="multipart/form-data">
                <div>
                    <label for="imageFile">Choose image:</label>
                    <input type="file" id="imageFile" name="imageFile" accept="image/*" required />
                </div>
                <div>
                    <label for="filename">Filename (if you want it different from original):</label>
                    <input type="text" id="filename" name="filename" />
                </div>
                <div>
                    <label for="tags">Tags (comma-separated):</label>
                    <input type="text" id="tags" name="tags" value="landscape, nature, sunset" required />
                </div>
                <div for="custom_key1">Optional Custom Tags (Key, Value)</div>
                <div>
                    <input type="text" id="custom_key1" name="custom_key1" value="" />
                    <input type="text" id="custom_value1" name="custom_value1" value="" />
                </div>
                <div>
                    <input type="text" id="custom_key2" name="custom_key2" value="" />
                    <input type="text" id="custom_value2" name="custom_value2" value="" />
                </div>
                <div>
                    <input type="text" id="custom_key3" name="custom_key3" value="" />
                    <input type="text" id="custom_value3" name="custom_value3" value="" />
                </div>
                <button type="submit">Upload</button>
            </form>
        </body>
        </html>
    "#)
}

/// The POST handler for the image upload form.
async fn upload_handler(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let mut filename: Option<String> = None;
    let mut tags: Option<String> = None;
    let mut custom_annotations = vec![];
    let mut image_bytes: Option<Vec<u8>> = None;
    let mut mime_type: Option<String> = None;

    // --- 1. VALIDATE AND PARSE THE INPUT ---
    println!("Parsing multipart form data...");
    while let Some(field) = multipart.next_field().await.unwrap() {
        let name = field.name().unwrap().to_string();
        
        match name.as_str() {
            "filename" => {
                filename = Some(field.text().await.unwrap());
            }
            "tags" => {
                tags = Some(field.text().await.unwrap());
            }
            "imageFile" => {
                println!("Reading image file...");
                // We'll get the content type first, which borrows the field,
                // and then get the bytes, which moves the field.
                mime_type = Some(field.content_type().unwrap().to_string());
                image_bytes = Some(field.bytes().await.unwrap().to_vec());
                println!("Image size: {} bytes", image_bytes.as_ref().unwrap().len());
            }
            custom_key if custom_key.starts_with("custom_key") => {
                let value_name = custom_key.replace("key", "value");
                let value = multipart.next_field().await.unwrap().unwrap().text().await.unwrap();
                
                if !value.is_empty() {
                    custom_annotations.push(Annotation::new(value_name.replace("custom_value", ""), value));
                }
            }
            _ => {
                // Ignore other fields
            }
        }
    }

    let original_image_bytes = match image_bytes {
        Some(bytes) => bytes,
        None => return (StatusCode::BAD_REQUEST, "No image file was uploaded.").into_response(),
    };
    let tags_str = tags.unwrap_or_else(|| "".to_string());
    let original_filename = filename.unwrap_or_else(|| "image.png".to_string());
    let mime_type_str = mime_type.unwrap_or_else(|| "image/png".to_string());

    println!("Received upload with tags: \"{}\"", tags_str);

    let mut string_annotations = vec![
        Annotation::new("type", "image"),
        Annotation::new("app", "golem-images-0.1"),
        Annotation::new("filename", original_filename.clone()),
        Annotation::new("mime_type", mime_type_str.clone()),
        Annotation::new("tag", tags_str.clone())
    ];

    // let tag_list: Vec<&str> = tags_str.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    // for tag in tag_list {
    //     string_annotations.push(Annotation::new("tag", tag));
    // }
    //string_annotations.push(Annotation::new("tag", &tags_str));

    // Combine custom annotations
    string_annotations.extend(custom_annotations);
    
    // --- 2. RESIZE THE IMAGE FOR A THUMBNAIL ---
    let image_data = image::load_from_memory(&original_image_bytes).unwrap();
    let resized_image_data = image_data.resize_to_fill(100, 100, FilterType::Lanczos3);
    
    // Use a cursor to write to the Vec<u8> in memory
    let mut thumbnail_bytes_cursor = Cursor::new(Vec::new());
    resized_image_data.write_to(&mut thumbnail_bytes_cursor, ImageFormat::Jpeg).unwrap();
    let thumbnail_bytes = thumbnail_bytes_cursor.into_inner();
    let thumbnail_len = thumbnail_bytes.len();

    println!("Resized image size: {} bytes", thumbnail_len);

    // --- 3. CHUNK THE ORIGINAL IMAGE IF NEEDED ---
    const CHUNK_SIZE: usize = 100000;
    let chunks: Vec<&[u8]> = original_image_bytes.chunks(CHUNK_SIZE).collect();
    println!("Number of chunks: {}", chunks.len());

    let mut create_entities = vec![];

    // First, create the main image entity (first chunk)
    let main_entity_create = Create {
        data: chunks[0].to_vec().into(),
        btl: 25,
        string_annotations: string_annotations.clone(),
        numeric_annotations: vec![
            Annotation::new("part", 1u64),
            Annotation::new("part_of", chunks.len() as u64),
        ],
    };
    let receipts = state.client.create_entities(vec![main_entity_create]).await;
    let receipts = match receipts {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Error creating main entity: {:?}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to create main entity").into_response();
        }
    };
    let main_entity_key = Some(receipts[0].entity_key);
    println!("Created main entity: {:?}", main_entity_key);

    // Create the thumbnail entity
    let thumb_create = Create {
        data: thumbnail_bytes.into(),
        btl: 25,
        string_annotations: vec![
            Annotation::new("parent", main_entity_key.unwrap().to_string()),
            Annotation::new("type", "thumbnail"),
            Annotation::new("app", "golem-images-0.1"),
            Annotation::new("resize", "100x100"),
            Annotation::new("filename", format!("thumb_{}", original_filename)),
            Annotation::new("mime_type", "image/jpeg"),
        ],
        numeric_annotations: vec![],
    };
    let thumb_receipts = state.client.create_entities(vec![thumb_create]).await;
    match thumb_receipts {
        Ok(r) => println!("Created thumbnail entity: {:?}", r),
        Err(e) => eprintln!("Error creating thumbnail: {:?}", e),
    };

    // If there are more chunks, create an entity for each
    if chunks.len() > 1 {
        for (i, chunk) in chunks.iter().skip(1).enumerate() {
            let chunk_create = Create {
                data: chunk.to_vec().into(),
                btl: 25,
                string_annotations: vec![
                    Annotation::new("parent", main_entity_key.unwrap().to_string()),
                    Annotation::new("type", "image_chunk"),
                    Annotation::new("app", "golem-images-0.1"),
                    Annotation::new("filename", original_filename.clone()),
                    Annotation::new("mime_type", mime_type_str.clone()),
                ],
                numeric_annotations: vec![
                    Annotation::new("part", (i + 2) as u64), // parts are 1-based
                    Annotation::new("part_of", chunks.len() as u64),
                ],
            };
            create_entities.push(chunk_create);
        }

        // Send all remaining chunks in a single API call
        let chunk_receipts = state.client.create_entities(create_entities).await;
        println!("{:?}", chunk_receipts);
        match chunk_receipts {
            Ok(r) => println!("Created {} chunk entities.", r.len()),
            Err(e) => eprintln!("Error creating chunks: {:?}", e),
        };
    }

    // --- 4. SEND A SUCCESS RESPONSE ---
    (StatusCode::OK, Json(json!({
        "message": "File processed successfully!",
        "originalSize": original_image_bytes.len(),
        "resizedSize": thumbnail_len,
        "tags": tags_str,
        "entity_key": main_entity_key.unwrap().to_string()
    }))).into_response()
}

// Handler for the `GET /thumbnails` route.
async fn get_thumbnails(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let query = "type=\"thumbnail\" && app=\"golem-images-0.1\"";
    
    println!("GET /thumbnails called. Executing query: {}", query);

    match state.client.query_entity_keys(query).await {
        Ok(keys) => Json(keys.into_iter().map(|key| key.to_string()).collect::<Vec<_>>()).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, format!("Error querying thumbnails: {}", e)).into_response(),
    }
}

// Handler for the `GET /parent/:thumbid` route.
async fn get_parent(
    State(state): State<Arc<AppState>>,
    Path(thumbid): Path<String>,
) -> impl IntoResponse {

    let entity_key = parse_b256(&thumbid);

    let metadata = state.client.get_entity_metadata(entity_key).await;

    match metadata {
        Ok(md) => {
            for annot in md.string_annotations {
                if annot.key == "parent" {
                    return (StatusCode::OK, annot.value).into_response();
                }
            }
            (StatusCode::NOT_FOUND, "Parent key not found.").into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, format!("Error fetching metadata: {}", e)).into_response(),
    }
}

// Handler for the `GET /image/:id` route.
async fn get_full_image(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let entity_key = parse_b256(&id);

    // Fetch and combine the image data
    let image_result = get_full_image_data(&state.client, entity_key).await;

    match image_result {
        Ok(result) => {
            // Success: Return the image data with the correct MIME type
            
            // Axum's IntoResponse allows us to build a custom response with headers.
            (
                [
                    ("Content-Type", result.mimetype),
                    ("Content-Disposition", format!("inline; filename=\"{}\"", result.filename)),
                ],
                // Convert Vec<u8> to axum::body::Bytes for the response body
                Bytes::from(result.image_data), 
            ).into_response()
        }
        Err(e) => {
            eprintln!("Error fetching image data: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to retrieve and combine image data.").into_response()
        }
    }
}

// Handler for the `POST /add-resize/:id` route.
async fn add_resize(
    //State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    // This handler would receive width and height and add a new resized version of the image.
    println!("POST /add-resize/{} called. This would resize the image.", id);
    (StatusCode::OK, "Add-resize logic would go here.").into_response()
}

// Handler for the `GET /query/:search` route.
async fn query_entities(
    State(state): State<Arc<AppState>>,
    Path(search): Path<String>,
) -> impl IntoResponse {
    // The query string to search for thumbnails that match the tag.
    let query = format!(
        "type=\"thumbnail\" && app=\"golem-images-0.1\" && (tag~\"{}\" || (tag~\"{},*\" || (tag~\"*,{}\" || tag~\"*,{},\"))) ", 
        search, search, search, search
    );

    println!("GET /query/{} called. Executing query: {}", search, query);
    
    // The Rust function already returns Vec<Hash>, so we map them to strings and return.
    match state.client.query_entity_keys(&query).await {
        Ok(keys) => Json(keys.into_iter().map(|key| key.to_string()).collect::<Vec<_>>()).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, format!("Query failed: {}", e)).into_response(),
    }
}