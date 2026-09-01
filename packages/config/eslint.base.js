import js from "@eslint/js"
import boundaries from "eslint-plugin-boundaries"
import tseslint from "typescript-eslint"

/**
 * The §3.1 dependency table, as data.
 *
 * This is the single source of truth for which workspace packages each layer
 * may import. Deny-lists are *derived* from it below, so adding a package to
 * WORKSPACE_PACKAGES without granting it anywhere denies it everywhere by
 * default — a new package can never silently become importable.
 *
 * `@cambio/config` is dev-only tooling (tsconfig/eslint/prettier bases) and is
 * deliberately not a runtime edge in this graph.
 */
const WORKSPACE_PACKAGES = [
  "@cambio/domain",
  "@cambio/application",
  "@cambio/contracts",
  "@cambio/ui",
]

/** @type {Record<string, ReadonlyArray<string>>} */
const MAY_IMPORT = {
  // pure. effect only.
  domain: [],
  // wire types shared by api + web. effect only.
  contracts: [],
  // shadcn primitives + shared components. nothing app-specific.
  ui: [],
  // use cases + infrastructure ports.
  application: ["@cambio/domain", "@cambio/contracts"],
  // presentation + infrastructure.
  api: ["@cambio/application", "@cambio/domain", "@cambio/contracts"],
  // never domain or application — see §3.1 and the note in docs/HANDOFF.md.
  web: ["@cambio/contracts", "@cambio/ui"],
}

const LAYER_RATIONALE = {
  domain: "`domain` is pure and may import `effect` only (§3.1).",
  contracts: "`contracts` may import `effect` only (§3.1).",
  ui: "`ui` may not import anything app-specific (§3.1).",
  application: "`application` may import `domain`, `contracts` and `effect` only (§3.1).",
  api: "`apps/api` may import `application`, `domain` and `contracts` only (§3.1).",
  web:
    "`apps/web` may import `contracts` and `ui` only — never `domain` or `application` (§3.1). " +
    "The domain contains full game state including other players' cards; keeping it " +
    "unreachable from the client makes information leakage a compile error rather than a " +
    "code-review question.",
}

/**
 * Layers whose §3.1 rule caps *external* (non-workspace, npm) imports at
 * `effect` only. Restricted to `src/**` — each of these layers' `test/**`
 * legitimately imports test tooling (`vitest`, `@effect/vitest`) that isn't
 * `effect`, so the check must not reach test files (ADR-0017).
 */
const EFFECT_ONLY_EXTERNAL_LAYERS = ["domain", "contracts", "application"]
const EFFECT_ONLY_ALLOWED_EXTERNAL = ["effect"]

/**
 * Shared flat ESLint config for every package in the monorepo.
 *
 * @param {{
 *   layer: keyof typeof MAY_IMPORT,
 *   files?: ReadonlyArray<string>,
 *   elementFolders?: ReadonlyArray<string>,
 * }} options
 * @returns {import("eslint").Linter.Config[]}
 */
export function cambioConfig(options) {
  const {
    layer,
    files,
    // boundaries element patterns match FOLDERS, not files. Every package in
    // this repo keeps its sources under src/ (and tests under test/), so the
    // whole package is one element whose type is its layer.
    elementFolders = ["src", "test"],
  } = options

  const allowed = MAY_IMPORT[layer]
  if (allowed === undefined) {
    throw new Error(
      `Unknown layer "${layer}". Expected one of: ${Object.keys(MAY_IMPORT).join(", ")}`,
    )
  }
  // Every denied workspace package is matched both bare and via any subpath
  // (`@cambio/foo/**`) — micromatch does not treat a bare pattern as a
  // subpath prefix, so without the `/**` variant an export subpath (e.g.
  // `@cambio/domain/testing`, ADR-0016) would silently bypass the deny-list.
  const denied = WORKSPACE_PACKAGES.filter((pkg) => !allowed.includes(pkg)).flatMap((pkg) => [
    pkg,
    `${pkg}/**`,
  ])

  const workspacePolicies =
    denied.length > 0
      ? [
          {
            from: { element: { type: layer } },
            disallow: { to: { module: { origin: "external", source: denied } } },
            message: LAYER_RATIONALE[layer],
          },
        ]
      : []

  // §3.1 caps some layers' *external* (npm) imports at `effect` only. The
  // policies array is evaluated last-write-wins (ADR-0017), so the blanket
  // disallow must come before the `effect` carve-out for the carve-out to
  // win. `!@cambio/**` excludes workspace packages so this pair doesn't
  // fight `workspacePolicies` above over the same import.
  const effectOnlyExternalPolicies = EFFECT_ONLY_EXTERNAL_LAYERS.includes(layer)
    ? [
        {
          from: { element: { type: layer } },
          disallow: { to: { module: { origin: "external", source: ["!@cambio/**"] } } },
          message: LAYER_RATIONALE[layer],
        },
        {
          from: { element: { type: layer } },
          allow: { to: { module: { origin: "external", source: EFFECT_ONLY_ALLOWED_EXTERNAL } } },
        },
      ]
    : []

  const settings = {
    "boundaries/elements": [{ type: layer, pattern: [...elementFolders] }],
    "boundaries/dependency-nodes": ["import", "dynamic-import", "require", "export"],
  }

  const sharedRules = {
    // Zod is banned outright — validation is Effect Schema (§2).
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "zod",
            message: "Validation is Effect Schema, not Zod (§2). Do not add Zod for any reason.",
          },
        ],
      },
    ],
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { prefer: "type-imports", fixStyle: "inline-type-imports" },
    ],
  }

  const boundariesBlock = (blockFiles, policies) => ({
    files: [...blockFiles],
    plugins: { boundaries },
    settings,
    rules: {
      ...sharedRules,
      ...(policies.length > 0
        ? {
            "boundaries/dependencies": [
              "error",
              {
                default: "allow",
                // Workspace packages resolve through node_modules symlinks, so
                // they are "external" from any single package's point of view.
                checkAllOrigins: true,
                policies,
              },
            ],
          }
        : {}),
    },
  })

  // A caller-supplied `files` override always gets one combined block (no
  // src/test split — nothing in the repo overrides `files` today). Layers
  // with an effect-only-external rule get two *mutually-exclusive* blocks
  // (src/** vs test/**) rather than one block carrying both policy sets,
  // because `boundaries/dependencies` policies replace wholesale rather than
  // merge if two config blocks both declare the rule for overlapping files
  // (ADR-0017) — mutually-exclusive globs sidestep that hazard entirely.
  const ruleBlocks = files
    ? [boundariesBlock(files, workspacePolicies)]
    : effectOnlyExternalPolicies.length > 0
      ? [
          boundariesBlock(
            ["src/**/*.{ts,tsx}"],
            [...workspacePolicies, ...effectOnlyExternalPolicies],
          ),
          boundariesBlock(["test/**/*.{ts,tsx}"], workspacePolicies),
        ]
      : [boundariesBlock(["src/**/*.{ts,tsx}", "test/**/*.{ts,tsx}"], workspacePolicies)]

  return tseslint.config(
    {
      ignores: [
        "**/dist/**",
        "**/node_modules/**",
        "**/.turbo/**",
        "**/.output/**",
        "**/.tanstack/**",
        "**/.nitro/**",
        "**/coverage/**",
        "**/*.gen.ts",
        "eslint.config.js",
        "vitest.config.ts",
        "vite.config.ts",
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...ruleBlocks,
  )
}

export { MAY_IMPORT, WORKSPACE_PACKAGES }
export default cambioConfig
