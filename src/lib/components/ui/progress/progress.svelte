<script lang="ts">
    import {Progress as ProgressPrimitive} from "bits-ui"
    import {cn} from "$lib/utils"

    let {
        class: className = "",
        value = 0,
        max = 100,
        ...restProps
    }: {
        class?: string
        value?: number
        max?: number
        [key: string]: any
    } = $props()
</script>

<ProgressPrimitive.Root
    data-slot="progress"
    {value}
    {max}
    class={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className,
    )}
    {...restProps}
>
    <div
        data-slot="progress-indicator"
        class="bg-primary h-full w-full flex-1 transition-all duration-300"
        style="transform: translateX(-{100 - (value || 0)}%);"
    ></div>
</ProgressPrimitive.Root>
