import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Component tests per ADR-0030: testing-library on jsdom.
    environment: "jsdom",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    setupFiles: ["test/setup.ts"],
  },
})
