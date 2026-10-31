<script lang="ts">
    import {DropdownMenu as DropdownMenuPrimitive} from "bits-ui"
    import {cn} from "$lib/utils"

    let {
        class: className = "",
        ...restProps
    }: {
        class?: string
        [key: string]: any
    } = $props()
</script>

<DropdownMenuPrimitive.Separator
    data-slot="dropdown-menu-separator"
    class={cn("bg-border -mx-1 my-1 h-px", className)}
    {...restProps}
/>
