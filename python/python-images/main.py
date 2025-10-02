import os
import asyncio
from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_file, Response, render_template_string
from flask_cors import CORS
from io import BytesIO
from PIL import Image
from golem_base_sdk import GenericBytes, decrypt_wallet, Annotation, GolemBaseClient, GolemBaseCreate, GolemBaseROClient

# Load environment variables
load_dotenv()

# Set up the Flask application
app = Flask(__name__)
CORS(app)
app.config['GOLEMDB_PASS'] = os.getenv('GOLEMDB_PASS')
# NOTE: The TypeScript code uses cors, but Flask's built-in server doesn't have CORS. 
# For production, you'd use a library like `flask_cors`.

if not app.config['GOLEMDB_PASS']:
    print('Please set the GOLEMDB_PASS password in the .env file.')
    exit()

def str_to_entity_key(entity_id):
    entity_key = GenericBytes.from_hex_string(entity_id)
    return entity_key


# Since Flask is synchronous by default, we'll run the Golem-Base SDK calls 
# inside an asyncio event loop.
async def get_golem_client():
    # In a real app, you might want a more robust way to manage the client lifecycle
    # or use a different web framework that is inherently async.

    private_key = await decrypt_wallet()
    # We create a read-write client to create new entities
    client = await GolemBaseClient.create_rw_client(
        rpc_url='http://localhost:8545',
        ws_url='ws://localhost:8545',
        private_key=private_key
    )
    return client

async def get_ro_client():
    # A read-only client for read-only operations
    client = await GolemBaseClient.create_ro_client(
        rpc_url='http://localhost:8545',
        ws_url='ws://localhost:8545'
    )
    return client

# Global client instances
# NOTE: It's important to manage the lifecycle of these clients carefully in a
# production environment. This is a simplified approach.
ro_client = asyncio.run(get_ro_client())
rw_client = asyncio.run(get_golem_client())

def prepend_0x(entity_id: str) -> str:
    """Prepends '0x' to the entity ID if it's missing."""
    return f"0x{entity_id}" if not entity_id.startswith('0x') else entity_id

def get_full_image_sync(entity_id: str):
    """Synchronous wrapper for async image retrieval."""
    return asyncio.run(get_full_image_async(entity_id))

async def get_full_image_async(entity_id: str):
    """
    Fetches the full image from Golem-Base, including chunks if present.
    """
    golem_client = ro_client
    image_data = None
    filename = None
    mimetype = None
    part_of = 1

    metadata = await golem_client.get_entity_metadata(entity_id)

    if metadata:
        for annot in metadata.string_annotations:
            if annot.key == 'filename':
                filename = annot.value
            elif annot.key == 'mime_type':
                mimetype = annot.value
        for annot in metadata.numeric_annotations:
            if annot.key == 'part_of':
                part_of = int(annot.value)

    print('Fetching raw data...')
    image_data = await golem_client.get_storage_value(entity_id)
    
    # Handle multi-chunk images
    if part_of > 1:
        chunks = [image_data]
        for i in range(2, part_of + 1):
            query_str = f'parent="{entity_id}" && type="image_chunk" && app="golem-images-0.1" && part={i}'
            chunk_info = await golem_client.query_entities(query_str)
            if chunk_info and chunk_info[0].storage_value:
                chunks.append(chunk_info[0].storage_value)
        
        # Concatenate chunks
        full_image_bytes = b"".join(chunks)
        image_data = full_image_bytes

    return {
        'id': entity_id,
        'image_data': image_data,
        'filename': filename,
        'mimetype': mimetype,
    }


@app.route('/')
def index():
    """Serves the HTML form for image upload."""
    return render_template_string('''
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Image Uploader</title>
            <style>
                body { font-family: sans-serif; max-width: 600px; margin: 2em auto; }
                form { display: flex; flex-direction: column; gap: 1em; }
                input, button { padding: 0.5em; }
            </style>
        </head>
        <body>
            <h1>Upload an Image</h1>
            <form action="/upload" method="POST" enctype="multipart/form-data">
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
    ''')

