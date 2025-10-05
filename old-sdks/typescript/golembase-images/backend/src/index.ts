import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import sharp from 'sharp'
import { writeFile } from 'fs/promises'
import { inspect } from 'util'
import {
    AccountData,
    Annotation,
    createClient,
    GolemBaseCreate,
    Hex,
    Tagged,
} from 'golem-base-sdk'
import { readFileSync } from 'fs'
import { buffer } from 'stream/consumers'
import { readJsonWalletFromXDGWithPassword } from '@freckleface/typescript-wallets'

const app = express()
const port = 3000

const corsOptions = {
    origin: 'http://localhost:4200',
}
app.use(cors(corsOptions))

app.use(express.json())

// Configure multer to handle file uploads in memory
// This means the file will be available as a Buffer on `req.file`
const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

if (process.env.GOLEMDB_PASS === undefined) {
    console.log('Please set the GOLEMDB_PASS password in .env file')
    process.exit()
}

// Read the JSON wallet from the XDG folder
const key: AccountData = await readJsonWalletFromXDGWithPassword(
    process.env.GOLEMDB_PASS as string
)
//const keyBytes = readFileSync('./private.key')
//const key: AccountData = new Tagged('privatekey', keyBytes)
export const client = await createClient(
    1337,
    key,
    'http://localhost:8545',
    'ws://localhost:8545'
)

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
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
	`)
})

// Image:
// 	Data is the actual image data
//  Annotations:
//    type: image
//    tag: ...
//    tag: etc. (Can have multiple tag keys)
//    name: name of the image file (e.g. kitty.png)
//    custom_tag_1: value1
//    custom_tag_2: value2
//    custom_tag_3: value3
//    date_added: (numeric - Unix timestamp)
//    date_updated: (numeric - Unix timestamp)
// Second data item is the thumbnail
// 	Data is the thumbnail image data as .png
//  Annotations
//    parent: hash (as string, refers to the above data item)
//    type: thumbnail
// Additional data are resized versions
// 	Data is the resized image data as .png
//  Annotations
//    parent: hash (as string, refers to the above data item)
//    type: resized
//    size: (as string "1024x768", width by height)
//    width: (as number, in pixels)
//    height: (as number, in pixels)

// get all image thumbnails

// get all image names

// get image by ID

// get images by filename

// get image thumbnail

// get image size (and cache it in the database) -- so first check if the size exists, and if so, retrieve it; otherwise create/store it and send it back

// More:
// get images within a certain date range (once that's working)

/* DOCUMENTATION
 * TODO:
 *   Let's do a writeup on the difference between Uint8Array and Buffer, and how we store the data in Golem in Uint8Array
 *   and that res.send(data) and fs.writeFile are able to see that it's Uint8Array and build a buffer from it and send it out,
 *   but sharp doesn't check and needs and actual buffer. Without sharp, we could just rely on res.send and fs.writeFile
 *   doing what we need them to do without having to worry about the difference.
 */

const prepend0x = (id: string): Hex => {
    // Prepend '0x' if it's missing
    if (!id.startsWith('0x')) {
        id = '0x' + id
    }

    return id as Hex
}

interface ImageResult {
    id: string | null
    image_data: Buffer
    filename: string
    mimetype: string
}

const getFullImage = async (id: Hex) => {
    // For those not familiar with Partial, it's a great way to build up the object as we go
    // without having to put a bunch of | null's at the end of each type in the Interface
    // (because we don't want them to be null when we return the object.)
    // Here's the ref: https://www.typescriptlang.org/docs/handbook/utility-types.html#partialtype
    let result: Partial<ImageResult> = {
        id: id,
        mimetype: '',
        filename: '',
    }

    // Grab the metadata
    const metadata = await client.getEntityMetaData(id as Hex)
    console.log(metadata)

    // Grab the filename and mime type

    let filename = 'image'
    let partof = 1
    for (let annot of metadata.stringAnnotations) {
        if (annot.key == 'filename') {
            filename = annot.value
        } else if (annot.key == 'mime_type') {
            result.mimetype = annot.value
        }
    }
    for (let annot of metadata.numericAnnotations) {
        if (annot.key == 'part_of') {
            partof = annot.value
        }
    }

    result.filename = filename
    console.log(filename)
    console.log(result.mimetype)
    console.log(partof)

    console.log('Fetching raw data...')

    result.image_data = Buffer.from(await client.getStorageValue(id as Hex))

    // See if there are more parts.

    // 0x7112367186930e3d80624f326d6666e0369074e642af2d9c6a80dfe1e16cda6f
    if (partof > 1) {
        const chunks = [result.image_data]

        // The query only gives us the payload and not the metadata, so we'll query them each individually
        // (Note that we saved the values 1-based not 0-based, so the second has index 2 now)

        for (let i = 2; i <= partof; i++) {
            const chunk_info = await client.queryEntities(
                `parent="${id}" && type="image_chunk" && app="golem-images-0.1" && part=${i}`
            )
            console.log(`CHUNKS ${i}:`)
            console.log(chunk_info)
            chunks.push(chunk_info[0].storageValue as Buffer)
        }

        console.log(`SENDING ${chunks.length} chunks`)

        result.image_data = Buffer.concat(chunks)
    }

    return result as ImageResult
}

app.get('/thumbnails', async (req, res) => {
    // todo: Consider building an index, as pulling back all the thumbnail data via query is a lot of unnecessary overhead
    const thumbs = await client.queryEntities(
        'type="thumbnail" && app="golem-images-0.1"'
    )
    res.send(
        thumbs.map((item) => {
            return item.entityKey
        })
    )
})

app.get('/parent/:thumbid', async (req, res) => {
    let id: Hex = prepend0x(req.params.thumbid)

    // Get the metadata

    const metadata = await client.getEntityMetaData(id as Hex)
    if (metadata) {
        for (let annot of metadata.stringAnnotations) {
            if (annot.key == 'parent') {
                // Not sure yet, let's just return the parent key for now and see how that works
                res.send(annot.value)
                return
            }
        }
        // No parent key found
        res.status(404)
        res.send('not found')
        return
    } else {
        res.status(404)
        res.send('not found')
        return
    }
})

app.get('/image/:id', async (req, res) => {
    let id: Hex = prepend0x(req.params.id)

    let result: ImageResult = await getFullImage(id)
    res.set('Content-Disposition', `inline; filename="${result.filename}"`)
    res.type(result.mimetype)
    res.send(result.image_data)
})

app.post('/upload', upload.single('imageFile'), async (req, res) => {
    try {
        let entity_key = ''

        // --- 1. VALIDATE THE INPUT ---
        // Check if a file was uploaded
        if (!req.file) {
            return res.status(400).send('No image file was uploaded.')
        }

        console.log('Filename:')
        console.log(req.body.filename || req.file.originalname)

        // Check for the tags field
        console.log(req.body)
        const { tags } = req.body
        if (!tags || typeof tags !== 'string') {
            return res.status(400).send('Tags string is required.')
        }

        console.log(`Received upload with tags: "${tags}"`)

        let stringAnnotations = []
        let numericAnnotations = []

        stringAnnotations.push(new Annotation('tag', tags))

        // Add each tag as an annotation.
        // const tag_list = tags
        //     .split(',') // split by commas
        //     .map((tag) => tag.trim()) // remove leading/trailing space
        //     .filter((tag) => tag.length > 0) // remove empty strings resulting from multiple commas
        // for (let tag of tag_list) {
        //     stringAnnotations.push(new Annotation('tag', tag))
        // }

        for (let i = 1; i <= 3; i++) {
            const key = req.body[`custom_key${i}`]
            const value = req.body[`custom_value${i}`]
            if (key && value) {
                console.log(`Found custom key/value ${i}:`)
                console.log(key, value)
                if (typeof value === 'number' && !isNaN(value)) {
                    numericAnnotations.push(new Annotation(key, value))
                } else {
                    stringAnnotations.push(new Annotation(key, String(value)))
                }
            }
        }

        // --- 2. GET THE ORIGINAL IMAGE DATA ---
        // The original image is already in memory as a Buffer
        const originalImageBuffer = req.file.buffer
        console.log(`Original image size: ${originalImageBuffer.length} bytes`)

        // --- 3. RESIZE THE IMAGE USING SHARP ---
        // sharp takes the buffer, resizes it, and outputs a new buffer
        console.log('Resizing image to 60px width...')
        const resizedImageBuffer = await sharp(originalImageBuffer)
            .resize({
                width: 100,
                height: 100,
                fit: 'inside', // This ensures the image is resized to fit within a 100x100 box
            })
            .jpeg({ quality: 70 })
            .toBuffer()
        console.log(`Resized image size: ${resizedImageBuffer.length} bytes`)

        // Break into chunks if it's too big

        const chunks: Buffer[] = []

        const chunkSize = 100000

        for (let i = 0; i < originalImageBuffer.length; i += chunkSize) {
            const chunk = Buffer.from(
                originalImageBuffer.subarray(i, i + chunkSize)
            )
            chunks.push(chunk)
        }

        console.log(`Number of chunks: ${chunks.length}`)

        for (let chunk of chunks) {
            console.log(chunk.length)
        }

        // --- 4. PREPARE DATA ---

        try {
            // We have to do these creates sequentially, as we need the returned hash to be used in the thumbnail (and additional parts if needed).
            let creates_main: GolemBaseCreate[] = [
                {
                    data: chunks[0],
                    btl: 25,
                    stringAnnotations: [
                        new Annotation('type', 'image'),
                        new Annotation('app', 'golem-images-0.1'),
                        new Annotation(
                            'filename',
                            req.body.filename || req.file.originalname
                        ),
                        new Annotation('mime_type', req.file.mimetype),
                        ...stringAnnotations,
                    ],
                    numericAnnotations: [
                        new Annotation('part', 1),
                        new Annotation('part_of', chunks.length),
                        ...numericAnnotations,
                    ],
                },
            ]

            console.log('Sending main:')
            console.log(inspect(creates_main, { depth: 10 }))
            const receipts_main = await client.createEntities(creates_main)
            let hash = receipts_main[0].entityKey
            console.log('Receipts for main:')
            console.log(receipts_main)
            entity_key = receipts_main[0].entityKey

            let create_thumb: GolemBaseCreate[] = [
                {
                    data: resizedImageBuffer,
                    btl: 25,
                    stringAnnotations: [
                        new Annotation('parent', receipts_main[0].entityKey),
                        new Annotation('type', 'thumbnail'),
                        new Annotation('app', 'golem-images-0.1'),
                        new Annotation('resize', '100x100'),
                        new Annotation(
                            'filename',
                            `thumb_${req.body.filename || req.file.originalname}`
                        ),
                        new Annotation('mime_type', 'image/jpeg'), // Our thumbnail is jpg
                        ...stringAnnotations,
                    ],
                    numericAnnotations: [],
                },
            ]

            // Now if there are more chunks for the larger files, build creates for them.

            // Start at index [1] here, since we already saved index [0]
            for (let i = 1; i < chunks.length; i++) {
                const next_create: GolemBaseCreate[] = [
                    {
                        data: chunks[i],
                        btl: 25,
                        stringAnnotations: [
                            new Annotation(
                                'parent',
                                receipts_main[0].entityKey
                            ),
                            new Annotation('type', 'image_chunk'),
                            new Annotation('app', 'golem-images-0.1'),
                            new Annotation(
                                'filename',
                                req.body.filename || req.file.originalname
                            ),
                            new Annotation('mime_type', req.file.mimetype),
                            ...stringAnnotations,
                        ],
                        numericAnnotations: [
                            new Annotation('part', i + 1),
                            new Annotation('part_of', chunks.length),
                            ...numericAnnotations,
                        ],
                    },
                ]
                const next_receipt = await client.createEntities(next_create)
                console.log(`Next receipt: (part ${i + 1})`)
                console.log(next_receipt)
            }

            console.log('Sending thumbs and chunks:')
            const receipts_thumb = await client.createEntities(create_thumb)
            console.log('Receipts for thumb:')
            console.log(receipts_thumb)
        } catch (e) {
            console.log('ERROR')
            if (e instanceof Error) {
                if ((e as any)?.cause?.details) {
                    throw (e as any).cause.details
                }
            } else {
                throw e
            }
        }

        // // For testing -- save the files locally
        // try {
        //     const timestamp = Date.now() // Create a unique name for each upload
        //     const originalFilename = `test_output_${timestamp}_original.png`
        //     const resizedFilename = `test_output_${timestamp}_resized.png`

        //     // Asynchronously write the buffer to a file
        //     await writeFile(originalFilename, originalImageBuffer)
        //     console.log(
        //         `✅ Successfully saved original image to ${originalFilename}`
        //     )

        //     //     await writeFile(resizedFilename, resizedImageBuffer)
        //     //     console.log(
        //     //         `✅ Successfully saved resized image to ${resizedFilename}`
        //     //     )
        // } catch (err) {
        //     console.error('Error saving files for testing:', err)
        // }

        // --- 5. SEND A SUCCESS RESPONSE ---
        res.status(200).json({
            message: 'File processed successfully!',
            originalSize: originalImageBuffer.length,
            resizedSize: resizedImageBuffer.length,
            tags: tags,
            entity_key: entity_key,
        })
    } catch (error) {
        console.error('Error processing image:', error)
        res.status(500).send(
            `An error occurred while processing the image: ${error}`
        )
    }
})

app.post('/add-resize/:id', async (req, res) => {
    let id: Hex = prepend0x(req.params.id)

    // Grab image
    let result: ImageResult = await getFullImage(id)

    // Get the dimensions of the original
    const image_meta = await sharp(result.image_data).metadata()
    const original_width = image_meta.width
    const original_height = image_meta.height

    // It was broken, but Gemini helped me track down the problem by
    // printing out the following. The second line should be true,
    // but it was false. That meant I needed to call
    // Buffer.from(result.image_data) before sending it to Sharp.
    // (Yet the file saver was able to spot the difference and make
    // the change accordingly.)
    // console.log('Type of retrieved data:', typeof result.image_data)
    // console.log('Is it a Buffer?', Buffer.isBuffer(result.image_data))
    // console.log('Retrieved data structure:', result.image_data)

    const { width, height } = req.body

    // If the user provides a width but no height, leave height out of params to .resize and let Sharp calculate it.
    // Similarly with height. If both are provided, tell Sharp to use the "fill" form of fitting in case aspect ratio is different.
    const resizeOptions: sharp.ResizeOptions = {}
    let finalWidth: number = 0
    let finalHeight: number = 0

    // Validate that if width/height are provided, they are valid numbers
    const parsedWidth = width ? parseInt(width, 10) : undefined
    const parsedHeight = height ? parseInt(height, 10) : undefined

    // Figure out which options to fill in, while also figure out the "WxH" string to save with the golem metadata
    if (parsedWidth && parsedHeight) {
        // Case 1: Both width and height are provided (stretch/fill)
        resizeOptions.width = parsedWidth
        resizeOptions.height = parsedHeight
        resizeOptions.fit = 'fill'

        finalWidth = parsedWidth
        finalHeight = parsedHeight
    } else if (parsedWidth) {
        // Case 2: Only width is provided
        resizeOptions.width = parsedWidth
        finalWidth = parsedWidth
        const aspectRatio = original_height / original_width
        finalHeight = Math.round(parsedWidth * aspectRatio)
    } else if (parsedHeight) {
        // Case 3: Only height is provided
        resizeOptions.height = parsedHeight
        finalHeight = parsedHeight
        const aspectRatio = original_width / original_height
        finalWidth = Math.round(parsedHeight * aspectRatio)
    } else {
        // Case 4: Neither is provided (no resize)
        console.log('Case: No dimensions provided.')
        finalWidth = original_width
        finalHeight = original_height
    }

    const resolutionString = `${finalWidth}x${finalHeight}`
    console.log(resolutionString)

    // Check if this image already exists

    // Resize using the given parameters
    const resizedImageBuffer = await sharp(result.image_data)
        .resize(resizeOptions)
        .jpeg({ quality: 70 }) // For now we'll just always do jpeg at 70%. In a future version we can ask the user for type/quality
        .toBuffer()
    console.log(`Resized image size: ${resizedImageBuffer.length} bytes`)

    res.type('image/jpeg')
    res.send(resizedImageBuffer)
})

// Search -- by tag, but really anything
// Feature request for Golem-base -- search and only return the IDs and not payloads, search and return IDs and metadata but not payload
app.get('/query/:search', async (req, res) => {
    const search = req.params.search
    const query = `type="thumbnail" && app="golem-images-0.1" && (tag~"${search}" || (tag~"${search},*" || (tag~"*,${search},*" || tag~"*,${search}")))`
    console.log(query)
    const results = await client.queryEntities(query)
    res.send(
        results.map((item) => {
            return item.entityKey
        })
    )
})

// Start server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`)
})
