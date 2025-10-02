import 'dotenv/config'
import { Wallet } from 'ethers'
import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import xdg from 'xdg-portable'

export const createWalletAtFileWithPassword = async (
    password: string,
    filePath: string
) => {
    try {
        if (!process.env.GOLEMDB_PASS) {
            console.log(`No password provided. Please create a .env file in the root of your project
and include a line such as the following:

    GOLEMDB_PASS=abc123

(Tip: Do not put the .env file in your src directory.)`)
            return
        }

        if (existsSync(filePath)) {
            console.log(`Error: The file '${filePath}' already exists.`)
            console.log(
                'Please delete it manually if you want to create a new one.'
            )
            return // Exit the function gracefully
        }

        // Generate a new random wallet
        const wallet = Wallet.createRandom()
        const accountAddress = wallet.address
        console.log(`New account address created: ${accountAddress}`)

        // Encrypt the wallet with the provided password.
        // The encrypt method from ethers.js requires the options object as the third parameter.
        const encryptedWallet = await wallet.encrypt(password)

        // Write the encrypted JSON string to the specified file path.
        await writeFile(filePath, encryptedWallet)

        console.log(
            `Successfully created encrypted wallet file at: ${filePath}`
        )
    } catch (error) {
        console.error('Failed to create encrypted wallet file:', error)
        throw error
    }
}

const filePath = join(xdg.config(), 'golembase', 'wallet.json')
createWalletAtFileWithPassword(process.env.GOLEMDB_PASS as string, filePath)
