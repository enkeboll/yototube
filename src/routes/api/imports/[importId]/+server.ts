import type {RequestHandler} from "@sveltejs/kit"

import {getAppEnv} from "$lib/app-context"
import {isAuthenticated} from "$lib/auth.server"
import {importWorkflowManager} from "$lib/import-workflow.server"
import {logger} from "$lib/logger.server"

export const GET: RequestHandler = async ({params, request, locals}) => {
    const env = locals.env ?? getAppEnv()

    const authenticated = await isAuthenticated(request, env)
    if (!authenticated) {
        return Response.json({error: "Unauthorized"}, {status: 401})
    }

    const importId = params.importId as string

    try {
        const instance = await importWorkflowManager.get(importId)
        const instanceStatus = await instance.status()

        return Response.json({
            importId,
            status: instanceStatus.status,
            error: instanceStatus.error ?? null,
            output: instanceStatus.output ?? null,
        })
    } catch (error) {
        logger.warn({
            message: "import.status.read_failed",
            importId,
            error: error instanceof Error ? error.message : String(error),
        })

        return Response.json(
            {error: "Unable to get import status"},
            {status: 500},
        )
    }
}
