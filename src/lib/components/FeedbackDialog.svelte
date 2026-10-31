<script lang="ts">
    import {MessageSquare} from "@lucide/svelte"
    import {toast} from "svelte-sonner"
    import {Button} from "$lib/components/ui/button"
    import {
        Dialog,
        DialogContent,
        DialogDescription,
        DialogFooter,
        DialogHeader,
        DialogTitle,
        DialogTrigger,
    } from "$lib/components/ui/dialog"
    import {Input} from "$lib/components/ui/input"
    import {Label} from "$lib/components/ui/label"
    import {Select} from "$lib/components/ui/select"
    import {Textarea} from "$lib/components/ui/textarea"

    let open = $state(false)
    let category = $state("")
    let message = $state("")
    let email = $state("")
    let isSubmitting = $state(false)

    async function handleSubmit(event: SubmitEvent) {
        event.preventDefault()

        if (!category || !message.trim()) {
            toast.error("Please select a category and enter a message.")
            return
        }

        isSubmitting = true
        try {
            const formData = new FormData()
            formData.set("category", category)
            formData.set("message", message)
            if (email.trim()) {
                formData.set("email", email.trim())
            }

            const response = await fetch("/api/feedback", {
                method: "POST",
                body: formData,
            })

            const data = await response.json()

            if (data.success) {
                toast.success("Thanks for your feedback!")
                category = ""
                message = ""
                email = ""
                open = false
            } else if (data.errors) {
                const firstError = Object.values(
                    data.errors,
                ).flat()[0] as string
                toast.error(firstError ?? "Invalid input.")
            } else if (data.error) {
                toast.error(data.error)
            }
        } catch {
            toast.error("Failed to send feedback. Please try again.")
        } finally {
            isSubmitting = false
        }
    }
</script>

<Dialog bind:open>
    <DialogTrigger>
        <button
            type="button"
            class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
            <MessageSquare class="h-4 w-4" />
            Feedback
        </button>
    </DialogTrigger>

    <DialogContent class="sm:max-w-md">
        <DialogHeader>
            <DialogTitle>Send Feedback</DialogTitle>
            <DialogDescription>
                Report a bug, request a feature, or share your thoughts.
            </DialogDescription>
        </DialogHeader>

        <form onsubmit={handleSubmit} class="grid gap-4 py-2">
            <div class="grid gap-2">
                <Label for="category">Category</Label>
                <Select id="category" bind:value={category} required>
                    <option value="" disabled selected>Select a category</option
                    >
                    <option value="bug">Bug Report</option>
                    <option value="feature">Feature Request</option>
                    <option value="feedback">General Feedback</option>
                </Select>
            </div>

            <div class="grid gap-2">
                <Label for="message">Message</Label>
                <Textarea
                    id="message"
                    name="message"
                    placeholder="Tell us what's on your mind..."
                    rows={4}
                    bind:value={message}
                    required
                />
            </div>

            <div class="grid gap-2">
                <Label for="email">
                    Email <span class="text-muted-foreground font-normal"
                        >(optional)</span
                    >
                </Label>
                <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="your@email.com"
                    bind:value={email}
                />
                <p class="text-xs text-muted-foreground">
                    Include your email if you'd like a response.
                </p>
            </div>

            <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Sending..." : "Send Feedback"}
                </Button>
            </DialogFooter>
        </form>
    </DialogContent>
</Dialog>
