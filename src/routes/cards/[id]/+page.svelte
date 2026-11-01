<script lang="ts">
    import {
        CheckSquare,
        Copy,
        Hash,
        ListChecks,
        Plus,
        Square,
        Trash2,
        Upload,
    } from "@lucide/svelte"
    import {invalidateAll} from "$app/navigation"
    import {toast} from "svelte-sonner"
    import type {CardBlockView} from "$lib/card-blocks.server"
    import AddTracksDialog from "$lib/components/AddTracksDialog.svelte"
    import CardCover from "$lib/components/CardCover.svelte"
    import CopyTrackDialog from "$lib/components/CopyTrackDialog.svelte"
    import EditableTitle from "$lib/components/EditableTitle.svelte"
    import IconPicker, {
        type IconSelection,
    } from "$lib/components/IconPicker.svelte"
    import SyncedPlaylistBlock from "$lib/components/SyncedPlaylistBlock.svelte"
    import TrackItem, {type Track} from "$lib/components/TrackItem.svelte"
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
    import {Card, CardContent} from "$lib/components/ui/card"
    import type {ActionData, PageData} from "./$types"

    let {data, form}: {data: PageData; form: ActionData} = $props()

    let tracks = $state<Track[]>([])
    let blocks = $state<CardBlockView[]>([])
    let selectedKeys = $state<Set<string>>(new Set())
    let isSelecting = $state(false)
    let isReordering = $state(false)
    let isBusy = $state(false)
    let isAddTracksOpen = $state(false)
    let isCopyDialogOpen = $state(false)
    let isBulkCopyDialogOpen = $state(false)
    let copyingTrackKey = $state<string | null>(null)
    let activeIconTrackKey = $state<string | null>(null)
    let fileInputEl = $state<HTMLInputElement | null>(null)
    let draggedIndex = $state<number | null>(null)

    const hasPlaylists = $derived(blocks.some(b => b.type === "playlist"))

    // Sync tracks and blocks from server data
    $effect(() => {
        tracks = [...data.card.tracks]
        blocks = [...(data.card.blocks ?? [])]
    })

    // Handle form feedback
    $effect(() => {
        if (form && "error" in form && form.error) {
            toast.error(form.error)
        } else if (form && "success" in form && form.success) {
            if ("deleted" in form) {
                toast.success("Track deleted")
            } else if ("deletedCount" in form) {
                toast.success(`Deleted ${form.deletedCount} tracks`)
            } else if ("copied" in form) {
                toast.success(
                    `Copied to ${form.destinationCardTitle ?? "destination card"}`,
                )
            } else if ("coverUpdated" in form) {
                toast.success("Cover updated")
            } else if ("iconUpdated" in form) {
                toast.success("Icon updated")
            } else if ("tracksNumbered" in form) {
                toast.success("Tracks numbered")
            } else if ("titleUpdated" in form) {
                toast.success("Title updated")
            }
        }
    })

    async function submitIntent(
        intent: string,
        params: Record<string, string> = {},
    ): Promise<boolean> {
        isBusy = true
        try {
            const formData = new FormData()
            formData.set("intent", intent)
            for (const [key, value] of Object.entries(params)) {
                formData.set(key, value)
            }

            const response = await fetch("", {
                method: "POST",
                body: formData,
            })

            if (response.redirected) {
                window.location.href = response.url
                return true
            }

            const result = await response.json()
            if (result.type === "failure" && result.data?.error) {
                toast.error(result.data.error)
                return false
            } else {
                await invalidateAll()
                return true
            }
        } catch {
            toast.error("An error occurred")
            return false
        } finally {
            isBusy = false
        }
    }

    // Save title
    async function handleSaveTitle(newTitle: string) {
        await submitIntent("updateTitle", {title: newTitle})
    }

    // Number tracks
    async function handleNumberTracks() {
        if (await submitIntent("numberTracks")) {
            toast.success("Tracks numbered")
        }
    }

    // Delete single track
    async function handleDeleteTrack(trackKey: string) {
        if (await submitIntent("deleteTrack", {trackKey})) {
            toast.success("Track deleted")
        }
    }

    // Delete selected tracks
    async function handleDeleteSelectedTracks() {
        const keys = Array.from(selectedKeys)
        if (
            await submitIntent("deleteTracks", {
                trackKeys: JSON.stringify(keys),
            })
        ) {
            selectedKeys = new Set()
            isSelecting = false
            toast.success(`Deleted ${keys.length} tracks`)
        }
    }

    // Copy single track
    async function handleCopyTrack(destinationCardId: string) {
        if (!copyingTrackKey) return
        if (
            await submitIntent("copyTrack", {
                trackKey: copyingTrackKey,
                destinationCardId,
            })
        ) {
            isCopyDialogOpen = false
            copyingTrackKey = null
            toast.success("Track copied")
        }
    }

    // Copy selected tracks
    async function handleCopySelectedTracks(destinationCardId: string) {
        const keys = Array.from(selectedKeys)
        if (
            await submitIntent("copyTracks", {
                trackKeys: JSON.stringify(keys),
                destinationCardId,
            })
        ) {
            isBulkCopyDialogOpen = false
            selectedKeys = new Set()
            isSelecting = false
            toast.success(`Copied ${keys.length} tracks`)
        }
    }

    // Icon select (for standalone tracks or synced playlist tracks)
    async function handleSelectIconForTrackKey(
        trackKey: string,
        icon: IconSelection,
    ) {
        activeIconTrackKey = null
        if (
            await submitIntent("updateTrackIcon", {
                trackKey,
                iconId: icon.id,
                iconType: icon.type,
            })
        ) {
            toast.success("Icon updated")
        }
    }

    async function handleSelectIcon(icon: IconSelection) {
        if (!activeIconTrackKey) return
        await handleSelectIconForTrackKey(activeIconTrackKey, icon)
    }

    // Synced playlist operations
    async function handleTogglePlaylistTrackSkip(
        playlistTrackId: string,
        skipped: boolean,
    ) {
        if (
            await submitIntent("togglePlaylistTrackSkip", {
                playlistTrackId,
                skipped: String(skipped),
            })
        ) {
            toast.success(
                skipped
                    ? "Track skipped on Yoto card"
                    : "Track included on Yoto card",
            )
        }
    }

    async function handleSyncPlaylistBlock(blockId: string) {
        if (await submitIntent("syncPlaylistBlock", {blockId})) {
            toast.success("Playlist synced with upstream")
        }
    }

    async function handleDeletePlaylistBlock(blockId: string) {
        if (await submitIntent("deletePlaylistBlock", {blockId})) {
            toast.success("Synced playlist removed from card")
        }
    }

    // Upload cover
    async function handleCoverFileChange(e: Event) {
        const input = e.target as HTMLInputElement
        const file = input.files?.[0]
        if (!file) return

        isBusy = true
        try {
            const formData = new FormData()
            formData.set("intent", "updateCover")
            formData.set("coverFile", file)

            const response = await fetch("", {
                method: "POST",
                body: formData,
            })

            const result = await response.json()
            if (result.type === "failure" && result.data?.error) {
                toast.error(result.data.error)
            } else {
                toast.success("Cover image updated")
                await invalidateAll()
            }
        } catch {
            toast.error("Failed to upload cover")
        } finally {
            isBusy = false
            if (fileInputEl) fileInputEl.value = ""
        }
    }

    // Drag and drop reordering (supports top-level blocks or standalone tracks)
    function handleDragStart(e: DragEvent, index: number) {
        draggedIndex = index
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move"
        }
    }

    function handleDragOver(_e: DragEvent, index: number) {
        if (draggedIndex === null || draggedIndex === index) return
        const reordered = [...blocks]
        const [moved] = reordered.splice(draggedIndex, 1)
        reordered.splice(index, 0, moved)
        blocks = reordered
        draggedIndex = index
    }

    async function handleDragEnd() {
        if (draggedIndex === null) return
        draggedIndex = null
        isReordering = true

        try {
            if (hasPlaylists) {
                const blockIds = blocks.map(b => b.id)
                await submitIntent("reorderBlocks", {
                    blockIds: JSON.stringify(blockIds),
                })
            } else {
                const trackKeys = blocks
                    .filter(
                        (b): b is Extract<CardBlockView, {type: "track"}> =>
                            b.type === "track",
                    )
                    .map(t => t.key)
                await submitIntent("reorderTracks", {
                    trackKeys: JSON.stringify(trackKeys),
                })
            }
        } finally {
            isReordering = false
        }
    }

    // Selection helpers
    function toggleSelectAll() {
        if (selectedKeys.size === tracks.length) {
            selectedKeys = new Set()
        } else {
            selectedKeys = new Set(tracks.map(t => t.key))
        }
    }

    function toggleSelectTrack(trackKey: string, selected: boolean) {
        const next = new Set(selectedKeys)
        if (selected) {
            next.add(trackKey)
        } else {
            next.delete(trackKey)
        }
        selectedKeys = next
    }
