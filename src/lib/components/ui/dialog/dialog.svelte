<script lang="ts">
    import type {Snippet} from "svelte"
    import {Dialog as DialogPrimitive} from "bits-ui"

    let {
        open = $bindable(false),
        onOpenChange = undefined,
        children,
        ...restProps
    }: {
        open?: boolean
        onOpenChange?: (open: boolean) => void
        children?: Snippet
        [key: string]: any
    } = $props()
</script>

<DialogPrimitive.Root bind:open {onOpenChange} {...restProps}>
    {@render children?.()}
</DialogPrimitive.Root>
