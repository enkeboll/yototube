import {getAppEnv} from "~/lib/app-context"
import {isAuthenticated} from "~/lib/auth.server"
import {importWorkflowManager} from "~/lib/import-workflow.server"
import {logger} from "~/lib/logger.server"

import type {Route} from "./+types/api.imports.$importId"

export async function loader({params, request, context}: Route.LoaderArgs) {
    const env = getAppEnv(context)

    const authenticated = await isAuthenticated(request, env)
    if (!authenticated) {
        return Response.json({error: "Unauthorized"}, {status: 401})
    }

    const {importId} = params

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
