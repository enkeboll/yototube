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

<DialogPrimitive.Trigger data-slot="dialog-trigger" {...restProps}>
    {@render children?.()}
</DialogPrimitive.Trigger>
