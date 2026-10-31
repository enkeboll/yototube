<script lang="ts">
    import type {Snippet} from "svelte"
    import {DropdownMenu as DropdownMenuPrimitive} from "bits-ui"
    import {cn} from "$lib/utils"

    let {
        class: className = "",
        children,
        ...restProps
    }: {
        class?: string
        children?: Snippet
        [key: string]: any
    } = $props()
</script>

<DropdownMenuPrimitive.GroupHeading
    data-slot="dropdown-menu-label"
    class={cn("px-2 py-1.5 text-sm font-medium", className)}
    {...restProps}
>
    {@render children?.()}
</DropdownMenuPrimitive.GroupHeading>
