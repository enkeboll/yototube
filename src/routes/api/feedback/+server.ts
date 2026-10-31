import type {RequestHandler} from "@sveltejs/kit"
import {Resend} from "resend"
import {z} from "zod"

import {getAppEnv} from "$lib/app-context"
import {renderFeedbackEmail} from "$lib/feedback-email.server"
import {logger} from "$lib/logger.server"
import {feedbackSchema} from "$lib/schemas/feedback"
import {isValidOrigin} from "$lib/security.server"
import {parseFormData} from "$lib/validation.server"

const categoryLabels: Record<string, string> = {
    bug: "Bug Report",
    feature: "Feature Request",
    feedback: "General Feedback",
}

export const POST: RequestHandler = async ({request, locals}) => {
    if (!isValidOrigin(request)) {
        return Response.json({error: "Forbidden"}, {status: 403})
    }

    const env = locals.env ?? getAppEnv()
    const formData = await request.formData()
    const result = parseFormData(formData, feedbackSchema)

    if (!result.success) {
        const {fieldErrors} = z.flattenError(result.error)
        return Response.json({errors: fieldErrors}, {status: 400})
    }

    const {category, message, email} = result.data
    const categoryLabel = categoryLabels[category]
    const emailValue = email ?? "Not provided"
    const subject = categoryLabel

    try {
        const resend = new Resend(env.RESEND_API_KEY)
        const html = renderFeedbackEmail({
            categoryLabel,
            email: emailValue,
            message,
        })

        await resend.emails.send({
            from: "Yoto Sync <feedback@yoto.bradgarropy.com>",
            to: "bradgarropy@gmail.com",
            replyTo: email,
            subject,
            html,
        })

        return Response.json({success: true})
    } catch (error) {
        logger.error({
            message: "feedback.email.send_failed",
            error,
        })

        return Response.json(
            {error: "Failed to send feedback. Please try again."},
            {status: 500},
        )
    }
}
