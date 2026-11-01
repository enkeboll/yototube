import crypto from "node:crypto"

import type {YotoSdk} from "@yotoplay/yoto-sdk"
import {asc, eq} from "drizzle-orm"

import {
    compileAndPushCardToYoto,
    reconcileCardBlocksWithYoto,
} from "$lib/card-blocks.server"
import {getDb, schema} from "$lib/db/index.server"
import type {ProviderId, ResolutionStatus} from "$lib/db/schema"
import {pickUniqueYotoIconsForTracks} from "$lib/icon-suggest.server"
import type {ImportSuccess} from "$lib/import"
import {
    assertCardCapacity,
    processAudioResilient,
    type TranscodedTrack,
} from "$lib/import.server"
import {formatTitleWithArtist, type ImportProgress} from "$lib/import-utils"
import {logger} from "$lib/logger.server"
import {getProviderAdapter, getProviderForUrl} from "$lib/providers/registry.server"
import {resolveTrackToYouTube} from "$lib/providers/resolver.server"
import type {ExternalTrackMetadata} from "$lib/providers/types"
import {destroySandbox} from "$lib/sandbox.server"
import type {CardData} from "$lib/types"
import {fetchYotoIconsWithSdk} from "$lib/yoto-icons.server"
import type {YouTubeVideo} from "$lib/youtube.server"

function getCardUsedIconIds(
    cardId: string,
    card: CardData | null,
    env?: Env,
): Set<string> {
    const used = new Set<string>()
    for (const ch of card?.content?.chapters ?? []) {
        const iconRef =
            ch.display?.icon16x16 ?? ch.tracks?.[0]?.display?.icon16x16
        if (iconRef?.startsWith("yoto:#")) {
            used.add(iconRef.slice("yoto:#".length))
        }
    }
    try {
        const db = getDb(env)
        const blocks = db
            .select()
            .from(schema.cardBlocks)
            .where(eq(schema.cardBlocks.cardId, cardId))
            .all()
        for (const b of blocks) {
            if (b.trackIconMediaId) {
                used.add(b.trackIconMediaId)
            }
            if (b.type === "playlist") {
                const pTracks = db
                    .select()
                    .from(schema.syncedPlaylistTracks)
                    .where(eq(schema.syncedPlaylistTracks.blockId, b.id))
                    .all()
                for (const pt of pTracks) {
                    if (pt.iconMediaId) {
                        used.add(pt.iconMediaId)
                    }
                }
            }
        }
    } catch {
        // Ignore DB read errors
    }
    return used
}

export type SyncResult = ImportSuccess & {
    unresolvedCount?: number
    unresolvedTracks?: Array<{title: string; reason: string}>
    removedCount?: number
}

/**
 * Resolves and transcodes a list of ExternalTrackMetadata items one-by-one or in batch,
 * isolating per-track resolution/download failures so a single unavailable or exclusive
 * track never aborts a playlist import/sync or forces a wrong track onto the card.
 */
export async function resolveAndTranscodePlaylistTracks({
    sdk,
    env,
    importId,
    cardId,
    sandboxId,
    tracks,
    onProgress,
}: {
    sdk: YotoSdk
    env: Env
    importId: string
    cardId: string
    sandboxId: string
    tracks: ExternalTrackMetadata[]
    onProgress?: (progress: ImportProgress) => void | Promise<void>
}): Promise<
    Array<{
        meta: ExternalTrackMetadata
        resolutionStatus: ResolutionStatus
        unresolvedReason?: string
        resolvedYoutubeId?: string
        transcoded?: {key: string; duration: number; fileSize: number}
    }>
