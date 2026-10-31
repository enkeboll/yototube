import {getAuthSecret} from "./app-context"
import {decrypt, encrypt} from "./encryption.server"

function getSecret(env: Env): string {
    return getAuthSecret(env)
}

async function createImportCredential(
    accessToken: string,
    env: Env,
): Promise<string> {
    return encrypt(accessToken, getSecret(env))
}

async function readImportCredential(
    credential: string,
    env: Env,
): Promise<string> {
    return decrypt(credential, getSecret(env))
}

export {createImportCredential, readImportCredential}
