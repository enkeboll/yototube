import {redirect} from "react-router"

import {getAppEnv} from "~/lib/app-context"
import {logout} from "~/lib/auth.server"

import type {Route} from "./+types/logout"

export async function action({request, context}: Route.ActionArgs) {
    const env = getAppEnv(context)
    const setCookie = await logout(request, env)

    return redirect("/", {
        headers: {"Set-Cookie": setCookie},
    })
}

// Redirect GET requests to landing page
export async function loader() {
    return redirect("/")
}
