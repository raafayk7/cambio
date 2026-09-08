import "@testing-library/jest-dom/vitest"
import { cleanup, configure } from "@testing-library/react"
import { afterEach } from "vitest"

// Vitest globals are off repo-wide, so testing-library cannot register its
// own cleanup — do it explicitly.
afterEach(() => {
  cleanup()
})

// testing-library's async queries (findBy*/waitFor) carry their own
// internal timeout, separate from vitest's testTimeout (raised in
// vitest.config.ts per CAM-24) — raise it too so the same CPU-contention
// flakiness under a full-monorepo gate run doesn't starve these queries
// past their much shorter 1000ms default.
configure({ asyncUtilTimeout: 10_000 })
