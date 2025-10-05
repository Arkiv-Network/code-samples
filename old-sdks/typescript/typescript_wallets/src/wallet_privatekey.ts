import { Wallet } from '@ethereumjs/wallet'
import { readFile, writeFile } from 'fs/promises'
import { AccountData, Tagged } from 'golem-base-sdk'
import { join } from 'path'
import xdg from 'xdg-portable'

// The xdg-portable library doesn't play nice with strict TypeScript, so let's just kill the error for now.
// Maybe someday the developer will fix this problem.
// @ts-ignore
let xdgConfig = xdg.config()

// Note: private.key files do not use a password.

/**
 *
 * @param filePath
 * @returns
 */
export const createPrivateKeyAtFile = async (filePath: string) => {
    const wallet = Wallet.generate()
    const privateKey = wallet.getPrivateKey()

    await writeFile(filePath, privateKey)
    console.log('Address:', wallet.getAddressString())
    return
}

/**
 *
 * @param filename
 * @returns
 */
export const createPrivateKeyAtXDG = async (filename: string) => {
    const filePath = join(xdgConfig(), 'golembase', 'wallet.json')
    return createPrivateKeyAtFile(filePath)
}

/**
 * Reads a private.key file found in the XDG path, such as ~/.config/golembase/private.key.
 * @param filename (optional) - The name of the file without the path. (The path will be determined by XDG, and within the "golembase" subdirectory.)
 */
export const readPrivateKeyFromXDG = async (
    filename: string = 'private.key'
): Promise<AccountData> => {
    return await readPrivateKeyFromFile(
        join(xdgConfig(), 'golembase', filename)
    )
}

/**
 * Reads a private.key file form a specific path/filename. If none given, the default will be ./private.key.
 * @param filePath (optional) - The name of the file with a full path.
 */
export const readPrivateKeyFromFile = async (
    filePath: string = './private.key'
): Promise<AccountData> => {
    const keyBytes = await readFile(filePath)
    const key: AccountData = new Tagged('privatekey', keyBytes)
    return key
}
