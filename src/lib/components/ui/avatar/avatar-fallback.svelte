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

<AvatarPrimitive.Fallback
    class={cn(
        "bg-muted text-muted-foreground flex size-full items-center justify-center rounded-full text-sm",
        className,
    )}
    {...restProps}
>
    {@render children?.()}
</AvatarPrimitive.Fallback>
