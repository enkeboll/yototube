import {beforeEach, describe, expect, it, vi} from "vitest"

import type {ImportWorkflowParams} from "~/lib/import"
import {createMockEnv} from "~/tests/mocks"

const mockDestroySandbox = vi.fn()
const mockCheckCardCapacity = vi.fn()
const mockGetProgress = vi.fn()
const mockGetYotoSdk = vi.fn()
const mockInspectVideo = vi.fn()
const mockProcessAudio = vi.fn()
const mockReadImportCredential = vi.fn()
const mockReportComplete = vi.fn()
const mockReportError = vi.fn()
const mockReportProgress = vi.fn()
const mockUpdateCard = vi.fn()

const {MockCardCapacityError} = vi.hoisted(() => ({
    MockCardCapacityError: class extends Error {
        override readonly name = "CardCapacityError"

        constructor(
            readonly existingTrackCount: number,
            readonly incomingTrackCount: number,
        ) {
            super(
                `This import would exceed Yoto's 100-track card limit. This card has ${existingTrackCount} tracks and the import contains ${incomingTrackCount} track.`,
            )
        }
    },
}))

vi.mock("~/lib/auth.server", () => ({
    getYotoSdk: (...args: unknown[]) => mockGetYotoSdk(...args),
}))

vi.mock("~/lib/import-credential.server", () => ({
    readImportCredential: (...args: unknown[]) =>
        mockReadImportCredential(...args),
}))

vi.mock("~/lib/import-progress.server", () => ({
    getImportProgress: (...args: unknown[]) => mockGetProgress(...args),
}))

vi.mock("~/lib/import.server", () => ({
    CardCapacityError: MockCardCapacityError,
    checkCardCapacity: (...args: unknown[]) => mockCheckCardCapacity(...args),
    inspectVideo: (...args: unknown[]) => mockInspectVideo(...args),
    processAudio: (...args: unknown[]) => mockProcessAudio(...args),
    updateCard: (...args: unknown[]) => mockUpdateCard(...args),
}))

vi.mock("~/lib/sandbox.server", () => ({
    destroySandbox: (...args: unknown[]) => mockDestroySandbox(...args),
}))

import {importWorkflowManager} from "./import-workflow.server"

const cardImport: ImportWorkflowParams = {
    id: "import-1",
    cardId: "card-1",
    youtubeUrl: "https://www.youtube.com/watch?v=video-1",
    splitByChapters: false,
    credential: "encrypted-token",
}
const inspectedTracks = [
    {
        id: "video-1",
        title: "Test Video",
        url: cardImport.youtubeUrl,
        duration: 180,
    },
]
const transcodedTracks = [
    {
        index: 0,
        track: inspectedTracks[0],
        audio: {key: "transcoded-sha", duration: 180, fileSize: 100000},
    },
]
const importResult = {
    status: "success" as const,
    message: "Added 1 track",
    added: 1,
    skipped: 0,
}

describe("ImportWorkflowRunner", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(console, "debug").mockImplementation(() => {})
        vi.spyOn(console, "info").mockImplementation(() => {})
        vi.spyOn(console, "warn").mockImplementation(() => {})
        vi.spyOn(console, "error").mockImplementation(() => {})

        mockDestroySandbox.mockResolvedValue(undefined)
        mockCheckCardCapacity.mockResolvedValue(undefined)
        mockGetProgress.mockReturnValue({
            reportComplete: mockReportComplete,
            reportError: mockReportError,
            reportProgress: mockReportProgress,
        })
        mockGetYotoSdk.mockReturnValue({content: {}, media: {}})
        mockInspectVideo.mockResolvedValue(inspectedTracks)
        mockProcessAudio.mockResolvedValue(transcodedTracks)
        mockReadImportCredential.mockResolvedValue("access-token")
        mockUpdateCard.mockResolvedValue(importResult)
    })

    it("runs each import phase and reports completion", async () => {
        const env = createMockEnv()
        const result = await importWorkflowManager.run(cardImport, env)

        const cardImportWithoutCred = {
            id: cardImport.id,
            cardId: cardImport.cardId,
            youtubeUrl: cardImport.youtubeUrl,
            splitByChapters: cardImport.splitByChapters,
        }
        expect(mockInspectVideo).toHaveBeenCalledWith(
            env,
            cardImportWithoutCred,
            expect.any(Function),
        )
        expect(mockCheckCardCapacity).toHaveBeenCalledWith(
            expect.any(Object),
            cardImportWithoutCred,
            inspectedTracks,
        )
        expect(mockProcessAudio).toHaveBeenCalledWith(
            expect.any(Object),
            env,
            cardImportWithoutCred,
            inspectedTracks,
            expect.any(Function),
        )
        expect(mockUpdateCard).toHaveBeenCalledWith(
            expect.any(Object),
            cardImportWithoutCred,
            transcodedTracks,
            expect.any(Function),
        )
        expect(mockReportComplete).toHaveBeenCalledWith(importResult)
        expect(mockDestroySandbox).toHaveBeenCalledWith(env, expect.any(String))
        expect(result).toEqual({
            importId: cardImport.id,
            ...importResult,
        })
    })

    it("reports note when chapters were requested but none were available", async () => {
        const env = createMockEnv()
        await importWorkflowManager.run(
            {...cardImport, splitByChapters: true},
            env,
        )

        expect(mockReportComplete).toHaveBeenCalledWith({
            ...importResult,
            description:
                "No YouTube chapters were found, so the video was added as a single track.",
        })
    })

    it("handles card capacity errors and cleans up sandbox", async () => {
        const env = createMockEnv()
        mockCheckCardCapacity.mockRejectedValue(
            new MockCardCapacityError(99, 2),
        )

        await expect(
            importWorkflowManager.run(cardImport, env),
        ).rejects.toThrow("card limit")

        expect(mockReportError).toHaveBeenCalledWith(
            expect.stringContaining("card limit"),
        )
        expect(mockDestroySandbox).toHaveBeenCalled()
    })
})
