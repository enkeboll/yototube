import {eq} from "drizzle-orm"

import {getYotoSdk} from "$lib/auth.server"
import {getDb, schema} from "$lib/db/index.server"
import {logger} from "$lib/logger.server"
import {syncPlaylistBlock} from "$lib/sync.server"

let schedulerStarted = false
let lastKnownYotoToken: string | null = null

export function recordActiveYotoTokenForScheduler(token: string): void {
    lastKnownYotoToken = token
}

export async function runDuePlaylistSyncs(
    env: Env,
    tokenOverride?: string,
): Promise<{syncedBlocks: number}> {
    const token = tokenOverride ?? lastKnownYotoToken
    if (!token) return {syncedBlocks: 0}

    const intervalMinutes = Number.parseInt(
        env.SYNC_INTERVAL_MINUTES ||
            process.env.SYNC_INTERVAL_MINUTES ||
            "360",
        10,
    )
    const thresholdMs =
        (Number.isFinite(intervalMinutes) && intervalMinutes > 0
            ? intervalMinutes
            : 360) *
        60 *
        1000
    const now = Date.now()

    const db = getDb(env)
    const playlistBlocks = db
        .select()
        .from(schema.cardBlocks)
        .where(eq(schema.cardBlocks.type, "playlist"))
        .all()

    const dueBlocks = playlistBlocks.filter(
        b =>
            b.lastSyncStatus !== "syncing" &&
            (!b.lastSyncedAt || now - b.lastSyncedAt >= thresholdMs),
    )

    if (dueBlocks.length === 0) {
        return {syncedBlocks: 0}
    }

    const sdk = getYotoSdk(token)
    let syncedBlocks = 0

    for (const block of dueBlocks) {
        try {
            await syncPlaylistBlock({
                sdk,
                env,
                cardId: block.cardId,
                blockId: block.id,
            })
            syncedBlocks++
        } catch (error) {
            logger.warn({
                message: "scheduler.playlist.sync_failed",
                cardId: block.cardId,
                blockId: block.id,
                error: error instanceof Error ? error.message : String(error),
            })
        }
    }

    return {syncedBlocks}
}

export function ensureBackgroundSyncScheduler(env: Env): void {
    if (
        schedulerStarted ||
        process.env.VITEST ||
        process.env.NODE_ENV === "test"
    ) {
        return
    }
    schedulerStarted = true

    const CHECK_INTERVAL_MS = 15 * 60 * 1000 // Check every 15 minutes
    const timer = setInterval(() => {
        runDuePlaylistSyncs(env).catch(() => {
            // Logged inside runDuePlaylistSyncs
        })
    }, CHECK_INTERVAL_MS)

    timer.unref?.()
}

