import {createContext} from "react-router"

// Context for application environment - used by loaders/actions via context.get(appContext)
export type AppContext = {
    env: Env
}

export const appContext = createContext<AppContext>()

export function getAppEnv(context?: {
    get: (key: typeof appContext) => AppContext | undefined
}): Env {
    try {
        const appCtx = context?.get(appContext)
        if (appCtx?.env) {
            return appCtx.env
        }
    } catch {
        // Fall back to process.env
    }

    return {
        YOTO_AUTH_SECRET: process.env.YOTO_AUTH_SECRET ?? "",
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        PORT: process.env.PORT,
        NODE_ENV: process.env.NODE_ENV,
    }
}
