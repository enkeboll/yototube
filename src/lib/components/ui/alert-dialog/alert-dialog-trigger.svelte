<script lang="ts">
    import type {Snippet} from "svelte"
    import {AlertDialog as AlertDialogPrimitive} from "bits-ui"

    let {
        children,
        ...restProps
    }: {
        children?: Snippet
        [key: string]: any
    } = $props()
</script>

<AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...restProps}>
    {@render children?.()}
</AlertDialogPrimitive.Trigger>
