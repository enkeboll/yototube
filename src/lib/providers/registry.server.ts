import crypto from "node:crypto"

import {getPlaylistInfo} from "$lib/sandbox.server"
import {extractPlaylistId} from "$lib/youtube.server"

import {fetchYouTubePlaylistViaApi} from "./google-oauth.server"
import {
    detectProviderFromUrl,
    type ExternalPlaylist,
    type ExternalTrackMetadata,
    type MusicProviderAdapter,
    type ProviderId,
} from "./types"

function isUnavailableYouTubeTitle(title: string): string | undefined {
    const trimmed = title.trim()
    if (trimmed === "[Private video]" || trimmed === "Private video") {
        return "Video is private on YouTube"
    }
    if (trimmed === "[Deleted video]" || trimmed === "Deleted video") {
        return "Video was deleted from YouTube"
    }
    return undefined
}

class YouTubeProviderAdapter implements MusicProviderAdapter {
    readonly id: ProviderId
    readonly displayName: string
    readonly supportsOAuth = true
    readonly isStub = false

    constructor(
        id: "youtube" | "youtube_music" = "youtube",
        displayName = "YouTube",
    ) {
        this.id = id
        this.displayName = displayName
    }

    canHandleUrl(url: string): boolean {
        return detectProviderFromUrl(url).provider === this.id
    }

    isPlaylistUrl(url: string): boolean {
        return detectProviderFromUrl(url).urlType === "playlist"
    }

    async fetchPlaylist(
        url: string,
        env?: Env,
        sandboxId?: string,
    ): Promise<ExternalPlaylist> {
        const detected = detectProviderFromUrl(url)

        // If it's a playlist, try authenticated YouTube Data API v3 first (supports private/unlisted playlists)
        if (detected.urlType === "playlist") {
            try {
                const playlistId = extractPlaylistId(url)
                const apiPlaylist = await fetchYouTubePlaylistViaApi(
                    playlistId,
                    url,
                    this.id as "youtube" | "youtube_music",
                    env,
                )
                if (apiPlaylist) {
                    return apiPlaylist
                }
            } catch {
                // Fall back to yt-dlp for public playlists
            }
        }

        const effectiveSandboxId =
            sandboxId ?? `inspect-${crypto.randomUUID()}`
        const info = await getPlaylistInfo(
            env ?? ({} as Env),
            effectiveSandboxId,
            url,
        )

        const tracks: ExternalTrackMetadata[] = info.videos.map(v => {
            const unavailableReason = isUnavailableYouTubeTitle(v.title)
            return {
                externalId: v.id,
                title: v.title,
                artist: v.artist,
                album: v.album,
                durationSeconds: v.duration,
                tags: [...(v.tags ?? []), ...(v.categories ?? [])],
                youtubeUrl: unavailableReason ? undefined : v.url,
                chapters: v.chapters,
                unavailableReason,
            }
        })

        return {
            provider: this.id,
            externalId: info.id,
            title: info.title,
            sourceUrl: url,
            isSingleTrack: detected.urlType === "video",
            tracks,
        }
    }
}

class SpotifyProviderAdapter implements MusicProviderAdapter {
    readonly id: ProviderId = "spotify"
    readonly displayName = "Spotify"
    readonly supportsOAuth = false
    readonly isStub = true

    canHandleUrl(url: string): boolean {
        return detectProviderFromUrl(url).provider === "spotify"
    }

    isPlaylistUrl(url: string): boolean {
        return detectProviderFromUrl(url).urlType === "playlist"
    }

