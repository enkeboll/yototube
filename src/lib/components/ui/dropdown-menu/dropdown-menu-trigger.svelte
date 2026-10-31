<script lang="ts">
    import type {Snippet} from "svelte"
    import {DropdownMenu as DropdownMenuPrimitive} from "bits-ui"

    let {
        children,
        ...restProps
    }: {
        children?: Snippet
        [key: string]: any
    } = $props()
</script>

<DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...restProps}>
    {@render children?.()}
</DropdownMenuPrimitive.Trigger>
