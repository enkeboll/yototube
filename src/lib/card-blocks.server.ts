import crypto from "node:crypto"

import type {YotoSdk} from "@yotoplay/yoto-sdk"
import {asc, eq, inArray} from "drizzle-orm"

import {getDb, schema} from "$lib/db/index.server"
import type {ProviderId, ResolutionStatus, SyncStatus} from "$lib/db/schema"
import {createChapter, stripNullValues, type YotoChapter} from "$lib/import-utils"
import type {CardData} from "$lib/types"

export type PlaylistTrackView = {
    id: string
    blockId: string
    externalTrackId: string
    upstreamIndex: number
    title: string
    artist?: string
    album?: string
    tags: string[]
    resolutionStatus: ResolutionStatus
    unresolvedReason?: string
    duration?: number
    skipped: boolean
    isPermanentlySkipped: boolean
    iconMediaId?: string
    iconUrl?: string
    yotoChapterKey?: string
}

export type CardBlockView =
    | {
          id: string
          type: "track"
          sortOrder: number
          key: string
          title: string
          artist?: string
          album?: string
          tags: string[]
          duration?: number
          iconMediaId?: string
          iconUrl?: string
          error?: string
      }
    | {
          id: string
          type: "playlist"
          sortOrder: number
          provider: ProviderId
          externalPlaylistId: string
          sourceUrl: string
          playlistTitle: string
          lastSyncStatus: SyncStatus
          lastSyncError?: string
          lastSyncedAt?: number
          tracks: PlaylistTrackView[]
      }

