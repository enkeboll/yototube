<script lang="ts">
    import type {Snippet} from "svelte"
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

<div
    data-slot="alert-dialog-header"
    class={cn("flex flex-col gap-2 text-center sm:text-left", className)}
    {...restProps}
>
    {@render children?.()}
</div>
