import crypto from "node:crypto"

import {eq} from "drizzle-orm"

import {getDb, schema} from "$lib/db/index.server"

import type {ExternalPlaylist, ExternalTrackMetadata} from "./types"

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"
const YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly"

export type UserYouTubePlaylistSummary = {
    id: string
    title: string
    itemCount: number
    privacyStatus: string
    thumbnailUrl?: string
    url: string
}

export function isGoogleOAuthConfigured(env?: Env): boolean {
    const clientId = env?.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
    return Boolean(clientId)
}

export function getGoogleConnectionStatus(env?: Env): {
    configured: boolean
    connected: boolean
    accountTitle?: string
} {
    const configured = isGoogleOAuthConfigured(env)
    const db = getDb(env)
    const cred = db
        .select()
        .from(schema.providerCredentials)
        .where(eq(schema.providerCredentials.provider, "youtube"))
        .get()

    if (!cred) {
        return {configured, connected: false}
    }

    let accountTitle: string | undefined
    if (cred.metadataJson) {
        try {
            const parsed = JSON.parse(cred.metadataJson) as {title?: string}
            accountTitle = parsed.title
        } catch {
            // ignore
        }
    }

    return {
        configured,
        connected: true,
        accountTitle,
    }
}

export function createGoogleOAuthUrl(
    request: Request,
    env?: Env,
    returnTo: string = "/cards",
): {authUrl: string; statePayload: string} {
    const clientId = env?.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
    if (!clientId) {
        throw new Error(
            "GOOGLE_CLIENT_ID is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.",
        )
    }

    const verifier = crypto.randomBytes(32).toString("base64url")
    const challenge = crypto
        .createHash("sha256")
        .update(verifier)
        .digest("base64url")
    const state = crypto.randomBytes(16).toString("base64url")

    const origin = new URL(request.url).origin
    const redirectUri = `${origin}/auth/google/callback`

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: YOUTUBE_READONLY_SCOPE,
        access_type: "offline",
        prompt: "consent",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
    })

    const statePayload = JSON.stringify({
        verifier,
        state,
        redirectUri,
        returnTo,
    })

    return {
        authUrl: `${GOOGLE_AUTH_URL}?${params.toString()}`,
        statePayload,
    }
}

export async function completeGoogleOAuthCallback(
    code: string,
    stateParam: string,
    savedStateJson: string,
    env?: Env,
): Promise<{returnTo: string}> {
    const saved = JSON.parse(savedStateJson) as {
        verifier: string
        state: string
        redirectUri: string
        returnTo?: string
    }

    if (!saved || saved.state !== stateParam) {
        throw new Error("OAuth state mismatch")
    }

    const clientId = env?.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
    const clientSecret =
        env?.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET

    if (!clientId) {
        throw new Error("GOOGLE_CLIENT_ID is not configured")
    }

    const body = new URLSearchParams({
        client_id: clientId,
        ...(clientSecret ? {client_secret: clientSecret} : {}),
        code,
        code_verifier: saved.verifier,
        grant_type: "authorization_code",
        redirect_uri: saved.redirectUri,
    })

    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: body.toString(),
    })

    const data = (await response.json()) as {
        access_token?: string
        refresh_token?: string
        expires_in?: number
        error?: string
        error_description?: string
    }

    if (!response.ok || !data.access_token) {
        throw new Error(
            data.error_description ||
                data.error ||
                "Failed to exchange Google OAuth code",
        )
    }

    // Fetch channel title for display
    let accountTitle: string | undefined
    try {
        const chRes = await fetch(
            `${YOUTUBE_API_BASE}/channels?part=snippet&mine=true`,
            {
                headers: {Authorization: `Bearer ${data.access_token}`},
            },
        )
        if (chRes.ok) {
            const chData = (await chRes.json()) as {
                items?: Array<{snippet?: {title?: string}}>
            }
            accountTitle = chData.items?.[0]?.snippet?.title
        }
    } catch {
        // non-fatal
    }

    const db = getDb(env)
    const existing = db
        .select()
        .from(schema.providerCredentials)
        .where(eq(schema.providerCredentials.provider, "youtube"))
        .get()

    const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000
    const refreshToken = data.refresh_token ?? existing?.refreshToken ?? null
    const metadataJson = accountTitle ? JSON.stringify({title: accountTitle}) : null

    db.insert(schema.providerCredentials)
        .values({
            provider: "youtube",
            accessToken: data.access_token,
            refreshToken,
            expiresAt,
            metadataJson,
            updatedAt: Date.now(),
        })
        .onConflictDoUpdate({
            target: schema.providerCredentials.provider,
            set: {
                accessToken: data.access_token,
                refreshToken,
                expiresAt,
                metadataJson,
                updatedAt: Date.now(),
            },
        })
        .run()

    return {returnTo: saved.returnTo || "/cards"}
}

