import type {ProviderId} from "$lib/db/schema"

export type {ProviderId}

export type ExternalTrackMetadata = {
    externalId: string
    title: string
    artist?: string
    album?: string
    durationSeconds?: number
    isrc?: string
    tags?: string[]
    category?: string
    thumbnailUrl?: string
    /** Direct YouTube video URL if already known (for YouTube/YT Music) */
    youtubeUrl?: string
    chapters?: Array<{
        title: string
        startTime: number
        endTime: number
    }>
    /** If upstream marks this item as deleted/private/unplayable */
    unavailableReason?: string
}

export type TrackResolutionResult =
    | {
          status: "resolved"
          youtubeVideoId: string
          youtubeUrl: string
          matchedTitle: string
          durationSeconds?: number
      }
    | {
          status: "unresolved"
          reason: string
      }

export type ExternalPlaylist = {
    provider: ProviderId
    externalId: string
    title: string
    sourceUrl: string
    isSingleTrack?: boolean
    tracks: ExternalTrackMetadata[]
}

export interface MusicProviderAdapter {
    readonly id: ProviderId
    readonly displayName: string
    readonly supportsOAuth: boolean
    readonly isStub?: boolean
    canHandleUrl(url: string): boolean
    isPlaylistUrl(url: string): boolean
    fetchPlaylist(url: string, env?: Env): Promise<ExternalPlaylist>
}

export type ProviderInfo = {
    id: ProviderId
    displayName: string
    badgeColor: string
    supportsOAuth: boolean
    isStub: boolean
}

export const PROVIDER_METADATA: Record<ProviderId, ProviderInfo> = {
    youtube: {
        id: "youtube",
        displayName: "YouTube",
        badgeColor: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
        supportsOAuth: true,
        isStub: false,
    },
    youtube_music: {
        id: "youtube_music",
        displayName: "YouTube Music",
        badgeColor: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
        supportsOAuth: true,
        isStub: false,
    },
    spotify: {
        id: "spotify",
        displayName: "Spotify",
        badgeColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        supportsOAuth: false,
        isStub: true,
    },
    apple_music: {
        id: "apple_music",
        displayName: "Apple Music",
        badgeColor: "bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30",
        supportsOAuth: false,
        isStub: true,
    },
    amazon_music: {
        id: "amazon_music",
        displayName: "Amazon Music",
        badgeColor: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
        supportsOAuth: false,
        isStub: true,
    },
}

/**
 * Client-safe helper to detect the music provider and whether the URL is a playlist or single track.
 */
export function detectProviderFromUrl(rawUrl: string): {
    provider: ProviderId | null
    urlType: "video" | "playlist" | "unknown"
} {
    try {
        const url = new URL(rawUrl.trim())
        const host = url.hostname.toLowerCase()

        if (host === "music.youtube.com") {
            if (url.searchParams.has("list")) {
                return {provider: "youtube_music", urlType: "playlist"}
            }
            if (url.pathname === "/watch" && url.searchParams.has("v")) {
                return {provider: "youtube_music", urlType: "video"}
            }
            return {provider: "youtube_music", urlType: "unknown"}
        }

        if (
            host === "youtube.com" ||
            host.endsWith(".youtube.com") ||
            host === "youtu.be"
        ) {
            if (url.searchParams.has("list")) {
                return {provider: "youtube", urlType: "playlist"}
            }
            if (
                (host === "youtube.com" || host.endsWith(".youtube.com")) &&
                url.pathname === "/watch" &&
                url.searchParams.has("v")
            ) {
                return {provider: "youtube", urlType: "video"}
            }
            if (host === "youtu.be" && url.pathname.slice(1)) {
                return {provider: "youtube", urlType: "video"}
            }
            return {provider: "youtube", urlType: "unknown"}
        }

        if (host === "open.spotify.com" || host.endsWith(".spotify.com")) {
            if (url.pathname.includes("/playlist/")) {
                return {provider: "spotify", urlType: "playlist"}
            }
            if (url.pathname.includes("/track/")) {
                return {provider: "spotify", urlType: "video"}
            }
            return {provider: "spotify", urlType: "unknown"}
        }

        if (host === "music.apple.com" || host.endsWith(".apple.com")) {
            if (url.pathname.includes("/playlist/")) {
                return {provider: "apple_music", urlType: "playlist"}
            }
            return {provider: "apple_music", urlType: "video"}
        }

        if (host.includes("music.amazon.")) {
            if (url.pathname.includes("/playlists/")) {
                return {provider: "amazon_music", urlType: "playlist"}
            }
            return {provider: "amazon_music", urlType: "video"}
        }

        return {provider: null, urlType: "unknown"}
    } catch {
        return {provider: null, urlType: "unknown"}
    }
}

