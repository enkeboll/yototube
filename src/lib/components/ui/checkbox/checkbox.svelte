<script lang="ts">
    import {Checkbox as CheckboxPrimitive} from "bits-ui"
    import {Check} from "@lucide/svelte"
    import {cn} from "$lib/utils"

    let {
        class: className = "",
        checked = $bindable(false),
        onCheckedChange = undefined,
        ...restProps
    }: {
        class?: string
        checked?: boolean
        onCheckedChange?: (checked: boolean) => void
        [key: string]: any
    } = $props()
</script>

<CheckboxPrimitive.Root
    data-slot="checkbox"
    bind:checked
    {onCheckedChange}
    class={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground cursor-pointer flex items-center justify-center",
        className,
    )}
    {...restProps}
>
    {#snippet children({checked})}
        {#if checked}
            <Check class="size-3.5 stroke-[3]" />
        {/if}
    {/snippet}
</CheckboxPrimitive.Root>
