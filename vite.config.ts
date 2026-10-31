import path from "node:path"
import process from "node:process"

import {sveltekit} from "@sveltejs/kit/vite"
import tailwindcss from "@tailwindcss/vite"
import {defineConfig} from "vite"

try {
    process.loadEnvFile?.()
} catch {
    // .env may not exist in environments where vars are passed directly
}

export default defineConfig({
    plugins: [tailwindcss(), sveltekit()],
    resolve: {
        alias: {
            "~": path.resolve("./src"),
        },
    },
    server: {
        port: 3000,
    },
})