function extractSha256FromTrackUrl(trackUrl?: string): string | undefined {
    if (!trackUrl) return undefined
    const match = trackUrl.match(/^yoto:#([a-fA-F0-9]+)$/)
    return match ? match[1] : trackUrl.replace(/^yoto:#/, "")
}

function extractMediaId(icon16x16?: string): string | undefined {
    if (!icon16x16) return undefined
    return icon16x16.replace(/^yoto:#/, "")
}

function parseTagsJson(tagsJson?: string | null): string[] {
    if (!tagsJson) return []
    try {
        const parsed = JSON.parse(tagsJson)
        return Array.isArray(parsed)
            ? parsed.filter((v): v is string => typeof v === "string")
            : []
    } catch {
        return []
    }
}

/**
 * Ensures the database has an up-to-date representation of the card's chapters.
 * If the card has never been stored in the DB, imports existing Yoto chapters as
 * standalone track blocks. Also syncs any chapter titles/icons updated on Yoto.
 */
export function reconcileCardBlocksWithYoto(
    cardId: string,
    cardData: CardData,
    env?: Env,
): {
    blocks: (typeof schema.cardBlocks.$inferSelect)[]
    playlistTracksByBlockId: Map<
        string,
        (typeof schema.syncedPlaylistTracks.$inferSelect)[]
    >
} {
    const db = getDb(env)
    const yotoChapters = cardData.content?.chapters ?? []

    let existingBlocks = db
        .select()
        .from(schema.cardBlocks)
        .where(eq(schema.cardBlocks.cardId, cardId))
        .orderBy(asc(schema.cardBlocks.sortOrder))
        .all()

    if (existingBlocks.length === 0 && yotoChapters.length > 0) {
        const toInsert: (typeof schema.cardBlocks.$inferInsert)[] =
            yotoChapters.map((chapter, index) => {
                const firstTrack = chapter.tracks?.[0]
                const sha256 = extractSha256FromTrackUrl(firstTrack?.trackUrl)
                const iconMediaId = extractMediaId(
                    chapter.display?.icon16x16 ??
                        firstTrack?.display?.icon16x16,
                )
                return {
                    id: crypto.randomUUID(),
                    cardId,
                    sortOrder: index,
                    type: "track",
                    yotoChapterKey:
                        chapter.key ?? String(index).padStart(2, "0"),
                    trackTitle: chapter.title ?? "Untitled Track",
                    trackSha256: sha256,
                    trackDuration:
                        typeof chapter.duration === "number"
                            ? Math.round(chapter.duration)
                            : undefined,
                    trackFileSize:
                        typeof (chapter as {fileSize?: number}).fileSize ===
                        "number"
                            ? (chapter as {fileSize?: number}).fileSize
                            : undefined,
                    trackIconMediaId: iconMediaId,
                }
            })

        if (toInsert.length > 0) {
            db.insert(schema.cardBlocks).values(toInsert).run()
        }

        existingBlocks = db
            .select()
            .from(schema.cardBlocks)
            .where(eq(schema.cardBlocks.cardId, cardId))
            .orderBy(asc(schema.cardBlocks.sortOrder))
            .all()
    } else if (existingBlocks.length > 0) {
        // Reconcile icons/titles from Yoto chapters if modified by existing actions
        const playlistBlockIds = existingBlocks
            .filter(b => b.type === "playlist")
            .map(b => b.id)

        const existingPlaylistTracks =
            playlistBlockIds.length > 0
                ? db
                      .select()
                      .from(schema.syncedPlaylistTracks)
                      .where(
                          inArray(
                              schema.syncedPlaylistTracks.blockId,
                              playlistBlockIds,
                          ),
                      )
                      .all()
                : []

        const chapterByKey = new Map(
            yotoChapters
                .filter((ch): ch is typeof ch & {key: string} =>
                    Boolean(ch.key),
                )
                .map(ch => [ch.key, ch]),
        )

        for (const block of existingBlocks) {
            if (block.type === "track" && block.yotoChapterKey) {
                const ch = chapterByKey.get(block.yotoChapterKey)
                if (ch) {
                    const iconMediaId =
                        extractMediaId(
                            ch.display?.icon16x16 ??
                                ch.tracks?.[0]?.display?.icon16x16,
                        ) ?? null
                    if (iconMediaId !== block.trackIconMediaId) {
                        db.update(schema.cardBlocks)
                            .set({trackIconMediaId: iconMediaId})
                            .where(eq(schema.cardBlocks.id, block.id))
                            .run()
                        block.trackIconMediaId = iconMediaId
                    }
                }
            }
        }

        for (const pTrack of existingPlaylistTracks) {
            if (pTrack.yotoChapterKey) {
                const ch = chapterByKey.get(pTrack.yotoChapterKey)
                if (ch) {
                    const iconMediaId =
                        extractMediaId(
                            ch.display?.icon16x16 ??
                                ch.tracks?.[0]?.display?.icon16x16,
                        ) ?? null
                    if (iconMediaId !== pTrack.iconMediaId) {
                        db.update(schema.syncedPlaylistTracks)
                            .set({iconMediaId})
                            .where(
                                eq(schema.syncedPlaylistTracks.id, pTrack.id),
                            )
                            .run()
                    }
                }
            }
        }
    }

    const playlistBlockIds = existingBlocks
        .filter(b => b.type === "playlist")
        .map(b => b.id)

    const playlistTracks =
        playlistBlockIds.length > 0
            ? db
                  .select()
                  .from(schema.syncedPlaylistTracks)
                  .where(
                      inArray(
                          schema.syncedPlaylistTracks.blockId,
                          playlistBlockIds,
                      ),
                  )
                  .orderBy(asc(schema.syncedPlaylistTracks.upstreamIndex))
                  .all()
            : []

    const playlistTracksByBlockId = new Map<
        string,
        (typeof schema.syncedPlaylistTracks.$inferSelect)[]
    >()
    for (const track of playlistTracks) {
        const list = playlistTracksByBlockId.get(track.blockId) ?? []
        list.push(track)
        playlistTracksByBlockId.set(track.blockId, list)
    }

    return {blocks: existingBlocks, playlistTracksByBlockId}
}

export function buildCardBlockViews(
    cardId: string,
    cardData: CardData,
    yotoIconUrls: Map<string, string>,
    env?: Env,
): CardBlockView[] {
    const {blocks, playlistTracksByBlockId} = reconcileCardBlocksWithYoto(
        cardId,
        cardData,
        env,
    )

    return blocks.map((block): CardBlockView => {
        if (block.type === "playlist") {
            const pTracks = playlistTracksByBlockId.get(block.id) ?? []
            return {
                id: block.id,
                type: "playlist",
                sortOrder: block.sortOrder,
                provider: block.provider ?? "youtube",
                externalPlaylistId: block.externalPlaylistId ?? "",
                sourceUrl: block.sourceUrl ?? "",
                playlistTitle: block.playlistTitle ?? "Synced Playlist",
                lastSyncStatus: block.lastSyncStatus ?? "idle",
                lastSyncError: block.lastSyncError ?? undefined,
                lastSyncedAt: block.lastSyncedAt ?? undefined,
                tracks: pTracks.map(t => {
                    const isPermanentlySkipped =
                        t.resolutionStatus !== "resolved" ||
                        !t.transcodedSha256
                    return {
                        id: t.id,
                        blockId: t.blockId,
                        externalTrackId: t.externalTrackId,
                        upstreamIndex: t.upstreamIndex,
                        title: t.title,
                        artist: t.artist ?? undefined,
                        album: t.album ?? undefined,
                        tags: parseTagsJson(t.tagsJson),
                        resolutionStatus: t.resolutionStatus,
                        unresolvedReason: t.unresolvedReason ?? undefined,
                        duration: t.duration ?? undefined,
                        skipped: Boolean(t.skipped) || isPermanentlySkipped,
                        isPermanentlySkipped,
                        iconMediaId: t.iconMediaId ?? undefined,
                        iconUrl: t.iconMediaId
                            ? yotoIconUrls.get(t.iconMediaId)
                            : undefined,
                        yotoChapterKey: t.yotoChapterKey ?? undefined,
                    }
                }),
            }
        }

        return {
            id: block.id,
            type: "track",
            sortOrder: block.sortOrder,
            key: block.yotoChapterKey ?? block.id,
            title: block.trackTitle ?? "Untitled Track",
            artist: block.trackArtist ?? undefined,
            album: block.trackAlbum ?? undefined,
            tags: parseTagsJson(block.trackTagsJson),
            duration: block.trackDuration ?? undefined,
            iconMediaId: block.trackIconMediaId ?? undefined,
            iconUrl: block.trackIconMediaId
                ? yotoIconUrls.get(block.trackIconMediaId)
                : undefined,
            error: block.lastSyncError ?? undefined,
        }
    })
}

/**
 * Compiles all blocks for a card into Yoto chapters (omitting skipped or unresolved tracks),
 * updates chapter keys in SQLite, and pushes the updated chapters list to Yoto.
 */
export async function compileAndPushCardToYoto(
    sdk: YotoSdk,
    cardId: string,
    env?: Env,
): Promise<{chapterCount: number}> {
    const db = getDb(env)
    const card = (await sdk.content.getCard(cardId)) as unknown as CardData | null
    if (!card) {
        throw new Error("Card not found")
    }

    const blocks = db
        .select()
        .from(schema.cardBlocks)
        .where(eq(schema.cardBlocks.cardId, cardId))
        .orderBy(asc(schema.cardBlocks.sortOrder))
        .all()

    const playlistBlockIds = blocks
        .filter(b => b.type === "playlist")
        .map(b => b.id)

    const playlistTracks =
        playlistBlockIds.length > 0
            ? db
                  .select()
                  .from(schema.syncedPlaylistTracks)
                  .where(
                      inArray(
                          schema.syncedPlaylistTracks.blockId,
                          playlistBlockIds,
                      ),
                  )
                  .orderBy(asc(schema.syncedPlaylistTracks.upstreamIndex))
                  .all()
            : []

    const playlistTracksByBlock = new Map<
        string,
        (typeof schema.syncedPlaylistTracks.$inferSelect)[]
    >()
    for (const track of playlistTracks) {
        const list = playlistTracksByBlock.get(track.blockId) ?? []
        list.push(track)
        playlistTracksByBlock.set(track.blockId, list)
    }

    const compiledChapters: Array<
        YotoChapter & {
            display?: {icon16x16: string}
            tracks: Array<
                YotoChapter["tracks"][number] & {
                    display?: {icon16x16: string}
                }
            >
        }
    > = []

    let position = 1

    for (const block of blocks) {
        if (block.type === "track") {
            if (!block.trackSha256) continue
            const baseChapter = createChapter(
                block.trackTitle ?? "Untitled Track",
                block.trackSha256,
                position++,
                block.trackDuration ?? undefined,
                block.trackFileSize ?? undefined,
            )
            const iconDisplay = block.trackIconMediaId
                ? {icon16x16: `yoto:#${block.trackIconMediaId}`}
                : undefined

            const enrichedChapter = {
                ...baseChapter,
                ...(iconDisplay && {display: iconDisplay}),
                tracks: baseChapter.tracks.map(t => ({
                    ...t,
                    ...(iconDisplay && {display: iconDisplay}),
                })),
            }
            compiledChapters.push(enrichedChapter)

            if (block.yotoChapterKey !== baseChapter.key) {
                db.update(schema.cardBlocks)
                    .set({yotoChapterKey: baseChapter.key})
                    .where(eq(schema.cardBlocks.id, block.id))
                    .run()
            }
        } else if (block.type === "playlist") {
            const tracks = playlistTracksByBlock.get(block.id) ?? []
            for (const pTrack of tracks) {
                const isIncluded =
                    !pTrack.skipped &&
                    pTrack.resolutionStatus === "resolved" &&
                    Boolean(pTrack.transcodedSha256)

                if (!isIncluded || !pTrack.transcodedSha256) {
                    if (pTrack.yotoChapterKey !== null) {
                        db.update(schema.syncedPlaylistTracks)
                            .set({yotoChapterKey: null})
                            .where(
                                eq(schema.syncedPlaylistTracks.id, pTrack.id),
                            )
                            .run()
                    }
                    continue
                }

                const baseChapter = createChapter(
                    pTrack.title,
                    pTrack.transcodedSha256,
                    position++,
                    pTrack.duration ?? undefined,
                    pTrack.fileSize ?? undefined,
                )
                const iconDisplay = pTrack.iconMediaId
                    ? {icon16x16: `yoto:#${pTrack.iconMediaId}`}
                    : undefined

                const enrichedChapter = {
                    ...baseChapter,
                    ...(iconDisplay && {display: iconDisplay}),
                    tracks: baseChapter.tracks.map(t => ({
                        ...t,
                        ...(iconDisplay && {display: iconDisplay}),
                    })),
                }
                compiledChapters.push(enrichedChapter)

                if (pTrack.yotoChapterKey !== baseChapter.key) {
                    db.update(schema.syncedPlaylistTracks)
                        .set({yotoChapterKey: baseChapter.key})
                        .where(eq(schema.syncedPlaylistTracks.id, pTrack.id))
                        .run()
                }
            }
        }
    }

    const updatedCard = {
        cardId,
        title: card.title,
        content: {
            ...card.content,
            chapters: stripNullValues(compiledChapters),
        },
        metadata: card.metadata,
    }

    await sdk.content.updateCard(
        updatedCard as unknown as Parameters<typeof sdk.content.updateCard>[0],
    )

    return {chapterCount: compiledChapters.length}
}

/**
 * Toggle whether a track inside a synced playlist is skipped on the Yoto card.
 */
export async function togglePlaylistTrackSkip(
    sdk: YotoSdk,
    cardId: string,
    playlistTrackId: string,
    skipped: boolean,
    env?: Env,
): Promise<void> {
    const db = getDb(env)
    const track = db
        .select()
        .from(schema.syncedPlaylistTracks)
        .where(eq(schema.syncedPlaylistTracks.id, playlistTrackId))
        .get()

    if (!track) {
        throw new Error("Playlist track not found")
    }

    if (track.resolutionStatus !== "resolved" || !track.transcodedSha256) {
        throw new Error(
            "Cannot include an unresolved track that has no audio on Yoto",
        )
    }

    db.update(schema.syncedPlaylistTracks)
        .set({skipped: skipped ? 1 : 0})
        .where(eq(schema.syncedPlaylistTracks.id, playlistTrackId))
        .run()

    await compileAndPushCardToYoto(sdk, cardId, env)
}

/**
 * Delete an entire synced playlist block (and its tracks) from a card.
 */
export async function deletePlaylistBlock(
    sdk: YotoSdk,
    cardId: string,
    blockId: string,
    env?: Env,
): Promise<void> {
    const db = getDb(env)
    const block = db
        .select()
        .from(schema.cardBlocks)
        .where(eq(schema.cardBlocks.id, blockId))
        .get()

    if (!block || block.cardId !== cardId) {
        throw new Error("Playlist block not found")
    }

    db.delete(schema.syncedPlaylistTracks)
        .where(eq(schema.syncedPlaylistTracks.blockId, blockId))
        .run()
    db.delete(schema.cardBlocks)
        .where(eq(schema.cardBlocks.id, blockId))
        .run()

    await compileAndPushCardToYoto(sdk, cardId, env)
}

/**
 * Reorders top-level blocks (standalone tracks and synced playlist blocks) on a card.
 */
export async function reorderCardBlocks(
    sdk: YotoSdk,
    cardId: string,
    orderedBlockIds: string[],
    env?: Env,
): Promise<void> {
    const db = getDb(env)
    const existingBlocks = db
        .select()
        .from(schema.cardBlocks)
        .where(eq(schema.cardBlocks.cardId, cardId))
        .all()

    const blockMap = new Map(existingBlocks.map(b => [b.id, b]))
    if (
        orderedBlockIds.length !== existingBlocks.length ||
        orderedBlockIds.some(id => !blockMap.has(id))
    ) {
        throw new Error("One or more blocks were not found")
    }

    orderedBlockIds.forEach((id, index) => {
        db.update(schema.cardBlocks)
            .set({sortOrder: index})
            .where(eq(schema.cardBlocks.id, id))
            .run()
    })

    await compileAndPushCardToYoto(sdk, cardId, env)
}

