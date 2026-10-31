import {type Handle, redirect} from "@sveltejs/kit"

import {env as privateEnv} from "$env/dynamic/private"
import {getAppEnv, getAuthSecret} from "$lib/app-context"
import {status} from "$lib/auth.server"

export const handle: Handle = async ({event, resolve}) => {
    const env = getAppEnv({
        env: {
            YOTO_AUTH_SECRET: privateEnv.YOTO_AUTH_SECRET || getAuthSecret(),
            YOTO_CLIENT_ID:
                privateEnv.YOTO_CLIENT_ID || process.env.YOTO_CLIENT_ID,
            RESEND_API_KEY:
                privateEnv.RESEND_API_KEY || process.env.RESEND_API_KEY,
            PORT: privateEnv.PORT || process.env.PORT,
            NODE_ENV: privateEnv.NODE_ENV || process.env.NODE_ENV,
        },
    })
    event.locals.env = env

    const authStatus = await status(event.request, env)
    let setCookieHeader: string | undefined = undefined

    if (authStatus.valid) {
        event.locals.user = {
            valid: true,
            expiresIn: authStatus.expiresIn,
            expiresAt: authStatus.expiresAt,
        }
        if (authStatus.setCookie) {
            setCookieHeader = authStatus.setCookie
        }
    }

    // Protect /cards routes
    if (event.url.pathname.startsWith("/cards")) {
        if (!authStatus.valid) {
            throw redirect(302, "/login")
        }
    }

    const response = await resolve(event)

    if (setCookieHeader) {
        response.headers.append("set-cookie", setCookieHeader)
    }

    return response
}
