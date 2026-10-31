<script lang="ts">
    import {CARD_ASPECT_RATIO} from "$lib/components/CardCover.svelte"
    import {
        Dialog,
        DialogContent,
        DialogDescription,
        DialogHeader,
        DialogTitle,
    } from "$lib/components/ui/dialog"
    import type {TransferCard} from "$lib/types"

    let {
        tracks,
        cards,
        open = $bindable(false),
        onCopy,
        isCopying = false,
        copyingCardId = null,
    }: {
        tracks: Array<{key: string; title: string}>
        cards: TransferCard[]
        open?: boolean
        onCopy: (destinationCardId: string) => void
        isCopying?: boolean
        copyingCardId?: string | null
    } = $props()

    const isMultiple = $derived(tracks.length > 1)
</script>

<Dialog
    bind:open
    onOpenChange={nextOpen => {
        if (!nextOpen && isCopying) return
        open = nextOpen
    }}
>
    <DialogContent class="sm:max-w-md">
        <DialogHeader>
            <DialogTitle>
                Copy {isMultiple ? "Tracks" : "Track"}
            </DialogTitle>
            <DialogDescription>
                {#if isMultiple}
                    Copy {tracks.length} selected tracks to another card.
                {:else}
                    Copy &ldquo;{tracks[0]?.title ?? "Unknown Track"}&rdquo; to
                    another card.
                {/if}
            </DialogDescription>
        </DialogHeader>

        {#if cards.length === 0}
            <p class="text-sm text-muted-foreground text-center py-4">
                No other cards available.
            </p>
        {:else}
            <div
                class="max-h-64 overflow-y-auto -mx-2 divide-y divide-border/40"
            >
                {#each cards as card (card.id)}
                    {@const isThisCardCopying =
                        isCopying && copyingCardId === card.id}
                    <button
                        type="button"
                        class="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent transition-colors text-left disabled:opacity-50 cursor-pointer"
                        disabled={isCopying}
                        onclick={() => onCopy(card.id)}
                    >
                        {#if card.coverUrl}
                            <img
                                src={card.coverUrl}
                                alt=""
                                class="w-8 {CARD_ASPECT_RATIO} rounded object-cover shrink-0"
                            />
                        {:else}
                            <div
                                class="w-8 {CARD_ASPECT_RATIO} rounded bg-muted flex items-center justify-center shrink-0"
                            >
                                <span class="text-muted-foreground text-sm"
                                    >?</span
                                >
                            </div>
                        {/if}

                        <span class="font-medium truncate flex-1"
                            >{card.title}</span
                        >

                        {#if isThisCardCopying}
                            <span
                                class="text-sm text-muted-foreground shrink-0 animate-pulse"
                            >
                                Copying...
                            </span>
                        {/if}
                    </button>
                {/each}
            </div>
        {/if}
    </DialogContent>
</Dialog>
