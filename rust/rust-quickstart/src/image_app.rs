use axum::{
    extract::{multipart::Multipart, Path, State},
    http::StatusCode,
    response::{Html, IntoResponse, Json},
    routing::{get, post},
    Router,
};
use golem_base_sdk::{
    entity::{Annotation, Create, EntityResult},
    hex::FromHex,
    GolemBaseClient, GolemBaseRoClient, PrivateKeySigner, Url,
};
use image::{imageops::FilterType, ImageFormat};
use serde_json::json;
use std::{fs, sync::Arc};
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;

/// We'll use this struct to hold our shared state, including the GolemBase client.
struct AppState {
    client: GolemBaseClient,
    ro_client: GolemBaseRoClient,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // We'll read the private key from a file, as the TypeScript app does.
    let key_path = "private.key";
    let key_bytes = fs::read(key_path)
        .expect("Failed to read private.key file. Make sure it exists in the project root.");

    let signer = PrivateKeySigner::from_bytes(&key_bytes)
        .expect("Failed to create signer from private key bytes.");

    let rpc_url_str = "http://localhost:8545";
    let rpc_url = Url::parse(rpc_url_str).unwrap();

    // The GolemBaseClient is now part of our application's shared state.
    // It's wrapped in an Arc for thread-safe access from multiple request handlers.
    let shared_state = Arc::new(AppState {
        client: GolemBaseClient::builder()
            .wallet(signer.clone())
            .rpc_url(rpc_url.clone())
            .build(),
        ro_client: GolemBaseRoClient::new(rpc_url).unwrap(),
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
                image_bytes = Some(field.bytes().await.unwrap().to_vec());
                mime_type = Some(field.content_type().unwrap().to_string());
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
        Annotation::new("mime-type", mime_type_str.clone()),
    ];

    let tag_list: Vec<&str> = tags_str.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    for tag in tag_list {
        string_annotations.push(Annotation::new("tag", tag));
    }

    // Combine custom annotations
    string_annotations.extend(custom_annotations);
    
    // --- 2. RESIZE THE IMAGE FOR A THUMBNAIL ---
    let image_data = image::load_from_memory(&original_image_bytes).unwrap();
    let resized_image_data = image_data.resize_to_fill(100, 100, FilterType::Lanczos3);
    let mut thumbnail_bytes = Vec::new();
    resized_image_data.write_to(&mut thumbnail_bytes, ImageFormat::Jpeg).unwrap();
    println!("Resized image size: {} bytes", thumbnail_bytes.len());

    // --- 3. CHUNK THE ORIGINAL IMAGE IF NEEDED ---
    const CHUNK_SIZE: usize = 100000;
    let chunks: Vec<&[u8]> = original_image_bytes.chunks(CHUNK_SIZE).collect();
    println!("Number of chunks: {}", chunks.len());

    let mut create_entities = vec![];
    let mut main_entity_key = None;

    // First, create the main image entity (first chunk)
    let main_entity_create = Create {
        data: chunks[0].to_vec(),
        btl: 25,
        string_annotations: string_annotations.clone(),
        numeric_annotations: vec![
            Annotation::new("part", 1u64),
            Annotation::new("part-of", chunks.len() as u64),
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
    main_entity_key = Some(receipts[0].entity_key);
    println!("Created main entity: {:?}", main_entity_key);

    // Create the thumbnail entity
    let thumb_create = Create {
        data: thumbnail_bytes,
        btl: 25,
        string_annotations: vec![
            Annotation::new("parent", main_entity_key.unwrap().to_string()),
            Annotation::new("type", "thumbnail"),
            Annotation::new("app", "golem-images-0.1"),
            Annotation::new("resize", "100x100"),
            Annotation::new("filename", format!("thumb_{}", original_filename)),
            Annotation::new("mime-type", "image/jpeg"),
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
                data: chunk.to_vec(),
                btl: 25,
                string_annotations: vec![
                    Annotation::new("parent", main_entity_key.unwrap().to_string()),
                    Annotation::new("type", "image_chunk"),
                    Annotation::new("app", "golem-images-0.1"),
                    Annotation::new("filename", original_filename.clone()),
                    Annotation::new("mime-type", mime_type_str.clone()),
                ],
                numeric_annotations: vec![
                    Annotation::new("part", (i + 2) as u64), // parts are 1-based
                    Annotation::new("part-of", chunks.len() as u64),
                ],
            };
            create_entities.push(chunk_create);
        }

        // Send all remaining chunks in a single API call
        let chunk_receipts = state.client.create_entities(create_entities).await;
        match chunk_receipts {
            Ok(r) => println!("Created {} chunk entities.", r.len()),
            Err(e) => eprintln!("Error creating chunks: {:?}", e),
        };
    }

    // --- 4. SEND A SUCCESS RESPONSE ---
    (StatusCode::OK, Json(json!({
        "message": "File processed successfully!",
        "originalSize": original_image_bytes.len(),
        "resizedSize": thumbnail_bytes.len(),
        "tags": tags_str,
        "entity_key": main_entity_key.unwrap().to_string()
    }))).into_response()
}

// Handler for the `GET /thumbnails` route.
async fn get_thumbnails(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let query = "type=\"thumbnail\" && app=\"golem-images-0.1\"";
    let results = state.ro_client.query_entity_keys(query).await;
    
    match results {
        Ok(keys) => Json(keys.into_iter().map(|key| key.to_string()).collect::<Vec<_>>()).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, format!("Error querying thumbnails: {}", e)).into_response(),
    }
}

// Handler for the `GET /parent/:thumbid` route.
async fn get_parent(
    State(state): State<Arc<AppState>>,
    Path(thumbid): Path<String>,
) -> impl IntoResponse {
    let entity_key = match golem_base_sdk::EntityKey::from_hex(&thumbid) {
        Ok(key) => key,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid thumbnail ID format.").into_response(),
    };

    let metadata = state.ro_client.get_entity_metadata(entity_key).await;

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
    // This function would contain the logic from the `getFullImage` TypeScript function.
    // It would query for the image's chunks and combine them.
    // Due to the complexity of the full logic, this is a placeholder.
    println!("GET /image/{} called. This would fetch and combine the image data.", id);
    (StatusCode::OK, "Full image fetching logic would go here.").into_response()
}

// Handler for the `POST /add-resize/:id` route.
async fn add_resize(
    State(state): State<Arc<AppState>>,
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
    // This handler would query for entities based on the search string.
    let query = format!("type=\"thumbnail\" && app=\"golem-images-0.1\" && tag=\"{}\"", search);
    println!("GET /query/{} called. Executing query: {}", search, query);
    (StatusCode::OK, "Query logic would go here.").into_response()
}

```
eof

### How to Run This App

To run this application, you will need to add the following to your `Cargo.toml` file.

```toml
[dependencies]
axum = "0.7"
tokio = { version = "1.0", features = ["full"] }
tower-http = { version = "0.5", features = ["cors"] }
golem-base-sdk = { git = "https://github.com/Golem-Base/rust-sdk.git" }
image = { version = "0.25", default-features = false, features = ["jpeg", "png"] }
serde_json = "1.0"
serde = "1.0"