> {
    const resolvedVideos: Array<{
        trackIndex: number
        meta: ExternalTrackMetadata
        video: YouTubeVideo
    }> = []

    const outcomes: Array<{
        meta: ExternalTrackMetadata
        resolutionStatus: ResolutionStatus
        unresolvedReason?: string
        resolvedYoutubeId?: string
        transcoded?: {key: string; duration: number; fileSize: number}
    }> = tracks.map(meta => ({
        meta,
        resolutionStatus: "resolved",
    }))

    for (let i = 0; i < tracks.length; i++) {
        const meta = tracks[i]
        const resolution = await resolveTrackToYouTube(sandboxId, meta)
        if (resolution.status === "unresolved") {
            outcomes[i] = {
                meta,
                resolutionStatus: meta.unavailableReason
                    ? "unavailable"
                    : "unresolved",
                unresolvedReason: resolution.reason,
            }
            continue
        }

        resolvedVideos.push({
            trackIndex: i,
            meta,
            video: {
                id: resolution.youtubeVideoId,
                title: meta.title,
                url: resolution.youtubeUrl,
                duration: resolution.durationSeconds ?? meta.durationSeconds,
                artist: meta.artist,
                album: meta.album,
                tags: meta.tags,
            },
        })
    }

    if (resolvedVideos.length === 0) {
        return outcomes
    }

    const {succeeded, failed} = await processAudioResilient(
        sdk,
        env,
        {
            id: importId,
            cardId,
            youtubeUrl: resolvedVideos[0].video.url,
            splitByChapters: false,
        },
        resolvedVideos.map(r => r.video),
        onProgress,
    )

    const succeededByVideoId = new Map<string, TranscodedTrack>()
    for (const t of succeeded) {
        succeededByVideoId.set(t.track.sourceId, t)
    }

    const failedByVideoId = new Map<string, string>()
    for (const f of failed) {
        failedByVideoId.set(f.track.sourceId, f.reason)
    }

    for (const {trackIndex, meta, video} of resolvedVideos) {
        const matched = succeededByVideoId.get(video.id)
        if (matched) {
            outcomes[trackIndex] = {
                meta,
                resolutionStatus: "resolved",
                resolvedYoutubeId: video.id,
                transcoded: matched.audio,
            }
        } else {
            outcomes[trackIndex] = {
                meta,
                resolutionStatus: "unavailable",
                unresolvedReason:
                    failedByVideoId.get(video.id) ??
                    "Failed to download or transcode audio",
            }
        }
    }

    return outcomes
}

/**
 * Creates a new synced playlist block on a card, resolves & transcodes its tracks,
 * records any unresolved/unavailable tracks as permanently skipped with a warning,
 * and compiles the card to Yoto.
 */
