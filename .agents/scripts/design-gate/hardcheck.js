// hardcheck.js — turn render facts into constraint-tier verdicts (real logic, not model reasoning).
//
//   node scripts/hardcheck.js --facts tests/output/name.facts.json [--tokens tokens/project.json]
//
// Emits  <name>.hardcheck.json  next to the facts file, and prints a summary.
// Checks: WCAG text contrast, touch targets, token self-consistency (per-project drift).
// Every finding carries a measured value + tier so the Decompose stage can fold it in as a FACT.

import { readFileSync, writeFileSync } from "node:fs"
import {
  parseColor,
  composite,
  contrastRatio,
  textContrastVerdict,
  touchTargetVerdict,
} from "./wcag.js"

function parseArgs(argv) {
  const a = {}
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i]
    if (k.startsWith("--")) {
      a[k.slice(2)] = argv[i + 1]?.startsWith("--") || argv[i + 1] === undefined ? true : argv[++i]
    }
  }
  return a
}

// ---- text contrast ----
function checkContrast(facts) {
  const fails = [],
    advisories = []
  for (const t of facts.textSamples) {
    const fg = parseColor(t.color)
    if (!fg) continue
    if (t.background?.indeterminate) {
      advisories.push({
        check: "contrast",
        path: t.path,
        text: t.text,
        reason: `text over ${t.background.reason} — contrast not statically verifiable`,
        fontSize: t.fontSize,
      })
      continue
    }
    let bgColor = parseColor(t.background?.color)
    if (!bgColor) continue
    // composite any translucent overlays (glass) over the solid base, farthest-first
    for (const ov of [...(t.background.overlays || [])].reverse()) {
      const ovc = parseColor(ov)
      if (ovc) bgColor = { ...composite(ovc, bgColor), a: 1 }
    }
    const fgOpaque = fg.a < 1 ? composite(fg, bgColor) : fg
    const ratio = contrastRatio(fgOpaque, bgColor)
    const v = textContrastVerdict(ratio, t.fontSize, t.fontWeight)
    if (!v.pass) {
      fails.push({
        check: "contrast",
        path: t.path,
        text: t.text,
        measured: `${v.ratio}:1`,
        required: `${v.required}:1`,
        fontSize: t.fontSize,
        tier: "constraint",
      })
    }
  }
  return { fails, advisories }
}

// ---- touch targets ----
function checkTouchTargets(facts) {
  const fails = [],
    advisories = []
  for (const el of facts.interactive) {
    if (el.width === 0 || el.height === 0) continue
    const v = touchTargetVerdict(el.width, el.height)
    if (v.verdict === "fail")
      fails.push({
        check: "touch-target",
        path: el.path,
        text: el.text,
        measured: `${v.min}px`,
        required: "24px",
        tier: "constraint",
      })
    else if (v.verdict === "advisory")
      advisories.push({
        check: "touch-target",
        path: el.path,
        text: el.text,
        measured: `${v.min}px`,
        recommended: "44px",
      })
  }
  return { fails, advisories }
}

