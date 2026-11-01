import type {RequestHandler} from "@sveltejs/kit"

import {getAppEnv} from "$lib/app-context"
import {isAuthenticated, requireAuthCore} from "$lib/auth.server"
import type {Import} from "$lib/import"
import {createImportCredential} from "$lib/import-credential.server"
import {importProgressManager} from "$lib/import-progress.server"
import {importWorkflowManager} from "$lib/import-workflow.server"
import {importSearchParamsSchema} from "$lib/schemas/import"
import {EVENT, telemetry} from "$lib/telemetry.server"
import {
    getCanonicalYouTubeUrl,
    getYouTubeUrlType,
    isYouTubeMix,
} from "$lib/youtube"

export const GET: RequestHandler = async ({params, request, locals}) => {
    const env = locals.env ?? getAppEnv()

    const authenticated = await isAuthenticated(request, env)
    if (!authenticated) {
        return Response.json({error: "Unauthorized"}, {status: 401})
    }

    const url = new URL(request.url)
    const searchParams = importSearchParamsSchema.safeParse(
        Object.fromEntries(url.searchParams),
    )
    const cardId = params.cardId as string

    if (!searchParams.success) {
        return Response.json(
            {
                error:
                    searchParams.error.issues[0]?.message ??
                    "Invalid import parameters",
            },
            {status: 400},
        )
    }

    const {
        url: youtubeUrl,
        splitByChapters,
        importMode = "one_time",
        insertPosition = "end",
    } = searchParams.data

    if (isYouTubeMix(youtubeUrl)) {
        return Response.json(
            {error: "YouTube Mixes are not supported."},
            {status: 400},
        )
    }

    const existingImportId = request.headers.get("Last-Event-ID")
    if (existingImportId) {
        const progressInstance =
            importProgressManager.getByName(existingImportId)
        return progressInstance.fetch(
            createProgressRequest(request, existingImportId),
        )
    }

    const {token} = await requireAuthCore(request, env)
    const cardImport: Import = {
        id: crypto.randomUUID(),
        cardId,
        youtubeUrl,
        splitByChapters,
        importMode,
        insertPosition,
    }
    const importLogContext = {
        importId: cardImport.id,
        cardId,
        youtubeUrl: getCanonicalYouTubeUrl(youtubeUrl),
        sourceType: getYouTubeUrlType(youtubeUrl),
        splitByChapters,
    }
    const progressInstance = importProgressManager.getByName(cardImport.id)

    try {
        const credential = await createImportCredential(token, env)
        await importWorkflowManager.create({
            id: cardImport.id,
            params: {...cardImport, credential},
        })
        telemetry.info(EVENT.IMPORT.STARTED, importLogContext)
    } catch (error) {
        telemetry.error(EVENT.IMPORT.FAILED, {
            ...importLogContext,
            stage: "create_workflow",
            reason: "workflow_creation_failed",
            errorName: error instanceof Error ? error.name : "UnknownError",
        })
        return Response.json({error: "Unable to start import"}, {status: 500})
    }

    return progressInstance.fetch(createProgressRequest(request, cardImport.id))
}

function createProgressRequest(request: Request, importId: string): Request {
    const headers = new Headers(request.headers)
    headers.set("X-Import-Id", importId)
    return new Request(request, {headers})
}
