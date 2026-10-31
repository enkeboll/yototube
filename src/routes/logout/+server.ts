import type {RequestHandler} from "@sveltejs/kit"

import {getAppEnv} from "$lib/app-context"
import {logout} from "$lib/auth.server"

export const POST: RequestHandler = async ({request, locals}) => {
    const env = locals.env ?? getAppEnv()
    const setCookie = await logout(request, env)

    const response = new Response(null, {
        status: 302,
        headers: {
            Location: "/",
        },
    })
    response.headers.append("set-cookie", setCookie)
    return response
}

export const GET: RequestHandler = async () => {
    return new Response(null, {
        status: 302,
        headers: {
            Location: "/",
        },
    })
}
