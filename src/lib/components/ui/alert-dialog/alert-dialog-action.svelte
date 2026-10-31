<script lang="ts">
    import type {Snippet} from "svelte"
    import {AlertDialog as AlertDialogPrimitive} from "bits-ui"
    import {buttonVariants, type ButtonVariant} from "$lib/components/ui/button"
    import {cn} from "$lib/utils"

    let {
        class: className = "",
        variant = "default" as ButtonVariant,
        children,
        ...restProps
    }: {
        class?: string
        variant?: ButtonVariant
        children?: Snippet
        [key: string]: any
    } = $props()
</script>

<AlertDialogPrimitive.Action
    class={cn(buttonVariants({variant}), className)}
    {...restProps}
>
    {@render children?.()}
</AlertDialogPrimitive.Action>
