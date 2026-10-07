import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
    resolve: {
        alias: {
            "@": fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, ""),
        },
    },
    test: {
        environment: "node",
        include: ["lib/**/*.test.ts", "components/**/*.test.ts", "components/**/*.test.tsx"],
    },
})
