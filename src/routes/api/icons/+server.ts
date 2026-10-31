import type {RequestHandler} from "@sveltejs/kit"

import {getAppEnv} from "$lib/app-context"
import {isAuthenticated} from "$lib/auth.server"
import {searchYotoIcons} from "$lib/yoto-icons.server"
import {searchCommunityIcons} from "$lib/yotoicons-community.server"

export const GET: RequestHandler = async ({request, locals}) => {
    const env = locals.env ?? getAppEnv()

    const authenticated = await isAuthenticated(request, env)
    if (!authenticated) {
        return Response.json({error: "Unauthorized"}, {status: 401})
    }

    const url = new URL(request.url)
    const query = url.searchParams.get("q")

    if (!query) {
        return Response.json({yotoIcons: [], communityIcons: []})
    }

    const [yotoResult, communityResult] = await Promise.allSettled([
        searchYotoIcons(request, env, query),
        searchCommunityIcons(query),
    ])

    const yotoIcons = yotoResult.status === "fulfilled" ? yotoResult.value : []
    const communityIcons =
        communityResult.status === "fulfilled"
            ? communityResult.value.icons
            : []
    const communityError =
        communityResult.status === "rejected"
            ? (communityResult.reason?.message ??
              "Community icon search failed")
            : undefined

    return Response.json({yotoIcons, communityIcons, communityError})
}
