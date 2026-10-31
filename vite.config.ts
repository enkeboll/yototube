import path from "node:path"

import {sveltekit} from "@sveltejs/kit/vite"
import tailwindcss from "@tailwindcss/vite"
import {defineConfig} from "vite"

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
