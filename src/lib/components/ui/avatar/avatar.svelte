<script lang="ts">
    import type {Snippet} from "svelte"
    import {Avatar as AvatarPrimitive} from "bits-ui"
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

<AvatarPrimitive.Root
    class={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full select-none",
        className,
    )}
    {...restProps}
>
    {@render children?.()}
</AvatarPrimitive.Root>
