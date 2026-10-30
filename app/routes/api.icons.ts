import {getAppEnv} from "~/lib/app-context"
import {isAuthenticated} from "~/lib/auth.server"
import {searchYotoIcons} from "~/lib/yoto-icons.server"
import {searchCommunityIcons} from "~/lib/yotoicons-community.server"

import type {Route} from "./+types/api.icons"

export async function loader({request, context}: Route.LoaderArgs) {
    const env = getAppEnv(context)

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
