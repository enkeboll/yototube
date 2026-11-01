import type {YotoSdk} from "@yotoplay/yoto-sdk"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {
    buildCardBlockViews,
    compileAndPushCardToYoto,
    deletePlaylistBlock,
    reorderCardBlocks,
    togglePlaylistTrackSkip,
} from "./card-blocks.server"
import {getDb, resetTestDb, schema} from "./db/index.server"
import type {CardData} from "./types"

describe("card-blocks.server", () => {
    const mockGetCard = vi.fn()
    const mockUpdateCard = vi.fn()
    const sdk = {
        content: {
            getCard: mockGetCard,
            updateCard: mockUpdateCard,
        },
    } as unknown as YotoSdk

    const baseCardData: CardData = {
        cardId: "card-1",
        title: "Kids Favorites",
        content: {
            activity: "http://yoto.io/activities/playAudio",
            chapters: [
                {
                    key: "00",
                    title: "Intro Song",
                    duration: 60,
                    display: {icon16x16: "yoto:#icon-intro"},
                    tracks: [
                        {
                            trackUrl: "yoto:#sha-intro",
                            display: {icon16x16: "yoto:#icon-intro"},
                        },
                    ],
                },
            ],
            restricted: false,
            config: {onlineOnly: false},
            version: "1",
        },
        metadata: {},
    }

    beforeEach(() => {
        vi.clearAllMocks()
        getDb()
        resetTestDb()
        mockGetCard.mockResolvedValue(baseCardData)
        mockUpdateCard.mockResolvedValue(undefined)
    })

    it("hydrates existing Yoto card chapters as standalone track blocks", () => {
        const iconMap = new Map([["icon-intro", "https://icons/intro.png"]])
        const views = buildCardBlockViews("card-1", baseCardData, iconMap)

        expect(views).toHaveLength(1)
        expect(views[0]).toMatchObject({
            type: "track",
            sortOrder: 0,
            key: "00",
            title: "Intro Song",
            duration: 60,
            iconMediaId: "icon-intro",
            iconUrl: "https://icons/intro.png",
        })
    })

    it("interleaves standalone tracks and synced playlists, omitting skipped and unresolved tracks when compiling to Yoto", async () => {
        const db = getDb()
        // Hydrate initial standalone track ("Intro Song")
        buildCardBlockViews("card-1", baseCardData, new Map())

        // Add a synced playlist block at sortOrder 1
        db.insert(schema.cardBlocks)
            .values({
                id: "pl-block-1",
                cardId: "card-1",
                sortOrder: 1,
                type: "playlist",
                provider: "spotify",
                externalPlaylistId: "sp-123",
                sourceUrl: "https://open.spotify.com/playlist/sp-123",
                playlistTitle: "Bedtime Playlist",
                lastSyncStatus: "synced",
            })
            .run()

        // Add 3 tracks to the synced playlist:
        // 1. Active resolved track
        // 2. User-skipped resolved track
        // 3. Unresolved exclusive track (permanently skipped)
        db.insert(schema.syncedPlaylistTracks)
            .values([
                {
                    id: "pt-1",
                    blockId: "pl-block-1",
                    externalTrackId: "sp-t1",
                    upstreamIndex: 0,
                    title: "Twinkle Twinkle",
                    artist: "Lullaby Band",
                    resolutionStatus: "resolved",
                    transcodedSha256: "sha-twinkle",
                    duration: 120,
                    skipped: 0,
                    iconMediaId: "icon-star",
                },
                {
                    id: "pt-2",
                    blockId: "pl-block-1",
                    externalTrackId: "sp-t2",
                    upstreamIndex: 1,
                    title: "Skipped Song",
                    resolutionStatus: "resolved",
                    transcodedSha256: "sha-skipped",
                    duration: 95,
                    skipped: 1,
                },
                {
                    id: "pt-3",
                    blockId: "pl-block-1",
                    externalTrackId: "sp-t3",
                    upstreamIndex: 2,
                    title: "Spotify Exclusive Podcast",
                    resolutionStatus: "unresolved",
                    unresolvedReason:
                        "Could not confidently match on YouTube",
                    transcodedSha256: null,
                    skipped: 1,
                },
            ])
            .run()

        // Add an outro standalone track at sortOrder 2
        db.insert(schema.cardBlocks)
            .values({
                id: "track-outro",
                cardId: "card-1",
                sortOrder: 2,
                type: "track",
                trackTitle: "Goodnight Outro",
                trackSha256: "sha-outro",
                trackDuration: 45,
            })
            .run()

        const views = buildCardBlockViews(
            "card-1",
            baseCardData,
            new Map([["icon-star", "https://icons/star.png"]]),
        )
        expect(views).toHaveLength(3)
        expect(views[1].type).toBe("playlist")
        if (views[1].type === "playlist") {
            expect(views[1].tracks).toHaveLength(3)
            expect(views[1].tracks[2]).toMatchObject({
                title: "Spotify Exclusive Podcast",
                skipped: true,
                isPermanentlySkipped: true,
                unresolvedReason: "Could not confidently match on YouTube",
            })
        }

        // Compile and push to Yoto: only Intro Song, Twinkle Twinkle, and Goodnight Outro should be pushed
        const {chapterCount} = await compileAndPushCardToYoto(sdk, "card-1")
        expect(chapterCount).toBe(3)

        expect(mockUpdateCard).toHaveBeenCalledOnce()
        const pushedCard = mockUpdateCard.mock.calls[0][0]
        expect(pushedCard.content.chapters.map((c: {title: string; key: string}) => ({
            key: c.key,
            title: c.title,
        }))).toEqual([
            {key: "00", title: "Intro Song"},
            {key: "01", title: "Twinkle Twinkle"},
            {key: "02", title: "Goodnight Outro"},
        ])

        // Verify toggling skip on a resolved track works, while toggling skip on an unresolved track throws
        await expect(
            togglePlaylistTrackSkip(sdk, "card-1", "pt-3", false),
        ).rejects.toThrow(
            "Cannot include an unresolved track that has no audio on Yoto",
        )

        await togglePlaylistTrackSkip(sdk, "card-1", "pt-2", false)
        const secondPush = mockUpdateCard.mock.calls[1][0]
        expect(
            secondPush.content.chapters.map((c: {title: string}) => c.title),
        ).toEqual([
            "Intro Song",
            "Twinkle Twinkle",
            "Skipped Song",
            "Goodnight Outro",
        ])

        // Reorder blocks: move playlist before Intro Song
        const allBlockIds = views.map(v => v.id)
        await reorderCardBlocks(sdk, "card-1", [
            allBlockIds[1],
            allBlockIds[0],
            allBlockIds[2],
        ])
        const thirdPush = mockUpdateCard.mock.calls[2][0]
        expect(
            thirdPush.content.chapters.map((c: {title: string}) => c.title),
        ).toEqual([
            "Twinkle Twinkle",
            "Skipped Song",
            "Intro Song",
            "Goodnight Outro",
        ])

        // Delete playlist block
        await deletePlaylistBlock(sdk, "card-1", "pl-block-1")
        const fourthPush = mockUpdateCard.mock.calls[3][0]
        expect(
            fourthPush.content.chapters.map((c: {title: string}) => c.title),
        ).toEqual(["Intro Song", "Goodnight Outro"])
    })
})

