import {eq} from "drizzle-orm"

import {getDb, schema} from "$lib/db/index.server"

export type YotoEverythingIcon = {
    id: string // slug
    title: string
    category: string
    topic: string
    prompt: string
    tags: string[]
    url: string // https://www.yotoeverything.com/icons/{slug}.png
}

const BASE_URL = "https://www.yotoeverything.com"
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour in-memory / DB refresh

let memoryCache: YotoEverythingIcon[] | null = null
let memoryCacheTimestamp = 0

const ESCAPED_ICON_REGEX =
    /\\"slug\\":\\"([^"\\]+)\\",\\"title\\":\\"([^"\\]+)\\",\\"category\\":\\"([^"\\]+)\\",\\"topic\\":\\"([^"\\]+)\\",\\"prompt\\":\\"([^"\\]*)\\"/g

const UNESCAPED_ICON_REGEX =
    /"slug":"([^"]+)","title":"([^"]+)","category":"([^"]+)","topic":"([^"]+)","prompt":"([^"]*)"/g

function tokenizePrompt(prompt: string): string[] {
    return prompt
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter(w => w.length > 2)
}

export function parseYotoEverythingIconsFromHtml(
    html: string,
): YotoEverythingIcon[] {
    const seen = new Set<string>()
    const icons: YotoEverythingIcon[] = []

    const addMatch = (
        slug: string,
        title: string,
        category: string,
        topic: string,
        prompt: string,
    ) => {
        if (!slug || seen.has(slug)) return
        seen.add(slug)

        const tags = Array.from(
            new Set([
                category.toLowerCase(),
                topic.toLowerCase(),
                ...slug.toLowerCase().split("-"),
                ...tokenizePrompt(prompt),
            ]),
        ).filter(Boolean)

        icons.push({
            id: slug,
            title,
            category,
            topic,
            prompt,
            tags,
            url: `${BASE_URL}/icons/${slug}.png`,
        })
    }

    ESCAPED_ICON_REGEX.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = ESCAPED_ICON_REGEX.exec(html)) !== null) {
        const [, slug, title, category, topic, prompt] = match
        addMatch(slug, title, category, topic, prompt)
    }

    UNESCAPED_ICON_REGEX.lastIndex = 0
    while ((match = UNESCAPED_ICON_REGEX.exec(html)) !== null) {
        const [, slug, title, category, topic, prompt] = match
        addMatch(slug, title, category, topic, prompt)
    }

    return icons
}

export async function fetchYotoEverythingIcons(
    env?: Env,
): Promise<YotoEverythingIcon[]> {
    const now = Date.now()
    if (memoryCache && now - memoryCacheTimestamp < CACHE_TTL_MS) {
        return memoryCache
    }

    const db = getDb(env)
    const cachedRows = db
        .select()
        .from(schema.iconCache)
        .where(eq(schema.iconCache.source, "yotoeverything"))
        .all()

    if (
        cachedRows.length > 0 &&
        now - cachedRows[0].updatedAt < 24 * 60 * 60 * 1000
    ) {
        memoryCache = cachedRows.map(row => ({
            id: row.externalId,
            title: row.title,
            category: row.category ?? "general",
            topic: row.category ?? "general",
            prompt: row.prompt ?? "",
            tags: JSON.parse(row.tagsJson) as string[],
            url: row.imageUrl,
        }))
        memoryCacheTimestamp = now
        return memoryCache
    }

    try {
        const response = await fetch(`${BASE_URL}/icons`)
        if (!response.ok) {
            throw new Error(
                `yotoeverything.com returned ${response.status}`,
            )
        }
        const html = await response.text()
        const icons = parseYotoEverythingIconsFromHtml(html)

        if (icons.length > 0) {
            for (const icon of icons) {
                db.insert(schema.iconCache)
                    .values({
                        id: `yotoeverything:${icon.id}`,
                        source: "yotoeverything",
                        externalId: icon.id,
                        title: icon.title,
                        category: icon.category,
                        tagsJson: JSON.stringify(icon.tags),
                        prompt: icon.prompt,
                        imageUrl: icon.url,
                        updatedAt: now,
                    })
                    .onConflictDoUpdate({
                        target: schema.iconCache.id,
                        set: {
                            title: icon.title,
                            category: icon.category,
                            tagsJson: JSON.stringify(icon.tags),
                            prompt: icon.prompt,
                            imageUrl: icon.url,
                            updatedAt: now,
                        },
                    })
                    .run()
            }

            memoryCache = icons
            memoryCacheTimestamp = now
            return icons
        }
    } catch (error) {
        if (cachedRows.length > 0) {
            return cachedRows.map(row => ({
                id: row.externalId,
                title: row.title,
                category: row.category ?? "general",
                topic: row.category ?? "general",
                prompt: row.prompt ?? "",
                tags: JSON.parse(row.tagsJson) as string[],
                url: row.imageUrl,
            }))
        }
        throw error
    }

    return []
}

export async function searchYotoEverythingIcons(
    query: string,
    env?: Env,
): Promise<YotoEverythingIcon[]> {
    const icons = await fetchYotoEverythingIcons(env)
    const lowerQuery = query.trim().toLowerCase()
    if (!lowerQuery) return []

    const queryTokens = lowerQuery.split(/\s+/).filter(Boolean)

    return icons.filter(icon => {
        const haystacks = [
            icon.title.toLowerCase(),
            icon.id.toLowerCase(),
            icon.category.toLowerCase(),
            icon.topic.toLowerCase(),
            icon.prompt.toLowerCase(),
            ...icon.tags,
        ]
        return queryTokens.every(token =>
            haystacks.some(h => h.includes(token)),
        )
    })
}

export async function fetchYotoEverythingIconImage(
    slug: string,
): Promise<Uint8Array> {
    const cleanSlug = slug.replace(/[^a-zA-Z0-9_-]/g, "")
    const url = `${BASE_URL}/icons/${cleanSlug}.png`
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(
            `Failed to fetch Yoto Everything icon ${cleanSlug}: ${response.status}`,
        )
    }
    const arrayBuffer = await response.arrayBuffer()
    return new Uint8Array(arrayBuffer)
}

export function clearYotoEverythingCache(): void {
    memoryCache = null
    memoryCacheTimestamp = 0
}

