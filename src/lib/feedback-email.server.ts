interface FeedbackEmailProps {
    categoryLabel: string
    email: string
    message: string
}

export function renderFeedbackEmail({
    categoryLabel,
    email,
    message,
}: FeedbackEmailProps): string {
    return `<!doctype html>
<html>
<head>
    <meta charset="utf-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a; padding: 20px;">
    <h2 style="margin: 0 0 20px; fontSize: 20px;">${categoryLabel}</h2>
    <div style="border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
        <table style="border-collapse: collapse; width: 100%;">
            <thead>
                <tr>
                    <th style="padding: 10px 14px; font-weight: 600; color: #555; background: #f5f5f5; border-bottom: 1px solid #e0e0e0; text-align: left; width: 50%;">Category</th>
                    <th style="padding: 10px 14px; font-weight: 600; color: #555; background: #f5f5f5; border-bottom: 1px solid #e0e0e0; text-align: left; width: 50%;">Email</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="padding: 10px 14px;">${categoryLabel}</td>
                    <td style="padding: 10px 14px;">${email}</td>
                </tr>
            </tbody>
        </table>
    </div>
    <div style="padding: 16px; border: 1px solid #e0e0e0; border-radius: 6px;">
        <p style="margin: 0 0 8px; font-weight: 600; color: #555; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Message</p>
        <p style="margin: 0; white-space: pre-wrap; line-height: 1.5;">${escapeHtml(message)}</p>
    </div>
    <p style="margin: 20px 0 0; font-size: 12px; color: #999;">Sent from Yoto Sync feedback form</p>
</body>
</html>`
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
}
