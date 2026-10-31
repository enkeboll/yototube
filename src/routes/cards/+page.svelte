<script lang="ts">
    import {enhance} from "$app/forms"
    import {ArrowDownNarrowWide, Plus} from "@lucide/svelte"
    import CardCover from "$lib/components/CardCover.svelte"
    import {Button, buttonVariants} from "$lib/components/ui/button"
    import {Card, CardContent} from "$lib/components/ui/card"
    import {
        Dialog,
        DialogContent,
        DialogDescription,
        DialogFooter,
        DialogHeader,
        DialogTitle,
        DialogTrigger,
    } from "$lib/components/ui/dialog"
    import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuLabel,
        DropdownMenuSeparator,
        DropdownMenuTrigger,
    } from "$lib/components/ui/dropdown-menu"
    import {Input} from "$lib/components/ui/input"
    import {Label} from "$lib/components/ui/label"
    import type {CardSummary} from "./+page.server"
    import type {ActionData, PageData} from "./$types"

    type SortOption = "title" | "tracks" | "updated"

    let {data, form}: {data: PageData; form: ActionData} = $props()

    let sortBy = $state<SortOption>("title")
    let searchQuery = $state("")
    let dialogOpen = $state(false)
    let cardName = $state("")
    let isCreating = $state(false)

    function sortCards(cards: CardSummary[], sort: SortOption) {
        return [...cards].sort((a, b) => {
            switch (sort) {
                case "title":
                    return a.title.localeCompare(b.title)
                case "tracks":
                    return b.trackCount - a.trackCount
                case "updated":
                    if (a.updatedAt && b.updatedAt) {
                        return (
                            new Date(b.updatedAt).getTime() -
                            new Date(a.updatedAt).getTime()
                        )
                    }
                    if (a.updatedAt) return -1
                    if (b.updatedAt) return 1
                    return 0
                default:
                    return 0
            }
        })
    }

    const filteredCards = $derived(
        data.cards.filter(card =>
            card.title.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
    )

    const sortedCards = $derived(sortCards(filteredCards, sortBy))
</script>

<svelte:head>
    <title>My Cards - Yoto Sync</title>
    <meta name="description" content="Manage your Yoto cards" />
</svelte:head>

<div class="p-8 pb-32">
    <div class="max-w-6xl mx-auto">
        <h1 class="text-3xl font-bold mb-6">My Cards</h1>
        <div class="flex items-center gap-3 mb-8">
            <Input
                type="text"
                placeholder="Search cards..."
                bind:value={searchQuery}
                class="flex-1"
            />
            <DropdownMenu>
                <DropdownMenuTrigger
                    class={buttonVariants({
                        variant: "outline",
                        size: "icon",
                        class: "cursor-pointer",
                    })}
                    aria-label="Sort cards"
                >
                    <ArrowDownNarrowWide class="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onclick={() => (sortBy = "title")}>
                        <span>Title</span>
                        {#if sortBy === "title"}
                            <span class="ml-auto font-bold">✓</span>
                        {/if}
                    </DropdownMenuItem>
                    <DropdownMenuItem onclick={() => (sortBy = "tracks")}>
                        <span>Track Count</span>
                        {#if sortBy === "tracks"}
                            <span class="ml-auto font-bold">✓</span>
                        {/if}
                    </DropdownMenuItem>
                    <DropdownMenuItem onclick={() => (sortBy = "updated")}>
                        <span>Last Updated</span>
                        {#if sortBy === "updated"}
                            <span class="ml-auto font-bold">✓</span>
                        {/if}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog bind:open={dialogOpen}>
                <DialogTrigger
                    class={buttonVariants({
                        class: "cursor-pointer",
                    })}
                >
                    <Plus class="h-4 w-4" />
                    Create Card
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Card</DialogTitle>
                        <DialogDescription>
                            Create a new Yoto card to add tracks to.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        method="post"
                        action="?/createCard"
                        use:enhance={() => {
                            isCreating = true
                            return async ({update, result}) => {
                                await update()
                                isCreating = false
                                if (
                                    result.type === "success" ||
                                    result.type === "redirect"
                                ) {
                                    dialogOpen = false
                                    cardName = ""
                                }
                            }
                        }}
                    >
                        <div class="grid gap-4 py-4">
                            <div class="grid gap-2">
                                <Label for="cardName">Card Name</Label>
                                <Input
                                    id="cardName"
                                    name="cardName"
                                    placeholder="Enter card name..."
                                    bind:value={cardName}
                                    autoComplete="off"
                                    required
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onclick={() => (dialogOpen = false)}
                                disabled={isCreating}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={isCreating || !cardName.trim()}
                            >
                                {isCreating ? "Creating..." : "Create Card"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>

        {#if data.cards.length === 0}
            <Card>
                <CardContent class="py-8 text-center">
                    <p class="text-muted-foreground mb-4">
                        No cards found. Create a card to get started.
                    </p>
                    <Button onclick={() => (dialogOpen = true)}>
                        <Plus class="h-4 w-4" />
                        Create Your First Card
                    </Button>
                </CardContent>
            </Card>
        {:else if sortedCards.length === 0}
            <Card>
                <CardContent class="py-8 text-center">
                    <p class="text-muted-foreground">
                        No cards match &ldquo;{searchQuery}&rdquo;
                    </p>
                </CardContent>
            </Card>
        {:else}
            <div
                class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            >
                {#each sortedCards as card (card.id)}
                    <a href="/cards/{card.id}" class="group block h-full">
                        <Card
                            class="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer h-full py-0 gap-0 rounded-2xl"
                        >
                            <CardCover
                                coverUrl={card.coverUrl}
                                title={card.title}
                            />
                            <CardContent class="p-4">
                                <h3
                                    class="font-semibold truncate group-hover:text-primary transition-colors"
                                >
                                    {card.title}
                                </h3>
                                <p class="text-sm text-muted-foreground">
                                    {card.trackCount} track{card.trackCount !==
                                    1
                                        ? "s"
                                        : ""}
                                </p>
                            </CardContent>
                        </Card>
                    </a>
                {/each}
            </div>
        {/if}
    </div>
</div>
