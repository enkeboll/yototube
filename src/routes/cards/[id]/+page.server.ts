import {type Actions, fail, redirect} from "@sveltejs/kit"

import {getAppEnv} from "$lib/app-context"
import {getAuthenticatedSdk, getToken} from "$lib/auth.server"
import {getCardCoverUrl} from "$lib/card-utils"
import {getNextChapterKey, stripNullValues} from "$lib/import-utils"
import {logger} from "$lib/logger.server"
import {trackKeysSchema, updateTitleSchema} from "$lib/schemas/card"
import {EVENT, telemetry} from "$lib/telemetry.server"
import type {CardData, TransferCard} from "$lib/types"
import {parseFormData} from "$lib/validation.server"
import {getNumberIcons, getYotoIconUrlMap} from "$lib/yoto-icons.server"
import {fetchCommunityIconImage} from "$lib/yotoicons-community.server"

import type {PageServerLoad} from "./$types"

type TrackOperation = "copy" | "delete"

const TRACK_EVENT = {
    copy: {
        completed: EVENT.TRACK.COPY.COMPLETED,
        failed: EVENT.TRACK.COPY.FAILED,
    },
    delete: {
        completed: EVENT.TRACK.DELETE.COMPLETED,
        failed: EVENT.TRACK.DELETE.FAILED,
    },
} as const

const getTrackOperation = (
    intent: FormDataEntryValue | null,
): TrackOperation | null => {
    if (intent === "copyTrack" || intent === "copyTracks") return "copy"
    if (intent === "deleteTrack" || intent === "deleteTracks") return "delete"
    return null
}

const getTrackKeys = (formData: FormData): string[] => {
    const trackKey = formData.get("trackKey")
    if (typeof trackKey === "string" && trackKey) return [trackKey]

    const trackKeys = formData.get("trackKeys")
    if (typeof trackKeys !== "string") return []

    try {
        const parsed = JSON.parse(trackKeys)
        return Array.isArray(parsed)
            ? parsed.filter(
                  (value): value is string => typeof value === "string",
              )
            : []
    } catch {
        return []
    }
}

function createTrackOperationTelemetry({
    cardId,
    formData,
    intent,
    startedAt,
}: {
    cardId: string
    formData: FormData
    intent: FormDataEntryValue | null
    startedAt: number
}) {
    const operation = getTrackOperation(intent)
    if (!operation) return null

    const trackKeys = getTrackKeys(formData)
    const requestedCount = trackKeys.length
    const destinationCardId = formData.get("destinationCardId")
    const basePayload = {
        cardId,
        ...(typeof destinationCardId === "string" &&
            destinationCardId && {destinationCardId}),
        trackKeys,
        requestedCount,
    }

    return {
        completed(succeededCount = requestedCount) {
            telemetry.info(TRACK_EVENT[operation].completed, {
                ...basePayload,
                succeededCount,
                failedCount: requestedCount - succeededCount,
                durationMs: Date.now() - startedAt,
            })
        },
        failed(reason: string, level: "warn" | "error" = "warn") {
            const payload = {
                ...basePayload,
                succeededCount: 0,
                failedCount: requestedCount,
                reason,
                durationMs: Date.now() - startedAt,
            }

            if (level === "error") {
                telemetry.error(TRACK_EVENT[operation].failed, payload)
            } else {
                telemetry.warn(TRACK_EVENT[operation].failed, payload)
            }
        },
    }
}

