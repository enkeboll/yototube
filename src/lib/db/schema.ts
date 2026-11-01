import {index, integer, sqliteTable, text} from "drizzle-orm/sqlite-core"

export type ProviderId =
    | "youtube"
    | "youtube_music"
    | "spotify"
    | "apple_music"
    | "amazon_music"

export type CardBlockType = "track" | "playlist"

export type SyncStatus = "idle" | "syncing" | "synced" | "error"

export type ResolutionStatus = "resolved" | "unresolved" | "unavailable"

export type IconSource = "yoto" | "yotoicons" | "yotoeverything"

export const cardConfigs = sqliteTable("card_config", {
    cardId: text("card_id").primaryKey(),
    syncIntervalMinutes: integer("sync_interval_minutes").default(360),
    updatedAt: integer("updated_at").notNull(),
})

export const cardBlocks = sqliteTable(
    "card_block",
    {
        id: text("id").primaryKey(),
        cardId: text("card_id").notNull(),
        sortOrder: integer("sort_order").notNull(),
        type: text("type").$type<CardBlockType>().notNull(),
        // Fields for standalone tracks (type = "track")
        yotoChapterKey: text("yoto_chapter_key"),
        trackTitle: text("track_title"),
        trackArtist: text("track_artist"),
        trackAlbum: text("track_album"),
        trackTagsJson: text("track_tags_json"),
        trackSha256: text("track_sha256"),
        trackDuration: integer("track_duration"),
        trackFileSize: integer("track_file_size"),
        trackIconMediaId: text("track_icon_media_id"),
        // Fields for synced playlists (type = "playlist")
        provider: text("provider").$type<ProviderId>(),
        externalPlaylistId: text("external_playlist_id"),
        sourceUrl: text("source_url"),
        playlistTitle: text("playlist_title"),
        lastSyncStatus: text("last_sync_status")
            .$type<SyncStatus>()
            .default("idle"),
        lastSyncError: text("last_sync_error"),
        lastSyncedAt: integer("last_synced_at"),
    },
    table => [index("card_block_card_id_idx").on(table.cardId)],
)

export const syncedPlaylistTracks = sqliteTable(
    "synced_playlist_track",
    {
        id: text("id").primaryKey(),
        blockId: text("block_id").notNull(),
        externalTrackId: text("external_track_id").notNull(),
        upstreamIndex: integer("upstream_index").notNull(),
        title: text("title").notNull(),
        artist: text("artist"),
        album: text("album"),
        tagsJson: text("tags_json"),
        resolutionStatus: text("resolution_status")
            .$type<ResolutionStatus>()
            .notNull()
            .default("resolved"),
        unresolvedReason: text("unresolved_reason"),
        resolvedYoutubeId: text("resolved_youtube_id"),
        transcodedSha256: text("transcoded_sha256"),
        duration: integer("duration"),
        fileSize: integer("file_size"),
        skipped: integer("skipped").notNull().default(0),
        iconMediaId: text("icon_media_id"),
        yotoChapterKey: text("yoto_chapter_key"),
    },
    table => [index("synced_playlist_track_block_id_idx").on(table.blockId)],
)

export const providerCredentials = sqliteTable("provider_credentials", {
    provider: text("provider").$type<ProviderId>().primaryKey(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: integer("expires_at"),
    metadataJson: text("metadata_json"),
    updatedAt: integer("updated_at").notNull(),
})

export const iconCache = sqliteTable(
    "icon_cache",
    {
        id: text("id").primaryKey(), // "${source}:${externalId}"
        source: text("source").$type<IconSource>().notNull(),
        externalId: text("external_id").notNull(),
        title: text("title").notNull(),
        category: text("category"),
        tagsJson: text("tags_json").notNull(), // JSON string[] of tags/topics/prompt words
        prompt: text("prompt"),
        imageUrl: text("image_url").notNull(),
        yotoMediaId: text("yoto_media_id"),
        downloads: integer("downloads").default(0),
        updatedAt: integer("updated_at").notNull(),
    },
    table => [index("icon_cache_source_idx").on(table.source)],
)

