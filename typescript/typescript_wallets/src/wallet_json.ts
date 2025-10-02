import { join } from 'path'
import { readPassword } from './prompt_password.js'
import { readFileSync } from 'fs'
import xdg from 'xdg-portable'
import { getBytes, HDNodeWallet, Wallet } from 'ethers'
import { writeFile } from 'fs/promises'
import { AccountData, Tagged } from 'golem-base-sdk'

// The xdg-portable library doesn't play nice with strict TypeScript, so let's just kill the error for now.
// Maybe someday the developer will fix this problem.
// @ts-ignore
let xdgConfig = xdg.config

// ==== JSON WALLET HELPERS ====

/**
 *
 * @param password
 * @param filepath
 */
export const createWalletAtFileWithPassword = async (
    password: string,
    filePath: string
) => {
    try {
        // Generate a new random wallet
        const wallet = Wallet.createRandom()

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

/**
 *
 * @param password
 * @param filename
 */
export const createWalletAtXDGWithPassword = async (
    password: string,
    filename: string = 'wallet.json'
) => {
    const filePath = join(xdgConfig(), 'golembase', filename)
    return await createWalletAtFileWithPassword(password, filePath)
}

/**
 *
 * @param filePath
 */
export const createWalletAtFileAskPassword = async (filePath: string) => {
    return await createWalletAtFileWithPassword(await readPassword(), filePath)
}

/**
 *
 * @param filename
 */
export const createWalletAtXDGAskPassword = async (filename: string) => {
    return await createWalletAtXDGWithPassword(await readPassword(), filename)
}

/**
 * Reads a JSON wallet found in the XDG path, such as ~/.config/golembase/wallet.json
 * The function will prompt the user for a password.
 * @param filename (optional) - The name of the file without a path. (The path will be determined by XDG, and within the "golembase" subdirectory.)
 */
export const readJsonWalletFromXDGAskPassword = async (
    prompt: string = 'Enter wallet password: ',
    filename: string = 'wallet.json'
): Promise<AccountData> => {
    const walletPath = join(xdgConfig(), 'golembase', 'wallet.json')
    return await readJsonWalletFromFileWithPassword(
        await readPassword(),
        walletPath
    )
}

/**
 * Reads a JSON wallet from a specific path/filename. If none given, the default will be ./wallet.json.
 * The function will prompt the user for a password.
 * @param filename
 */
export const readJsonWalletFromFileAskPassword = async (
    prompt: string = 'Enter wallet password: ',
    filePath: string = './wallet.json'
): Promise<AccountData> => {
    return await readJsonWalletFromFileWithPassword(
        await readPassword(),
        filePath
    )
}

/**
 * Reads a JSON wallet found in the XDG path, such as ~/.config/golembase/wallet.json
 * The function does NOT prompt the user for a password; instead, supply it as a parameter
 * @param password - the password to open the wallet.json file
 * @param filename (optional) - The name of the file without a path. (The path will be determined by XDG, and within the "golembase" subdirectory.)
 */
export const readJsonWalletFromXDGWithPassword = async (
    password: string,
    filename: string = 'wallet.json'
): Promise<AccountData> => {
    const walletPath = join(xdgConfig(), 'golembase', filename)
    return readJsonWalletFromFileWithPassword(password, walletPath)
}

/**
 * Reads a JSON wallet from a specific path/filename. If none given, the default will be ./wallet.json.
 * The function does NOT prompt the user for a password; instead, supply it as a parameter
 * @param password - the password to open the wallet.json file.
 * @param filename (optional) - The name of the file with a full path.
 */
export const readJsonWalletFromFileWithPassword = async (
    password: string,
    filePath: string = './wallet.json'
): Promise<AccountData> => {
    const keystore = readFileSync(filePath, 'utf8')
    const wallet = await Wallet.fromEncryptedJson(keystore, password)
    const key: AccountData = new Tagged(
        'privatekey',
        getBytes(wallet.privateKey)
    )
    return key
}
