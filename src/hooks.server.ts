import {type Handle, redirect} from "@sveltejs/kit"

import {env as privateEnv} from "$env/dynamic/private"
import {getAppEnv, getAuthSecret} from "$lib/app-context"
import {getToken, status} from "$lib/auth.server"
import {
    ensureBackgroundSyncScheduler,
    recordActiveYotoTokenForScheduler,
} from "$lib/scheduler.server"

export const handle: Handle = async ({event, resolve}) => {
    const env = getAppEnv({
        env: {
            YOTO_AUTH_SECRET: privateEnv.YOTO_AUTH_SECRET || getAuthSecret(),
            YOTO_CLIENT_ID:
                privateEnv.YOTO_CLIENT_ID || process.env.YOTO_CLIENT_ID,
            RESEND_API_KEY:
                privateEnv.RESEND_API_KEY || process.env.RESEND_API_KEY,
            DATABASE_URL:
                privateEnv.DATABASE_URL || process.env.DATABASE_URL,
            GOOGLE_CLIENT_ID:
                privateEnv.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
            GOOGLE_CLIENT_SECRET:
                privateEnv.GOOGLE_CLIENT_SECRET ||
                process.env.GOOGLE_CLIENT_SECRET,
            SYNC_INTERVAL_MINUTES:
                privateEnv.SYNC_INTERVAL_MINUTES ||
                process.env.SYNC_INTERVAL_MINUTES,
            PORT: privateEnv.PORT || process.env.PORT,
            NODE_ENV: privateEnv.NODE_ENV || process.env.NODE_ENV,
        },
    })
    event.locals.env = env
    ensureBackgroundSyncScheduler(env)

    const authStatus = await status(event.request, env)

    if (authStatus.valid) {
        const tokenRes = await getToken(event.request, env).catch(() => null)
        if (tokenRes?.token) {
            recordActiveYotoTokenForScheduler(tokenRes.token)
        }
        event.locals.user = {
            valid: true,
            expiresIn: authStatus.expiresIn,
            expiresAt: authStatus.expiresAt,
        }
        if (authStatus.setCookie) {
            const authCookieVal = authStatus.setCookie
                .split(";")[0]
                .replace(/^yoto-auth=/, "")
            event.cookies.set("yoto-auth", decodeURIComponent(authCookieVal), {
                path: "/",
                httpOnly: true,
                sameSite: "lax",
                maxAge: 60 * 60 * 24 * 30, // 30 days
                secure: event.request.url.startsWith("https:"),
            })
        }
    }

    // Protect /cards routes
    if (event.url.pathname.startsWith("/cards")) {
        if (!authStatus.valid) {
            throw redirect(302, "/login")
        }
    }

    return resolve(event)
}
