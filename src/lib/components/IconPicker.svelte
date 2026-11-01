<script lang="ts" module>
    import type {SuggestedIcon} from "$lib/icon-suggest.server"
    import type {YotoIcon} from "$lib/yoto-icons.server"
    import type {YotoEverythingIcon} from "$lib/yotoeverything-icons.server"
    import type {CommunityIcon} from "$lib/yotoicons-community.server"

    export type IconSelection =
        | ({type: "yoto"} & YotoIcon)
        | ({type: "yotoeverything"} & YotoEverythingIcon)
        | ({type: "community"} & CommunityIcon)
</script>

<script lang="ts">
    import {onMount} from "svelte"
    import { Search, Sparkles } from "@lucide/svelte"
    import {Button} from "$lib/components/ui/button"
    import {
        DialogDescription,
        DialogHeader,
        DialogTitle,
    } from "$lib/components/ui/dialog"
    import {Input} from "$lib/components/ui/input"

    let {
        onSelect,
        trackTitle = undefined,
        trackArtist = undefined,
        trackAlbum = undefined,
        trackTags = undefined,
    }: {
        onSelect: (icon: IconSelection) => void
        trackTitle?: string
        trackArtist?: string
        trackAlbum?: string
        trackTags?: string[]
    } = $props()

    let query = $state("")
    let hasSearched = $state(false)
    let pendingIcon = $state<IconSelection | null>(null)
    let loading = $state(false)
    let loadingSuggestions = $state(false)
    let suggestedKeywords = $state<string[]>([])
    let suggestedIcons = $state<SuggestedIcon[]>([])
    let yotoIcons = $state<YotoIcon[]>([])
    let yotoEverythingIcons = $state<YotoEverythingIcon[]>([])
    let communityIcons = $state<CommunityIcon[]>([])
    let communityError = $state<string | undefined>(undefined)

    const totalResults = $derived(
        yotoIcons.length + yotoEverythingIcons.length + communityIcons.length,
    )
    const isUpdating = $derived(pendingIcon !== null)

    onMount(async () => {
        if (!trackTitle?.trim()) return
        loadingSuggestions = true
        try {
            const params = new URLSearchParams({
                suggest: "1",
                title: trackTitle,
            })
            if (trackArtist) params.set("artist", trackArtist)
            if (trackAlbum) params.set("album", trackAlbum)
            if (trackTags?.length) {
                params.set("tags", JSON.stringify(trackTags))
            }
            const res = await fetch(`/api/icons?${params.toString()}`)
            if (res.ok) {
                const data = await res.json()
                suggestedKeywords = data.keywords ?? []
                suggestedIcons = data.suggestions ?? []
            }
        } catch {
            // Non-fatal
        } finally {
            loadingSuggestions = false
        }
    })

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
            yotoEverythingIcons = data.yotoEverythingIcons ?? []
            communityIcons = data.communityIcons ?? []
            communityError = data.communityError
            hasSearched = true
        } catch {
            communityError = "Failed to search icons"
        } finally {
            loading = false
        }
    }

    function searchByKeywordChip(kw: string) {
        query = kw
        handleSearch()
    }

    function handleSelect(icon: IconSelection) {
        pendingIcon = icon
        onSelect(icon)
    }

    function getIconAlt(icon: IconSelection): string {
        if (icon.type === "yoto" || icon.type === "yotoeverything") {
            return icon.title
        }
        return icon.tags.join(", ")
    }
</script>

<DialogHeader>
    <DialogTitle>Choose Icon</DialogTitle>
    <DialogDescription>
        Search across Yoto's official library, Yoto Everything, and
        yotoicons.com.
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

{#if suggestedKeywords.length > 0 && !isUpdating}
    <div class="flex flex-wrap items-center gap-1.5 mb-2">
        <span class="text-xs text-muted-foreground flex items-center gap-1 mr-1">
            <Sparkles class="h-3 w-3 text-amber-500" />
            Keywords:
        </span>
        {#each suggestedKeywords.slice(0, 6) as kw (kw)}
            <button
                type="button"
                onclick={() => searchByKeywordChip(kw)}
                class="text-xs px-2 py-0.5 rounded-full border bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
            >
                {kw}
            </button>
        {/each}
    </div>
{/if}

<div class="min-h-50 max-h-[60vh] overflow-y-auto">
    {#if isUpdating}
        <div
            class="flex flex-col items-center justify-center h-50 gap-3 text-muted-foreground"
        >
            {#if pendingIcon}
                <div class="p-3 rounded-md bg-zinc-900">
                    <img
                        src={pendingIcon.url}
                        alt={getIconAlt(pendingIcon)}
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
        {#if loadingSuggestions}
            <div
                class="flex items-center justify-center h-50 text-muted-foreground"
            >
                Finding icon suggestions for this track...
            </div>
        {:else if suggestedIcons.length > 0}
            <div class="space-y-3">
                <p class="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Sparkles class="h-3.5 w-3.5 text-amber-500" />
                    Suggested for &ldquo;{trackTitle}&rdquo;
                </p>
                <div class="grid grid-cols-8 gap-2">
                    {#each suggestedIcons as icon, index (`suggested-${icon.type}-${icon.id}-${index}`)}
                        <button
                            type="button"
                            onclick={() => handleSelect(icon)}
                            class="p-2 rounded-md bg-zinc-900 hover:bg-zinc-700 transition-colors w-fit cursor-pointer"
                            title="{getIconAlt(icon)} (matched '{icon.matchedKeyword}')"
                        >
                            <img
                                src={icon.url}
                                alt={getIconAlt(icon)}
                                class="w-8 h-8"
                                style="image-rendering: pixelated;"
                            />
                        </button>
                    {/each}
                </div>
            </div>
        {:else}
            <div
                class="flex items-center justify-center h-50 text-muted-foreground text-center"
            >
                Search to find icons from Yoto's official library, Yoto
                Everything, and yotoicons.com.
            </div>
        {/if}
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
                        Yoto Official ({yotoIcons.length} results)
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

            {#if yotoEverythingIcons.length > 0}
                <div>
                    <p class="text-sm text-muted-foreground mb-3">
                        Yoto Everything ({yotoEverythingIcons.length} results)
                    </p>
                    <div class="grid grid-cols-8 gap-2">
                        {#each yotoEverythingIcons as icon, index (`ye-${icon.id}-${index}`)}
                            <button
                                type="button"
                                onclick={() =>
                                    handleSelect({
                                        type: "yotoeverything",
                                        ...icon,
                                    })}
                                class="p-2 rounded-md bg-zinc-900 hover:bg-zinc-700 transition-colors w-fit cursor-pointer"
                                title="{icon.title} — {icon.prompt}"
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
