<script lang="ts">
    import {Toaster as SonnerToaster} from "svelte-sonner"

    let {
        richColors = true,
        ...restProps
    }: {
        richColors?: boolean
        [key: string]: any
    } = $props()
</script>

<SonnerToaster {richColors} {...restProps} />
