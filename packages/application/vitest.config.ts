import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Pure unit tests on stub layers — no DB, no global setup, default timeout.
    include: ["test/**/*.test.ts"],
  },
})
