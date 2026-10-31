<script lang="ts">
    import type {Snippet} from "svelte"
    import {Dialog as DialogPrimitive} from "bits-ui"
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

<DialogPrimitive.Description
    data-slot="dialog-description"
    class={cn("text-muted-foreground text-sm", className)}
    {...restProps}
>
    {@render children?.()}
</DialogPrimitive.Description>
