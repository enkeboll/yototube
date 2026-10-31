<script lang="ts">
    import type {Snippet} from "svelte"
    import {AlertDialog as AlertDialogPrimitive} from "bits-ui"
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

<AlertDialogPrimitive.Title
    data-slot="alert-dialog-title"
    class={cn("text-lg font-semibold", className)}
    {...restProps}
>
    {@render children?.()}
</AlertDialogPrimitive.Title>
