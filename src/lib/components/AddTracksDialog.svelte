<script lang="ts">
    import {onDestroy} from "svelte"
    import {invalidateAll} from "$app/navigation"
    import {
        CheckCircle2,
        Link2,
        ListMusic,
        Lock,
        RefreshCw,
        Unlink,
    } from "@lucide/svelte"
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
    import type {ImportMode, InsertPosition} from "$lib/import"
    import {getProgressPercent, type ImportProgress} from "$lib/import-utils"
    import {
        detectProviderFromUrl,
        PROVIDER_METADATA,
    } from "$lib/providers/types"
    import {isYouTubeMix} from "$lib/youtube"

    type UserPlaylist = {
        id: string
        title: string
        itemCount: number
        privacyStatus: string
        url: string
    }

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
    let importMode = $state<ImportMode>("one_time")
    let insertPosition = $state<InsertPosition>("end")
    let eventSource: EventSource | null = null

    let googleStatus = $state<{
        configured: boolean
        connected: boolean
        accountTitle?: string
        playlists: UserPlaylist[]
    }>({
        configured: false,
        connected: false,
        playlists: [],
    })

    const isImporting = $derived(importState.status === "importing")
    const detected = $derived(detectProviderFromUrl(youtubeUrl))
    const isVideoUrl = $derived(detected.urlType === "video")
    const isPlaylistUrl = $derived(detected.urlType === "playlist")
    const detectedProviderInfo = $derived(
        detected.provider ? PROVIDER_METADATA[detected.provider] : null,
    )
    const progress = $derived(
        importState.status === "importing" ? importState.progress : null,
    )

    $effect(() => {
        if (open) {
            loadGooglePlaylists()
        }
    })

    async function loadGooglePlaylists() {
        try {
            const res = await fetch("/api/providers/youtube/playlists")
            if (res.ok) {
                const data = await res.json()
                googleStatus = {
                    configured: Boolean(data.configured),
                    connected: Boolean(data.connected),
                    accountTitle: data.accountTitle,
                    playlists: data.playlists ?? [],
                }
            }
        } catch {
            // Non-fatal
        }
    }

    async function handleDisconnectGoogle() {
        try {
            const res = await fetch("/auth/google", {method: "POST"})
            if (res.ok) {
                googleStatus = {
                    ...googleStatus,
                    connected: false,
                    accountTitle: undefined,
                    playlists: [],
                }
                toast.success("Disconnected YouTube account")
            }
        } catch {
            toast.error("Failed to disconnect account")
        }
    }

    function handleYoutubeUrlChange(val: string) {
        youtubeUrl = val
        const nextDetected = detectProviderFromUrl(val)
        if (nextDetected.urlType !== "video") {
            splitByChapters = false
        }
        if (nextDetected.urlType !== "playlist") {
            importMode = "one_time"
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

        const effectiveMode: ImportMode = isPlaylistUrl
            ? importMode
            : "one_time"
        const searchParams = new URLSearchParams({
            url: youtubeUrl,
            splitByChapters: String(splitByChapters),
            importMode: effectiveMode,
            insertPosition,
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
                    importMode = "one_time"
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
    <DialogContent class="sm:max-w-lg">
        <DialogHeader>
            <DialogTitle>Add Tracks</DialogTitle>
            <DialogDescription>
                Paste a video or playlist URL from YouTube, YouTube Music, or
                another streaming provider.
            </DialogDescription>
        </DialogHeader>

        <!-- Supported Providers & Google OAuth Banner -->
        <div class="space-y-3 pt-1">
            <div class="flex flex-wrap items-center gap-1.5 text-xs">
                <span class="text-muted-foreground mr-1">Providers:</span>
                {#each Object.values(PROVIDER_METADATA) as prov (prov.id)}
                    <span
                        class="px-2 py-0.5 rounded-full border font-medium {prov.badgeColor} {prov.isStub
                            ? 'opacity-75'
                            : ''}"
                        title={prov.isStub
                            ? `${prov.displayName} (Public playlists / Beta)`
                            : prov.displayName}
                    >
                        {prov.displayName}
                    </span>
                {/each}
            </div>

            {#if googleStatus.connected}
                <div
                    class="p-2.5 rounded-lg border bg-muted/40 flex flex-col gap-2 text-xs"
                >
                    <div class="flex items-center justify-between gap-2">
                        <span class="flex items-center gap-1.5 font-medium">
                            <CheckCircle2 class="h-3.5 w-3.5 text-emerald-500" />
                            Connected to YouTube{googleStatus.accountTitle
                                ? ` (${googleStatus.accountTitle})`
                                : ""}
                        </span>
                        <button
                            type="button"
                            onclick={handleDisconnectGoogle}
                            class="text-muted-foreground hover:text-destructive inline-flex items-center gap-1 cursor-pointer"
                        >
                            <Unlink class="h-3 w-3" />
                            Disconnect
                        </button>
                    </div>

                    {#if googleStatus.playlists.length > 0}
                        <div class="space-y-1">
                            <Label
                                for="user-yt-playlist-select"
                                class="text-xs text-muted-foreground"
                            >
                                Pick from your YouTube / YT Music playlists
                                (including private):
                            </Label>
                            <select
                                id="user-yt-playlist-select"
                                class="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
                                onchange={e => {
                                    const val = (e.target as HTMLSelectElement)
                                        .value
                                    if (val) handleYoutubeUrlChange(val)
                                }}
                                disabled={isBusy || isImporting}
                            >
                                <option value=""
                                    >Select a playlist...</option
                                >
                                {#each googleStatus.playlists as pl (pl.id)}
                                    <option value={pl.url}>
                                        {pl.title} ({pl.itemCount} tracks · {pl.privacyStatus})
                                    </option>
                                {/each}
                            </select>
                        </div>
                    {/if}
                </div>
            {:else if googleStatus.configured}
                <div
                    class="p-2.5 rounded-lg border bg-muted/30 flex items-center justify-between gap-2 text-xs"
                >
                    <span class="text-muted-foreground flex items-center gap-1.5">
                        <Lock class="h-3.5 w-3.5 shrink-0" />
                        Need to import a private YouTube or YT Music playlist?
                    </span>
                    <a
                        href="/auth/google?returnTo=/cards/{cardId}"
                        class="font-medium text-primary hover:underline shrink-0"
                    >
                        Connect Account
                    </a>
                </div>
            {/if}
        </div>

        <form onsubmit={handleSubmit} class="space-y-5 pt-1">
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <Label for="import-source-url" class="text-xs font-medium">
                        Track or Playlist URL
                    </Label>
                    {#if detectedProviderInfo}
                        <span
                            class="text-[11px] px-2 py-0.5 rounded-full border font-medium {detectedProviderInfo.badgeColor}"
                        >
                            {detectedProviderInfo.displayName}
                            {isPlaylistUrl
                                ? "Playlist"
                                : isVideoUrl
                                  ? "Track"
                                  : ""}
                        </span>
                    {/if}
                </div>
                <Input
                    id="import-source-url"
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=abc123 or playlist URL"
                    required
                    disabled={isBusy || isImporting}
                    value={youtubeUrl}
                    oninput={(e: Event) =>
                        handleYoutubeUrlChange(
                            (e.target as HTMLInputElement).value,
                        )}
                />
                {#if isVideoUrl}
                    <div class="flex items-center gap-2 pt-1">
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

            {#if isPlaylistUrl}
                <div class="space-y-3 rounded-xl border bg-muted/30 p-3.5">
                    <Label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Playlist Import Mode
                    </Label>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                            type="button"
                            disabled={isBusy || isImporting}
                            onclick={() => (importMode = "one_time")}
                            class="text-left p-3 rounded-lg border transition-colors cursor-pointer {importMode ===
                            'one_time'
                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                : 'bg-background hover:bg-muted/60'}"
                        >
                            <div class="flex items-center gap-2 font-medium text-sm">
                                <ListMusic class="h-4 w-4 text-primary" />
                                One-Time Import
                            </div>
                            <p class="text-xs text-muted-foreground mt-1">
                                Imports tracks as standalone songs that can be
                                freely rearranged or deleted.
                            </p>
                        </button>

                        <button
                            type="button"
                            disabled={isBusy || isImporting}
                            onclick={() => (importMode = "synced")}
                            class="text-left p-3 rounded-lg border transition-colors cursor-pointer {importMode ===
                            'synced'
                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                : 'bg-background hover:bg-muted/60'}"
                        >
                            <div class="flex items-center gap-2 font-medium text-sm">
                                <RefreshCw class="h-4 w-4 text-primary" />
                                Synced Playlist
                            </div>
                            <p class="text-xs text-muted-foreground mt-1">
                                Keeps playlist linked for updates. Order is
                                locked to playlist; songs can be skipped.
                            </p>
                        </button>
                    </div>

                    {#if importMode === "synced"}
                        <div class="flex items-center justify-between gap-2 pt-1">
                            <Label
                                for="insert-position-select"
                                class="text-xs text-muted-foreground"
                            >
                                Position on card:
                            </Label>
                            <select
                                id="insert-position-select"
                                bind:value={insertPosition}
                                disabled={isBusy || isImporting}
                                class="rounded-md border bg-background px-2.5 py-1 text-xs"
                            >
                                <option value="end"
                                    >Append to end of card</option
                                >
                                <option value="start"
                                    >Insert at beginning of card</option
                                >
                            </select>
                        </div>
                    {/if}
                </div>
            {/if}

            <Button
                type="submit"
                disabled={isBusy || isImporting || !youtubeUrl.trim()}
                class="w-full"
            >
                {#if isImporting}
                    {importMode === "synced"
                        ? "Syncing Playlist..."
                        : "Importing..."}
                {:else if isPlaylistUrl && importMode === "synced"}
                    <Link2 class="h-4 w-4 mr-1.5" />
                    Link & Sync Playlist
                {:else}
                    Import
                {/if}
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
