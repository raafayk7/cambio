import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Component tests per ADR-0030: testing-library on jsdom.
    environment: "jsdom",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    setupFiles: ["test/setup.ts"],
    // These jsdom renders finish in well under 1s in isolation, but a full
    // monorepo gate run (`pnpm turbo ... --force` building/testing all 7
    // packages concurrently) starves them of CPU past the 5s default.
    testTimeout: 30_000,
  },
})
