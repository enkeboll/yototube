<script lang="ts">
    import "../app.css"
    import Footer from "$lib/components/Footer.svelte"
    import Header from "$lib/components/Header.svelte"
    import {Toaster} from "$lib/components/ui/sonner"

    let {children} = $props()
</script>

<svelte:head>
    <title>Yoto Sync</title>
</svelte:head>

<Toaster richColors />

<div class="flex min-h-screen flex-col">
    <Header />
    <main class="flex flex-1 flex-col">
        {@render children?.()}
    </main>
    <Footer />
</div>
