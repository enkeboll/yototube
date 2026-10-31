import {type Actions, fail, redirect} from "@sveltejs/kit"

import {getAppEnv} from "$lib/app-context"
import {
    completeLogin,
    initiateLogin,
    initiatePkceLogin,
    status,
} from "$lib/auth.server"

import type {PageServerLoad} from "./$types"

export const load: PageServerLoad = async ({request, locals, url}) => {
    const env = locals.env ?? getAppEnv()
    const authStatus = await status(request, env)

    if (authStatus.valid) {
        throw redirect(302, "/cards")
    }

    const urlError = url.searchParams.get("error")
    return {urlError}
}

export const actions: Actions = {
    default: async ({request, locals, cookies}) => {
        const env = locals.env ?? getAppEnv()
        const formData = await request.formData()
        const intent = formData.get("intent")

        if (intent === "oauth" || !intent) {
            const {authUrl, setCookie} = await initiatePkceLogin(request, env)
            // Parse yoto-pkce value from setCookie header string
            const pkceVal = setCookie.split(";")[0].replace(/^yoto-pkce=/, "")
            cookies.set("yoto-pkce", decodeURIComponent(pkceVal), {
                path: "/",
                httpOnly: true,
                sameSite: "lax",
                maxAge: 600,
                secure: request.url.startsWith("https:"),
            })
            throw redirect(302, authUrl)
        }

        if (intent === "initiate") {
            const deviceCode = await initiateLogin(env)

            if (!deviceCode.success) {
                const isClientError =
                    deviceCode.error === "Unauthorized or unknown client" ||
                    deviceCode.error?.includes("client")

                const errorMsg = isClientError
                    ? "Unauthorized or unknown client ID. Please register a free app at https://yoto.dev and set YOTO_CLIENT_ID in your .env file."
                    : (deviceCode.error ??
                      "Failed to initiate login with Yoto.")

                return fail(400, {
                    step: "error" as const,
                    error: errorMsg,
                })
            }

            return {
                step: "pending" as const,
                verificationUri:
                    deviceCode.verificationUriComplete ??
                    deviceCode.verificationUri ??
                    "",
                userCode: deviceCode.userCode ?? "",
                deviceCode: deviceCode.deviceCode ?? "",
                interval: deviceCode.interval ?? 5,
            }
        }

        if (intent === "complete") {
            const deviceCode = formData.get("deviceCode") as string
            const interval = parseInt(formData.get("interval") as string, 10)

            const result = await completeLogin(
                request,
                env,
                deviceCode,
                interval,
            )

            if (result.success) {
                // Parse auth token from setCookie header
                const authVal = result.setCookie
                    .split(";")[0]
                    .replace(/^yoto-auth=/, "")
                cookies.set("yoto-auth", decodeURIComponent(authVal), {
                    path: "/",
                    httpOnly: true,
                    sameSite: "lax",
                    maxAge: 60 * 60 * 24 * 30,
                    secure: request.url.startsWith("https:"),
                })
                throw redirect(302, "/cards")
            }

            return fail(400, {
                step: "error" as const,
                error: result.error,
            })
        }

        return {step: "idle" as const}
    },
}
