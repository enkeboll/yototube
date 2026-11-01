import {getYotoSdk} from "~/lib/auth.server"
import {
    getImportSandboxId,
    type ImportWorkflowParams,
    type ImportWorkflowResult,
} from "~/lib/import"
import {
    CardCapacityError,
    checkCardCapacity,
    type FailedAudioTrack,
    inspectVideo,
    processAudio,
    processAudioResilient,
    type TranscodedTrack,
    updateCard,
} from "~/lib/import.server"
import {readImportCredential} from "~/lib/import-credential.server"
import {getImportProgress} from "~/lib/import-progress.server"
import {logger} from "~/lib/logger.server"
import {destroySandbox} from "~/lib/sandbox.server"
import {importSyncedPlaylist} from "~/lib/sync.server"
import {EVENT, telemetry} from "~/lib/telemetry.server"
import {getCanonicalYouTubeUrl, getYouTubeUrlType} from "~/lib/youtube"

type ImportStage =
    "inspect_video" | "check_card_capacity" | "process_audio" | "update_card"

type WorkflowInstanceStatus = {
    status: "running" | "complete" | "errored"
    error?: string | null
    output?: ImportWorkflowResult | null
}

type WorkflowInstance = {
    status: () => Promise<WorkflowInstanceStatus>
}

class ImportWorkflowRunner {
    private instances = new Map<string, WorkflowInstanceStatus>()

