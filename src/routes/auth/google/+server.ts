import {redirect, type RequestHandler} from "@sveltejs/kit"

import {getAppEnv} from "$lib/app-context"
import {isAuthenticated} from "$lib/auth.server"
import {
    createGoogleOAuthUrl,
    disconnectGoogleOAuth,
} from "$lib/providers/google-oauth.server"

export const GET: RequestHandler = async ({request, locals, url, cookies}) => {
    const env = locals.env ?? getAppEnv()
    const authenticated = await isAuthenticated(request, env)
    if (!authenticated) {
        throw redirect(302, "/login")
    }

    const returnTo = url.searchParams.get("returnTo") || "/cards"
    const {authUrl, statePayload} = createGoogleOAuthUrl(request, env, returnTo)

    cookies.set("google-oauth-state", statePayload, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 600,
        secure: request.url.startsWith("https:"),
    })

    throw redirect(302, authUrl)
}

export const POST: RequestHandler = async ({request, locals}) => {
    const env = locals.env ?? getAppEnv()
    const authenticated = await isAuthenticated(request, env)
    if (!authenticated) {
        return Response.json({error: "Unauthorized"}, {status: 401})
    }

    disconnectGoogleOAuth(env)
    return Response.json({success: true})
}

