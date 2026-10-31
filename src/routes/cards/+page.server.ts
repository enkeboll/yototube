import {type Actions, fail, redirect} from "@sveltejs/kit"

import {getAppEnv} from "$lib/app-context"
import {getAuthenticatedSdk} from "$lib/auth.server"
import {getCardCoverUrl} from "$lib/card-utils"
import {DEFAULT_CARD_COVER_URL} from "$lib/constants"
import {logger} from "$lib/logger.server"
import {EVENT, telemetry} from "$lib/telemetry.server"

import type {PageServerLoad} from "./$types"

export type CardSummary = {
    id: string
    title: string
    coverUrl: string | undefined
    trackCount: number
    updatedAt: string | null
}

export const load: PageServerLoad = async ({request, locals}) => {
    const env = locals.env ?? getAppEnv()
    const {sdk} = await getAuthenticatedSdk(request, env)

    try {
        const cards = await sdk.content.getMyCards()

        // Fetch card details in parallel to get track counts
        const cardsWithDetails: CardSummary[] = await Promise.all(
            cards.map(async card => {
                try {
                    const fullCard = (await sdk.content.getCard(
                        card.cardId,
                    )) as {
                        content?: {chapters?: Array<unknown>}
                    }
                    return {
                        id: card.cardId,
                        title: card.title ?? "Untitled Card",
                        coverUrl: getCardCoverUrl(card),
                        trackCount: fullCard.content?.chapters?.length ?? 0,
                        updatedAt: card.updatedAt ?? null,
                    }
                } catch {
                    return {
                        id: card.cardId,
                        title: card.title ?? "Untitled Card",
                        coverUrl: getCardCoverUrl(card),
                        trackCount: 0,
                        updatedAt: card.updatedAt ?? null,
                    }
                }
            }),
        )

        return {cards: cardsWithDetails}
    } catch (error) {
        logger.error({
            message: "cards.fetch_failed",
            error,
        })
        return {cards: []}
    }
}

export const actions: Actions = {
    createCard: async ({request, locals}) => {
        const startedAt = Date.now()
        const env = locals.env ?? getAppEnv()
        const formData = await request.formData()
        const cardName = formData.get("cardName") as string

        if (!cardName?.trim()) {
            telemetry.warn(EVENT.CARD.CREATE.FAILED, {
                reason: "invalid_request",
                durationMs: Date.now() - startedAt,
            })
            return fail(400, {error: "Card name is required"})
        }

        try {
            const {sdk} = await getAuthenticatedSdk(request, env)
            const cardData = {
                title: cardName.trim(),
                content: {
                    activity: "yoto_Player",
                    chapters: [],
                    restricted: true,
                    config: {onlineOnly: false},
                    version: "1",
                },
                metadata: {
                    cover: {
                        imageL: DEFAULT_CARD_COVER_URL,
                    },
                    media: {},
                },
            }

            const result = (await sdk.content.updateCard(
                cardData as unknown as Parameters<
                    typeof sdk.content.updateCard
                >[0],
            )) as {cardId?: string}

            if (!result.cardId) {
                telemetry.error(EVENT.CARD.CREATE.FAILED, {
                    reason: "missing_card_id",
                    durationMs: Date.now() - startedAt,
                })
                return fail(500, {error: "Failed to create card"})
            }

            telemetry.info(EVENT.CARD.CREATE.COMPLETED, {
                cardId: result.cardId,
                durationMs: Date.now() - startedAt,
            })

            throw redirect(302, `/cards/${result.cardId}`)
        } catch (error) {
            if (
                error &&
                typeof error === "object" &&
                "status" in error &&
                (error.status === 302 || error.status === 303)
            ) {
                throw error
            }

            telemetry.error(EVENT.CARD.CREATE.FAILED, {
                reason: "operation_failed",
                durationMs: Date.now() - startedAt,
            })
            logger.error({
                message: "card.create_failed",
                error,
            })
            return fail(500, {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to create card",
            })
        }
    },
}
