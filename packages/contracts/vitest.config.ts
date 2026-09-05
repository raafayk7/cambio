import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Pure schema tests — no DB, no global setup, default timeout.
    include: ["test/**/*.test.ts"],
  },
})
