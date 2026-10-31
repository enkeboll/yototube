<script lang="ts">
    import {Pencil} from "@lucide/svelte"

    let {
        value,
        onSave,
        disabled = false,
        class: className = "",
        ariaLabel = "Edit title",
    }: {
        value: string
        onSave: (newValue: string) => void
        disabled?: boolean
        class?: string
        ariaLabel?: string
    } = $props()

    let isEditing = $state(false)
    let editValue = $state("")
    let pendingValue = $state<string | null>(null)
    let inputEl = $state<HTMLInputElement | null>(null)
    let handled = false

    $effect(() => {
        if (!isEditing) {
            editValue = value
        }
    })

    $effect(() => {
        if (!disabled) {
            pendingValue = null
        }
    })

    $effect(() => {
        if (isEditing && inputEl) {
            inputEl.focus()
            inputEl.select()
        }
    })

    const displayValue = $derived(pendingValue ?? value)

    function save() {
        const trimmed = editValue.trim()
        if (!trimmed || trimmed === displayValue) {
            editValue = displayValue
            isEditing = false
            return
        }
        pendingValue = trimmed
        onSave(trimmed)
        isEditing = false
    }

    function cancel() {
        editValue = displayValue
        isEditing = false
    }
</script>

{#if isEditing}
    <input
        bind:this={inputEl}
        type="text"
        aria-label={ariaLabel}
        class="{className} bg-transparent border-b-2 border-primary outline-none w-full"
        bind:value={editValue}
        onkeydown={e => {
            if (e.key === "Enter") {
                e.preventDefault()
                handled = true
                save()
            }
            if (e.key === "Escape") {
                handled = true
                cancel()
            }
        }}
        onblur={() => {
            if (handled) {
                handled = false
                return
            }
            save()
        }}
        {disabled}
    />
{:else}
    <button
        type="button"
        {disabled}
        class="{className} inline-flex items-center gap-2 text-left border-b-2 border-transparent transition-opacity {disabled
            ? 'cursor-default opacity-50'
            : 'group cursor-pointer'}"
        onclick={() => {
            editValue = displayValue
            isEditing = true
        }}
    >
        <span>{displayValue}</span>
        <Pencil
            class="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        />
    </button>
{/if}
