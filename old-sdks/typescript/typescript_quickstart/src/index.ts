import 'dotenv/config'
import xdg from 'xdg-portable'
import { getBytes, Wallet } from 'ethers'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
    AccountData,
    Annotation,
    createClient,
    GolemBaseCreate,
    GolemBaseExtend,
    GolemBaseUpdate,
    Tagged,
} from 'golem-base-sdk'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

//
// Step 1: Read the wallet and from that the key
//         Note: We're reading the password from the .env file
//         Normally you would NOT check the .env file into
//         version control; however, for this sample we are
//         so you can see where to put it and what format
//         it should be in.
//

// Read wallet

const walletPath = join(xdg.config(), 'golembase', 'wallet.json')
const keystore = readFileSync(walletPath, 'utf8')
const wallet = Wallet.fromEncryptedJsonSync(
    keystore,
    process.env.GOLEMDB_PASS as string
)

// Read key from wallet
const key: AccountData = new Tagged('privatekey', getBytes(wallet.privateKey))

//
// Step 2: Create a client that connects to a GolemDB node
//

// const client = await createClient(
//     60138453025,
//     key,
//     'https://kaolin.holesky.golem-base.io/rpc',
//     'wss://kaolin.holesky.golem-base.io/rpc/ws'
// )

const client = await createClient(
    1337,
    key,
    'http://localhost:8545',
    'http://localhost:8545'
)

//
// Try connecting to the client.
//     As an example, we'll request the current block number

const block = await client.getRawClient().httpClient.getBlockNumber()

console.log(block)

//
// Step 3: Create two entities and store them
//

const creates: GolemBaseCreate[] = [
    {
        data: encoder.encode('Imagine Dragons'),
        btl: 25,
        stringAnnotations: [
            new Annotation('first_album', 'Night Visions'),
            new Annotation('singer', 'Dan Reynolds'),
        ],
        numericAnnotations: [new Annotation('year_formed', 2008)],
    },
    {
        data: encoder.encode('Foo Fighters'),
        btl: 25,
        stringAnnotations: [
            new Annotation('first_album', 'Foo Fighters'),
            new Annotation('singer', 'Dave Grohl'),
        ],
        numericAnnotations: [new Annotation('year_formed', 1994)],
    },
]

const receipts = await client.createEntities(creates)
console.log('Receipts from create (entity key and expiration block):')
console.log(receipts)

// Tip: The test net gets a lot of activity. Monitor it and
// see if 25 for BTL is really enough for your application's needs

//
// Step 4: Delete the second of the two entities
//

// Let's grab keys. This is just a sample so we're safe
// hardcoding the indexes, 0 and 1.
const first_key = receipts[0].entityKey
const second_key = receipts[1].entityKey

// Notice we pass an array; we're allowed to delete multiple entities
await client.deleteEntities([second_key])

// Let's print out how many entities we now own.

// Get the owner
let owner = await client.getOwnerAddress()

// Get the count; watch closely if you this app multiple times,
// and factor in blocks to live as well.
let entity_count = (await client.getEntitiesOfOwner(owner)).length
console.log(`Number of entities after delete: ${entity_count}`)

//
// Step 5: Update an entity
//

// Let's update the Imagine Dragons entity by adding the second album.
// First, we'll read the existing entity

const imagine_data = await client.getStorageValue(first_key)
console.log(decoder.decode(imagine_data))

const imagine_metadata = await client.getEntityMetaData(first_key)
console.log(imagine_metadata)

const updates: GolemBaseUpdate[] = [
    {
        entityKey: first_key,
        btl: 40,
        data: imagine_data,
        stringAnnotations: [
            ...imagine_metadata.stringAnnotations,
            new Annotation('second_album', 'Smoke + Mirrors'),
        ],
        numericAnnotations: [],
    },
]

await client.updateEntities(updates)

console.log('Entities updated!')

// Let's verify

const imagine_metadata2 = await client.getEntityMetaData(first_key)
console.log(imagine_metadata2)

//
// Step 6: Extend the blocks to live
//

// Let's extend the blocks for the first entity to live by 40

const extensions: GolemBaseExtend[] = [
    {
        entityKey: first_key,
        numberOfBlocks: 40,
    },
]

await client.extendEntities(extensions)

// Let's verify again

const imagine_metadata3 = await client.getEntityMetaData(first_key)
console.log(imagine_metadata3.expiresAtBlock - imagine_metadata2.expiresAtBlock)

//
// Step 7: A simple query
//

// Let's do a quick query for demo purposes, even though we have only one entity
const result = await client.queryEntities(
    'first_album="Night Visions" && singer="Dan Reynolds"'
)
console.log(result)

// Tip: If you run this app and quickly run it again before the entities expire,
// you might see more than one result in the query.
