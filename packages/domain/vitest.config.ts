import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The CAM-2 simulation suite plays whole games inside single tests; the
    // 5 s default is too tight on slow CI. The batch's beforeAll carries its
    // own computed timeout on top of this.
    testTimeout: 30_000,
  },
})
