import { stdin, stdout } from 'process'
import { createInterface } from 'readline'

// This function was written by Chris O'Brien
export const readPassword = async (
    prompt: string = 'Enter wallet password: '
): Promise<string> => {
    if (stdin.isTTY) {
        // Interactive prompt
        const rl = createInterface({
            input: stdin,
            output: stdout,
            terminal: true,
        })

        return new Promise((resolve) => {
            rl.question(prompt, (password) => {
                rl.close()
                resolve(password.trim())
            })
            // Hide input for security
            ;(rl as any)._writeToOutput = () => {}
        })
    } else {
        // Input is piped
        const chunks: Buffer[] = []
        for await (const chunk of stdin) {
            chunks.push(Buffer.from(chunk))
        }
        return Buffer.concat(chunks).toString().trim()
    }
}
