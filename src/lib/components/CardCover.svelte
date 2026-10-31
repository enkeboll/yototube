<script lang="ts" module>
    export const CARD_ASPECT_RATIO = "aspect-[49/78]"
</script>

<script lang="ts">
    import {spring} from "svelte/motion"

    let {
        coverUrl = undefined,
        title,
        class: className = "",
    }: {
        coverUrl?: string
        title: string
        class?: string
    } = $props()

    let containerEl = $state<HTMLDivElement | null>(null)

    const motionState = spring(
        {x: 0, y: 0, scale: 1},
        {stiffness: 0.15, damping: 0.8},
    )

    function handleMouseMove(e: MouseEvent) {
        if (!containerEl) return
        const rect = containerEl.getBoundingClientRect()
        const mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2
        const mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2

        motionState.set({
            x: mouseX * -8,
            y: mouseY * -8,
            scale: 1.08,
        })
    }

    function handleMouseLeave() {
        motionState.set({x: 0, y: 0, scale: 1})
    }
</script>

{#if coverUrl}
    <div
        bind:this={containerEl}
        class="{CARD_ASPECT_RATIO} bg-muted rounded-2xl overflow-hidden shadow-md transition-shadow hover:shadow-lg {className}"
        onmousemove={handleMouseMove}
        onmouseleave={handleMouseLeave}
        role="presentation"
    >
        <img
            src={coverUrl}
            alt={title}
            class="w-full h-full object-cover transition-transform ease-out"
            style="transform: translate3d({$motionState.x}px, {$motionState.y}px, 0) scale({$motionState.scale});"
        />
    </div>
{:else}
    <div
        bind:this={containerEl}
        class="{CARD_ASPECT_RATIO} bg-muted rounded-2xl flex items-center justify-center shadow-md transition-shadow hover:shadow-lg {className}"
        onmousemove={handleMouseMove}
        onmouseleave={handleMouseLeave}
        role="presentation"
    >
        <span
            class="text-4xl text-muted-foreground select-none"
            style="transform: translate3d({$motionState.x}px, {$motionState.y}px, 0) scale({$motionState.scale});"
        >
            ?
        </span>
    </div>
{/if}
