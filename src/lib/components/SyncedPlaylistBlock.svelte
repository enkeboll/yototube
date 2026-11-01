<script lang="ts">
    import {
        AlertTriangle,
        ChevronDown,
        Eye,
        EyeOff,
        GripVertical,
        RefreshCw,
        Trash2,
    } from "@lucide/svelte"
    import type {CardBlockView, PlaylistTrackView} from "$lib/card-blocks.server"
    import IconPicker, {
        type IconSelection,
    } from "$lib/components/IconPicker.svelte"
    import {
        AlertDialog,
        AlertDialogAction,
        AlertDialogCancel,
        AlertDialogContent,
        AlertDialogDescription,
        AlertDialogFooter,
        AlertDialogHeader,
        AlertDialogTitle,
        AlertDialogTrigger,
    } from "$lib/components/ui/alert-dialog"
    import {Button, buttonVariants} from "$lib/components/ui/button"
    import {
        Dialog,
        DialogContent,
        DialogTrigger,
    } from "$lib/components/ui/dialog"
    import {formatDuration} from "$lib/format"
    import {PROVIDER_METADATA} from "$lib/providers/types"

    type PlaylistBlockData = Extract<CardBlockView, {type: "playlist"}>

    let {
        block,
        index,
        isBusy = false,
        isSelecting = false,
        activeIconTrackKey = null,
        onIconDialogChange,
        onSelectIcon,
        onToggleSkip,
        onSyncNow,
        onDeletePlaylist,
        ondragstart = undefined,
        ondragover = undefined,
        ondragend = undefined,
    }: {
        block: PlaylistBlockData
        index: number
        isBusy?: boolean
        isSelecting?: boolean
        activeIconTrackKey?: string | null
        onIconDialogChange: (trackKey: string | null) => void
        onSelectIcon: (trackKey: string, icon: IconSelection) => void
        onToggleSkip: (playlistTrackId: string, skipped: boolean) => void
        onSyncNow: (blockId: string) => void
        onDeletePlaylist: (blockId: string) => void
        ondragstart?: (e: DragEvent, index: number) => void
        ondragover?: (e: DragEvent, index: number) => void
        ondragend?: (e: DragEvent) => void
    } = $props()

    let isDraggedOver = $state(false)

    const providerInfo = $derived(
        PROVIDER_METADATA[block.provider] ?? PROVIDER_METADATA.youtube,
    )
    const activeCount = $derived(
        block.tracks.filter(t => !t.skipped && !t.isPermanentlySkipped).length,
    )
    const userSkippedCount = $derived(
        block.tracks.filter(t => t.skipped && !t.isPermanentlySkipped).length,
    )
    const unresolvedCount = $derived(
        block.tracks.filter(t => t.isPermanentlySkipped).length,
    )

    function formatLastSynced(ts?: number): string {
        if (!ts) return "Never synced"
        const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
        if (diffSec < 60) return "Synced just now"
        const mins = Math.floor(diffSec / 60)
        if (mins < 60) return `Synced ${mins}m ago`
        const hours = Math.floor(mins / 60)
        if (hours < 24) return `Synced ${hours}h ago`
        const days = Math.floor(hours / 24)
        return `Synced ${days}d ago`
    }

    function getTrackIconKey(track: PlaylistTrackView): string {
        return track.yotoChapterKey ?? `playlist-track-${track.id}`
    }
</script>

<li
    class="rounded-xl border bg-muted/20 overflow-hidden transition-colors {isDraggedOver
        ? 'border-primary/60 bg-accent/30'
        : 'border-border/60'}"
    draggable={!isSelecting && !isBusy}
    ondragstart={e => ondragstart?.(e, index)}
    ondragover={e => {
        e.preventDefault()
        isDraggedOver = true
        ondragover?.(e, index)
    }}
    ondragleave={() => {
        isDraggedOver = false
    }}
    ondrop={e => {
        e.preventDefault()
        isDraggedOver = false
    }}
    ondragend={e => {
        isDraggedOver = false
        ondragend?.(e)
    }}
