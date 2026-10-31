<script lang="ts">
    import type {Snippet} from "svelte"
    import {Label as LabelPrimitive} from "bits-ui"
    import {cn} from "$lib/utils"

    let {
        class: className = "",
        children,
        for: htmlFor = undefined,
        ...restProps
    }: {
        class?: string
        children?: Snippet
        for?: string
        [key: string]: any
    } = $props()
</script>

<LabelPrimitive.Root
    data-slot="label"
    for={htmlFor}
    class={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
    )}
    {...restProps}
>
    {@render children?.()}
</LabelPrimitive.Root>
