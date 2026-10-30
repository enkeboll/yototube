import {ExternalLink} from "lucide-react"
import {useEffect, useState} from "react"
import {
    Form,
    redirect,
    useActionData,
    useFetcher,
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
import {completeLogin, initiateLogin, status} from "~/lib/auth.server"

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

    return {}
}

// Handle the two-step device code flow
export async function action({
    request,
    context,
}: Route.ActionArgs): Promise<ActionData | Response> {
    const env = getAppEnv(context)

    const formData = await request.formData()
    const intent = formData.get("intent")

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
    const isStarting =
        navigation.state !== "idle" &&
        navigation.formData?.get("intent") === "initiate"
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
                        Yoto will show a device confirmation screen. Ensure this
                        code matches on Yoto, then click confirm.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {errorData ? (
                        <div className="space-y-4">
                            <div className="space-y-2 text-center">
                                <p className="text-destructive font-medium">
                                    {errorData.error}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    To use YotoTube, you can register an
                                    application in the{" "}
                                    <a
                                        href="https://yoto.dev"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline hover:text-foreground"
                                    >
                                        Yoto Developer Portal (yoto.dev)
                                    </a>{" "}
                                    and set{" "}
                                    <code className="bg-muted px-1 py-0.5 rounded text-xs">
                                        YOTO_CLIENT_ID
                                    </code>{" "}
                                    in your{" "}
                                    <code className="bg-muted px-1 py-0.5 rounded text-xs">
                                        .env
                                    </code>
                                    .
                                </p>
                            </div>
                            <Form method="post">
                                <input
                                    type="hidden"
                                    name="intent"
                                    value="initiate"
                                />
                                <Button type="submit" className="w-full">
                                    Try Again
                                </Button>
                            </Form>
                        </div>
                    ) : !pendingData ? (
                        <Form method="post">
                            <input
                                type="hidden"
                                name="intent"
                                value="initiate"
                            />
                            <Button
                                type="submit"
                                className="w-full"
                                disabled={isStarting}
                            >
                                {isStarting ? "Starting..." : "Start Login"}
                            </Button>
                        </Form>
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
