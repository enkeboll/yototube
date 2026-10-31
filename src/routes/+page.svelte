<script lang="ts">
    import {ListMusic, Sparkles, Wallet} from "@lucide/svelte"
    import {Button} from "$lib/components/ui/button"
    import {
        Card,
        CardContent,
        CardHeader,
        CardTitle,
    } from "$lib/components/ui/card"
</script>

<svelte:head>
    <title>Yoto Sync</title>
    <meta
        name="description"
        content="Sync YouTube playlists to your Yoto cards"
    />
</svelte:head>

<div>
    <!-- Hero Section -->
    <section
        class="flex flex-col items-center justify-center px-4 py-24 text-center"
    >
        <h1 class="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Yoto Sync
        </h1>
        <p class="mt-6 max-w-2xl text-lg text-muted-foreground">
            Sync YouTube playlists to your Yoto cards.
            <br />
            Easily manage and organize audio content for your kids.
        </p>
        <div class="mt-10">
            <Button size="lg" href="/login">Get Started</Button>
        </div>
    </section>

    <!-- Features Section -->
    <section class="px-4 py-16">
        <div class="mx-auto max-w-6xl">
            <h2 class="mb-12 text-center text-3xl font-bold">Features</h2>
            <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle class="flex items-center gap-2">
                            <ListMusic class="h-5 w-5" />
                            Sync YouTube Playlists
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p class="text-muted-foreground">
                            Import audio from YouTube playlists directly to your
                            Yoto cards with just a few clicks.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle class="flex items-center gap-2">
                            <Wallet class="h-5 w-5" />
                            Manage Your Cards
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p class="text-muted-foreground">
                            Create, edit, and organize your Yoto cards. Add
                            tracks, reorder content, and customize covers.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle class="flex items-center gap-2">
                            <Sparkles class="h-5 w-5" />
                            Easy to Use
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p class="text-muted-foreground">
                            Simple interface designed for parents. No technical
                            knowledge required.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    </section>
</div>
