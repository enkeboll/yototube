import type {RequestHandler} from "@sveltejs/kit"

import {getAppEnv} from "$lib/app-context"
import {completePkceLogin} from "$lib/auth.server"

export const GET: RequestHandler = async ({request, locals}) => {
    const env = locals.env ?? getAppEnv()
    const result = await completePkceLogin(request, env)

    if (result.success) {
        const response = new Response(null, {
            status: 302,
            headers: {
                Location: "/cards",
            },
        })
        response.headers.append("set-cookie", result.setCookie)
        if (result.clearPkceCookie) {
            response.headers.append("set-cookie", result.clearPkceCookie)
        }
        return response
    }

    const response = new Response(null, {
        status: 302,
        headers: {
            Location: `/login?error=${encodeURIComponent(result.error)}`,
        },
    })
    if (result.clearPkceCookie) {
        response.headers.append("set-cookie", result.clearPkceCookie)
    }
    return response
}
