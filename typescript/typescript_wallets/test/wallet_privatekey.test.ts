import { join } from 'path'
import '../src/wallet_json'
import xdg from 'xdg-portable'
import { readFile, rm } from 'fs/promises'
import {
    createWalletAtFileWithPassword,
    createWalletAtXDGWithPassword,
    readJsonWalletFromFileWithPassword,
    readJsonWalletFromXDGWithPassword,
} from '../src/wallet_json'
import { existsSync } from 'fs'

describe('wallet XDG', () => {
    it('should create wallet.json in XDG path ~/.config/golembase', async () => {
        const filename = 'wallet_test.json'

        const filePath = join(xdg.config(), 'golembase', filename)
        console.log(filePath)

        // Delete any wallet_test.json
        await rm(filePath, { force: true })

        // Create the file

        await createWalletAtXDGWithPassword('abc123', filename)

        // Check if it exists

        const fileExists = existsSync(filePath)
        expect(fileExists).toBe(true)

        // Decode the file

        let parseError = null

        try {
            const fileContents = await readFile(filePath, 'utf-8')
            JSON.parse(fileContents)

            // We won't save the JSON data; we're assuming if it reads in it's good
        } catch (e) {
            parseError = e
        }

        expect(parseError).toBeNull()

        const key = readJsonWalletFromXDGWithPassword('abc123', filename)

        expect(key).not.toBeNull()

        // Read in the file and make sure it loads fine
    })

    // it('should return the correct sum when a negative number is included', () => {
    //     expect(sum(10, -5)).toBe(5)
    // })

    // it('should return 0 for two numbers that sum to 0', () => {
    //     expect(sum(0, 0)).toBe(0)
    // })
})

describe('wallet filepath', () => {
    it('should create wallet.json in path .', async () => {
        // We'll manually construct a path to ~/.config/golembase
        // and use the non-XDG calls.
        const filename = 'wallet_test2.json'
        const filePath = join(xdg.config(), 'golembase', filename)

        // Delete any wallet_test.json
        await rm(filePath, { force: true })

        // Create the file
        await createWalletAtFileWithPassword('abc123', filePath)

        // Check if it exists
        const fileExists = existsSync(filePath)
        expect(fileExists).toBe(true)

        // Decode the file

        let parseError = null

        try {
            const fileContents = await readFile(filePath, 'utf-8')
            JSON.parse(fileContents)

            // We won't save the JSON data; we're assuming if it reads in it's good
        } catch (e) {
            parseError = e
        }

        expect(parseError).toBeNull()

        const key = readJsonWalletFromFileWithPassword('abc123', filePath)

        expect(key).not.toBeNull()

        // Read in the file and make sure it loads fine
    })

    // it('should return the correct sum when a negative number is included', () => {
    //     expect(sum(10, -5)).toBe(5)
    // })

    // it('should return 0 for two numbers that sum to 0', () => {
    //     expect(sum(0, 0)).toBe(0)
    // })
})
