import {redirect, type RequestHandler} from "@sveltejs/kit"

import {getAppEnv} from "$lib/app-context"
import {logout} from "$lib/auth.server"

export const POST: RequestHandler = async ({request, locals, cookies}) => {
    const env = locals.env ?? getAppEnv()
    await logout(request, env)
    cookies.delete("yoto-auth", {path: "/"})
    throw redirect(302, "/")
}

export const GET: RequestHandler = async () => {
    throw redirect(302, "/")
}
