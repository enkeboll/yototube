<script lang="ts">
    import {onDestroy} from "svelte"
    import {invalidateAll} from "$app/navigation"
    import {toast} from "svelte-sonner"
    import {Button} from "$lib/components/ui/button"
    import {Checkbox} from "$lib/components/ui/checkbox"
    import {
        Dialog,
        DialogContent,
        DialogDescription,
        DialogHeader,
        DialogTitle,
    } from "$lib/components/ui/dialog"
    import {Input} from "$lib/components/ui/input"
    import {Label} from "$lib/components/ui/label"
    import {Progress} from "$lib/components/ui/progress"
    import {getProgressPercent, type ImportProgress} from "$lib/import-utils"
    import {getYouTubeUrlType, isYouTubeMix} from "$lib/youtube"

    type ImportState =
        | {status: "idle"}
        | {status: "importing"; progress: ImportProgress | null}
        | {
              status: "complete"
              added: number
              skipped: number
              message: string
              description?: string
          }
        | {status: "error"; error: string}

    let {
        cardId,
        isBusy = false,
        open = $bindable(false),
    }: {
        cardId: string
        isBusy?: boolean
        open?: boolean
    } = $props()

    let importState = $state<ImportState>({status: "idle"})
    let youtubeUrl = $state("")
    let splitByChapters = $state(false)
    let eventSource: EventSource | null = null

    const isImporting = $derived(importState.status === "importing")
    const isVideoUrl = $derived(getYouTubeUrlType(youtubeUrl) === "video")
    const progress = $derived(
        importState.status === "importing" ? importState.progress : null,
    )

    function handleYoutubeUrlChange(val: string) {
        youtubeUrl = val
        if (getYouTubeUrlType(val) !== "video") {
            splitByChapters = false
        }
    }

    function getProgressMessage(prog: ImportProgress | null): string {
        if (!prog || prog.phase === "preparing") {
            return "Preparing import..."
        }
        if (prog.phase === "finalizing") {
            return "Finalizing..."
        }
        return `Importing ${prog.total} ${prog.total === 1 ? "track" : "tracks"}...`
    }

    function cleanupEventSource() {
        if (eventSource) {
            eventSource.close()
            eventSource = null
        }
    }

    onDestroy(() => {
        cleanupEventSource()
    })

    function startImport() {
        if (!youtubeUrl.trim()) return

        if (isYouTubeMix(youtubeUrl)) {
            importState = {
                status: "error",
                error: "YouTube Mixes are not supported.",
            }
            toast.error("YouTube Mixes are not supported.")
            return
        }

        cleanupEventSource()
        importState = {status: "importing", progress: null}

        const searchParams = new URLSearchParams({
            url: youtubeUrl,
            splitByChapters: String(splitByChapters),
        })
        const url = `/api/import/${cardId}?${searchParams.toString()}`
        const es = new EventSource(url)
        eventSource = es

        es.onmessage = async event => {
            try {
                const data = JSON.parse(event.data)

                if (data.type === "started") {
                    // Import started
                } else if (data.type === "progress") {
                    importState = {
                        status: "importing",
                        progress: {
                            phase: data.phase,
                            percent: data.percent,
                            total: data.total,
                            prepared: data.prepared,
                            uploaded: data.uploaded,
                            ready: data.ready,
                        },
                    }
                } else if (data.type === "complete") {
                    importState = {
                        status: "complete",
                        added: data.added,
                        skipped: data.skipped,
                        message: data.message,
                        description: data.description,
                    }
                    cleanupEventSource()
                    youtubeUrl = ""
                    splitByChapters = false
                    toast.success(data.message, {description: data.description})
                    await invalidateAll()
                    open = false
                    setTimeout(() => {
                        importState = {status: "idle"}
                    }, 300)
                } else if (data.type === "error") {
                    importState = {status: "error", error: data.error}
                    cleanupEventSource()
                    toast.error(data.error)
                    setTimeout(() => {
                        importState = {status: "idle"}
                    }, 3000)
                } else {
                    importState = {
                        status: "error",
                        error: "Unexpected response from server. Please try again.",
                    }
                    cleanupEventSource()
                    toast.error("Unexpected response from server.")
                }
            } catch {
                importState = {
                    status: "error",
                    error: "Unexpected response from server. Please try again.",
                }
                cleanupEventSource()
                toast.error("Unexpected response from server.")
            }
        }

        es.onerror = () => {
            importState = {
                status: "error",
                error: "Connection lost. Please try again.",
            }
            cleanupEventSource()
            toast.error("Connection lost. Please try again.")
        }
    }

    function handleSubmit(e: SubmitEvent) {
        e.preventDefault()
        startImport()
    }
</script>

<Dialog
    bind:open
    onOpenChange={nextOpen => {
        if (!nextOpen && isImporting) return
        open = nextOpen
    }}
>
    <DialogContent>
        <DialogHeader>
            <DialogTitle>Add Tracks</DialogTitle>
            <DialogDescription>
                Paste a YouTube video or playlist URL to import tracks.
            </DialogDescription>
        </DialogHeader>

        <form onsubmit={handleSubmit} class="space-y-6 pt-2">
            <div class="space-y-2">
                <Input
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=abc123"
                    required
                    disabled={isBusy || isImporting}
                    value={youtubeUrl}
                    oninput={(e: Event) =>
                        handleYoutubeUrlChange(
                            (e.target as HTMLInputElement).value,
                        )}
                />
                {#if isVideoUrl}
                    <div class="flex items-center gap-2">
                        <Checkbox
                            id="split-by-chapters"
                            bind:checked={splitByChapters}
                            disabled={isBusy || isImporting}
                        />
                        <Label for="split-by-chapters" class="cursor-pointer">
                            Split by chapters
                        </Label>
                    </div>
                {/if}
            </div>

            <Button
                type="submit"
                disabled={isBusy || isImporting || !youtubeUrl.trim()}
                class="w-full"
            >
                {isImporting ? "Importing..." : "Import"}
            </Button>

            {#if isImporting}
                <div class="space-y-2">
                    <Progress value={getProgressPercent(progress)} />
                    <p class="text-sm text-muted-foreground text-center">
                        {getProgressMessage(progress)}
                    </p>
                </div>
            {/if}
        </form>
    </DialogContent>
</Dialog>