</script>

<svelte:head>
    <title>Yoto - {data.card.title}</title>
    <meta name="description" content="View {data.card.title} card details" />
</svelte:head>

<div class="p-8 pb-32">
    <div class="max-w-4xl mx-auto space-y-8">
        <!-- Card Header Info -->
        <div class="flex flex-col sm:flex-row gap-6 items-start">
            <div class="relative group cursor-pointer shrink-0">
                <CardCover
                    coverUrl={data.card.coverUrl}
                    title={data.card.title}
                    class="w-36 shadow-lg"
                />
                <button
                    type="button"
                    class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex flex-col items-center justify-center gap-2 text-white text-xs font-medium cursor-pointer"
                    onclick={() => fileInputEl?.click()}
                    disabled={isBusy}
                >
                    <Upload class="h-6 w-6" />
                    Change Cover
                </button>
                <input
                    bind:this={fileInputEl}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    class="hidden"
                    onchange={handleCoverFileChange}
                />
            </div>

            <div class="flex-1 min-w-0 space-y-4">
                <div class="space-y-1">
                    <EditableTitle
                        value={data.card.title}
                        onSave={handleSaveTitle}
                        disabled={isBusy}
                        class="text-3xl font-bold"
                    />
                    <p class="text-muted-foreground text-sm">
                        {data.card.tracks.length} track{data.card.tracks
                            .length !== 1
                            ? "s"
                            : ""} on card
                    </p>
                </div>

                <div class="flex flex-wrap items-center gap-2 pt-2">
                    <Button
                        onclick={() => (isAddTracksOpen = true)}
                        disabled={isBusy}
                    >
                        <Plus class="h-4 w-4" />
                        Add Tracks
                    </Button>

                    <Button
                        variant="outline"
                        onclick={handleNumberTracks}
                        disabled={isBusy || data.card.tracks.length === 0}
                    >
                        <Hash class="h-4 w-4" />
                        Number Tracks
                    </Button>

                    <Button
                        variant={isSelecting ? "secondary" : "outline"}
                        onclick={() => {
                            isSelecting = !isSelecting
                            if (!isSelecting) selectedKeys = new Set()
                        }}
                        disabled={isBusy || data.card.tracks.length === 0}
                    >
                        <ListChecks class="h-4 w-4" />
                        {isSelecting ? "Done" : "Select"}
                    </Button>

                    <AlertDialog>
                        <AlertDialogTrigger
                            class={buttonVariants({
                                variant: "ghost",
                                class: "text-destructive hover:bg-destructive/10 cursor-pointer",
                            })}
                            disabled={isBusy}
                        >
                            <Trash2 class="h-4 w-4" />
                            Delete Card
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete Card</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Are you sure you want to delete &ldquo;{data
                                        .card.title}&rdquo;? This cannot be
                                    undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <form method="post" class="inline">
                                    <input
                                        type="hidden"
                                        name="intent"
                                        value="deleteCard"
                                    />
                                    <AlertDialogAction
                                        type="submit"
                                        variant="destructive"
                                    >
                                        Delete
                                    </AlertDialogAction>
                                </form>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>
        </div>

        <!-- Bulk Action Bar -->
        {#if isSelecting}
            <div
                class="p-3 bg-muted/60 rounded-xl border flex items-center justify-between gap-4"
            >
                <div class="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onclick={toggleSelectAll}>
                        {#if selectedKeys.size === tracks.length}
                            <CheckSquare class="h-4 w-4 mr-1.5" />
                            Deselect All
                        {:else}
                            <Square class="h-4 w-4 mr-1.5" />
                            Select All
                        {/if}
                    </Button>
                    <span class="text-sm font-medium text-muted-foreground">
                        {selectedKeys.size} of {tracks.length} selected
                    </span>
                </div>

                <div class="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={selectedKeys.size === 0 || isBusy}
                        onclick={() => (isBulkCopyDialogOpen = true)}
                    >
                        <Copy class="h-4 w-4 mr-1" />
                        Copy Selected
                    </Button>

                    <AlertDialog>
                        <AlertDialogTrigger
                            class={buttonVariants({
                                variant: "destructive",
                                size: "sm",
                                class: "cursor-pointer",
                            })}
                            disabled={selectedKeys.size === 0 || isBusy}
                        >
                            <Trash2 class="h-4 w-4 mr-1" />
                            Delete Selected
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle
                                    >Delete Selected Tracks</AlertDialogTitle
                                >
                                <AlertDialogDescription>
                                    Are you sure you want to delete {selectedKeys.size}
                                    tracks from this card?
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    variant="destructive"
                                    onclick={handleDeleteSelectedTracks}
                                >
                                    Delete
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>
        {/if}

        <!-- Track & Playlist Block List -->
        {#if blocks.length === 0}
            <Card>
                <CardContent class="py-12 text-center">
                    <p class="text-muted-foreground mb-4">
                        This card has no tracks yet.
                    </p>
                    <Button onclick={() => (isAddTracksOpen = true)}>
                        <Plus class="h-4 w-4" />
                        Add Tracks from YouTube
                    </Button>
                </CardContent>
            </Card>
        {:else}
            <ul
                class="space-y-2 rounded-xl border bg-card/50 p-2 overflow-hidden shadow-xs"
            >
                {#each blocks as block, index (block.id)}
                    {#if block.type === "playlist"}
                        <SyncedPlaylistBlock
                            {block}
                            {index}
                            {isBusy}
                            {isSelecting}
                            {activeIconTrackKey}
                            onIconDialogChange={key => {
                                activeIconTrackKey = key
                            }}
                            onSelectIcon={handleSelectIconForTrackKey}
                            onToggleSkip={handleTogglePlaylistTrackSkip}
                            onSyncNow={handleSyncPlaylistBlock}
                            onDeletePlaylist={handleDeletePlaylistBlock}
                            ondragstart={handleDragStart}
                            ondragover={handleDragOver}
                            ondragend={handleDragEnd}
                        />
                    {:else}
                        <TrackItem
                            track={block}
                            {index}
                            {isBusy}
                            {isReordering}
                            {isSelecting}
                            isSelected={selectedKeys.has(block.key)}
                            isIconDialogOpen={activeIconTrackKey === block.key}
                            onIconDialogChange={open => {
                                activeIconTrackKey = open ? block.key : null
                            }}
                            onCopy={() => {
                                copyingTrackKey = block.key
                                isCopyDialogOpen = true
                            }}
                            onDelete={handleDeleteTrack}
                            onSelectedChange={selected =>
                                toggleSelectTrack(block.key, selected)}
                            ondragstart={handleDragStart}
                            ondragover={handleDragOver}
                            ondragend={handleDragEnd}
                        >
                            {#snippet iconPicker()}
                                <IconPicker
                                    trackTitle={block.title}
                                    trackArtist={block.artist}
                                    trackAlbum={block.album}
                                    trackTags={block.tags}
                                    onSelect={handleSelectIcon}
                                />
                            {/snippet}
                        </TrackItem>
                    {/if}
                {/each}
            </ul>
        {/if}
    </div>
</div>

<!-- Add Tracks Dialog -->
<AddTracksDialog cardId={data.card.id} bind:open={isAddTracksOpen} {isBusy} />

<!-- Single Track Copy Dialog -->
<CopyTrackDialog
    bind:open={isCopyDialogOpen}
    tracks={copyingTrackKey
        ? tracks.filter(t => t.key === copyingTrackKey)
        : []}
    cards={data.otherCards}
    onCopy={handleCopyTrack}
    isCopying={isBusy}
/>

<!-- Bulk Copy Dialog -->
<CopyTrackDialog
    bind:open={isBulkCopyDialogOpen}
    tracks={tracks.filter(t => selectedKeys.has(t.key))}
    cards={data.otherCards}
    onCopy={handleCopySelectedTracks}
    isCopying={isBusy}
/>