export function disconnectGoogleOAuth(env?: Env): void {
    const db = getDb(env)
    db.delete(schema.providerCredentials)
        .where(eq(schema.providerCredentials.provider, "youtube"))
        .run()
}

export async function getValidGoogleAccessToken(
    env?: Env,
): Promise<string | null> {
    const db = getDb(env)
    const cred = db
        .select()
        .from(schema.providerCredentials)
        .where(eq(schema.providerCredentials.provider, "youtube"))
        .get()

    if (!cred) return null

    const now = Date.now()
    if (cred.expiresAt && cred.expiresAt - now > 5 * 60 * 1000) {
        return cred.accessToken
    }

    if (!cred.refreshToken) {
        return cred.expiresAt && cred.expiresAt > now ? cred.accessToken : null
    }

    const clientId = env?.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
    const clientSecret =
        env?.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET
    if (!clientId) return null

    try {
        const body = new URLSearchParams({
            client_id: clientId,
            ...(clientSecret ? {client_secret: clientSecret} : {}),
            refresh_token: cred.refreshToken,
            grant_type: "refresh_token",
        })

        const response = await fetch(GOOGLE_TOKEN_URL, {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: body.toString(),
        })

        if (!response.ok) return null
        const data = (await response.json()) as {
            access_token?: string
            expires_in?: number
        }
        if (!data.access_token) return null

        const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000
        db.update(schema.providerCredentials)
            .set({
                accessToken: data.access_token,
                expiresAt,
                updatedAt: Date.now(),
            })
            .where(eq(schema.providerCredentials.provider, "youtube"))
            .run()

        return data.access_token
    } catch {
        return null
    }
}

function parseIso8601Duration(iso?: string): number | undefined {
    if (!iso) return undefined
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return undefined
    const hours = Number.parseInt(match[1] ?? "0", 10)
    const minutes = Number.parseInt(match[2] ?? "0", 10)
    const seconds = Number.parseInt(match[3] ?? "0", 10)
    return hours * 3600 + minutes * 60 + seconds
}

export async function fetchUserYouTubePlaylists(
    env?: Env,
): Promise<UserYouTubePlaylistSummary[]> {
    const token = await getValidGoogleAccessToken(env)
    if (!token) return []

    const url = new URL(`${YOUTUBE_API_BASE}/playlists`)
    url.searchParams.set("part", "snippet,contentDetails,status")
    url.searchParams.set("mine", "true")
    url.searchParams.set("maxResults", "50")

    const response = await fetch(url, {
        headers: {Authorization: `Bearer ${token}`},
    })

    if (!response.ok) {
        return []
    }

    const data = (await response.json()) as {
        items?: Array<{
            id: string
            snippet?: {
                title?: string
                thumbnails?: {default?: {url?: string}; medium?: {url?: string}}
            }
            contentDetails?: {itemCount?: number}
            status?: {privacyStatus?: string}
        }>
    }

    return (data.items ?? []).map(item => ({
        id: item.id,
        title: item.snippet?.title ?? "Untitled Playlist",
        itemCount: item.contentDetails?.itemCount ?? 0,
        privacyStatus: item.status?.privacyStatus ?? "public",
        thumbnailUrl:
            item.snippet?.thumbnails?.medium?.url ??
            item.snippet?.thumbnails?.default?.url,
        url: `https://www.youtube.com/playlist?list=${encodeURIComponent(item.id)}`,
    }))
}

/**
 * Fetches a playlist and its items using the authenticated YouTube Data API v3.
 * Supports private and unlisted playlists owned by the authenticated user.
 */
