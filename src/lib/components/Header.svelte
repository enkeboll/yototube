<script lang="ts">
    import {page} from "$app/stores"
    import {LogOut, User} from "@lucide/svelte"
    import {Avatar, AvatarFallback} from "$lib/components/ui/avatar"
    import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuTrigger,
    } from "$lib/components/ui/dropdown-menu"

    const isLoginPage = $derived($page.url.pathname === "/login")
    const isLandingPage = $derived($page.url.pathname === "/")
</script>

{#if !isLoginPage && !isLandingPage}
    <header class="border-b bg-background px-8">
        <div class="max-w-6xl mx-auto h-14 flex items-center justify-between">
            <a
                href="/cards"
                class="font-bold text-lg hover:opacity-90 transition-opacity"
            >
                Yoto Sync
            </a>

            <DropdownMenu>
                <DropdownMenuTrigger>
                    <button
                        type="button"
                        class="rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                        aria-label="User menu"
                    >
                        <Avatar>
                            <AvatarFallback>
                                <User class="h-4 w-4" />
                            </AvatarFallback>
                        </Avatar>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <form action="/logout" method="post" class="w-full">
                        <DropdownMenuItem>
                            <button
                                type="submit"
                                class="w-full flex items-center gap-2 cursor-pointer text-left"
                            >
                                <LogOut class="h-4 w-4" />
                                Logout
                            </button>
                        </DropdownMenuItem>
                    </form>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    </header>
{/if}
