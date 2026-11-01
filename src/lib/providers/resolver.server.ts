import shellEscape from "shell-escape"

import {getSandbox} from "$lib/sandbox-executor.server"

import type {ExternalTrackMetadata, TrackResolutionResult} from "./types"

export type YouTubeSearchCandidate = {
    id: string
    title: string
    uploader?: string
    duration?: number
}

const REJECTED_VARIANT_WORDS = new Set([
    "karaoke",
    "instrumental",
    "cover",
    "tribute",
    "parody",
    "8d",
    "nightcore",
    "slowed",
    "reverb",
    "reaction",
    "tutorial",
    "lesson",
])

const NOISE_WORDS = new Set([
    "official",
    "video",
    "audio",
    "music",
    "lyrics",
    "lyric",
    "hd",
    "hq",
    "4k",
    "remastered",
    "remaster",
    "version",
    "feat",
    "ft",
    "the",
    "a",
    "an",
    "and",
])

export function tokenizeForMatching(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(token => token.length > 1 && !NOISE_WORDS.has(token))
}

/**
 * Strictly evaluates candidate YouTube search results against an external track's metadata.
 * Never forces a guess: if title/artist tokens don't match or if it looks like a cover/karaoke
 * when the original wasn't, or if duration differs by >12s, it rejects the candidate.
 */
export function selectBestCandidate(
    track: ExternalTrackMetadata,
    candidates: YouTubeSearchCandidate[],
): TrackResolutionResult {
    if (track.unavailableReason) {
        return {
            status: "unresolved",
            reason: track.unavailableReason,
        }
    }

    if (candidates.length === 0) {
        return {
            status: "unresolved",
            reason: "No matching results found on YouTube",
        }
    }

    const expectedTitleTokens = tokenizeForMatching(track.title)
    const expectedArtistTokens = track.artist
        ? tokenizeForMatching(track.artist)
        : []
    const originalTitleLower = track.title.toLowerCase()

    if (expectedTitleTokens.length === 0) {
        return {
            status: "unresolved",
            reason: "Track title has insufficient searchable metadata",
        }
    }

    let bestCandidate: YouTubeSearchCandidate | null = null
    let bestScore = 0

    for (const candidate of candidates) {
        const candidateCombined = `${candidate.title} ${candidate.uploader ?? ""}`
        const candidateLower = candidateCombined.toLowerCase()
        const candidateTokens = new Set(tokenizeForMatching(candidateCombined))

        // Reject unwanted variants (karaoke, cover, tribute, etc.) unless requested in original title
        let hasRejectedVariant = false
        for (const badWord of REJECTED_VARIANT_WORDS) {
            if (
                candidateLower.includes(badWord) &&
                !originalTitleLower.includes(badWord)
            ) {
                hasRejectedVariant = true
                break
            }
        }
        if (hasRejectedVariant) {
            continue
        }

        // Check duration tolerance if both are known (±12 seconds)
        if (
            track.durationSeconds !== undefined &&
            track.durationSeconds > 0 &&
            candidate.duration !== undefined &&
            candidate.duration > 0
        ) {
            const diff = Math.abs(track.durationSeconds - candidate.duration)
            if (diff > 12) {
                continue
            }
        }

        // Compute title token overlap
        const matchedTitleCount = expectedTitleTokens.filter(t =>
            candidateTokens.has(t),
        ).length
        const titleCoverage = matchedTitleCount / expectedTitleTokens.length

        // Require at least 75% of meaningful title tokens to be present
        if (titleCoverage < 0.75) {
            continue
        }

        // Compute artist token overlap if artist is known
        let artistCoverage = 1
        if (expectedArtistTokens.length > 0) {
            const matchedArtistCount = expectedArtistTokens.filter(t =>
                candidateTokens.has(t),
            ).length
            artistCoverage = matchedArtistCount / expectedArtistTokens.length
            // Require at least 50% artist token match so we don't pick a different artist's song with the same title
            if (artistCoverage < 0.5) {
                continue
            }
        }

        const score = titleCoverage * 0.7 + artistCoverage * 0.3
        if (score > bestScore) {
            bestScore = score
            bestCandidate = candidate
        }
    }

    if (!bestCandidate || bestScore < 0.75) {
        return {
            status: "unresolved",
            reason: `Could not confidently match "${track.title}"${track.artist ? ` by ${track.artist}` : ""} on YouTube`,
        }
    }

    return {
        status: "resolved",
        youtubeVideoId: bestCandidate.id,
        youtubeUrl: `https://www.youtube.com/watch?v=${bestCandidate.id}`,
        matchedTitle: bestCandidate.title,
        durationSeconds: bestCandidate.duration ?? track.durationSeconds,
    }
}

/**
 * Resolves an ExternalTrackMetadata to a verified YouTube video URL.
 * If the track already has a direct youtubeUrl, validates it's not marked unavailable.
 */
export async function resolveTrackToYouTube(
    sandboxId: string,
    track: ExternalTrackMetadata,
): Promise<TrackResolutionResult> {
    if (track.unavailableReason) {
        return {
            status: "unresolved",
            reason: track.unavailableReason,
        }
    }

    if (track.youtubeUrl) {
        return {
            status: "resolved",
            youtubeVideoId: track.externalId,
            youtubeUrl: track.youtubeUrl,
            matchedTitle: track.title,
            durationSeconds: track.durationSeconds,
        }
    }

    const query = [track.artist, track.title, "Official Audio"]
        .filter(Boolean)
        .join(" ")
    const searchSpec = shellEscape([`ytsearch5:${query}`])
    const sandbox = getSandbox(sandboxId)

    const result = await sandbox.exec(
        `yt-dlp --no-check-certificates --js-runtimes node --flat-playlist --print "%(id)s\t%(title)s\t%(uploader)s\t%(duration)s" ${searchSpec}`,
    )

    if (!result.success) {
        return {
            status: "unresolved",
            reason: "YouTube search failed while resolving track",
        }
    }

    const candidates: YouTubeSearchCandidate[] = result.stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .flatMap(line => {
            const [id, title, uploader, durationStr] = line.split("\t")
            if (!id || !title) return []
            const duration = durationStr ? Number.parseFloat(durationStr) : undefined
            return [
                {
                    id,
                    title,
                    uploader: uploader || undefined,
                    duration:
                        duration !== undefined && Number.isFinite(duration)
                            ? duration
                            : undefined,
                },
            ]
        })

    return selectBestCandidate(track, candidates)
}

