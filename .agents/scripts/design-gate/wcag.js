// Pure WCAG / hard-check math. No browser, no IO — unit-testable in isolation.
// Thresholds locked in the approved plan:
//   text contrast: 4.5:1 (normal), 3:1 (large)  | large = >=24px, or >=18.66px && weight>=700
//   UI/graphics contrast: 3:1
//   touch target: <24px min-dimension => hard fail; 24–44px => advisory; >=44px => pass
//   pass is binary (4.49:1 fails).

/** Parse a CSS color string into {r,g,b,a} (r/g/b in 0–255, a in 0–1). Returns null if unparseable. */
export function parseColor(input) {
  if (!input) return null
  const s = String(input).trim().toLowerCase()
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 }

  // #rgb / #rgba / #rrggbb / #rrggbbaa
  let m = s.match(/^#([0-9a-f]{3,8})$/i)
  if (m) {
    const h = m[1]
    const ex = (a, b) => parseInt(h.slice(a, b), 16)
    if (h.length === 3) return { r: ex(0, 1) * 17, g: ex(1, 2) * 17, b: ex(2, 3) * 17, a: 1 }
    if (h.length === 4)
      return { r: ex(0, 1) * 17, g: ex(1, 2) * 17, b: ex(2, 3) * 17, a: (ex(3, 4) * 17) / 255 }
    if (h.length === 6) return { r: ex(0, 2), g: ex(2, 4), b: ex(4, 6), a: 1 }
    if (h.length === 8) return { r: ex(0, 2), g: ex(2, 4), b: ex(4, 6), a: ex(6, 8) / 255 }
  }
  // rgb()/rgba() — both comma and space syntaxes
  m = s.match(/^rgba?\(([^)]+)\)$/)
  if (m) {
    const parts = m[1].split(/[,/\s]+/).filter(Boolean)
    if (parts.length >= 3) {
      const chan = (v) =>
        v.endsWith("%") ? Math.round((parseFloat(v) / 100) * 255) : parseFloat(v)
      const a =
        parts[3] !== undefined
          ? parts[3].endsWith("%")
            ? parseFloat(parts[3]) / 100
            : parseFloat(parts[3])
          : 1
      return { r: chan(parts[0]), g: chan(parts[1]), b: chan(parts[2]), a }
    }
  }
  return null // hsl(), named colors, gradients handled upstream
}

/** Alpha-composite a foreground color over an opaque background. Returns opaque {r,g,b}. */
export function composite(fg, bg) {
  const a = fg.a ?? 1
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
  }
}

/** WCAG relative luminance for an opaque {r,g,b} (0–255). */
export function relativeLuminance({ r, g, b }) {
  const lin = (c) => {
    const cs = c / 255
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio between two opaque colors. Returns a number >= 1. */
export function contrastRatio(c1, c2) {
  const l1 = relativeLuminance(c1)
  const l2 = relativeLuminance(c2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Is this text "large" per WCAG? sizePx is computed px; weight is numeric (400/700/...). */
export function isLargeText(sizePx, weight = 400) {
  if (sizePx >= 24) return true
  if (sizePx >= 18.66 && Number(weight) >= 700) return true
  return false
}

/** Verdict for a text contrast measurement. Returns {pass, required, ratio, level}. */
export function textContrastVerdict(ratio, sizePx, weight = 400) {
  const required = isLargeText(sizePx, weight) ? 3 : 4.5
  // round to 2dp the way auditors quote it, but compare on the raw value
  return {
    ratio: Math.round(ratio * 100) / 100,
    required,
    pass: ratio >= required,
    level: "AA",
  }
}

/** Touch-target verdict from the smaller of width/height (px). */
export function touchTargetVerdict(width, height) {
  const min = Math.min(width, height)
  if (min < 24) return { min: Math.round(min), verdict: "fail", tier: "constraint" }
  if (min < 44) return { min: Math.round(min), verdict: "advisory", tier: "advisory" }
  return { min: Math.round(min), verdict: "pass", tier: null }
}
