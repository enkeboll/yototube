<script lang="ts">
    import type {Snippet} from "svelte"
    import {Dialog as DialogPrimitive} from "bits-ui"

    let {
        children,
        ...restProps
    }: {
        children?: Snippet
        [key: string]: any
    } = $props()
</script>

<DialogPrimitive.Close data-slot="dialog-close" {...restProps}>
    {@render children?.()}
</DialogPrimitive.Close>
