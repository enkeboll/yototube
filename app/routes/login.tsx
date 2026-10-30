import {ExternalLink} from "lucide-react"
import {useEffect, useState} from "react"
import {
    Form,
    redirect,
    useActionData,
    useFetcher,
    useLoaderData,
    useNavigation,
} from "react-router"

import {Button} from "~/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card"
import {getAppEnv} from "~/lib/app-context"
import {
    completeLogin,
    initiateLogin,
    initiatePkceLogin,
    status,
} from "~/lib/auth.server"

import type {Route} from "./+types/login"

type ActionData =
    | {step: "idle"}
    | {
          step: "pending"
          verificationUri: string
          userCode: string
          deviceCode: string
          interval: number
      }
    | {step: "error"; error: string}

export function meta() {
    return [
        {title: "Login - Yoto Sync"},
        {name: "description", content: "Login to Yoto Sync"},
    ]
}

// Redirect to dashboard if already logged in
export async function loader({request, context}: Route.LoaderArgs) {
    const env = getAppEnv(context)

    const authStatus = await status(request, env)

    if (authStatus.valid) {
        throw redirect("/cards")
    }

    const url = new URL(request.url)
    const urlError = url.searchParams.get("error")

    return {urlError}
}

// Handle login flows
export async function action({
    request,
    context,
}: Route.ActionArgs): Promise<ActionData | Response> {
    const env = getAppEnv(context)

    const formData = await request.formData()
    const intent = formData.get("intent")

    if (intent === "oauth") {
        const {authUrl, setCookie} = await initiatePkceLogin(request, env)
        return redirect(authUrl, {
            headers: {"Set-Cookie": setCookie},
        })
    }

    if (intent === "initiate") {
        // Step 1: Start device code flow
        const deviceCode = await initiateLogin(env)

        if (!deviceCode.success) {
            const isClientError =
                deviceCode.error === "Unauthorized or unknown client" ||
                deviceCode.error?.includes("client")

            const errorMsg = isClientError
                ? "Unauthorized or unknown client ID. Please register a free app at https://yoto.dev and set YOTO_CLIENT_ID in your .env file."
                : (deviceCode.error ?? "Failed to initiate login with Yoto.")

            return {
                step: "error" as const,
                error: errorMsg,
            }
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
        // Step 2: Poll for token
        const deviceCode = formData.get("deviceCode") as string
        const interval = parseInt(formData.get("interval") as string, 10)

        const result = await completeLogin(request, env, deviceCode, interval)

        if (result.success) {
            return redirect("/cards", {
                headers: {"Set-Cookie": result.setCookie},
            })
        }

        return {
            step: "error" as const,
            error: result.error,
        }
    }

    return {step: "idle" as const}
}

export default function Login() {
    const {urlError} = useLoaderData<typeof loader>()
    const actionData = useActionData<ActionData>()
    const completeFetcher = useFetcher<typeof action>()
    const navigation = useNavigation()
    const [pollingDeviceCode, setPollingDeviceCode] = useState<string | null>(
        null,
    )

    const completeData = completeFetcher.data
    const pendingData = actionData?.step === "pending" ? actionData : null
    const completeError =
        completeData?.step === "error" &&
        pollingDeviceCode === pendingData?.deviceCode
            ? completeData
            : null
    const errorData = actionData?.step === "error" ? actionData : completeError
    const displayError = errorData?.error || urlError

    const isStarting =
        navigation.state !== "idle" &&
        (navigation.formData?.get("intent") === "oauth" ||
            navigation.formData?.get("intent") === "initiate")
    const isPolling =
        Boolean(pendingData) &&
        pollingDeviceCode === pendingData?.deviceCode &&
        !completeError

    // When we get device code, start polling automatically
    useEffect(() => {
        if (pendingData && pollingDeviceCode !== pendingData.deviceCode) {
            setPollingDeviceCode(pendingData.deviceCode)

            // Submit the complete action
            const formData = new FormData()
            formData.set("intent", "complete")
            formData.set("deviceCode", pendingData.deviceCode)
            formData.set("interval", pendingData.interval.toString())

            completeFetcher.submit(formData, {method: "post"})
        }
    }, [completeFetcher, pendingData, pollingDeviceCode])

    return (
        <div className="flex flex-1 items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Connect your Yoto account</CardTitle>
                    <CardDescription>
                        Sign in with your Yoto account to access and sync your
                        Make Your Own cards.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {displayError && (
                        <div className="space-y-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-center">
                            <p className="text-sm font-medium text-destructive">
                                {displayError}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Ensure your app at{" "}
                                <a
                                    href="https://yoto.dev"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline hover:text-foreground"
                                >
                                    yoto.dev
                                </a>{" "}
                                has your callback URL configured (e.g.{" "}
                                <code className="bg-muted px-1 py-0.5 rounded">
                                    http://localhost:3000/callback
                                </code>
                                ) and matches{" "}
                                <code className="bg-muted px-1 py-0.5 rounded">
                                    YOTO_CLIENT_ID
                                </code>{" "}
                                in your{" "}
                                <code className="bg-muted px-1 py-0.5 rounded">
                                    .env
                                </code>
                                .
                            </p>
                        </div>
                    )}

                    {!pendingData ? (
                        <div className="space-y-4">
                            <Form method="post">
                                <input
                                    type="hidden"
                                    name="intent"
                                    value="oauth"
                                />
                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={isStarting}
                                >
                                    {isStarting
                                        ? "Redirecting to Yoto..."
                                        : "Log In with Yoto"}
                                </Button>
                            </Form>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="space-y-3 text-center">
                                <p className="font-mono text-2xl font-bold tracking-wider">
                                    {pendingData.userCode}
                                </p>
                                <p className="text-xs italic text-muted-foreground">
                                    You do not need to do anything on your Yoto
                                    player.
                                </p>
                            </div>

                            <Button asChild className="w-full">
                                <a
                                    href={pendingData.verificationUri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Login
                                    <ExternalLink />
                                </a>
                            </Button>

                            {isPolling && (
                                <p className="text-center text-sm text-muted-foreground animate-pulse">
                                    Waiting for authentication...
                                </p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
