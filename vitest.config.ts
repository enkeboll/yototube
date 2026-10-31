import path from "node:path"

import tsconfigPaths from "vite-tsconfig-paths"
import {defineConfig} from "vitest/config"

const config = defineConfig({
    plugins: [tsconfigPaths()],
    resolve: {
        alias: {
            "~": path.resolve("./src"),
            "$lib": path.resolve("./src/lib"),
        },
    },
    test: {
        globals: true,
    },
})

export default config
