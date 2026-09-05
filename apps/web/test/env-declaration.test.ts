import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * ADR-0032 insurance: Turborepo strict env mode silently strips any
 * variable not declared in turbo.json, and a stripped VITE_ var produces
 * a bundle with a broken realtime client, not a build error. turbo.json
 * carries comments, so this reads raw text rather than JSON.parse.
 */
describe("turbo.json env declarations (ADR-0032)", () => {
  // vitest's cwd is the package root (apps/web); jsdom rewrites
  // import.meta.url to a non-file scheme, so resolve from cwd instead.
  const turboJson = readFileSync(join(process.cwd(), "..", "..", "turbo.json"), "utf8")

  it.each(["VITE_API_URL", "VITE_REALTIME_URL", "VITE_REALTIME_ANON_JWT"])(
    "declares %s for the web build",
    (name) => {
      expect(turboJson).toContain(`"${name}"`)
    },
  )
})
