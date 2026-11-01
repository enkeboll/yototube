import {describe, expect, it} from "vitest"

import {selectBestCandidate} from "./resolver.server"
import {detectProviderFromUrl} from "./types"

describe("detectProviderFromUrl", () => {
    it("detects YouTube and YouTube Music videos and playlists", () => {
        expect(
            detectProviderFromUrl("https://www.youtube.com/watch?v=abc123"),
        ).toEqual({
            provider: "youtube",
            urlType: "video",
        })
        expect(
            detectProviderFromUrl(
                "https://www.youtube.com/playlist?list=PL123",
            ),
        ).toEqual({
            provider: "youtube",
            urlType: "playlist",
        })
        expect(
            detectProviderFromUrl(
                "https://music.youtube.com/playlist?list=PL456",
            ),
        ).toEqual({
            provider: "youtube_music",
            urlType: "playlist",
        })
    })

    it("detects Spotify, Apple Music, and Amazon Music playlists", () => {
        expect(
            detectProviderFromUrl(
                "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
            ),
        ).toEqual({
            provider: "spotify",
            urlType: "playlist",
        })
        expect(
            detectProviderFromUrl(
                "https://music.apple.com/us/playlist/kids-hits/pl.12345",
            ),
        ).toEqual({
            provider: "apple_music",
            urlType: "playlist",
        })
        expect(
            detectProviderFromUrl(
                "https://music.amazon.com/playlists/B08XYZ123",
            ),
        ).toEqual({
            provider: "amazon_music",
            urlType: "playlist",
        })
    })
})

describe("selectBestCandidate (strict non-YouTube track resolution)", () => {
    it("resolves a matching track when title, artist, and duration align", () => {
        const result = selectBestCandidate(
            {
                externalId: "sp-1",
                title: "Baby Shark",
                artist: "Pinkfong",
                durationSeconds: 136,
            },
            [
                {
                    id: "yt-baby-shark",
                    title: "Baby Shark (Official Audio)",
                    uploader: "Pinkfong - Topic",
                    duration: 137,
                },
            ],
        )

        expect(result).toEqual({
            status: "resolved",
            youtubeVideoId: "yt-baby-shark",
            youtubeUrl: "https://www.youtube.com/watch?v=yt-baby-shark",
            matchedTitle: "Baby Shark (Official Audio)",
            durationSeconds: 137,
        })
    })

    it("refuses to substitute a cover, karaoke, or wrong artist and returns unresolved", () => {
        const karaokeOnly = selectBestCandidate(
            {
                externalId: "sp-2",
                title: "Let It Go",
                artist: "Idina Menzel",
                durationSeconds: 224,
            },
            [
                {
                    id: "yt-karaoke",
                    title: "Let It Go - Idina Menzel (Karaoke Version)",
                    uploader: "Sing King Karaoke",
                    duration: 224,
                },
                {
                    id: "yt-wrong-artist",
                    title: "Let It Go",
                    uploader: "Random Cover Band",
                    duration: 224,
                },
            ],
        )

        expect(karaokeOnly.status).toBe("unresolved")
        if (karaokeOnly.status === "unresolved") {
            expect(karaokeOnly.reason).toContain(
                'Could not confidently match "Let It Go" by Idina Menzel on YouTube',
            )
        }
    })

    it("rejects candidates whose duration differs significantly from the track", () => {
        const result = selectBestCandidate(
            {
                externalId: "sp-3",
                title: "Circle of Life",
                artist: "Elton John",
                durationSeconds: 239,
            },
            [
                {
                    id: "yt-extended",
                    title: "Circle of Life - Elton John",
                    uploader: "Elton John",
                    duration: 320,
                },
            ],
        )

        expect(result.status).toBe("unresolved")
    })
})

