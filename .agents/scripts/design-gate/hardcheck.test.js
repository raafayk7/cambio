// Unit tests for the WCAG / hard-check math. Run: node scripts/hardcheck.test.js
// No browser, no deps — pure-function verification of the constraint-tier thresholds.
import {
  parseColor,
  composite,
  contrastRatio,
  isLargeText,
  textContrastVerdict,
  touchTargetVerdict,
} from "./wcag.js"

let passed = 0,
  failed = 0
const approx = (a, b, eps = 0.01) => Math.abs(a - b) <= eps
function check(name, cond) {
  if (cond) {
    passed++
  } else {
    failed++
    console.error(`  ✗ ${name}`)
  }
}

// --- parseColor ---
check(
  "parse #fff",
  JSON.stringify(parseColor("#fff")) === JSON.stringify({ r: 255, g: 255, b: 255, a: 1 }),
)
check(
  "parse #000000",
  JSON.stringify(parseColor("#000000")) === JSON.stringify({ r: 0, g: 0, b: 0, a: 1 }),
)
check(
  "parse rgb(255,0,0)",
  (() => {
    const c = parseColor("rgb(255, 0, 0)")
    return c.r === 255 && c.g === 0 && c.b === 0 && c.a === 1
  })(),
)
check(
  "parse rgba alpha",
  (() => {
    const c = parseColor("rgba(0,0,0,0.5)")
    return c.a === 0.5
  })(),
)
check(
  "parse space/slash syntax",
  (() => {
    const c = parseColor("rgb(0 0 0 / 50%)")
    return c.r === 0 && c.a === 0.5
  })(),
)
check("parse transparent", parseColor("transparent").a === 0)

// --- composite ---
check(
  "composite 50% black over white ~128",
  approx(composite(parseColor("rgba(0,0,0,0.5)"), parseColor("#fff")).r, 128, 1),
)

// --- contrast ratio ---
check("black/white = 21", approx(contrastRatio(parseColor("#000"), parseColor("#fff")), 21, 0.05))
check("white/white = 1", approx(contrastRatio(parseColor("#fff"), parseColor("#fff")), 1, 0.001))
check(
  "#767676 on white ~ 4.54 (passes)",
  (() => {
    const r = contrastRatio(parseColor("#767676"), parseColor("#fff"))
    return r >= 4.5 && r < 4.6
  })(),
)
check(
  "#777 on white ~ 4.48 (fails)",
  (() => {
    const r = contrastRatio(parseColor("#777777"), parseColor("#fff"))
    return r < 4.5
  })(),
)

// --- large text classification ---
check("24px/400 is large", isLargeText(24, 400) === true)
check("23px/400 is NOT large", isLargeText(23, 400) === false)
check("19px/700 is large", isLargeText(19, 700) === true)
check("18px/700 is NOT large", isLargeText(18, 700) === false)

// --- text contrast verdict: the canonical 4.49 fail / 4.5 pass boundary ---
check("ratio 4.49 normal text FAILS", textContrastVerdict(4.49, 16, 400).pass === false)
check("ratio 4.5 normal text PASSES", textContrastVerdict(4.5, 16, 400).pass === true)
check("ratio 3.0 large text PASSES", textContrastVerdict(3.0, 30, 400).pass === true)
check("ratio 2.99 large text FAILS", textContrastVerdict(2.99, 30, 400).pass === false)
check(
  "required is 3 for large, 4.5 for normal",
  textContrastVerdict(5, 30, 400).required === 3 &&
    textContrastVerdict(5, 16, 400).required === 4.5,
)

// --- touch targets: 23 fail / 24 advisory / 30 advisory / 44 pass ---
check("23px target FAILS (constraint)", touchTargetVerdict(23, 100).verdict === "fail")
check("24px target ADVISORY", touchTargetVerdict(24, 100).verdict === "advisory")
check("30px target ADVISORY", touchTargetVerdict(30, 100).verdict === "advisory")
check("44px target PASSES", touchTargetVerdict(44, 100).verdict === "pass")
check("uses smaller dimension", touchTargetVerdict(100, 20).verdict === "fail")

console.log(`\n${failed === 0 ? "✓ ALL PASS" : "✗ FAILURES"} — ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
