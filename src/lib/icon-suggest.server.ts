import {fetchYotoIcons, type YotoIcon} from "./yoto-icons.server"
import {
    fetchYotoEverythingIcons,
    type YotoEverythingIcon,
} from "./yotoeverything-icons.server"
import {
    searchCommunityIcons,
    type CommunityIcon,
} from "./yotoicons-community.server"

export type SuggestedIcon =
    | ({type: "yoto"; score: number; matchedKeyword: string} & YotoIcon)
    | ({
          type: "yotoeverything"
          score: number
          matchedKeyword: string
      } & YotoEverythingIcon)
    | ({
          type: "community"
          score: number
          matchedKeyword: string
      } & CommunityIcon)

const STOP_WORDS = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "your",
    "you",
    "are",
    "was",
    "were",
    "have",
    "has",
    "had",
    "not",
    "but",
    "all",
    "can",
    "her",
    "his",
    "our",
    "out",
    "who",
    "what",
    "when",
    "where",
    "why",
    "how",
    "official",
    "video",
    "audio",
    "music",
    "lyric",
    "lyrics",
    "remastered",
    "remaster",
    "version",
    "feat",
    "featuring",
    "ft",
    "prod",
    "hd",
    "hq",
    "4k",
    "1080p",
    "live",
    "topic",
    "vevo",
    "full",
    "song",
    "songs",
    "track",
    "album",
    "playlist",
    "kids",
    "children",
    "childrens",
    "nursery",
    "rhyme",
    "rhymes",
    "episode",
    "part",
    "vol",
    "volume",
    "chapter",
])

const THEME_SYNONYMS: Record<string, string[]> = {
    lullaby: ["moon", "star", "sleep"],
    bedtime: ["moon", "star", "bed"],
    sleep: ["moon", "star", "zzz"],
    dream: ["moon", "cloud", "star"],
    twinkle: ["star", "night"],
    dino: ["dinosaur", "trex"],
    trex: ["dinosaur"],
    jurassic: ["dinosaur"],
    shark: ["shark", "fish", "ocean"],
    whale: ["whale", "ocean", "fish"],
    ocean: ["wave", "fish", "sea"],
    sea: ["fish", "crab", "wave"],
    mermaid: ["mermaid", "sea"],
    pirate: ["pirate", "ship", "skull"],
    choo: ["train"],
    locomotive: ["train"],
    railroad: ["train"],
    wheels: ["bus", "car"],
    firetruck: ["truck", "fire"],
    ambulance: ["truck", "ambulance"],
    tractor: ["tractor", "farm"],
    farm: ["barn", "tractor", "cow", "pig"],
    macdonald: ["farm", "cow", "pig", "duck"],
    bingo: ["dog", "puppy"],
    puppy: ["dog"],
    kitty: ["cat"],
    kitten: ["cat"],
    meow: ["cat"],
    woof: ["dog"],
    quack: ["duck"],
    duckling: ["duck"],
    bunny: ["rabbit"],
    hop: ["rabbit", "frog"],
    spooky: ["ghost", "pumpkin", "bat"],
    halloween: ["pumpkin", "ghost", "witch"],
    monster: ["monster", "ghost"],
    christmas: ["tree", "santa", "snowflake"],
    santa: ["santa", "christmas", "reindeer"],
    jingle: ["bell", "christmas", "snowflake"],
    frozen: ["snowflake", "snowman", "ice"],
    elsa: ["snowflake", "crown"],
    olaf: ["snowman"],
    princess: ["crown", "castle"],
    prince: ["crown", "castle"],
    king: ["crown", "castle"],
    queen: ["crown", "castle"],
    knight: ["sword", "shield", "castle"],
    dragon: ["dragon", "fire"],
    unicorn: ["unicorn", "rainbow"],
    rainbow: ["rainbow", "cloud"],
    rain: ["rain", "umbrella", "cloud"],
    sunny: ["sun"],
    sunshine: ["sun"],
    rocket: ["rocket", "space", "planet"],
    astronaut: ["rocket", "space", "moon"],
    space: ["rocket", "planet", "star"],
    birthday: ["cake", "balloon", "party"],
    party: ["balloon", "cake", "music"],
    dance: ["music", "note", "disco"],
    dancing: ["music", "note"],
    rock: ["guitar", "music"],
    piano: ["piano", "music"],
    drum: ["drum", "music"],
    abc: ["alphabet", "letters"],
    alphabet: ["letters", "book"],
    story: ["book"],
    storytime: ["book"],
    read: ["book"],
    spider: ["spider", "web"],
    itsy: ["spider"],
    bitsy: ["spider"],
    bee: ["bee", "flower"],
    butterfly: ["butterfly", "flower"],
    bear: ["bear", "teddy"],
    teddy: ["bear"],
    monkey: ["monkey", "banana"],
    bananas: ["banana", "monkey"],
    apples: ["apple", "fruit"],
    pizza: ["pizza", "food"],
    cookie: ["cookie", "food"],
    superhero: ["hero", "star", "lightning"],
    spidey: ["spider"],
    bluey: ["bluey", "dog"],
    peppa: ["pig"],
    mario: ["mario", "mushroom", "star"],
    pokemon: ["pikachu", "pokeball"],
    pikachu: ["pikachu", "lightning"],
    paw: ["dog", "paw"],
}

function cleanAndTokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/\([^)]*\)/g, " ")
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(w => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
}

function singularize(word: string): string {
    if (word.endsWith("ies") && word.length > 4) {
        return word.slice(0, -3) + "y"
    }
    if (word.endsWith("es") && word.length > 4 && !word.endsWith("ses")) {
        return word.slice(0, -2)
    }
    if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) {
        return word.slice(0, -1)
    }
    return word
}

export type TrackMetadataForIcon = {
    title: string
    artist?: string
    album?: string
    tags?: string[]
}

/**
 * Extracts prioritized search keywords & theme tokens from a track's title, artist, album, and tags.
 */
export function extractKeywordsFromTrack(
    meta: TrackMetadataForIcon,
): Array<{keyword: string; weight: number}> {
    const weights = new Map<string, number>()

    const addToken = (rawToken: string, weight: number) => {
        const token = singularize(rawToken.toLowerCase().trim())
        if (!token || token.length < 3 || STOP_WORDS.has(token)) return
        weights.set(token, Math.max(weights.get(token) ?? 0, weight))

        const synonyms = THEME_SYNONYMS[rawToken] ?? THEME_SYNONYMS[token]
        if (synonyms) {
            for (const syn of synonyms) {
                weights.set(syn, Math.max(weights.get(syn) ?? 0, weight * 0.9))
            }
        }
    }

    // 1. Title tokens have highest weight (3.0)
    for (const token of cleanAndTokenize(meta.title)) {
        addToken(token, 3.0)
    }

    // 2. Album tokens (2.0)
    if (meta.album) {
        for (const token of cleanAndTokenize(meta.album)) {
            addToken(token, 2.0)
        }
    }

    // 3. YouTube / Provider tags (1.8)
    if (meta.tags) {
        for (const tag of meta.tags.slice(0, 15)) {
            for (const token of cleanAndTokenize(tag)) {
                addToken(token, 1.8)
            }
        }
    }

    // 4. Artist tokens (1.2)
    if (meta.artist) {
        for (const token of cleanAndTokenize(meta.artist)) {
            addToken(token, 1.2)
        }
    }

    const sorted = Array.from(weights.entries())
        .map(([keyword, weight]) => ({keyword, weight}))
        .sort((a, b) => b.weight - a.weight)

    // Always provide a fallback music keyword if nothing specific matched
    if (sorted.length === 0) {
        sorted.push({keyword: "music", weight: 1.0})
    }

    return sorted.slice(0, 16)
}

export function scoreIconsAgainstKeywords(
    keywords: Array<{keyword: string; weight: number}>,
    yotoIcons: YotoIcon[],
    yotoEverythingIcons: YotoEverythingIcon[],
    communityIcons: CommunityIcon[] = [],
): SuggestedIcon[] {
    const scored: SuggestedIcon[] = []

    // 1. Score Yoto Everything icons (rich title, topic, category, prompt)
    for (const icon of yotoEverythingIcons) {
        let bestScore = 0
        let matchedKeyword = ""
        const titleLower = icon.title.toLowerCase()
        const topicLower = icon.topic.toLowerCase()
        const slugParts = icon.id.toLowerCase().split("-")
        const tagSet = new Set(icon.tags.map(t => t.toLowerCase()))

        for (const {keyword, weight} of keywords) {
            let matchStrength = 0
            if (titleLower === keyword || topicLower === keyword || icon.id === keyword) {
                matchStrength = 4.0
            } else if (slugParts.includes(keyword)) {
                matchStrength = 3.5
            } else if (tagSet.has(keyword)) {
                matchStrength = 2.0
            } else if (titleLower.includes(keyword)) {
                matchStrength = 1.8
            }

            const total = matchStrength * weight
            if (total > bestScore) {
                bestScore = total
                matchedKeyword = keyword
            }
        }

        if (bestScore > 0) {
            scored.push({
                type: "yotoeverything",
                ...icon,
                score: bestScore,
                matchedKeyword,
            })
        }
    }

    // 2. Score Yoto Official icons
    for (const icon of yotoIcons) {
        let bestScore = 0
        let matchedKeyword = ""
        const titleLower = (icon.title ?? "").toLowerCase()
        const titleWords = cleanAndTokenize(titleLower)
        const tagsLower = (icon.tags ?? []).map(t => t.toLowerCase())

        for (const {keyword, weight} of keywords) {
            let matchStrength = 0
            if (titleLower === keyword || titleWords.includes(keyword)) {
                matchStrength = 4.0
            } else if (tagsLower.includes(keyword)) {
                matchStrength = 3.2
            } else if (
                titleLower.includes(keyword) ||
                tagsLower.some(t => t.includes(keyword))
            ) {
                matchStrength = 1.8
            }

            const total = matchStrength * weight
            if (total > bestScore) {
                bestScore = total
                matchedKeyword = keyword
            }
        }

        if (bestScore > 0) {
            scored.push({
                type: "yoto",
                ...icon,
                score: bestScore,
                matchedKeyword,
            })
        }
    }

    // 3. Score Community icons (yotoicons.com)
    for (const icon of communityIcons) {
        let bestScore = 0
        let matchedKeyword = ""
        const tagsLower = icon.tags.map(t => t.toLowerCase())
        const catLower = icon.category.toLowerCase()

        for (const {keyword, weight} of keywords) {
            let matchStrength = 0
            if (tagsLower.includes(keyword)) {
                matchStrength = 3.6
            } else if (catLower === keyword) {
                matchStrength = 2.2
            } else if (tagsLower.some(t => t.includes(keyword))) {
                matchStrength = 2.0
            }

            const popularityBoost = Math.min(icon.downloads / 5000, 0.5)
            const total = (matchStrength + (matchStrength > 0 ? popularityBoost : 0)) * weight
            if (total > bestScore) {
                bestScore = total
                matchedKeyword = keyword
            }
        }

        if (bestScore > 0) {
            scored.push({
                type: "community",
                ...icon,
                score: bestScore,
                matchedKeyword,
            })
        }
    }

    return scored.sort((a, b) => b.score - a.score)
}

