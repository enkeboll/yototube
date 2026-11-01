import type {RequestHandler} from "@sveltejs/kit"

import {getAppEnv} from "$lib/app-context"
import {isAuthenticated} from "$lib/auth.server"
import {suggestIconsForTrack} from "$lib/icon-suggest.server"
import {searchYotoIcons} from "$lib/yoto-icons.server"
import {searchYotoEverythingIcons} from "$lib/yotoeverything-icons.server"
import {searchCommunityIcons} from "$lib/yotoicons-community.server"

export const GET: RequestHandler = async ({request, locals}) => {
    const env = locals.env ?? getAppEnv()

    const authenticated = await isAuthenticated(request, env)
    if (!authenticated) {
        return Response.json({error: "Unauthorized"}, {status: 401})
    }

    const url = new URL(request.url)

    // Mode 1: Automated icon suggestions for a track
    if (url.searchParams.get("suggest") === "1") {
        const title = url.searchParams.get("title") ?? ""
        const artist = url.searchParams.get("artist") ?? undefined
        const album = url.searchParams.get("album") ?? undefined
        const tagsParam = url.searchParams.get("tags")
        let tags: string[] | undefined
        if (tagsParam) {
            try {
                const parsed = JSON.parse(tagsParam)
                if (Array.isArray(parsed)) {
                    tags = parsed.filter(
                        (t): t is string => typeof t === "string",
                    )
                }
            } catch {
                tags = tagsParam.split(",").map(t => t.trim()).filter(Boolean)
            }
        }

        const {keywords, suggestions} = await suggestIconsForTrack(
            request,
            env,
            {title, artist, album, tags},
        )
        return Response.json({keywords, suggestions})
    }

    // Mode 2: Manual search across all 3 icon libraries
    const query = url.searchParams.get("q")

    if (!query) {
        return Response.json({
            yotoIcons: [],
            yotoEverythingIcons: [],
            communityIcons: [],
        })
    }

    const [yotoResult, everythingResult, communityResult] =
        await Promise.allSettled([
            searchYotoIcons(request, env, query),
            searchYotoEverythingIcons(query, env),
            searchCommunityIcons(query),
        ])

    const yotoIcons = yotoResult.status === "fulfilled" ? yotoResult.value : []
    const yotoEverythingIcons =
        everythingResult.status === "fulfilled" ? everythingResult.value : []
    const communityIcons =
        communityResult.status === "fulfilled"
            ? communityResult.value.icons
            : []
    const communityError =
        communityResult.status === "rejected"
            ? (communityResult.reason?.message ??
              "Community icon search failed")
            : undefined

    return Response.json({
        yotoIcons,
        yotoEverythingIcons,
        communityIcons,
        communityError,
    })
}
