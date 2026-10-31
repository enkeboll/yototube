import {redirect, type RequestHandler} from "@sveltejs/kit"

import {getAppEnv} from "$lib/app-context"
import {completePkceLogin} from "$lib/auth.server"

export const GET: RequestHandler = async ({request, locals, cookies}) => {
    const env = locals.env ?? getAppEnv()
    const result = await completePkceLogin(request, env)

    if (result.success) {
        const authCookieVal = result.setCookie
            .split(";")[0]
            .replace(/^yoto-auth=/, "")
        cookies.set("yoto-auth", decodeURIComponent(authCookieVal), {
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 30, // 30 days
            secure: request.url.startsWith("https:"),
        })
        cookies.delete("yoto-pkce", {path: "/"})
        throw redirect(302, "/cards")
    }

    if (result.clearPkceCookie) {
        cookies.delete("yoto-pkce", {path: "/"})
    }
    throw redirect(302, `/login?error=${encodeURIComponent(result.error)}`)
}
