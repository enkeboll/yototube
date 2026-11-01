import {redirect, type RequestHandler} from "@sveltejs/kit"

import {getAppEnv} from "$lib/app-context"
import {completeGoogleOAuthCallback} from "$lib/providers/google-oauth.server"

export const GET: RequestHandler = async ({url, cookies, locals}) => {
    const env = locals.env ?? getAppEnv()
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    const errorParam = url.searchParams.get("error")

    const savedStateJson = cookies.get("google-oauth-state")
    cookies.delete("google-oauth-state", {path: "/"})

    if (errorParam || !code || !state || !savedStateJson) {
        throw redirect(302, "/cards?googleAuthError=1")
    }

    try {
        const {returnTo} = await completeGoogleOAuthCallback(
            code,
            state,
            savedStateJson,
            env,
        )
        throw redirect(302, returnTo)
    } catch {
        throw redirect(302, "/cards?googleAuthError=1")
    }
}