    async fetchPlaylist(url: string): Promise<ExternalPlaylist> {
        const parsed = new URL(url)
        const match = parsed.pathname.match(/\/playlist\/([a-zA-Z0-9]+)/)
        if (!match) {
            throw new Error(
                "Please provide a public Spotify playlist URL (e.g., https://open.spotify.com/playlist/...)",
            )
        }
        const playlistId = match[1]

        // Attempt to read public Spotify embed tracklist JSON
        const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`
        const response = await fetch(embedUrl, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            },
        })

        if (!response.ok) {
            throw new Error(
                `Spotify playlist could not be fetched (${response.status}). Make sure the playlist is public.`,
            )
        }

        const html = await response.text()
        const nextDataMatch = html.match(
            /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
        )

        if (!nextDataMatch) {
            throw new Error(
                "Spotify provider stub: Could not parse public playlist metadata from embed page.",
            )
        }

        const nextData = JSON.parse(nextDataMatch[1]) as {
            props?: {
                pageProps?: {
                    state?: {
                        data?: {
                            entity?: {
                                name?: string
                                title?: string
                                trackList?: Array<{
                                    uri?: string
                                    title?: string
                                    subtitle?: string
                                    duration?: number
                                    isPlayable?: boolean
                                }>
                            }
                        }
                    }
                }
            }
        }

        const entity = nextData.props?.pageProps?.state?.data?.entity
        const rawTracks = entity?.trackList ?? []
        if (rawTracks.length === 0) {
            throw new Error(
                "No tracks found in Spotify playlist (or playlist is private).",
            )
        }

        const tracks: ExternalTrackMetadata[] = rawTracks.map(
            (item, index) => {
                const externalId =
                    item.uri?.split(":").pop() ?? `spotify-${index}`
                const durationSeconds = item.duration
                    ? Math.round(item.duration / 1000)
                    : undefined
                return {
                    externalId,
                    title: item.title ?? "Untitled Track",
                    artist: item.subtitle?.replace(/\u00a0/g, " "),
                    durationSeconds,
                    unavailableReason:
                        item.isPlayable === false
                            ? "Track is marked unplayable on Spotify"
                            : undefined,
                }
            },
        )

        return {
            provider: "spotify",
            externalId: playlistId,
            title: entity?.name ?? entity?.title ?? "Spotify Playlist",
            sourceUrl: url,
            tracks,
        }
    }
}

class AppleMusicProviderAdapter implements MusicProviderAdapter {
    readonly id: ProviderId = "apple_music"
    readonly displayName = "Apple Music"
    readonly supportsOAuth = false
    readonly isStub = true

    canHandleUrl(url: string): boolean {
        return detectProviderFromUrl(url).provider === "apple_music"
    }

    isPlaylistUrl(url: string): boolean {
        return detectProviderFromUrl(url).urlType === "playlist"
    }

    async fetchPlaylist(url: string): Promise<ExternalPlaylist> {
        const parsed = new URL(url)
        const playlistId =
            parsed.pathname.split("/").filter(Boolean).pop() ?? "apple-playlist"

        throw new Error(
            `Apple Music provider (${playlistId}) is stubbed for an upcoming release. Use a YouTube, YouTube Music, or public Spotify playlist URL for now.`,
        )
    }
}

class AmazonMusicProviderAdapter implements MusicProviderAdapter {
    readonly id: ProviderId = "amazon_music"
    readonly displayName = "Amazon Music"
    readonly supportsOAuth = false
    readonly isStub = true

    canHandleUrl(url: string): boolean {
        return detectProviderFromUrl(url).provider === "amazon_music"
    }

    isPlaylistUrl(url: string): boolean {
        return detectProviderFromUrl(url).urlType === "playlist"
    }

    async fetchPlaylist(url: string): Promise<ExternalPlaylist> {
        const parsed = new URL(url)
        const playlistId =
            parsed.pathname.split("/").filter(Boolean).pop() ??
            "amazon-playlist"

        throw new Error(
            `Amazon Music provider (${playlistId}) is stubbed for an upcoming release. Use a YouTube, YouTube Music, or public Spotify playlist URL for now.`,
        )
    }
}

const PROVIDERS: Record<ProviderId, MusicProviderAdapter> = {
    youtube: new YouTubeProviderAdapter("youtube", "YouTube"),
    youtube_music: new YouTubeProviderAdapter("youtube_music", "YouTube Music"),
    spotify: new SpotifyProviderAdapter(),
    apple_music: new AppleMusicProviderAdapter(),
    amazon_music: new AmazonMusicProviderAdapter(),
}

export function getProviderAdapter(
    providerId: ProviderId,
): MusicProviderAdapter {
    return PROVIDERS[providerId]
}

export function getProviderForUrl(url: string): MusicProviderAdapter | null {
    const {provider} = detectProviderFromUrl(url)
    return provider ? PROVIDERS[provider] : null
}

export function getAllProviderAdapters(): MusicProviderAdapter[] {
    return Object.values(PROVIDERS)
}

