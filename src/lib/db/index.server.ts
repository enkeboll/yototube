import fs from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3"

import * as schema from "./schema"

export type AppDatabase = BetterSQLite3Database<typeof schema>

let _db: AppDatabase | null = null
let _sqlite: Database.Database | null = null
let _currentUrl: string | null = null

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS card_config (
    card_id TEXT PRIMARY KEY,
    sync_interval_minutes INTEGER DEFAULT 360,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS card_block (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    type TEXT NOT NULL,
    yoto_chapter_key TEXT,
    track_title TEXT,
    track_artist TEXT,
    track_album TEXT,
    track_tags_json TEXT,
    track_sha256 TEXT,
    track_duration INTEGER,
    track_file_size INTEGER,
    track_icon_media_id TEXT,
    provider TEXT,
    external_playlist_id TEXT,
    source_url TEXT,
    playlist_title TEXT,
    last_sync_status TEXT DEFAULT 'idle',
    last_sync_error TEXT,
    last_synced_at INTEGER
);

CREATE INDEX IF NOT EXISTS card_block_card_id_idx ON card_block(card_id);

CREATE TABLE IF NOT EXISTS synced_playlist_track (
    id TEXT PRIMARY KEY,
    block_id TEXT NOT NULL,
    external_track_id TEXT NOT NULL,
    upstream_index INTEGER NOT NULL,
    title TEXT NOT NULL,
    artist TEXT,
    album TEXT,
    tags_json TEXT,
    resolution_status TEXT NOT NULL DEFAULT 'resolved',
    unresolved_reason TEXT,
    resolved_youtube_id TEXT,
    transcoded_sha256 TEXT,
    duration INTEGER,
    file_size INTEGER,
    skipped INTEGER NOT NULL DEFAULT 0,
    icon_media_id TEXT,
    yoto_chapter_key TEXT
);

CREATE INDEX IF NOT EXISTS synced_playlist_track_block_id_idx ON synced_playlist_track(block_id);

CREATE TABLE IF NOT EXISTS provider_credentials (
    provider TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at INTEGER,
    metadata_json TEXT,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS icon_cache (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT,
    tags_json TEXT NOT NULL,
    prompt TEXT,
    image_url TEXT NOT NULL,
    yoto_media_id TEXT,
    downloads INTEGER DEFAULT 0,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS icon_cache_source_idx ON icon_cache(source);
`

export function resolveDatabaseUrl(env?: Env): string {
    const configured = env?.DATABASE_URL || process.env.DATABASE_URL
    if (configured) {
        return configured
    }
    if (process.env.VITEST || process.env.NODE_ENV === "test") {
        return ":memory:"
    }
    return "./data/yototube.db"
}

export function getDb(env?: Env): AppDatabase {
    const dbUrl = resolveDatabaseUrl(env)

    if (_db && _currentUrl === dbUrl) {
        return _db
    }

    if (_sqlite) {
        try {
            _sqlite.close()
        } catch {
            // ignore
        }
    }

    if (dbUrl !== ":memory:") {
        const dir = path.dirname(path.resolve(dbUrl))
        fs.mkdirSync(dir, {recursive: true})
    }

    _sqlite = new Database(dbUrl)
    _sqlite.pragma("journal_mode = WAL")
    _sqlite.pragma("foreign_keys = ON")
    _sqlite.exec(INIT_SQL)

    _db = drizzle(_sqlite, {schema})
    _currentUrl = dbUrl
    return _db
}

export function resetTestDb(): void {
    if (_sqlite) {
        _sqlite.exec(`
            DELETE FROM synced_playlist_track;
            DELETE FROM card_block;
            DELETE FROM card_config;
            DELETE FROM provider_credentials;
            DELETE FROM icon_cache;
        `)
    }
}

export {schema}

