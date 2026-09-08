import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Round-trip suites persist whole harness games; DB round-trips are slow.
    testTimeout: 30_000,
    // Provision + migrate the isolated cambio_test database once per run.
    globalSetup: "./test/global-setup.ts",
    // The five suites share one database; serial files keep isolation honest
    // without per-test truncation.
    fileParallelism: false,
  },
})
