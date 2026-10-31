<script lang="ts" module>
    export type Track = {
        key: string
        title: string
        duration?: number
        iconUrl?: string
    }
</script>

<script lang="ts">
    import type {Snippet} from "svelte"
    import {Copy, GripVertical, Trash2} from "@lucide/svelte"
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
    import {Button} from "$lib/components/ui/button"
    import {Checkbox} from "$lib/components/ui/checkbox"
    import {
        Dialog,
        DialogContent,
        DialogTrigger,
    } from "$lib/components/ui/dialog"
    import {formatDuration} from "$lib/format"

    let {
        track,
        index,
        isBusy = false,
        isReordering = false,
        isSelecting = false,
        isSelected = false,
        isIconDialogOpen = false,
        onIconDialogChange,
        onCopy,
        onDelete,
        onSelectedChange,
        ondragstart = undefined,
        ondragover = undefined,
        ondrop = undefined,
        ondragend = undefined,
        iconPicker,
    }: {
        track: Track
        index: number
        isBusy?: boolean
        isReordering?: boolean
        isSelecting?: boolean
        isSelected?: boolean
        isIconDialogOpen?: boolean
        onIconDialogChange: (open: boolean) => void
        onCopy: () => void
        onDelete: (trackKey: string) => void
        onSelectedChange: (selected: boolean) => void
        ondragstart?: (e: DragEvent, index: number) => void
        ondragover?: (e: DragEvent, index: number) => void
        ondrop?: (e: DragEvent, index: number) => void
        ondragend?: (e: DragEvent) => void
        iconPicker?: Snippet
    } = $props()

    let isDraggedOver = $state(false)
</script>

<li
    class="py-3 px-2 flex items-center gap-4 bg-background rounded-lg transition-colors border border-transparent {isDraggedOver
        ? 'border-primary/50 bg-accent/40'
        : 'hover:bg-muted/40'}"
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
        ondrop?.(e, index)
    }}
    ondragend={e => {
        isDraggedOver = false
        ondragend?.(e)
    }}
>
    {#if isSelecting}
        <Checkbox
            checked={isSelected}
            disabled={isBusy}
            onCheckedChange={checked => onSelectedChange(checked === true)}
            aria-label="Select track: {track.title}"
        />
    {:else}
        <div
            class="touch-none cursor-grab active:cursor-grabbing p-1 -m-1 text-muted-foreground hover:text-foreground"
            aria-label="Drag to reorder"
        >
            <GripVertical class="h-4 w-4 shrink-0" />
        </div>
    {/if}

    <Dialog open={isIconDialogOpen} onOpenChange={onIconDialogChange}>
        <DialogTrigger>
            <button
                type="button"
                class="shrink-0 p-2 rounded-md bg-zinc-900 hover:bg-zinc-700 transition-colors cursor-pointer"
                aria-label="Change icon for {track.title}"
            >
                {#if track.iconUrl}
                    <img
                        src={track.iconUrl}
                        alt=""
                        class="w-8 h-8"
                        style="image-rendering: pixelated;"
                    />
                {:else}
                    <div class="w-8 h-8 bg-zinc-700 rounded"></div>
                {/if}
            </button>
        </DialogTrigger>
        <DialogContent class="sm:max-w-lg">
            {@render iconPicker?.()}
        </DialogContent>
    </Dialog>

    <div class="flex-1 min-w-0">
        <p class="font-medium truncate">{track.title}</p>
    </div>

    {#if track.duration}
        <span class="text-sm text-muted-foreground whitespace-nowrap">
            {formatDuration(track.duration)}
        </span>
    {/if}

    <div class="flex items-center gap-1">
        <Button
            variant="ghost"
            size="sm"
            class="text-muted-foreground hover:text-foreground"
            disabled={isBusy || isReordering}
            aria-label="Copy track: {track.title}"
            onclick={onCopy}
        >
            <Copy class="h-4 w-4" />
        </Button>

        <AlertDialog>
            <AlertDialogTrigger>
                <Button
                    variant="ghost"
                    size="sm"
                    class="text-muted-foreground hover:text-destructive"
                    disabled={isBusy || isReordering}
                    aria-label="Delete track: {track.title}"
                >
                    <Trash2 class="h-4 w-4" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete Track</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to delete &ldquo;{track.title}&rdquo;?
                        This will remove the track from the card.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        onclick={() => onDelete(track.key)}
                    >
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
</li>