export async function importSyncedPlaylist({
    sdk,
    env,
    importId,
    cardId,
    sourceUrl,
    insertPosition = "end",
    onProgress,
}: {
    sdk: YotoSdk
    env: Env
    importId: string
    cardId: string
    sourceUrl: string
    insertPosition?: "start" | "end"
    onProgress?: (progress: ImportProgress) => void | Promise<void>
}): Promise<SyncResult> {
    const db = getDb(env)
    const sandboxId = `import-${importId}`

    await onProgress?.({
        phase: "preparing",
        percent: 0,
        total: 0,
        prepared: 0,
        uploaded: 0,
        ready: 0,
    })

    const provider = getProviderForUrl(sourceUrl)
    if (!provider) {
        throw new Error("Unsupported playlist URL provider")
    }

    try {
        const card = (await sdk.content.getCard(
            cardId,
        )) as unknown as CardData | null
        if (!card) throw new Error("Card not found")

        // Ensure existing chapters on the card are hydrated in DB
        const {blocks: existingBlocks} = reconcileCardBlocksWithYoto(
            cardId,
            card,
            env,
        )

        const playlist = await provider.fetchPlaylist(sourceUrl, env)
        const existingChapterCount = card.content?.chapters?.length ?? 0
        const resolvableEstimate = playlist.tracks.filter(
            t => !t.unavailableReason,
        ).length
        assertCardCapacity(existingChapterCount, resolvableEstimate)

        const blockId = crypto.randomUUID()
        let sortOrder = existingBlocks.length

        if (insertPosition === "start" && existingBlocks.length > 0) {
            for (const b of existingBlocks) {
                db.update(schema.cardBlocks)
                    .set({sortOrder: b.sortOrder + 1})
                    .where(eq(schema.cardBlocks.id, b.id))
                    .run()
            }
            sortOrder = 0
        }

        db.insert(schema.cardBlocks)
            .values({
                id: blockId,
                cardId,
                sortOrder,
                type: "playlist",
                provider: playlist.provider,
                externalPlaylistId: playlist.externalId,
                sourceUrl,
                playlistTitle: playlist.title,
                lastSyncStatus: "syncing",
                lastSyncedAt: Date.now(),
            })
            .run()

        const outcomes = await resolveAndTranscodePlaylistTracks({
            sdk,
            env,
            importId,
            cardId,
            sandboxId,
            tracks: playlist.tracks,
            onProgress,
        })

        const usedIconIds = getCardUsedIconIds(cardId, card, env)
        const yotoIcons = await fetchYotoIconsWithSdk(sdk)
        const assignedIcons = pickUniqueYotoIconsForTracks(
            yotoIcons,
            outcomes.map(o => ({
                title: o.meta.title,
                artist: o.meta.artist,
                album: o.meta.album,
                tags: o.meta.tags,
            })),
            usedIconIds,
        )

        let addedCount = 0
        const unresolvedTracks: Array<{title: string; reason: string}> = []

        outcomes.forEach((outcome, index) => {
            const isResolved =
                outcome.resolutionStatus === "resolved" &&
                Boolean(outcome.transcoded)
            const formattedTitle = formatTitleWithArtist(
                outcome.meta.title,
                outcome.meta.artist,
            )

            if (isResolved) {
                addedCount++
            } else {
                unresolvedTracks.push({
                    title: formattedTitle,
                    reason:
                        outcome.unresolvedReason ??
                        "Could not resolve track audio",
                })
            }

            db.insert(schema.syncedPlaylistTracks)
                .values({
                    id: crypto.randomUUID(),
                    blockId,
                    externalTrackId: outcome.meta.externalId,
                    upstreamIndex: index,
                    title: formattedTitle,
                    artist: outcome.meta.artist ?? null,
                    album: outcome.meta.album ?? null,
                    tagsJson: outcome.meta.tags
                        ? JSON.stringify(outcome.meta.tags)
                        : null,
                    resolutionStatus: isResolved
                        ? "resolved"
                        : outcome.resolutionStatus,
                    unresolvedReason: isResolved
                        ? null
                        : (outcome.unresolvedReason ??
                          "Could not resolve track audio"),
                    resolvedYoutubeId: outcome.resolvedYoutubeId ?? null,
                    transcodedSha256: outcome.transcoded?.key ?? null,
                    duration: outcome.transcoded?.duration
                        ? Math.round(outcome.transcoded.duration)
                        : outcome.meta.durationSeconds
                          ? Math.round(outcome.meta.durationSeconds)
                          : null,
                    fileSize: outcome.transcoded?.fileSize ?? null,
                    iconMediaId: isResolved
                        ? (assignedIcons[index] ?? null)
                        : null,
                    skipped: isResolved ? 0 : 1,
                })
                .run()
        })

        db.update(schema.cardBlocks)
            .set({
                lastSyncStatus: "synced",
                lastSyncError: null,
                lastSyncedAt: Date.now(),
            })
            .where(eq(schema.cardBlocks.id, blockId))
            .run()

        await onProgress?.({
            phase: "finalizing",
            percent: 95,
            total: playlist.tracks.length,
            prepared: addedCount,
            uploaded: addedCount,
            ready: addedCount,
        })

        await compileAndPushCardToYoto(sdk, cardId, env)

        await onProgress?.({
            phase: "finalizing",
            percent: 100,
            total: playlist.tracks.length,
            prepared: addedCount,
            uploaded: addedCount,
            ready: addedCount,
        })

        const unresolvedCount = unresolvedTracks.length
        const description =
            unresolvedCount > 0
                ? `${unresolvedCount} track${unresolvedCount === 1 ? " was" : "s were"} permanently skipped because audio could not be resolved.`
                : `Synced playlist "${playlist.title}" linked to this card.`

        return {
            status: "success",
            message: `Synced "${playlist.title}" (${addedCount} track${addedCount === 1 ? "" : "s"} active)`,
            added: addedCount,
            skipped: unresolvedCount,
            unresolvedCount,
            unresolvedTracks,
            description,
        }
    } finally {
        await destroySandbox(env, sandboxId).catch(() => {})
    }
}

/**
 * Syncs an existing playlist block with its upstream source:
 * - Preserves existing resolved tracks, their custom icons, and user skip state
 * - Resolves and transcodes newly added upstream tracks
 * - Removes tracks deleted from upstream
 * - Reorders tracks to match upstream order
 * - Recompiles and pushes the updated card to Yoto
 */