@app.route('/thumbnails')
def get_thumbnails():
    """Gets all thumbnail entity keys."""
    client = ro_client
    query = 'type="thumbnail" && app="golem-images-0.1"'
    results = asyncio.run(client.query_entities(query))
    entity_keys = [item.entity_key for item in results]
    return jsonify(entity_keys)

@app.route('/parent/<thumbid>')
def get_parent(thumbid):
    """Gets the parent ID for a given thumbnail ID."""
    client = ro_client
    entity_id = prepend_0x(thumbid)
    entity_key = str_to_entity_key(entity_id)
    print(entity_key)
    metadata = asyncio.run(client.get_entity_metadata(entity_key))
    if metadata:
        for annot in metadata.string_annotations:
            if annot.key == 'parent':
                return annot.value
    return 'not found', 404

@app.route('/image/<entity_id>')
def get_image(entity_id):
    """Retrieves and serves a full image from Golem-Base."""
    try:
        image_id = prepend_0x(entity_id)
        entity_key = str_to_entity_key(entity_id)
        result = get_full_image_sync(entity_key)
        
        if not result['image_data']:
            return 'Image not found', 404
        
        return Response(result['image_data'], mimetype=result['mimetype'])
    except Exception as e:
        print(f"Error fetching image: {e}")
        return str(e), 500

@app.route('/upload', methods=['POST'])
def upload_file():
    """
    Handles file upload, resizes, and saves the original and thumbnail to Golem-Base.
    """
    # 1. VALIDATE INPUT
    if 'imageFile' not in request.files:
        return jsonify({'error': 'No image file was uploaded.'}), 400
    
    file = request.files['imageFile']
    tags = request.form.get('tags')
    filename = request.form.get('filename') or file.filename

    if not tags:
        return jsonify({'error': 'Tags string is required.'}), 400

    string_annotations = [
        Annotation('tag', tags),
        Annotation('type', 'image'),
        Annotation('app', 'golem-images-0.1'),
        Annotation('filename', filename),
        Annotation('mime_type', file.mimetype),
    ]
    numeric_annotations = []

    # Handle custom tags
    for i in range(1, 4):
        key = request.form.get(f'custom_key{i}')
        value = request.form.get(f'custom_value{i}')
        if key and value:
            try:
                numeric_annotations.append(Annotation(key, int(value)))
            except ValueError:
                string_annotations.append(Annotation(key, str(value)))

    # 2. GET ORIGINAL IMAGE DATA
    original_image_bytes = file.read()
    print(f"Original image size: {len(original_image_bytes)} bytes")
    
    # 3. RESIZE THE IMAGE USING PIL (Pillow)
    img = Image.open(BytesIO(original_image_bytes))
    img.thumbnail((100, 100))
    
    resized_bytes_io = BytesIO()
    img.save(resized_bytes_io, format='JPEG')
    resized_image_bytes = resized_bytes_io.getvalue()
    print(f"Resized image size: {len(resized_image_bytes)} bytes")

    # 4. PREPARE DATA FOR GOLEM-BASE
    try:
        # Split original image into chunks
        chunk_size = 100000
        chunks = [original_image_bytes[i:i + chunk_size] for i in range(0, len(original_image_bytes), chunk_size)]
        
        # Create the main image entity
        main_create = GolemBaseCreate(
            data=chunks[0],
            btl=25,
            string_annotations=string_annotations,
            numeric_annotations=[Annotation('part', 1), Annotation('part_of', len(chunks))]
        )
        
        # Send the main entity create request
        receipts_main = asyncio.run(rw_client.create_entities([main_create]))
        main_entity_key = receipts_main[0].entity_key.as_hex_string()

        # Create additional chunks if they exist
        if len(chunks) > 1:
            chunk_creates = []
            for i, chunk in enumerate(chunks[1:]):
                chunk_creates.append(GolemBaseCreate(
                    data=chunk,
                    btl=25,
                    string_annotations=[
                        Annotation('parent', main_entity_key),
                        Annotation('type', 'image_chunk'),
                        Annotation('app', 'golem-images-0.1'),
                        Annotation('filename', filename),
                        Annotation('mime_type', file.mimetype)
                    ],
                    numeric_annotations=[
                        Annotation('part', i + 2),
                        Annotation('part_of', len(chunks))
                    ]
                ))
            asyncio.run(rw_client.create_entities(chunk_creates))

        # Create the thumbnail entity
        thumb_create = GolemBaseCreate(
            data=resized_image_bytes,
            btl=25,
            string_annotations=[
                Annotation('parent', main_entity_key),
                Annotation('type', 'thumbnail'),
                Annotation('app', 'golem-images-0.1'),
                Annotation('resize', '100x100'),
                Annotation('filename', f'thumb_{filename}'),
                Annotation('mime_type', 'image/jpeg'),
            ],
            numeric_annotations=[]
        )
        asyncio.run(rw_client.create_entities([thumb_create]))

    except Exception as e:
        print(f"Error during Golem-Base operation: {e}")
        return jsonify({'error': f'Failed to process image: {e}'}), 500

    # 5. SEND SUCCESS RESPONSE
    return jsonify({
        'message': 'File processed successfully!',
        'originalSize': len(original_image_bytes),
        'resizedSize': len(resized_image_bytes),
        'tags': tags,
        'entity_key': main_entity_key,
    })

