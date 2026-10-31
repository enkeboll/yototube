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
    data-slot="dialog-footer"
    class={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
    )}
    {...restProps}
>
    {@render children?.()}
</div>
