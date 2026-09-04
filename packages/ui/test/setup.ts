import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// Vitest globals are off repo-wide, so testing-library cannot register its
// own cleanup — do it explicitly.
afterEach(() => {
  cleanup()
})
