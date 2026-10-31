import {type Handle, redirect} from "@sveltejs/kit"

import {getAppEnv} from "$lib/app-context"
import {status} from "$lib/auth.server"

export const handle: Handle = async ({event, resolve}) => {
    const env = getAppEnv()
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