// ---- token self-consistency (per-project drift, not company conformance) ----
// Infer the project's de-facto spacing base and flag values that don't sit on it.
function checkTokenConsistency(facts, tokens) {
  const findings = []
  const scale = facts.spacingScale || []

  if (tokens?.spacing) {
    const allowed = new Set(tokens.spacing)
    const off = scale.filter((v) => !allowed.has(v))
    if (off.length)
      findings.push({
        check: "token-conformance",
        dimension: "spacing",
        detail: `${off.length} off-token spacing values: ${off.join(", ")}px (project tokens: ${tokens.spacing.join(", ")})`,
        tier: "default",
      })
  } else if (scale.length >= 4) {
    // No token file: infer a base grid. Try common bases, pick the one most values divide into.
    const bases = [8, 4]
    let best = { base: null, onGrid: -1 }
    for (const base of bases) {
      const onGrid = scale.filter((v) => v % base === 0).length
      if (onGrid > best.onGrid) best = { base, onGrid }
    }
    const offGrid = scale.filter((v) => v % best.base !== 0)
    const offRatio = offGrid.length / scale.length
    // Flag only on clear drift: many distinct values AND a high share off the inferred grid.
    if (scale.length >= 6 && offRatio > 0.4) {
      findings.push({
        check: "token-consistency",
        dimension: "spacing",
        detail: `spacing looks unsystematic: ${offGrid.length}/${scale.length} values off the inferred ${best.base}px grid (off-grid: ${offGrid.join(", ")}px)`,
        tier: "default",
      })
    }
  }

  // Palette breadth: a very wide distinct-color count is a drift signal (informational, not a fail).
  const palette = facts.palette || []
  if (palette.length > 18) {
    findings.push({
      check: "token-consistency",
      dimension: "color",
      detail: `${palette.length} distinct colors in use — wide palette, check for an unsystematic color set`,
      tier: "advisory",
    })
  }
  if ((facts.fonts || []).length > 3) {
    findings.push({
      check: "token-consistency",
      dimension: "type",
      detail: `${facts.fonts.length} font families: ${facts.fonts.join(", ")} — more than 3 typefaces (a recurring slop marker in the corpus)`,
      tier: "advisory",
    })
  }
  return findings
}

function main() {
  const args = parseArgs(process.argv)
  if (!args.facts) {
    console.error("Provide --facts <file.facts.json>")
    process.exit(2)
  }
  const facts = JSON.parse(readFileSync(String(args.facts), "utf8"))
  const tokens = args.tokens ? JSON.parse(readFileSync(String(args.tokens), "utf8")) : null

  const contrast = checkContrast(facts)
  const touch = checkTouchTargets(facts)
  const tokenFindings = checkTokenConsistency(facts, tokens)

  // CONSTRAINT tier = only the near-inviolable measurables (contrast, touch targets).
  // Token self-consistency is DEFAULT tier (Eman's call) → a signal the Judge weighs under D10, never an auto-fail.
  const constraintFails = [...contrast.fails, ...touch.fails]
  const defaultSignals = tokenFindings.filter((f) => f.tier === "default")
  const advisories = [
    ...contrast.advisories,
    ...touch.advisories,
    ...tokenFindings.filter((f) => f.tier === "advisory"),
  ]

  const result = {
    source: facts.source,
    summary: {
      constraintFails: constraintFails.length,
      defaultSignals: defaultSignals.length,
      advisories: advisories.length,
      gate: constraintFails.length === 0 ? "pass" : "fail",
    },
    constraintFails,
    defaultSignals,
    advisories,
    observed: {
      fonts: facts.fonts,
      palette: facts.palette,
      spacingScale: facts.spacingScale,
      radii: facts.radii,
    },
  }

  const outPath = String(args.facts).replace(/\.facts\.json$/, ".hardcheck.json")
  writeFileSync(outPath, JSON.stringify(result, null, 2))

  console.log(
    `HARD CHECKS — ${result.summary.gate.toUpperCase()}  (${constraintFails.length} constraint fails, ${defaultSignals.length} default signals, ${advisories.length} advisories)`,
  )
  for (const f of constraintFails)
    console.log(
      `  ✗ [${f.check}] ${f.path || f.dimension || ""} — ${f.measured || f.detail}${f.required ? ` (needs ${f.required})` : ""}`,
    )
  for (const d of defaultSignals)
    console.log(
      `  ◆ [${d.check}] ${d.path || d.dimension || ""} — ${d.detail} (default-tier, judged)`,
    )
  for (const a of advisories.slice(0, 8))
    console.log(`  ⚠ [${a.check}] ${a.path || a.dimension} — ${a.reason || a.detail || a.measured}`)
  console.log(`→ ${outPath}`)
}

main()