export const load: PageServerLoad = async ({params, request, locals}) => {
    const cardId = params.id
    if (!cardId) {
        throw redirect(302, "/cards")
    }
    const env = locals.env ?? getAppEnv()
    const {sdk} = await getAuthenticatedSdk(request, env)

    try {
        const [card, allCards] = await Promise.all([
            sdk.content.getCard(cardId),
            sdk.content.getMyCards(),
        ])

        const otherCards: TransferCard[] = allCards
            .filter(c => c.cardId !== cardId)
            .map(c => ({
                id: c.cardId,
                title: c.title ?? "Untitled Card",
                coverUrl: getCardCoverUrl(c),
            }))

        const cardData = card as unknown as CardData
        if (!cardData) {
            throw new Error("Card not found")
        }

        const chapters = cardData.content?.chapters ?? []
        const coverUrl = getCardCoverUrl(cardData)
        const yotoIconUrls = await getYotoIconUrlMap(request, env).catch(
            () => new Map<string, string>(),
        )

        const tracks = chapters.map(chapter => {
            const iconMediaId = chapter.display?.icon16x16
                ? (sdk.extractMediaId(chapter.display.icon16x16) ?? undefined)
                : undefined
            return {
                key: chapter.key ?? "",
                title: chapter.title ?? "Untitled Track",
                duration: chapter.duration,
                iconUrl: iconMediaId
                    ? yotoIconUrls.get(iconMediaId)
                    : undefined,
            }
        })

        return {
            card: {
                id: cardData.cardId ?? cardId,
                title: cardData.title ?? "Untitled Card",
                coverUrl,
                tracks,
            },
            otherCards,
        }
    } catch (error) {
        logger.error({
            message: "card.fetch_failed",
            cardId,
            error,
        })
        throw redirect(302, "/cards")
    }
}