>
    <details open class="group">
        <summary
            class="list-none px-3 py-3 bg-muted/50 hover:bg-muted/70 transition-colors flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none"
        >
            <div class="flex items-center gap-3 min-w-0 flex-1">
                {#if !isSelecting}
                    <div
                        class="touch-none cursor-grab active:cursor-grabbing p-1 -m-1 text-muted-foreground hover:text-foreground"
                        aria-label="Drag to reorder playlist block"
                    >
                        <GripVertical class="h-4 w-4 shrink-0" />
                    </div>
                {/if}

                <ChevronDown
                    class="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-open:rotate-0 -rotate-90"
                />

                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                        <span
                            class="text-[11px] px-2 py-0.5 rounded-full border font-medium {providerInfo.badgeColor}"
                        >
                            {providerInfo.displayName} Synced Playlist
                        </span>
                        <span class="font-semibold truncate">
                            {block.playlistTitle}
                        </span>
                    </div>
                    <div
                        class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5"
                    >
                        <span>
                            {activeCount} active
                            {activeCount === 1 ? "track" : "tracks"}
                        </span>
                        {#if userSkippedCount > 0}
                            <span>· {userSkippedCount} skipped</span>
                        {/if}
                        {#if unresolvedCount > 0}
                            <span
                                class="text-amber-600 dark:text-amber-400 font-medium inline-flex items-center gap-1"
                            >
                                ·
                                <AlertTriangle class="h-3 w-3" />
                                {unresolvedCount} unresolved
                            </span>
                        {/if}
                        <span>· {formatLastSynced(block.lastSyncedAt)}</span>
                    </div>
                </div>
            </div>

            <!-- Stop click propagation so action buttons don't toggle <details> -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="flex items-center gap-1.5"
                onclick={e => e.stopPropagation()}
            >
                <Button
                    variant="outline"
                    size="sm"
                    disabled={isBusy || block.lastSyncStatus === "syncing"}
                    onclick={() => onSyncNow(block.id)}
                    title="Sync playlist with upstream now"
                >
                    <RefreshCw
                        class="h-3.5 w-3.5 mr-1 {block.lastSyncStatus ===
                        'syncing'
                            ? 'animate-spin'
                            : ''}"
                    />
                    Sync Now
                </Button>

                <AlertDialog>
                    <AlertDialogTrigger
                        class={buttonVariants({
                            variant: "ghost",
                            size: "sm",
                            class: "text-muted-foreground hover:text-destructive cursor-pointer",
                        })}
                        disabled={isBusy}
                        aria-label="Remove playlist: {block.playlistTitle}"
                    >
                        <Trash2 class="h-4 w-4" />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle
                                >Remove Synced Playlist</AlertDialogTitle
                            >
                            <AlertDialogDescription>
                                Are you sure you want to remove the synced
                                playlist &ldquo;{block.playlistTitle}&rdquo; and
                                all {block.tracks.length} of its tracks from this
                                card?
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                variant="destructive"
                                onclick={() => onDeletePlaylist(block.id)}
                            >
                                Remove Playlist
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </summary>

        {#if block.lastSyncError}
            <div
                class="px-4 py-2 bg-destructive/10 border-t border-destructive/20 text-xs text-destructive flex items-center gap-2"
            >
                <AlertTriangle class="h-4 w-4 shrink-0" />
                <span>Last sync failed: {block.lastSyncError}</span>
            </div>
        {/if}

        <ul class="divide-y divide-border/30 border-t bg-background/80">
            {#each block.tracks as pTrack (pTrack.id)}
                {@const iconKey = getTrackIconKey(pTrack)}
                <li
                    class="py-2.5 px-4 pl-9 flex items-center gap-3 transition-colors {pTrack.isPermanentlySkipped
                        ? 'bg-amber-500/5'
                        : pTrack.skipped
                          ? 'opacity-60 bg-muted/20'
                          : 'hover:bg-muted/30'}"
                >
                    <span
                        class="text-xs font-mono text-muted-foreground w-5 text-right shrink-0"
                    >
                        {pTrack.upstreamIndex + 1}.
                    </span>

                    {#if pTrack.isPermanentlySkipped}
                        <div
                            class="shrink-0 w-12 h-12 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400"
                            title={pTrack.unresolvedReason ??
                                "Track audio could not be resolved"}
                        >
                            <AlertTriangle class="h-5 w-5" />
                        </div>
                    {:else}
                        <Dialog
                            open={activeIconTrackKey === iconKey}
                            onOpenChange={open =>
                                onIconDialogChange(open ? iconKey : null)}
                        >
                            <DialogTrigger
                                class="shrink-0 p-2 rounded-md bg-zinc-900 hover:bg-zinc-700 transition-colors cursor-pointer"
                                disabled={isBusy || !pTrack.yotoChapterKey}
                                aria-label="Change icon for {pTrack.title}"
                                title={pTrack.yotoChapterKey
                                    ? `Change icon for ${pTrack.title}`
                                    : "Include track on card to set its Yoto icon"}
                            >
                                {#if pTrack.iconUrl}
                                    <img
                                        src={pTrack.iconUrl}
                                        alt=""
                                        class="w-8 h-8"
                                        style="image-rendering: pixelated;"
                                    />
                                {:else}
                                    <div
                                        class="w-8 h-8 bg-zinc-700 rounded"
                                    ></div>
                                {/if}
                            </DialogTrigger>
                            <DialogContent class="sm:max-w-lg">
                                <IconPicker
                                    trackTitle={pTrack.title}
                                    trackArtist={pTrack.artist}
                                    trackAlbum={pTrack.album}
                                    trackTags={pTrack.tags}
                                    onSelect={icon => {
                                        if (pTrack.yotoChapterKey) {
                                            onSelectIcon(
                                                pTrack.yotoChapterKey,
                                                icon,
                                            )
                                        }
                                    }}
                                />
                            </DialogContent>
                        </Dialog>
                    {/if}

                    <div class="flex-1 min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                            <p
                                class="font-medium truncate {pTrack.skipped
                                    ? 'line-through text-muted-foreground'
                                    : ''}"
                            >
                                {pTrack.title}
                            </p>
                            {#if pTrack.isPermanentlySkipped}
                                <span
                                    class="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-medium"
                                >
                                    Permanently Skipped
                                </span>
                            {:else if pTrack.skipped}
                                <span
                                    class="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border font-medium"
                                >
                                    Skipped on Yoto
                                </span>
                            {/if}
                        </div>

                        {#if pTrack.isPermanentlySkipped}
                            <p
                                class="text-xs text-amber-600 dark:text-amber-400 mt-0.5"
                            >
                                {pTrack.unresolvedReason ??
                                    "Could not resolve matching audio on YouTube — skipped so a wrong track is not substituted."}
                            </p>
                        {:else if pTrack.artist && !pTrack.title
                                .toLowerCase()
                                .includes(pTrack.artist.toLowerCase())}
                            <p class="text-xs text-muted-foreground truncate">
                                {pTrack.artist}
                            </p>
                        {/if}
                    </div>

                    {#if pTrack.duration}
                        <span
                            class="text-sm text-muted-foreground whitespace-nowrap"
                        >
                            {formatDuration(pTrack.duration)}
                        </span>
                    {/if}

                    <div class="flex items-center gap-1">
                        {#if pTrack.isPermanentlySkipped}
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={true}
                                title={pTrack.unresolvedReason ??
                                    "Audio unavailable — cannot be included on card"}
                                aria-label="Track permanently skipped: {pTrack.title}"
                            >
                                <EyeOff class="h-4 w-4 text-amber-500" />
                            </Button>
                        {:else}
                            <Button
                                variant={pTrack.skipped ? "outline" : "ghost"}
                                size="sm"
                                disabled={isBusy}
                                onclick={() =>
                                    onToggleSkip(pTrack.id, !pTrack.skipped)}
                                title={pTrack.skipped
                                    ? "Include track on Yoto card"
                                    : "Skip track (hide from Yoto card)"}
                                aria-label={pTrack.skipped
                                    ? `Include track: ${pTrack.title}`
                                    : `Skip track: ${pTrack.title}`}
                            >
                                {#if pTrack.skipped}
                                    <Eye class="h-4 w-4 mr-1" />
                                    <span class="text-xs">Include</span>
                                {:else}
                                    <EyeOff
                                        class="h-4 w-4 text-muted-foreground"
                                    />
                                {/if}
                            </Button>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    </details>
</li>

