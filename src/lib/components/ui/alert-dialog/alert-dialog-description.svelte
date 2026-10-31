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

<AlertDialogPrimitive.Description
    data-slot="alert-dialog-description"
    class={cn("text-muted-foreground text-sm", className)}
    {...restProps}
>
    {@render children?.()}
</AlertDialogPrimitive.Description>
