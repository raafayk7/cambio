import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * ADR-0032 insurance: Turborepo strict env mode silently strips any
 * variable not declared in turbo.json, and a stripped VITE_ var produces
 * a bundle with a broken realtime client, not a build error. turbo.json
 * carries comments, so blocks are extracted by string slicing rather
 * than JSON.parse.
 *
 * The two slots are asserted separately because they break independently
 * (review F11): the `@cambio/web#build` task bakes VITE_ vars into the
 * bundle via its hashed `env` array, while `dev` passes them through
 * unhashed via `passThroughEnv`. A var declared in only one slot builds
 * fine in one mode and silently strips in the other — a whole-file
 * `toContain` cannot tell the slots apart.
 */

const VITE_VARS = ["VITE_API_URL", "VITE_REALTIME_URL", "VITE_REALTIME_APIKEY"]

// vitest's cwd is the package root (apps/web); jsdom rewrites
// import.meta.url to a non-file scheme, so resolve from cwd instead.
const turboJson = readFileSync(join(process.cwd(), "..", "..", "turbo.json"), "utf8")

/** Slice out the balanced-brace block that follows `"<key>":`. */
function taskBlock(key: string): string {
  const keyIndex = turboJson.indexOf(`"${key}"`)
  expect(keyIndex, `task "${key}" is missing from turbo.json`).toBeGreaterThanOrEqual(0)
  const open = turboJson.indexOf("{", keyIndex)
  let depth = 0
  for (let index = open; index < turboJson.length; index += 1) {
    if (turboJson[index] === "{") depth += 1
    if (turboJson[index] === "}") {
      depth -= 1
      if (depth === 0) return turboJson.slice(open, index + 1)
    }
  }
  throw new Error(`unbalanced braces after "${key}" in turbo.json`)
}

/** The raw text of one `"<field>": [...]` array inside a task block. */
function arrayField(block: string, field: string): string {
  const match = new RegExp(`"${field}"\\s*:\\s*\\[([^\\]]*)\\]`).exec(block)
  expect(match, `"${field}" array not found in the task block`).not.toBeNull()
  return match![1]!
}

describe("turbo.json env declarations (ADR-0032)", () => {
  it.each(VITE_VARS)("the @cambio/web#build hashed env array declares %s", (name) => {
    expect(arrayField(taskBlock("@cambio/web#build"), "env")).toContain(`"${name}"`)
  })

  it.each(VITE_VARS)("the dev passThroughEnv array declares %s", (name) => {
    expect(arrayField(taskBlock("dev"), "passThroughEnv")).toContain(`"${name}"`)
  })
})