export async function syncPlaylistBlock({
    sdk,
    env,
    cardId,
    blockId,
    onProgress,
}: {
    sdk: YotoSdk
    env: Env
    cardId: string
    blockId: string
    onProgress?: (progress: ImportProgress) => void | Promise<void>
}): Promise<SyncResult> {
    const db = getDb(env)
    const block = db
        .select()
        .from(schema.cardBlocks)
        .where(eq(schema.cardBlocks.id, blockId))
        .get()

    if (!block || block.cardId !== cardId || block.type !== "playlist") {
        throw new Error("Synced playlist block not found")
    }

    if (!block.sourceUrl) {
        throw new Error("Playlist block has no source URL")
    }

    const sandboxId = `sync-${crypto.randomUUID()}`
    db.update(schema.cardBlocks)
        .set({lastSyncStatus: "syncing", lastSyncError: null})
        .where(eq(schema.cardBlocks.id, blockId))
        .run()

    try {
        const provider = block.provider
            ? getProviderAdapter(block.provider as ProviderId)
            : getProviderForUrl(block.sourceUrl)

        if (!provider) {
            throw new Error("Unsupported playlist provider")
        }

        const upstream = await provider.fetchPlaylist(block.sourceUrl, env)
        const existingTracks = db
            .select()
            .from(schema.syncedPlaylistTracks)
            .where(eq(schema.syncedPlaylistTracks.blockId, blockId))
            .orderBy(asc(schema.syncedPlaylistTracks.upstreamIndex))
            .all()

        const existingByExternalId = new Map(
            existingTracks.map(t => [t.externalTrackId, t]),
        )

        const newTracksToResolve: Array<{
            upstreamIndex: number
            meta: ExternalTrackMetadata
        }> = []

        upstream.tracks.forEach((meta, idx) => {
            const existing = existingByExternalId.get(meta.externalId)
            if (
                !existing ||
                (existing.resolutionStatus !== "resolved" &&
                    !meta.unavailableReason)
            ) {
                newTracksToResolve.push({upstreamIndex: idx, meta})
            }
        })

        // Resolve & transcode only newly discovered (or previously unresolved) tracks
        const resolvedNewMap = new Map<
            number,
            Awaited<
                ReturnType<typeof resolveAndTranscodePlaylistTracks>
            >[number]
        >()

        if (newTracksToResolve.length > 0) {
            const outcomes = await resolveAndTranscodePlaylistTracks({
                sdk,
                env,
                importId: blockId,
                cardId,
                sandboxId,
                tracks: newTracksToResolve.map(item => item.meta),
                onProgress,
            })
            newTracksToResolve.forEach((item, idx) => {
                resolvedNewMap.set(item.upstreamIndex, outcomes[idx])
            })
        }

        // Remove tracks deleted upstream
        const upstreamIds = new Set(upstream.tracks.map(t => t.externalId))
        let removedCount = 0
        for (const existing of existingTracks) {
            if (!upstreamIds.has(existing.externalTrackId)) {
                db.delete(schema.syncedPlaylistTracks)
                    .where(eq(schema.syncedPlaylistTracks.id, existing.id))
                    .run()
                removedCount++
            }
        }

        let addedCount = 0
        let unresolvedCount = 0

        const usedIconIds = getCardUsedIconIds(cardId, null, env)
        const yotoIcons = await fetchYotoIconsWithSdk(sdk)
        const assignedIcons = pickUniqueYotoIconsForTracks(
            yotoIcons,
            upstream.tracks.map(meta => ({
                title: meta.title,
                artist: meta.artist,
                album: meta.album,
                tags: meta.tags,
            })),
            usedIconIds,
        )

        // Upsert tracks in upstream order
        upstream.tracks.forEach((meta, upstreamIndex) => {
            const existing = existingByExternalId.get(meta.externalId)
            const newlyResolved = resolvedNewMap.get(upstreamIndex)
            const formattedTitle = formatTitleWithArtist(
                meta.title,
                meta.artist,
            )

            if (existing && !newlyResolved) {
                // Keep existing track state, just update upstreamIndex and title/artist if changed
                db.update(schema.syncedPlaylistTracks)
                    .set({
                        upstreamIndex,
                        title: formattedTitle || existing.title,
                        iconMediaId:
                            existing.iconMediaId ??
                            (existing.resolutionStatus === "resolved"
                                ? (assignedIcons[upstreamIndex] ?? null)
                                : null),
                    })
                    .where(eq(schema.syncedPlaylistTracks.id, existing.id))
                    .run()
                if (existing.resolutionStatus !== "resolved") {
                    unresolvedCount++
                }
                return
            }

            if (newlyResolved) {
                const isResolved =
                    newlyResolved.resolutionStatus === "resolved" &&
                    Boolean(newlyResolved.transcoded)

                if (isResolved) {
                    addedCount++
                } else {
                    unresolvedCount++
                }

                if (existing) {
                    db.update(schema.syncedPlaylistTracks)
                        .set({
                            upstreamIndex,
                            title: formattedTitle,
                            artist: meta.artist ?? existing.artist,
                            album: meta.album ?? existing.album,
                            resolutionStatus: isResolved
                                ? "resolved"
                                : newlyResolved.resolutionStatus,
                            unresolvedReason: isResolved
                                ? null
                                : (newlyResolved.unresolvedReason ??
                                  "Could not resolve track audio"),
                            resolvedYoutubeId:
                                newlyResolved.resolvedYoutubeId ?? null,
                            transcodedSha256:
                                newlyResolved.transcoded?.key ?? null,
                            duration: newlyResolved.transcoded?.duration
                                ? Math.round(newlyResolved.transcoded.duration)
                                : existing.duration,
                            fileSize:
                                newlyResolved.transcoded?.fileSize ??
                                existing.fileSize,
                            iconMediaId:
                                existing.iconMediaId ??
                                (isResolved
                                    ? (assignedIcons[upstreamIndex] ?? null)
                                    : null),
                            skipped: isResolved ? existing.skipped : 1,
                        })
                        .where(eq(schema.syncedPlaylistTracks.id, existing.id))
                        .run()
                } else {
                    db.insert(schema.syncedPlaylistTracks)
                        .values({
                            id: crypto.randomUUID(),
                            blockId,
                            externalTrackId: meta.externalId,
                            upstreamIndex,
                            title: formattedTitle,
                            artist: meta.artist ?? null,
                            album: meta.album ?? null,
                            tagsJson: meta.tags
                                ? JSON.stringify(meta.tags)
                                : null,
                            resolutionStatus: isResolved
                                ? "resolved"
                                : newlyResolved.resolutionStatus,
                            unresolvedReason: isResolved
                                ? null
                                : (newlyResolved.unresolvedReason ??
                                  "Could not resolve track audio"),
                            resolvedYoutubeId:
                                newlyResolved.resolvedYoutubeId ?? null,
                            transcodedSha256:
                                newlyResolved.transcoded?.key ?? null,
                            duration: newlyResolved.transcoded?.duration
                                ? Math.round(newlyResolved.transcoded.duration)
                                : meta.durationSeconds
                                  ? Math.round(meta.durationSeconds)
                                  : null,
                            fileSize:
                                newlyResolved.transcoded?.fileSize ?? null,
                            iconMediaId: isResolved
                                ? (assignedIcons[upstreamIndex] ?? null)
                                : null,
                            skipped: isResolved ? 0 : 1,
                        })
                        .run()
                }
            }
        })

        db.update(schema.cardBlocks)
            .set({
                playlistTitle: upstream.title || block.playlistTitle,
                lastSyncStatus: "synced",
                lastSyncError: null,
                lastSyncedAt: Date.now(),
            })
            .where(eq(schema.cardBlocks.id, blockId))
            .run()

        await compileAndPushCardToYoto(sdk, cardId, env)

        logger.info({
            message: "playlist.sync.completed",
            cardId,
            blockId,
            addedCount,
            removedCount,
            unresolvedCount,
        })

        return {
            status: "success",
            message: `Synced "${upstream.title}" (+${addedCount} added, -${removedCount} removed)`,
            added: addedCount,
            skipped: unresolvedCount,
            removedCount,
            unresolvedCount,
        }
    } catch (error) {
        const errMsg =
            error instanceof Error ? error.message : "Playlist sync failed"
        db.update(schema.cardBlocks)
            .set({
                lastSyncStatus: "error",
                lastSyncError: errMsg,
            })
            .where(eq(schema.cardBlocks.id, blockId))
            .run()
        throw error
    } finally {
        await destroySandbox(env, sandboxId).catch(() => {})
    }
}