export const actions: Actions = {
    default: async ({params, request, locals}) => {
        const startedAt = Date.now()
        const cardId = params.id
        if (!cardId) {
            return fail(400, {error: "Card ID is required"})
        }
        const env = locals.env ?? getAppEnv()
        const formData = await request.formData()
        const intent = formData.get("intent")
        const trackTelemetry = createTrackOperationTelemetry({
            cardId,
            formData,
            intent,
            startedAt,
        })

        try {
            const {sdk} = await getAuthenticatedSdk(request, env)

            if (intent === "deleteTrack") {
                const trackKey = formData.get("trackKey") as string
                if (!trackKey) {
                    trackTelemetry?.failed("invalid_request")
                    return fail(400, {error: "Track key is required"})
                }

                const card = (await sdk.content.getCard(
                    cardId,
                )) as unknown as CardData
                const updatedChapters = card.content.chapters.filter(
                    chapter => chapter.key !== trackKey,
                )

                if (updatedChapters.length === card.content.chapters.length) {
                    trackTelemetry?.failed("track_not_found")
                    return fail(404, {error: "Track not found"})
                }

                const updatedCard = {
                    cardId,
                    title: card.title,
                    content: {
                        ...card.content,
                        chapters: stripNullValues(updatedChapters),
                    },
                    metadata: card.metadata,
                }

                await sdk.content.updateCard(
                    updatedCard as unknown as Parameters<
                        typeof sdk.content.updateCard
                    >[0],
                )

                trackTelemetry?.completed()
                return {success: true, deleted: trackKey}
            }

            if (intent === "deleteTracks") {
                const trackKeysJson = formData.get("trackKeys")
                if (typeof trackKeysJson !== "string") {
                    trackTelemetry?.failed("invalid_request")
                    return fail(400, {error: "Track keys are required"})
                }

                let trackKeys: unknown
                try {
                    trackKeys = JSON.parse(trackKeysJson)
                } catch {
                    trackTelemetry?.failed("invalid_request")
                    return fail(400, {error: "Invalid track keys"})
                }

                const result = trackKeysSchema.safeParse(trackKeys)
                if (!result.success) {
                    trackTelemetry?.failed("invalid_request")
                    return fail(400, {
                        error:
                            result.error.issues[0]?.message ??
                            "Invalid track keys",
                    })
                }

                const selectedTrackKeys = new Set(result.data)
                const card = (await sdk.content.getCard(
                    cardId,
                )) as unknown as CardData
                const updatedChapters = card.content.chapters.filter(
                    chapter =>
                        !chapter.key || !selectedTrackKeys.has(chapter.key),
                )
                const deletedCount =
                    card.content.chapters.length - updatedChapters.length

                if (deletedCount === 0) {
                    trackTelemetry?.failed("tracks_not_found")
                    return fail(404, {error: "Selected tracks were not found"})
                }

                const updatedCard = {
                    cardId,
                    title: card.title,
                    content: {
                        ...card.content,
                        chapters: stripNullValues(updatedChapters),
                    },
                    metadata: card.metadata,
                }

                await sdk.content.updateCard(
                    updatedCard as unknown as Parameters<
                        typeof sdk.content.updateCard
                    >[0],
                )

                trackTelemetry?.completed(deletedCount)
                return {success: true, deletedCount}
            }

            if (intent === "copyTrack") {
                const trackKey = formData.get("trackKey") as string
                const destinationCardId = formData.get(
                    "destinationCardId",
                ) as string

                if (!trackKey || !destinationCardId) {
                    trackTelemetry?.failed("invalid_request")
                    return fail(400, {
                        error: "Track key and destination card required",
                    })
                }

                if (destinationCardId === cardId) {
                    trackTelemetry?.failed("same_card")
                    return fail(400, {
                        error: "Cannot copy a track to the same card",
                    })
                }

                const [sourceCard, destCard] = await Promise.all([
                    sdk.content.getCard(cardId),
                    sdk.content.getCard(destinationCardId),
                ])

                const sourceCardData = sourceCard as unknown as CardData
                const destCardData = destCard as unknown as CardData

                const chapterToCopy = sourceCardData.content.chapters.find(
                    chapter => chapter.key === trackKey,
                )

                if (!chapterToCopy) {
                    trackTelemetry?.failed("track_not_found")
                    return fail(404, {error: "Track not found on source card"})
                }

                const destChapters = destCardData.content.chapters
                const nextKey = getNextChapterKey(destChapters)
                const copiedChapter = {...chapterToCopy, key: nextKey}
                const updatedChapters = [
                    ...stripNullValues(destChapters),
                    stripNullValues(copiedChapter),
                ]

                const updatedDestCard = {
                    cardId: destinationCardId,
                    title: destCardData.title,
                    content: {
                        ...destCardData.content,
                        chapters: updatedChapters,
                    },
                    metadata: destCardData.metadata,
                }

                await sdk.content.updateCard(
                    updatedDestCard as unknown as Parameters<
                        typeof sdk.content.updateCard
                    >[0],
                )

                trackTelemetry?.completed()
                return {
                    success: true,
                    copied: true,
                    destinationCardTitle: destCardData.title ?? "Untitled Card",
                }
            }

            if (intent === "copyTracks") {
                const trackKeysJson = formData.get("trackKeys")
                const destinationCardId = formData.get("destinationCardId")

                if (
                    typeof trackKeysJson !== "string" ||
                    typeof destinationCardId !== "string" ||
                    !destinationCardId
                ) {
                    trackTelemetry?.failed("invalid_request")
                    return fail(400, {
                        error: "Track keys and destination card required",
                    })
                }

                if (destinationCardId === cardId) {
                    trackTelemetry?.failed("same_card")
                    return fail(400, {
                        error: "Cannot copy tracks to the same card",
                    })
                }

                let trackKeys: unknown
                try {
                    trackKeys = JSON.parse(trackKeysJson)
                } catch {
                    trackTelemetry?.failed("invalid_request")
                    return fail(400, {error: "Invalid track keys"})
                }

                const result = trackKeysSchema.safeParse(trackKeys)
                if (!result.success) {
                    trackTelemetry?.failed("invalid_request")
                    return fail(400, {
                        error:
                            result.error.issues[0]?.message ??
                            "Invalid track keys",
                    })
                }

                const [sourceCard, destinationCard] = await Promise.all([
                    sdk.content.getCard(cardId),
                    sdk.content.getCard(destinationCardId),
                ])

                const sourceCardData = sourceCard as unknown as CardData
                const destinationCardData =
                    destinationCard as unknown as CardData
                const selectedTrackKeys = new Set(result.data)
                const chaptersToCopy = sourceCardData.content.chapters.filter(
                    chapter =>
                        chapter.key && selectedTrackKeys.has(chapter.key),
                )

                if (chaptersToCopy.length !== selectedTrackKeys.size) {
                    trackTelemetry?.failed("tracks_not_found")
                    return fail(404, {
                        error: "One or more selected tracks were not found",
                    })
                }

                const updatedChapters = [
                    ...stripNullValues(destinationCardData.content.chapters),
                ]

                for (const chapter of chaptersToCopy) {
                    updatedChapters.push(
                        stripNullValues({
                            ...chapter,
                            key: getNextChapterKey(updatedChapters),
                        }),
                    )
                }

                const updatedDestinationCard = {
                    cardId: destinationCardId,
                    title: destinationCardData.title,
                    content: {
                        ...destinationCardData.content,
                        chapters: updatedChapters,
                    },
                    metadata: destinationCardData.metadata,
                }

                await sdk.content.updateCard(
                    updatedDestinationCard as unknown as Parameters<
                        typeof sdk.content.updateCard
                    >[0],
                )

                trackTelemetry?.completed(chaptersToCopy.length)
                return {
                    success: true,
                    copied: true,
                    copiedCount: chaptersToCopy.length,
                    destinationCardTitle:
                        destinationCardData.title ?? "Untitled Card",
                }
            }

            if (intent === "deleteCard") {
                await sdk.content.deleteCard(cardId)
                telemetry.info(EVENT.CARD.DELETE.COMPLETED, {
                    cardId,
                    durationMs: Date.now() - startedAt,
                })
                throw redirect(302, "/cards")
            }

            if (intent === "reorderTracks") {
                const trackKeys = getTrackKeys(formData)
                const result = trackKeysSchema.safeParse(trackKeys)

                if (!result.success) {
                    return fail(400, {error: "Track keys are required"})
                }

                const newOrder = result.data
                const card = (await sdk.content.getCard(
                    cardId,
                )) as unknown as CardData
                const chapterMap = new Map(
                    card.content.chapters.map(chapter => [
                        chapter.key,
                        chapter,
                    ]),
                )

                if (
                    newOrder.length !== card.content.chapters.length ||
                    newOrder.some(key => !chapterMap.has(key))
                ) {
                    return fail(404, {
                        error: "One or more tracks were not found",
                    })
                }

                const reorderedChapters = newOrder
                    .map(key => chapterMap.get(key))
                    .filter(
                        (chapter): chapter is NonNullable<typeof chapter> =>
                            chapter !== undefined,
                    )

                const updatedCard = {
                    cardId,
                    title: card.title,
                    content: {
                        ...card.content,
                        chapters: stripNullValues(reorderedChapters),
                    },
                    metadata: card.metadata,
                }

                await sdk.content.updateCard(
                    updatedCard as unknown as Parameters<
                        typeof sdk.content.updateCard
                    >[0],
                )

                telemetry.info(EVENT.TRACK.REORDER.COMPLETED, {
                    cardId,
                    trackKeys: newOrder,
                    trackCount: newOrder.length,
                    durationMs: Date.now() - startedAt,
                })
                return {success: true, reordered: true}
            }

            if (intent === "updateCover") {
                const coverFile = formData.get("coverFile") as File
                if (!coverFile || coverFile.size === 0) {
                    return fail(400, {error: "Cover image file is required"})
                }

                const MAX_COVER_SIZE = 10 * 1024 * 1024
                if (coverFile.size > MAX_COVER_SIZE) {
                    return fail(400, {error: "Cover image must be under 10MB"})
                }

                const ALLOWED_IMAGE_TYPES = [
                    "image/jpeg",
                    "image/png",
                    "image/gif",
                    "image/webp",
                ]
                if (!ALLOWED_IMAGE_TYPES.includes(coverFile.type)) {
                    return fail(400, {
                        error: "Cover image must be a JPEG, PNG, GIF, or WebP",
                    })
                }

                const tokenResult = await getToken(request, env)
                if (!tokenResult) {
                    return fail(401, {
                        error: "Authentication required to upload cover",
                    })
                }

                const imageBuffer = new Uint8Array(
                    await coverFile.arrayBuffer(),
                )
                const url = new URL(
                    "https://api.yotoplay.com/media/coverImage/user/me/upload",
                )
                url.searchParams.set("autoconvert", "true")
                url.searchParams.set("coverType", "default")

                const uploadResponse = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${tokenResult.token}`,
                        "Content-Type": coverFile.type,
                    },
                    body: imageBuffer,
                })

                if (!uploadResponse.ok) {
                    return fail(500, {
                        error: `Cover upload failed: ${uploadResponse.statusText}`,
                    })
                }

                const uploadResult = (await uploadResponse.json()) as {
                    coverImage: {mediaId: string; mediaUrl: string}
                }
                const {mediaUrl} = uploadResult.coverImage

                const card = (await sdk.content.getCard(
                    cardId,
                )) as unknown as CardData
                const updatedCard = {
                    cardId,
                    title: card.title,
                    content: card.content,
                    metadata: {
                        ...card.metadata,
                        cover: {
                            ...card.metadata?.cover,
                            imageL: mediaUrl,
                        },
                    },
                }

                await sdk.content.updateCard(
                    updatedCard as unknown as Parameters<
                        typeof sdk.content.updateCard
                    >[0],
                )

                telemetry.info(EVENT.CARD.COVER.COMPLETED, {
                    cardId,
                    fileSizeBytes: coverFile.size,
                    contentType: coverFile.type,
                    durationMs: Date.now() - startedAt,
                })
                return {success: true, coverUpdated: true}
            }

            if (intent === "updateTrackIcon") {
                const trackKey = formData.get("trackKey") as string
                const iconId = formData.get("iconId") as string
                const requestedIconType = formData.get("iconType")
                const iconType: "yoto" | "community" =
                    requestedIconType === "community" ? "community" : "yoto"

                if (!trackKey || !iconId) {
                    return fail(400, {
                        error: "Track key and icon ID are required",
                    })
                }

                let mediaId: string
                if (iconType === "yoto") {
                    mediaId = iconId
                } else {
                    const imageBuffer = await fetchCommunityIconImage(iconId)
                    const iconTokenResult = await getToken(request, env)
                    if (!iconTokenResult) {
                        return fail(401, {
                            error: "Authentication required to upload icons",
                        })
                    }

                    const uploadResponse = await fetch(
                        `https://api.yotoplay.com/media/displayIcons/user/me/upload?autoConvert=true&filename=${iconId}.png`,
                        {
                            method: "POST",
                            headers: {
                                "Authorization": `Bearer ${iconTokenResult.token}`,
                                "Content-Type": "image/png",
                            },
                            body: imageBuffer.buffer as ArrayBuffer,
                        },
                    )

                    if (!uploadResponse.ok) {
                        return fail(500, {
                            error: `Icon upload failed: ${uploadResponse.statusText}`,
                        })
                    }

                    const uploadResult = (await uploadResponse.json()) as {
                        displayIcon: {mediaId: string}
                    }
                    mediaId = uploadResult.displayIcon.mediaId
                }

                const card = (await sdk.content.getCard(
                    cardId,
                )) as unknown as CardData
                if (
                    !card.content.chapters.some(
                        chapter => chapter.key === trackKey,
                    )
                ) {
                    return fail(404, {error: "Track not found"})
                }

                const updatedChapters = card.content.chapters.map(chapter => {
                    if (chapter.key === trackKey) {
                        const updatedTracks = chapter.tracks?.map(track => ({
                            ...track,
                            display: {
                                ...track.display,
                                icon16x16: `yoto:#${mediaId}`,
                            },
                        }))

                        return {
                            ...chapter,
                            display: {
                                ...chapter.display,
                                icon16x16: `yoto:#${mediaId}`,
                            },
                            ...(updatedTracks && {tracks: updatedTracks}),
                        }
                    }
                    return chapter
                })

                const updatedCard = {
                    cardId,
                    title: card.title,
                    content: {
                        ...card.content,
                        chapters: stripNullValues(updatedChapters),
                    },
                    metadata: card.metadata,
                }

                await sdk.content.updateCard(
                    updatedCard as unknown as Parameters<
                        typeof sdk.content.updateCard
                    >[0],
                )

                telemetry.info(EVENT.TRACK.ICON.COMPLETED, {
                    cardId,
                    trackKey,
                    iconType,
                    durationMs: Date.now() - startedAt,
                })
                return {success: true, iconUpdated: true}
            }

            if (intent === "numberTracks") {
                const numberIcons = await getNumberIcons(request, env)
                if (numberIcons.size === 0) {
                    return fail(500, {error: "Could not find number icons"})
                }

                const card = (await sdk.content.getCard(
                    cardId,
                )) as unknown as CardData
                const numberedCount = card.content.chapters.filter((_, index) =>
                    numberIcons.has(index + 1),
                ).length

                const updatedChapters = card.content.chapters.map(
                    (chapter, index) => {
                        const position = index + 1
                        const mediaId = numberIcons.get(position)
                        if (!mediaId) return chapter

                        const updatedTracks = chapter.tracks?.map(track => ({
                            ...track,
                            display: {
                                ...track.display,
                                icon16x16: `yoto:#${mediaId}`,
                            },
                        }))

                        return {
                            ...chapter,
                            display: {
                                ...chapter.display,
                                icon16x16: `yoto:#${mediaId}`,
                            },
                            ...(updatedTracks && {tracks: updatedTracks}),
                        }
                    },
                )

                const updatedCard = {
                    cardId,
                    title: card.title,
                    content: {
                        ...card.content,
                        chapters: stripNullValues(updatedChapters),
                    },
                    metadata: card.metadata,
                }

                await sdk.content.updateCard(
                    updatedCard as unknown as Parameters<
                        typeof sdk.content.updateCard
                    >[0],
                )

                telemetry.info(EVENT.TRACK.NUMBER.COMPLETED, {
                    cardId,
                    trackCount: card.content.chapters.length,
                    numberedCount,
                    durationMs: Date.now() - startedAt,
                })
                return {success: true, tracksNumbered: true}
            }

            if (intent === "updateTitle") {
                const result = parseFormData(formData, updateTitleSchema)
                if (!result.success) {
                    const error =
                        result.error.issues[0]?.message ?? "Invalid title"
                    return fail(400, {error})
                }

                const {title} = result.data
                const card = (await sdk.content.getCard(
                    cardId,
                )) as unknown as CardData
                const updatedCard = {
                    cardId,
                    title,
                    content: card.content,
                    metadata: card.metadata,
                }

                await sdk.content.updateCard(
                    updatedCard as unknown as Parameters<
                        typeof sdk.content.updateCard
                    >[0],
                )

                telemetry.info(EVENT.CARD.TITLE.COMPLETED, {
                    cardId,
                    durationMs: Date.now() - startedAt,
                })
                return {success: true, titleUpdated: true}
            }

            return fail(400, {error: "Unknown action"})
        } catch (error) {
            if (
                error &&
                typeof error === "object" &&
                "status" in error &&
                (error.status === 302 || error.status === 303)
            ) {
                throw error
            }

            logger.error({
                message: "card.operation_failed",
                cardId,
                error,
            })
            return fail(500, {
                error:
                    error instanceof Error ? error.message : "Operation failed",
            })
        }
    },
}
