<script lang="ts">
    import {ExternalLink} from "@lucide/svelte"
    import {Button} from "$lib/components/ui/button"
    import {
        Card,
        CardContent,
        CardDescription,
        CardHeader,
        CardTitle,
    } from "$lib/components/ui/card"
    import type {ActionData, PageData} from "./$types"

    let {data, form}: {data: PageData; form: ActionData} = $props()

    let isStarting = $state(false)

    const pendingData = $derived(
        form && "step" in form && form.step === "pending" ? form : null,
    )
    const errorData = $derived(
        form && "error" in form && form.error ? form.error : null,
    )
    const displayError = $derived(errorData ?? data.urlError)
</script>

<svelte:head>
    <title>Login - Yoto Sync</title>
    <meta name="description" content="Login to Yoto Sync" />
</svelte:head>

<div class="flex flex-1 items-center justify-center p-4">
    <Card class="w-full max-w-md">
        <CardHeader>
            <CardTitle>Connect your Yoto account</CardTitle>
            <CardDescription>
                Sign in with your Yoto account to access and sync your Make Your
                Own cards.
            </CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
            {#if displayError}
                <div
                    class="space-y-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-center"
                >
                    <p class="text-sm font-medium text-destructive">
                        {displayError}
                    </p>
                    <p class="text-xs text-muted-foreground">
                        Ensure your app at{" "}
                        <a
                            href="https://yoto.dev"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="underline hover:text-foreground"
                        >
                            yoto.dev
                        </a>{" "}
                        has your callback URL configured (e.g.{" "}
                        <code class="bg-muted px-1 py-0.5 rounded">
                            http://localhost:3000/callback
                        </code>
                        ) and matches{" "}
                        <code class="bg-muted px-1 py-0.5 rounded">
                            YOTO_CLIENT_ID
                        </code>{" "}
                        in your{" "}
                        <code class="bg-muted px-1 py-0.5 rounded"> .env </code>
                        .
                    </p>
                </div>
            {/if}

            {#if !pendingData}
                <div class="space-y-4">
                    <form method="post" onsubmit={() => (isStarting = true)}>
                        <input type="hidden" name="intent" value="oauth" />
                        <Button
                            type="submit"
                            class="w-full"
                            disabled={isStarting}
                        >
                            {isStarting
                                ? "Redirecting to Yoto..."
                                : "Log In with Yoto"}
                        </Button>
                    </form>
                </div>
            {:else}
                <div class="space-y-6">
                    <div class="space-y-3 text-center">
                        <p class="font-mono text-2xl font-bold tracking-wider">
                            {pendingData.userCode}
                        </p>
                        <p class="text-xs italic text-muted-foreground">
                            You do not need to do anything on your Yoto player.
                        </p>
                    </div>

                    <Button
                        class="w-full"
                        href={pendingData.verificationUri}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Login
                        <ExternalLink class="h-4 w-4" />
                    </Button>
                </div>
            {/if}
        </CardContent>
    </Card>
</div>
