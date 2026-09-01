import { fileURLToPath } from "node:url"
import { ESLint } from "eslint"
import { describe, expect, it } from "vitest"
import { cambioConfig } from "../eslint.base.js"

/**
 * Regression coverage for CAM-11 (see ADR-0017): both ESLint boundary gaps
 * — unrestricted external (npm) imports into the "effect only" layers, and
 * bare deny-list patterns not matching workspace-package export subpaths —
 * must stay closed. These lint the real composed config via ESLint's own
 * programmatic API against small fixture sources, rather than a mocked
 * rule harness, so a future edit to `cambioConfig` is checked end to end.
 */

const packageDir = (relativeFromThisFile: string) =>
  fileURLToPath(new URL(relativeFromThisFile, import.meta.url))

async function lintErrors(
  layer: Parameters<typeof cambioConfig>[0]["layer"],
  cwd: string,
  filePath: string,
  code: string,
) {
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: cambioConfig({ layer }),
  })
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((message) => message.ruleId === "boundaries/dependencies")
}

describe("cambioConfig — Gap 1: effect-only external imports (src only)", () => {
  const cases = [
    { layer: "domain", dir: "../../domain" },
    { layer: "contracts", dir: "../../contracts" },
    { layer: "application", dir: "../../application" },
  ] as const

  for (const { layer, dir } of cases) {
    const cwd = packageDir(dir)

    it(`blocks a non-effect external import in ${layer}/src`, async () => {
      const errors = await lintErrors(
        layer,
        cwd,
        "src/probe.ts",
        'import { Path } from "@effect/platform"\nexport const probe = Path\n',
      )
      expect(errors).toHaveLength(1)
    })

    it(`allows an effect import in ${layer}/src`, async () => {
      const errors = await lintErrors(
        layer,
        cwd,
        "src/probe.ts",
        'import { Effect } from "effect"\nexport const probe = Effect\n',
      )
      expect(errors).toHaveLength(0)
    })
  }

  it("does not restrict external imports in domain/test (src/test split)", async () => {
    const errors = await lintErrors(
      "domain",
      packageDir("../../domain"),
      "test/probe.test.ts",
      'import { it } from "vitest"\nexport const probe = it\n',
    )
    expect(errors).toHaveLength(0)
  })
})

describe("cambioConfig — Gap 2: workspace export subpaths are denied like the bare package", () => {
  it("blocks apps/web importing the @cambio/domain/testing subpath", async () => {
    const errors = await lintErrors(
      "web",
      packageDir("../../../apps/web"),
      "src/probe.ts",
      'import { Phase } from "@cambio/domain/testing"\nexport const probe = Phase\n',
    )
    expect(errors).toHaveLength(1)
  })
})