    async run(
        payload: ImportWorkflowParams,
        env: Env,
    ): Promise<ImportWorkflowResult> {
        const {credential, ...cardImport} = payload
        const sandboxId = getImportSandboxId(cardImport)
        const progress = getImportProgress(cardImport.id)
        const telemetryContext = {
            importId: cardImport.id,
            cardId: cardImport.cardId,
            youtubeUrl: getCanonicalYouTubeUrl(cardImport.youtubeUrl),
            sourceType: getYouTubeUrlType(cardImport.youtubeUrl),
            splitByChapters: cardImport.splitByChapters,
        }
        const startedAt = Date.now()
        let stage: ImportStage = "inspect_video"

        this.instances.set(cardImport.id, {
            status: "running",
            error: null,
            output: null,
        })

        logger.info({
            message: "import.workflow.started",
            importId: cardImport.id,
            cardId: cardImport.cardId,
            queueDurationMs: 0,
        })

        const getSdk = async () => {
            const sdkStartedAt = Date.now()
            const token = await readImportCredential(credential, env)
            const sdk = getYotoSdk(token)

            logger.debug({
                message: "import.sdk.created",
                importId: cardImport.id,
                cardId: cardImport.cardId,
                stage,
                durationMs: Date.now() - sdkStartedAt,
            })

            return sdk
        }

        const reportProgress = async (
            update: Parameters<typeof progress.reportProgress>[0],
        ) => {
            const progressStartedAt = Date.now()
            await progress.reportProgress(update)
            logger.debug({
                message: "import.progress.published",
                importId: cardImport.id,
                cardId: cardImport.cardId,
                phase: update.phase,
                durationMs: Date.now() - progressStartedAt,
            })
        }

        try {
            if (cardImport.importMode === "synced") {
                const sdk = await getSdk()
                const syncResult = await importSyncedPlaylist({
                    sdk,
                    env,
                    importId: cardImport.id,
                    cardId: cardImport.cardId,
                    sourceUrl: cardImport.youtubeUrl,
                    insertPosition: cardImport.insertPosition ?? "end",
                    onProgress: reportProgress,
                })

                await progress.reportComplete(syncResult)
                telemetry.info(EVENT.IMPORT.COMPLETED, {
                    ...telemetryContext,
                    durationMs: Date.now() - startedAt,
                    sourceTrackCount: syncResult.added + syncResult.skipped,
                    sourceDurationSeconds: 0,
                    added: syncResult.added,
                    skipped: syncResult.skipped,
                    chapterSplitUnavailable: false,
                })

                const workflowResult: ImportWorkflowResult = {
                    importId: cardImport.id,
                    ...syncResult,
                }

                this.instances.set(cardImport.id, {
                    status: "complete",
                    error: null,
                    output: workflowResult,
                })

                return workflowResult
            }

            stage = "inspect_video"
            const tracks = await inspectVideo(env, cardImport, reportProgress)
            const chapterSplitUnavailable =
                cardImport.splitByChapters &&
                tracks.every(track => !track.chapters?.length)
            const sourceDurationSeconds = tracks.reduce(
                (total, track) => total + (track.duration ?? 0),
                0,
            )

            stage = "check_card_capacity"
            const sdkForCapacity = await getSdk()
            await checkCardCapacity(sdkForCapacity, cardImport, tracks)

            stage = "process_audio"
            const sdkForAudio = await getSdk()
            let transcodedTracks: TranscodedTrack[]
            let failedTracks: FailedAudioTrack[] = []

            if (
                tracks.length > 1 &&
                typeof processAudioResilient === "function"
            ) {
                const resilientResult = await processAudioResilient(
                    sdkForAudio,
                    env,
                    cardImport,
                    tracks,
                    reportProgress,
                )
                transcodedTracks = resilientResult.succeeded
                failedTracks = resilientResult.failed
            } else {
                transcodedTracks = await processAudio(
                    sdkForAudio,
                    env,
                    cardImport,
                    tracks,
                    reportProgress,
                )
            }

            stage = "update_card"
            const sdkForUpdate = await getSdk()
            const result =
                failedTracks.length > 0
                    ? await updateCard(
                          sdkForUpdate,
                          cardImport,
                          transcodedTracks,
                          reportProgress,
                          failedTracks,
                      )
                    : await updateCard(
                          sdkForUpdate,
                          cardImport,
                          transcodedTracks,
                          reportProgress,
                      )

            const completedResult = chapterSplitUnavailable
                ? {
                      ...result,
                      description:
                          "No YouTube chapters were found, so the video was added as a single track.",
                  }
                : result

            await progress.reportComplete(completedResult)
            telemetry.info(EVENT.IMPORT.COMPLETED, {
                ...telemetryContext,
                durationMs: Date.now() - startedAt,
                sourceTrackCount: tracks.length,
                sourceDurationSeconds,
                added: completedResult.added,
                skipped: completedResult.skipped,
                chapterSplitUnavailable,
            })

            const workflowResult: ImportWorkflowResult = {
                importId: cardImport.id,
                ...completedResult,
            }

            this.instances.set(cardImport.id, {
                status: "complete",
                error: null,
                output: workflowResult,
            })

            return workflowResult
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Import failed unexpectedly"
            await progress.reportError(message)
            const failureContext = {
                ...telemetryContext,
                stage,
                errorName: error instanceof Error ? error.name : "UnknownError",
                errorMessage: message,
                durationMs: Date.now() - startedAt,
            }

            if (error instanceof CardCapacityError) {
                telemetry.warn(EVENT.IMPORT.FAILED, {
                    ...failureContext,
                    reason: "card_capacity_exceeded",
                    existingTrackCount: error.existingTrackCount,
                    incomingTrackCount: error.incomingTrackCount,
                })
            } else {
                telemetry.error(EVENT.IMPORT.FAILED, {
                    ...failureContext,
                    reason: "workflow_step_failed",
                })
            }

            this.instances.set(cardImport.id, {
                status: "errored",
                error: message,
                output: null,
            })

            throw error
        } finally {
            try {
                const cleanupStartedAt = Date.now()
                await destroySandbox(env, sandboxId)
                logger.info({
                    message: "import.sandbox.destroyed",
                    importId: cardImport.id,
                    sandboxId,
                    cardId: cardImport.cardId,
                    durationMs: Date.now() - cleanupStartedAt,
                })
            } catch (error) {
                logger.warn({
                    message: "import.sandbox.destroy_failed",
                    importId: cardImport.id,
                    sandboxId,
                    cardId: cardImport.cardId,
                    error:
                        error instanceof Error ? error.message : String(error),
                })
            }
        }
    }

    async create({
        id,
        params,
        env,
    }: {
        id: string
        params: ImportWorkflowParams
        env?: Env
    }): Promise<void> {
        // Start workflow asynchronously without blocking request
        const currentEnv =
            env ??
            ({
                YOTO_AUTH_SECRET: process.env.YOTO_AUTH_SECRET ?? "",
                RESEND_API_KEY: process.env.RESEND_API_KEY,
            } as Env)

        this.instances.set(id, {
            status: "running",
            error: null,
            output: null,
        })

        // Run in background
        queueMicrotask(() => {
            this.run(params, currentEnv).catch(() => {
                // Error already logged and reported in run()
            })
        })
    }

    async get(id: string): Promise<WorkflowInstance> {
        const state = this.instances.get(id) ?? {
            status: "running",
            error: null,
            output: null,
        }
        return {
            status: async () => state,
        }
    }

    _clear(): void {
        this.instances.clear()
    }
}

const importWorkflowManager = new ImportWorkflowRunner()

export {importWorkflowManager, ImportWorkflowRunner}
