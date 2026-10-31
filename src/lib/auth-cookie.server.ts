import type {StoredTokens} from "@yotoplay/oauth-device-code-flow"

import {getAuthSecret} from "./app-context"
import {decrypt, encrypt} from "./encryption.server"

function getSecret(env: Env): string {
    return getAuthSecret(env)
}

function parseCookieHeader(
    cookieHeader: string | null,
): Record<string, string> {
    if (!cookieHeader) return {}
    const cookies: Record<string, string> = {}
    for (const pair of cookieHeader.split(";")) {
        const [k, ...v] = pair.trim().split("=")
        if (k) {
            cookies[k] = decodeURIComponent(v.join("="))
        }
    }
    return cookies
}

export function _resetAuthCookie() {
    // No-op for test compatibility
}

export const pkceCookie = {
    async serialize(
        data: unknown,
        opts: {maxAge?: number} = {},
    ): Promise<string> {
        const val = typeof data === "string" ? data : JSON.stringify(data)
        const maxAge = opts.maxAge !== undefined ? opts.maxAge : 600 // 10 mins
        return `yoto-pkce=${encodeURIComponent(val)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax`
    },
    async parse(cookieHeader: string | null): Promise<unknown | null> {
        const cookies = parseCookieHeader(cookieHeader)
        const val = cookies["yoto-pkce"]
        if (!val) return null
        try {
            return JSON.parse(val)
        } catch {
            return val
        }
    },
}

export async function getTokensFromCookie(
    request: Request,
    env: Env,
): Promise<StoredTokens | null> {
    const cookieHeader = request.headers.get("Cookie")
    if (!cookieHeader || !cookieHeader.includes("yoto-auth=")) return null

    const cookies = parseCookieHeader(cookieHeader)
    let encrypted = cookies["yoto-auth"]
    if (!encrypted) return null

    // If signed with react-router s:... format, strip signature
    if (encrypted.startsWith("s:")) {
        encrypted = decodeURIComponent(encrypted.slice(2).split(".")[0])
    }

    try {
        const json = await decrypt(encrypted, getSecret(env))
        return JSON.parse(json)
    } catch {
        return null // Decryption failed
    }
}

export async function serializeAuthCookie(
    tokens: StoredTokens,
    env: Env,
    secure = true,
): Promise<string> {
    const json = JSON.stringify(tokens)
    const encrypted = await encrypt(json, getSecret(env))
    const parts = [
        `yoto-auth=${encodeURIComponent(encrypted)}`,
        `Max-Age=${60 * 60 * 24 * 30}`,
        `Path=/`,
        `HttpOnly`,
        `SameSite=Lax`,
    ]
    if (secure) {
        parts.push("Secure")
    }
    return parts.join("; ")
}

export async function clearAuthCookie(
    env: Env,
    secure = true,
): Promise<string> {
    const parts = [
        `yoto-auth=`,
        `Max-Age=0`,
        `Path=/`,
        `HttpOnly`,
        `SameSite=Lax`,
    ]
    if (secure) {
        parts.push("Secure")
    }
    return parts.join("; ")
}