@app.route('/add-resize/<entity_id>', methods=['POST'])
def add_resize(entity_id):
    """
    Creates and saves a resized version of an existing image to Golem-Base.
    """
    try:
        image_id = prepend_0x(entity_id)
        result = get_full_image_sync(image_id)
        
        if not result['image_data']:
            return 'Image not found', 404

        img = Image.open(BytesIO(result['image_data']))
        original_width, original_height = img.size

        # Get resize parameters from the request body
        width_str = request.json.get('width')
        height_str = request.json.get('height')
        
        width = int(width_str) if width_str else None
        height = int(height_str) if height_str else None

        final_width, final_height = original_width, original_height
        
        if width and height:
            resized_img = img.resize((width, height), Image.LANCZOS)
            final_width, final_height = width, height
        elif width:
            aspect_ratio = original_height / original_width
            final_height = int(width * aspect_ratio)
            resized_img = img.resize((width, final_height), Image.LANCZOS)
            final_width = width
        elif height:
            aspect_ratio = original_width / original_height
            final_width = int(height * aspect_ratio)
            resized_img = img.resize((final_width, height), Image.LANCZOS)
            final_height = height
        else:
            return 'No dimensions provided.', 400

        resized_bytes_io = BytesIO()
        resized_img.save(resized_bytes_io, format='JPEG')
        resized_image_bytes = resized_bytes_io.getvalue()

        # Create new entity for the resized image
        resized_create = GolemBaseCreate(
            data=resized_image_bytes,
            btl=25,
            string_annotations=[
                Annotation('parent', image_id),
                Annotation('type', 'resized'),
                Annotation('app', 'golem-images-0.1'),
                Annotation('resize', f'{final_width}x{final_height}'),
                Annotation('filename', result['filename']),
                Annotation('mime_type', 'image/jpeg'),
            ],
            numeric_annotations=[
                Annotation('width', final_width),
                Annotation('height', final_height),
            ]
        )
        asyncio.run(rw_client.create_entities([resized_create]))

        return Response(resized_image_bytes, mimetype='image/jpeg')

    except Exception as e:
        print(f"Error adding resized image: {e}")
        return str(e), 500

@app.route('/query/<search>')
def query_entities(search):
    """Queries Golem-Base entities by tag."""
    client = ro_client
    # The TypeScript regex is complex; this is a simpler but effective equivalent.
    query = f'type="thumbnail" && app="golem-images-0.1" && tag~"{search}"'
    results = asyncio.run(client.query_entities(query))
    entity_keys = [item.entity_key.as_hex_string() for item in results]
    return jsonify(entity_keys)

if __name__ == '__main__':
    app.run(debug=True, port=3000)