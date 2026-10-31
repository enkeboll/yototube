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

<DialogPrimitive.Title
    data-slot="dialog-title"
    class={cn("text-lg leading-none font-semibold", className)}
    {...restProps}
>
    {@render children?.()}
</DialogPrimitive.Title>
