<script lang="ts">
    import type {Snippet} from "svelte"
    import {AlertDialog as AlertDialogPrimitive} from "bits-ui"

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

<AlertDialogPrimitive.Root bind:open {...restProps}>
    {@render children?.()}
</AlertDialogPrimitive.Root>
