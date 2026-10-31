import process from "node:process"

try {
    process.loadEnvFile?.()
} catch {
    // .env may not exist in environments where vars are passed directly
}

let ephemeralSecret: string | null = null

export function getAuthSecret(env?: Partial<Env>): string {
    const secret = env?.YOTO_AUTH_SECRET || process.env.YOTO_AUTH_SECRET
    if (secret) {
        return secret
    }

    if (process.env.NODE_ENV === "production") {
        if (!ephemeralSecret) {
            console.warn(
                "⚠️ [auth] YOTO_AUTH_SECRET is not set. Using an ephemeral in-memory secret. " +
                    "Sessions will reset if the server restarts. Set YOTO_AUTH_SECRET in your environment for persistent sessions.",
            )
            ephemeralSecret =
                "yoto-ephemeral-secret-" +
                Math.random().toString(36).slice(2) +
                Date.now().toString(36)
        }
        return ephemeralSecret
    }

    return "dev-yototube-cookie-encryption-secret-key-32b"
}

export function getAppEnv(context?: {locals?: {env?: Env}; env?: Env}): Env {
    if (context?.locals?.env) {
        return context.locals.env
    }
    if (context?.env) {
        return context.env
    }

    return {
        YOTO_AUTH_SECRET: getAuthSecret(),
        YOTO_CLIENT_ID: process.env.YOTO_CLIENT_ID,
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        PORT: process.env.PORT,
        NODE_ENV: process.env.NODE_ENV,
    }
}
