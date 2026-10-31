import {reactRouter} from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import {defineConfig} from "vite"
import devtoolsJson from "vite-plugin-devtools-json"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
    plugins: [tailwindcss(), reactRouter(), tsconfigPaths(), devtoolsJson()],
    resolve: {
        dedupe: ["react", "react-dom"],
    },
    optimizeDeps: {
        include: [
            "react",
            "react-dom",
            "react-router",
            "motion/react",
            "lucide-react",
            "radix-ui",
            "clsx",
            "tailwind-merge",
            "class-variance-authority",
            "sonner",
        ],
    },
    server: {
        port: 3000,
    },
})
