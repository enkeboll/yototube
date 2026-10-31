<script lang="ts" module>
    import type {YotoIcon} from "$lib/yoto-icons.server"
    import type {CommunityIcon} from "$lib/yotoicons-community.server"

    export type IconSelection =
        ({type: "yoto"} & YotoIcon) | ({type: "community"} & CommunityIcon)
</script>

<script lang="ts">
    import {Search} from "@lucide/svelte"
    import {Button} from "$lib/components/ui/button"
    import {
        DialogDescription,
        DialogHeader,
        DialogTitle,
    } from "$lib/components/ui/dialog"
    import {Input} from "$lib/components/ui/input"

    let {
        onSelect,
    }: {
        onSelect: (icon: IconSelection) => void
    } = $props()

    let query = $state("")
    let hasSearched = $state(false)
    let pendingIcon = $state<IconSelection | null>(null)
    let loading = $state(false)
    let yotoIcons = $state<YotoIcon[]>([])
    let communityIcons = $state<CommunityIcon[]>([])
    let communityError = $state<string | undefined>(undefined)

    const totalResults = $derived(yotoIcons.length + communityIcons.length)
    const isUpdating = $derived(pendingIcon !== null)

    async function handleSearch(e?: Event) {
        if (e) e.preventDefault()
        if (!query.trim() || loading || isUpdating) return

        loading = true
        try {
            const res = await fetch(
                `/api/icons?q=${encodeURIComponent(query.trim())}`,
            )
            const data = await res.json()
            yotoIcons = data.yotoIcons ?? []
            communityIcons = data.communityIcons ?? []
            communityError = data.communityError
            hasSearched = true
        } catch {
            communityError = "Failed to search icons"
        } finally {
            loading = false
        }
    }

    function handleSelect(icon: IconSelection) {
        pendingIcon = icon
        onSelect(icon)
    }
</script>

<DialogHeader>
    <DialogTitle>Choose Icon</DialogTitle>
    <DialogDescription>
        Search for an icon from Yoto's official library or the yotoicons.com
        community.
    </DialogDescription>
</DialogHeader>

<form onsubmit={handleSearch} class="flex gap-2 my-2">
    <Input
        name="q"
        placeholder="Search icons..."
        bind:value={query}
        autoComplete="off"
        disabled={isUpdating}
    />
    <Button
        type="submit"
        disabled={isUpdating || loading || !query.trim()}
        aria-label="Search"
    >
        <Search class="h-4 w-4" />
    </Button>
</form>

<div class="min-h-50 max-h-[60vh] overflow-y-auto">
    {#if isUpdating}
        <div
            class="flex flex-col items-center justify-center h-50 gap-3 text-muted-foreground"
        >
            {#if pendingIcon}
                <div class="p-3 rounded-md bg-zinc-900">
                    <img
                        src={pendingIcon.url}
                        alt={pendingIcon.type === "yoto"
                            ? pendingIcon.title
                            : pendingIcon.tags.join(", ")}
                        class="w-12 h-12"
                        style="image-rendering: pixelated;"
                    />
                </div>
            {/if}
            Updating icon...
        </div>
    {:else if loading}
        <div
            class="flex items-center justify-center h-50 text-muted-foreground"
        >
            Searching...
        </div>
    {:else if !hasSearched}
        <div
            class="flex items-center justify-center h-50 text-muted-foreground text-center"
        >
            Search to find icons from Yoto's official library and yotoicons.com.
        </div>
    {:else if totalResults === 0}
        <div
            class="flex items-center justify-center h-50 text-muted-foreground"
        >
            No results found
        </div>
    {:else}
        <div class="space-y-6">
            {#if yotoIcons.length > 0}
                <div>
                    <p class="text-sm text-muted-foreground mb-3">
                        Yoto Icons ({yotoIcons.length} results)
                    </p>
                    <div class="grid grid-cols-8 gap-2">
                        {#each yotoIcons as icon, index (`yoto-${icon.id}-${index}`)}
                            <button
                                type="button"
                                onclick={() =>
                                    handleSelect({type: "yoto", ...icon})}
                                class="p-2 rounded-md bg-zinc-900 hover:bg-zinc-700 transition-colors w-fit cursor-pointer"
                                title={icon.title}
                            >
                                <img
                                    src={icon.url}
                                    alt={icon.title}
                                    class="w-8 h-8"
                                    style="image-rendering: pixelated;"
                                />
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}

            {#if communityError}
                <p class="text-sm text-destructive">
                    Community icons unavailable: {communityError}
                </p>
            {/if}

            {#if communityIcons.length > 0}
                <div>
                    <p class="text-sm text-muted-foreground mb-3">
                        Community Icons ({communityIcons.length} results)
                    </p>
                    <div class="grid grid-cols-8 gap-2">
                        {#each communityIcons as icon, index (`community-${icon.id}-${index}`)}
                            <button
                                type="button"
                                onclick={() =>
                                    handleSelect({type: "community", ...icon})}
                                class="p-2 rounded-md bg-zinc-900 hover:bg-zinc-700 transition-colors w-fit cursor-pointer"
                                title={icon.tags.join(", ")}
                            >
                                <img
                                    src={icon.url}
                                    alt={icon.tags.join(", ")}
                                    class="w-8 h-8"
                                    style="image-rendering: pixelated;"
                                />
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>
    {/if}
</div>
