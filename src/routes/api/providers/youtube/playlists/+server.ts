import type {RequestHandler} from "@sveltejs/kit"

import {getAppEnv} from "$lib/app-context"
import {isAuthenticated} from "$lib/auth.server"
import {
    fetchUserYouTubePlaylists,
    getGoogleConnectionStatus,
} from "$lib/providers/google-oauth.server"

export const GET: RequestHandler = async ({request, locals}) => {
    const env = locals.env ?? getAppEnv()
    const authenticated = await isAuthenticated(request, env)
    if (!authenticated) {
        return Response.json({error: "Unauthorized"}, {status: 401})
    }

    const status = getGoogleConnectionStatus(env)
    const playlists = status.connected
        ? await fetchUserYouTubePlaylists(env)
        : []

    return Response.json({
        ...status,
        playlists,
    })
}

