import type {ImportProgress} from "~/lib/import-utils"

type ImportMode = "one_time" | "synced"
type InsertPosition = "start" | "end"

type Import = {
    id: string
    cardId: string
    youtubeUrl: string
    splitByChapters: boolean
    importMode?: ImportMode
    insertPosition?: InsertPosition
}

type ImportWorkflowParams = Import & {
    credential: string
}

type AudioTrack = {
    id: string
    sourceId: string
    title: string
    url: string
    duration?: number
    startTime?: number
    endTime?: number
    artist?: string
    album?: string
    tags?: string[]
}

type ImportResult =
    | {
          status: "success"
          message: string
          added: number
          skipped: number
          description?: string
      }
    | {
          status: "error"
          error: string
      }

type ImportWorkflowResult = {
    importId: string
} & Extract<ImportResult, {status: "success"}>

type ImportSuccess = Extract<ImportResult, {status: "success"}>

type ImportStreamEvent =
    | ({type: "progress"} & ImportProgress)
    | ({type: "complete"; success: true} & Omit<ImportSuccess, "status">)
    | {type: "error"; error: string}

function getImportSandboxId(cardImport: Import): string {
    return `import-${cardImport.id}`
}

export {getImportSandboxId}
export type {
    AudioTrack,
    Import,
    ImportMode,
    ImportResult,
    ImportStreamEvent,
    ImportSuccess,
    ImportWorkflowParams,
    ImportWorkflowResult,
    InsertPosition,
}