export async function fetchYouTubePlaylistViaApi(
    playlistId: string,
    sourceUrl: string,
    provider: "youtube" | "youtube_music" = "youtube",
    env?: Env,
): Promise<ExternalPlaylist | null> {
    const token = await getValidGoogleAccessToken(env)
    if (!token) return null

    // 1. Fetch playlist metadata
    const plUrl = new URL(`${YOUTUBE_API_BASE}/playlists`)
    plUrl.searchParams.set("part", "snippet")
    plUrl.searchParams.set("id", playlistId)

    const plRes = await fetch(plUrl, {
        headers: {Authorization: `Bearer ${token}`},
    })
    if (!plRes.ok) return null

    const plData = (await plRes.json()) as {
        items?: Array<{id: string; snippet?: {title?: string}}>
    }
    const playlistItem = plData.items?.[0]
    if (!playlistItem) return null

    const playlistTitle = playlistItem.snippet?.title ?? "YouTube Playlist"

    // 2. Fetch all playlist items (up to 100)
    const rawItems: Array<{
        videoId: string
        title: string
        channelTitle?: string
        privacyStatus?: string
    }> = []

    let pageToken: string | undefined
    while (rawItems.length < 100) {
        const itemsUrl = new URL(`${YOUTUBE_API_BASE}/playlistItems`)
        itemsUrl.searchParams.set("part", "snippet,contentDetails,status")
        itemsUrl.searchParams.set("playlistId", playlistId)
        itemsUrl.searchParams.set("maxResults", "50")
        if (pageToken) itemsUrl.searchParams.set("pageToken", pageToken)

        const itemsRes = await fetch(itemsUrl, {
            headers: {Authorization: `Bearer ${token}`},
        })
        if (!itemsRes.ok) break

        const itemsData = (await itemsRes.json()) as {
            nextPageToken?: string
            items?: Array<{
                snippet?: {
                    title?: string
                    videoOwnerChannelTitle?: string
                    resourceId?: {videoId?: string}
                }
                contentDetails?: {videoId?: string}
                status?: {privacyStatus?: string}
            }>
        }

        for (const item of itemsData.items ?? []) {
            const videoId =
                item.contentDetails?.videoId ??
                item.snippet?.resourceId?.videoId
            if (!videoId) continue
            rawItems.push({
                videoId,
                title: item.snippet?.title ?? "Untitled Video",
                channelTitle: item.snippet?.videoOwnerChannelTitle,
                privacyStatus: item.status?.privacyStatus,
            })
        }

        if (!itemsData.nextPageToken) break
        pageToken = itemsData.nextPageToken
    }

    if (rawItems.length === 0) {
        throw new Error("No tracks found in playlist")
    }

    // 3. Batch fetch video durations & tags in chunks of 50
    const videoDetailsMap = new Map<
        string,
        {durationSeconds?: number; tags?: string[]; artist?: string}
    >()

    for (let i = 0; i < rawItems.length; i += 50) {
        const batchIds = rawItems.slice(i, i + 50).map(item => item.videoId)
        const vUrl = new URL(`${YOUTUBE_API_BASE}/videos`)
        vUrl.searchParams.set("part", "snippet,contentDetails")
        vUrl.searchParams.set("id", batchIds.join(","))

        const vRes = await fetch(vUrl, {
            headers: {Authorization: `Bearer ${token}`},
        })
        if (!vRes.ok) continue

        const vData = (await vRes.json()) as {
            items?: Array<{
                id: string
                snippet?: {tags?: string[]; channelTitle?: string}
                contentDetails?: {duration?: string}
            }>
        }

        for (const v of vData.items ?? []) {
            videoDetailsMap.set(v.id, {
                durationSeconds: parseIso8601Duration(
                    v.contentDetails?.duration,
                ),
                tags: v.snippet?.tags,
                artist: v.snippet?.channelTitle?.replace(/\s*-\s*Topic$/i, ""),
            })
        }
    }

    const tracks: ExternalTrackMetadata[] = rawItems.map(item => {
        const details = videoDetailsMap.get(item.videoId)
        const isDeletedOrPrivate =
            item.title === "Deleted video" ||
            item.title === "Private video" ||
            item.privacyStatus === "private"

        if (isDeletedOrPrivate) {
            return {
                externalId: item.videoId,
                title: item.title,
                artist: item.channelTitle?.replace(/\s*-\s*Topic$/i, ""),
                unavailableReason:
                    item.privacyStatus === "private"
                        ? "Private video cannot be downloaded without video owner access"
                        : "Video is unavailable or deleted on YouTube",
            }
        }

        return {
            externalId: item.videoId,
            title: item.title,
            artist:
                details?.artist ??
                item.channelTitle?.replace(/\s*-\s*Topic$/i, ""),
            durationSeconds: details?.durationSeconds,
            tags: details?.tags,
            youtubeUrl: `https://www.youtube.com/watch?v=${item.videoId}`,
        }
    })

    return {
        provider,
        externalId: playlistId,
        title: playlistTitle,
        sourceUrl,
        tracks,
    }
}