export async function suggestIconsForTrack(
    request: Request,
    env: Env,
    meta: TrackMetadataForIcon,
    limit = 16,
): Promise<{
    keywords: string[]
    suggestions: SuggestedIcon[]
}> {
    const weightedKeywords = extractKeywordsFromTrack(meta)
    const topKeyword = weightedKeywords[0]?.keyword

    const [yotoResult, everythingResult, communityResult] =
        await Promise.allSettled([
            fetchYotoIcons(request, env),
            fetchYotoEverythingIcons(env),
            topKeyword
                ? searchCommunityIcons(topKeyword)
                : Promise.resolve({icons: []}),
        ])

    const yotoIcons =
        yotoResult.status === "fulfilled" ? yotoResult.value : []
    const everythingIcons =
        everythingResult.status === "fulfilled" ? everythingResult.value : []
    const communityIcons =
        communityResult.status === "fulfilled"
            ? communityResult.value.icons.slice(0, 25)
            : []

    const suggestions = scoreIconsAgainstKeywords(
        weightedKeywords,
        yotoIcons,
        everythingIcons,
        communityIcons,
    ).slice(0, limit)

    return {
        keywords: weightedKeywords.map(k => k.keyword),
        suggestions,
    }
}

function hashString(input: string): number {
    let hash = 2166136261
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return Math.abs(hash >>> 0)
}

/**
 * Picks an icon mediaId for each track on import, guaranteeing:
 * 1. Best keyword/metadata match is chosen first if available.
 * 2. Even if no keyword matches ("even if it's wrong"), a fallback icon is always picked.
 * 3. Never picks an icon already used on the same card (existing or earlier in the same import batch).
 */
export function pickUniqueYotoIconsForTracks(
    yotoIcons: YotoIcon[],
    tracks: TrackMetadataForIcon[],
    alreadyUsedIconIds: Iterable<string> = [],
): Array<string | undefined> {
    if (yotoIcons.length === 0) {
        return tracks.map(() => undefined)
    }

    // Deduplicate yotoIcons by id
    const seenIds = new Set<string>()
    const allIcons = yotoIcons.filter(icon => {
        if (!icon.id || seenIds.has(icon.id)) return false
        seenIds.add(icon.id)
        return true
    })

    const numberPattern = /^Numbers?\s*-\s*\d+$/i
    const nonNumberIcons = allIcons.filter(
        icon => !numberPattern.test(icon.title ?? ""),
    )

    const used = new Set<string>(alreadyUsedIconIds)

    return tracks.map((track, index) => {
        const keywords = extractKeywordsFromTrack(track)
        const scored = scoreIconsAgainstKeywords(keywords, allIcons, [], [])

        // 1. Try highest-scoring matched icon not yet used on this card
        const matchedUnused = scored.find(
            candidate =>
                candidate.type === "yoto" &&
                !used.has(candidate.id) &&
                !numberPattern.test(candidate.title ?? ""),
        )
        if (matchedUnused) {
            used.add(matchedUnused.id)
            return matchedUnused.id
        }

        // 2. Fallback ("even if it's wrong"): pick a deterministic unused non-number icon
        const unusedNonNumber = nonNumberIcons.filter(
            icon => !used.has(icon.id),
        )
        const pool =
            unusedNonNumber.length > 0
                ? unusedNonNumber
                : allIcons.filter(icon => !used.has(icon.id))

        if (pool.length === 0) {
            return undefined
        }

        const pickIdx = hashString(`${track.title}:${index}`) % pool.length
        const chosen = pool[pickIdx]
        used.add(chosen.id)
        return chosen.id
    })
}
