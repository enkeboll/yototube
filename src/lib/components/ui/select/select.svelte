<script lang="ts">
    import type {Snippet} from "svelte"
    import {ChevronDown} from "@lucide/svelte"
    import {cn} from "$lib/utils"

    let {
        class: className = "",
        value = $bindable(),
        children,
        ...restProps
    }: {
        class?: string
        value?: any
        children?: Snippet
        [key: string]: any
    } = $props()
</script>

<div class="relative w-full">
    <select
        data-slot="select"
        bind:value
        class={cn(
            "h-9 w-full appearance-none rounded-md border border-input bg-background px-3 py-1 pr-8 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
            className,
        )}
        {...restProps}
    >
        {@render children?.()}
    </select>
    <ChevronDown
        class="pointer-events-none absolute right-2.5 top-2.5 size-4 opacity-50"
    />
</div>
