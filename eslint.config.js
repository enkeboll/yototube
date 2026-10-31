import bradgarropy from "@bradgarropy/eslint-config"
import {defineConfig} from "eslint/config"

export default defineConfig([
    ...bradgarropy,
    {
        ignores: [".svelte-kit/", "build/"],
    },
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: [
                        "eslint.config.js",
                        "svelte.config.js",
                        "vitest.config.ts",
                        "env.d.ts",
                        "scripts/*.ts",
                    ],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
])
