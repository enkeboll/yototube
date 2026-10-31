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
                <DropdownMenuTrigger
                    class="rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                    aria-label="User menu"
                >
                    <Avatar>
                        <AvatarFallback>
                            <User class="h-4 w-4" />
                        </AvatarFallback>
                    </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <form action="/logout" method="post" class="w-full">
                        <DropdownMenuItem
                            class="cursor-pointer"
                            onclick={(e: MouseEvent) => {
                                const form = (
                                    e.currentTarget as HTMLElement
                                )?.closest("form")
                                form?.requestSubmit()
                            }}
                        >
                            <LogOut class="h-4 w-4" />
                            <span>Logout</span>
                        </DropdownMenuItem>
                    </form>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    </header>
{/if}
