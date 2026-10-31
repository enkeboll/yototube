import {exec} from "node:child_process"
import {promisify} from "node:util"

const execAsync = promisify(exec)

export type ExecResult = {
    success: boolean
    stdout: string
    stderr: string
}

export type SandboxInstance = {
    exec: (
        command: string,
        options?: {env?: Record<string, string>},
    ) => Promise<ExecResult>
    destroy: () => Promise<void>
}

export function getSandbox(sandboxId: string): SandboxInstance {
    void sandboxId
    return {
        async exec(
            command: string,
            options?: {env?: Record<string, string>},
        ): Promise<ExecResult> {
            try {
                const {stdout, stderr} = await execAsync(command, {
                    env: {...process.env, ...options?.env},
                    maxBuffer: 50 * 1024 * 1024,
                    shell: "/bin/bash",
                })
                return {
                    success: true,
                    stdout: stdout.toString(),
                    stderr: stderr.toString(),
                }
            } catch (error: unknown) {
                const execError = error as {
                    stdout?: string | Buffer
                    stderr?: string | Buffer
                    message?: string
                }
                return {
                    success: false,
                    stdout: execError.stdout ? execError.stdout.toString() : "",
                    stderr: execError.stderr
                        ? execError.stderr.toString()
                        : (execError.message ?? "Command execution failed"),
                }
            }
        },
        async destroy(): Promise<void> {
            // No-op for local execution; temp files are cleaned up per track
        },
    }
}
