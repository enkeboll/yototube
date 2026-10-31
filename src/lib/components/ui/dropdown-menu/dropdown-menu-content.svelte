<script lang="ts">
    import type {Snippet} from "svelte"
    import {DropdownMenu as DropdownMenuPrimitive} from "bits-ui"
    import {cn} from "$lib/utils"

    let {
        class: className = "",
        sideOffset = 4,
        align = "end",
        children,
        ...restProps
    }: {
        class?: string
        sideOffset?: number
        align?: "start" | "center" | "end"
        children?: Snippet
        [key: string]: any
    } = $props()
</script>

<DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
        {sideOffset}
        {align}
        class={cn(
            "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md outline-none",
            className,
        )}
        {...restProps}
    >
        {@render children?.()}
    </DropdownMenuPrimitive.Content>
</DropdownMenuPrimitive.Portal>
