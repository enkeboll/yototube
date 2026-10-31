import {describe, expect, it} from "vitest"

import type {ImportProgress as ImportProgressState} from "~/lib/import-utils"

import {ImportProgress} from "./import-progress.server"

const createProgress = (importId = "import-1") => {
    const progress = new ImportProgress(importId)
    return {progress}
}

const readEvent = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const {value, done} = await reader.read()
    if (done || !value) return null

    const data = new TextDecoder()
        .decode(value)
        .split("\n")
        .find(line => line.startsWith("data: "))

    return data ? JSON.parse(data.slice(6)) : null
}

describe("ImportProgress", () => {
    it("broadcasts progress and completion to an SSE subscriber", async () => {
        const {progress} = createProgress("import-1")
        const response = await progress.fetch(
            new Request("https://example.com/events", {
                headers: {"X-Import-Id": "import-1"},
            }),
        )
        const reader = response.body!.getReader()

        await expect(readEvent(reader)).resolves.toEqual({
            type: "started",
            importId: "import-1",
        })

        await progress.reportProgress({
            phase: "importing",
            percent: 65,
            total: 1,
            prepared: 1,
            uploaded: 1,
            ready: 0,
        })
        await expect(readEvent(reader)).resolves.toEqual({
            type: "progress",
            phase: "importing",
            percent: 65,
            total: 1,
            prepared: 1,
            uploaded: 1,
            ready: 0,
        })

        await progress.reportComplete({
            status: "success",
            message: "Added 1 track",
            added: 1,
            skipped: 0,
            description:
                "No YouTube chapters were found, so the video was added as a single track.",
        })
        await expect(readEvent(reader)).resolves.toEqual({
            type: "complete",
            success: true,
            message: "Added 1 track",
            added: 1,
            skipped: 0,
            description:
                "No YouTube chapters were found, so the video was added as a single track.",
        })
        await expect(reader.read()).resolves.toEqual({
            value: undefined,
            done: true,
        })
    })

    it("replays the latest event to a new subscriber", async () => {
        const {progress} = createProgress("import-1")
        const update: ImportProgressState = {
            phase: "importing",
            percent: 45,
            total: 3,
            prepared: 3,
            uploaded: 1,
            ready: 0,
        }

        await progress.reportProgress(update)

        const response = await progress.fetch(
            new Request("https://example.com/events", {
                headers: {"X-Import-Id": "import-1"},
            }),
        )
        const reader = response.body!.getReader()

        await readEvent(reader) // "started"
        await expect(readEvent(reader)).resolves.toEqual({
            type: "progress",
            ...update,
        })
        await reader.cancel()
    })

    it("requires an import ID for subscriptions if not set on instance", async () => {
        const progress = new ImportProgress("")

        const response = await progress.fetch(
            new Request("https://example.com/events"),
        )

        expect(response.status).toBe(400)
    })
})
