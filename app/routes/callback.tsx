import {redirect} from "react-router"

import {getAppEnv} from "~/lib/app-context"
import {completePkceLogin} from "~/lib/auth.server"

import type {Route} from "./+types/callback"

export async function loader({request, context}: Route.LoaderArgs) {
    const env = getAppEnv(context)

    const result = await completePkceLogin(request, env)

    if (result.success) {
        const headers = new Headers()
        headers.append("Set-Cookie", result.setCookie)
        headers.append("Set-Cookie", result.clearPkceCookie)

        return redirect("/cards", {headers})
    }

    const headers = new Headers()
    if (result.clearPkceCookie) {
        headers.append("Set-Cookie", result.clearPkceCookie)
    }

    const searchParams = new URLSearchParams({
        error: result.error,
    })

    return redirect(`/login?${searchParams.toString()}`, {headers})
}

export default function Callback() {
    return (
        <div className="flex flex-1 items-center justify-center p-4">
            <p className="text-muted-foreground animate-pulse">
                Authenticating with Yoto...
            </p>
        </div>
    )
}
