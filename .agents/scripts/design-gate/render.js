// render.js — render a design (HTML file / raw HTML / URL) in headless Chromium and extract
// the raw perception facts the gate reasons over: a screenshot + computed-style facts.
//
//   node scripts/render.js --file path/to/design.html [--out tests/output/name] [--width 1280]
//   node scripts/render.js --url http://localhost:3000 --out tests/output/name
//   node scripts/render.js --url http://localhost:3100/game/<id> --cookie "cambio_session=<v>" \
//     [--api-origin http://localhost:3001] --out tests/output/name   (authenticated screens)
//   node scripts/render.js --html '<div>...</div>' --out tests/output/name
//
// Emits  <out>.png  (screenshot)  and  <out>.facts.json  (structured facts).
// JSX is not handled directly here — wrap/build it to HTML first (see docs); plain HTML is direct.

import { chromium } from "playwright"
import { writeFileSync, readFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"

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

// Runs INSIDE the page. Collects text contrast inputs, interactive sizes, palette, spacing scale.
function extractFacts() {
  const visible = (el) => {
    const s = getComputedStyle(el)
    if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0)
      return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }

  const alphaOf = (rgb) => {
    const m = rgb.match(/rgba?\(([^)]+)\)/)
    if (!m) return 1
    const parts = m[1].split(/[,/\s]+/).filter(Boolean)
    return parts[3] !== undefined ? parseFloat(parts[3]) : 1
  }

  // Resolve the effective background behind an element by walking ancestors.
  // Returns {color, overlays[]} for a solid bg (overlays = translucent layers in front, nearest-first
  // — hardcheck composites them), or {indeterminate, reason} when a gradient/image sits behind.
  const resolveBackground = (el) => {
    const overlays = []
    let node = el
    while (node && node !== document.documentElement.parentElement) {
      const s = getComputedStyle(node)
      if (s.backgroundImage && s.backgroundImage !== "none") {
        const reason = /gradient/i.test(s.backgroundImage) ? "gradient" : "image"
        return { indeterminate: true, reason, overlays }
      }
      const bg = s.backgroundColor
      if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
        if (alphaOf(bg) >= 1) return { color: bg, overlays }
        overlays.push(bg) // translucent (e.g. glass) — keep walking to find what's behind
      }
      node = node.parentElement
    }
    return { color: "rgb(255, 255, 255)", overlays } // assume white canvas
  }

  // Decorative text (aria-hidden / role=presentation) is exempt from contrast — e.g. a ghosted
  // background numeral. Proper a11y marks it hidden; a controlled break should.
  const isDecorative = (el) =>
    !!el.closest('[aria-hidden="true"], [role="presentation"], [role="none"]')

  const hasDirectText = (el) => {
    for (const n of el.childNodes)
      if (n.nodeType === 3 && n.textContent.trim().length > 1) return true
    return false
  }

  const cssPath = (el) => {
    const parts = []
    let node = el
    while (node && node.nodeType === 1 && parts.length < 4) {
      let sel = node.tagName.toLowerCase()
      if (node.id) {
        sel += `#${node.id}`
        parts.unshift(sel)
        break
      }
      if (node.className && typeof node.className === "string") {
        const c = node.className.trim().split(/\s+/).slice(0, 2).join(".")
        if (c) sel += `.${c}`
      }
      parts.unshift(sel)
      node = node.parentElement
    }
    return parts.join(" > ")
  }

  const textSamples = []
  const interactive = []
  const colors = new Set()
  const spacings = new Set()
  const fonts = new Set()
  const radii = new Set()

  const all = Array.from(document.querySelectorAll("*"))
  for (const el of all) {
    if (!visible(el)) continue
    const s = getComputedStyle(el)

    if (s.fontFamily) fonts.add(s.fontFamily.split(",")[0].replace(/["']/g, "").trim())
    for (const c of [s.color, s.backgroundColor, s.borderColor]) {
      if (c && c !== "transparent" && c !== "rgba(0, 0, 0, 0)") colors.add(c)
    }
    for (const v of [
      s.paddingTop,
      s.paddingLeft,
      s.marginTop,
      s.marginLeft,
      s.gap,
      s.rowGap,
      s.columnGap,
    ]) {
      const n = parseFloat(v)
      if (n > 0) spacings.add(Math.round(n))
    }
    const br = parseFloat(s.borderRadius)
    if (br > 0) radii.add(Math.round(br))

    if (hasDirectText(el) && !isDecorative(el)) {
      const bg = resolveBackground(el)
      textSamples.push({
        path: cssPath(el),
        text: el.textContent.trim().slice(0, 40),
        color: s.color,
        fontSize: parseFloat(s.fontSize),
        fontWeight: s.fontWeight,
        background: bg,
      })
    }

    const tag = el.tagName.toLowerCase()
    const role = el.getAttribute("role")
    const isInteractive =
      ["a", "button", "input", "select", "textarea"].includes(tag) ||
      ["button", "link", "checkbox", "radio", "switch", "tab"].includes(role) ||
      el.hasAttribute("onclick")
    if (isInteractive) {
      const r = el.getBoundingClientRect()
      interactive.push({
        path: cssPath(el),
        tag,
        role: role || null,
        width: Math.round(r.width),
        height: Math.round(r.height),
        text: el.textContent.trim().slice(0, 30),
      })
    }
  }

  // de-dupe text samples (cap to keep payload reasonable)
  const seen = new Set()
  const dedupText = textSamples
    .filter((t) => {
      const k = t.color + "|" + t.fontSize + "|" + JSON.stringify(t.background)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .slice(0, 120)

  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    sectionCount: document.querySelectorAll("section").length,
    textSamples: dedupText,
    interactive: interactive.slice(0, 120),
    palette: Array.from(colors),
    spacingScale: Array.from(spacings).sort((a, b) => a - b),
    radii: Array.from(radii).sort((a, b) => a - b),
    fonts: Array.from(fonts),
  }
}

async function main() {
  const args = parseArgs(process.argv)
  const out = resolve(String(args.out || "tests/output/render"))
  const width = parseInt(args.width || "1280", 10)
  const height = parseInt(args.height || "900", 10)
  mkdirSync(dirname(out), { recursive: true })

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })

  // --cookie "name=value": render an authenticated screen (CAM-18 lesson —
  // most real screens sit behind a session). The cookie is set for the page
  // URL's origin AND for --api-origin (default http://localhost:3001), so
  // in-page fetches with credentials carry it too. URL mode only.
  if (args.cookie && args.url) {
    const eq = String(args.cookie).indexOf("=")
    if (eq < 1) {
      console.error('--cookie must be "name=value"')
      process.exit(2)
    }
    const name = String(args.cookie).slice(0, eq)
    const value = String(args.cookie).slice(eq + 1)
    const apiOrigin = String(args["api-origin"] || "http://localhost:3001")
    await context.addCookies([
      { name, value, url: new URL(String(args.url)).origin },
      { name, value, url: apiOrigin },
    ])
  }

  const page = await context.newPage()

  try {
    if (args.url) {
      await page.goto(String(args.url), { waitUntil: "networkidle" })
    } else if (args.file) {
      const html = readFileSync(resolve(String(args.file)), "utf8")
      await page.setContent(html, { waitUntil: "networkidle" })
    } else if (args.html) {
      await page.setContent(String(args.html), { waitUntil: "networkidle" })
    } else {
      console.error("Provide --file, --url, or --html")
      process.exit(2)
    }
    await page.waitForTimeout(250)

    const facts = await page.evaluate(extractFacts)
    facts.source = args.file || args.url || "(inline html)"
    await page.screenshot({ path: `${out}.png`, fullPage: true })
    writeFileSync(`${out}.facts.json`, JSON.stringify(facts, null, 2))
    console.log(`rendered → ${out}.png  +  ${out}.facts.json`)
    console.log(
      `  ${facts.textSamples.length} text samples · ${facts.interactive.length} interactive · ${facts.palette.length} colors · ${facts.fonts.length} fonts`,
    )
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
