<script lang="ts">
    import type {Snippet} from "svelte"
    import {DropdownMenu as DropdownMenuPrimitive} from "bits-ui"

    let {
        open = $bindable(false),
        children,
        ...restProps
    }: {
        open?: boolean
        children?: Snippet
        [key: string]: any
    } = $props()
</script>

<DropdownMenuPrimitive.Root bind:open {...restProps}>
    {@render children?.()}
</DropdownMenuPrimitive.Root>
