// PostToolUse(Write|Edit) hook for the design-gate plugin.
// When a gateable UI artifact is produced, nudges Claude to run the gate — so the gate fires
// without the user invoking anything. It does NOT render here (that would re-run on every save);
// the gate skill renders once, deliberately. Bulletproof: any error → exit 0, never block.
import { readFileSync } from "node:fs"

function done(obj) {
  if (obj) process.stdout.write(JSON.stringify(obj))
  process.exit(0)
}

try {
  let raw = ""
  try {
    raw = readFileSync(0, "utf8")
  } catch {
    /* no stdin */
  }
  const data = JSON.parse(raw || "{}")
  const fp = data?.tool_input?.file_path || data?.tool_input?.path || ""
  if (!fp) done()

  const lc = fp.toLowerCase()
  const isHtml = lc.endsWith(".html") || lc.endsWith(".htm")
  const isComp = lc.endsWith(".jsx") || lc.endsWith(".tsx")
  // ignore tests/config/type-defs and non-UI files
  if (!isHtml && !isComp) done()
  if (/\.(test|spec|stories|config|d)\.[jt]sx?$/.test(lc)) done()

  const name = fp.split("/").pop()
  const how = isHtml
    ? `run the \`gate\` skill on this file — it renders the page, runs the WCAG/touch/token hard-checks, then decompose→map→judge`
    : `if a rendered preview or dev URL is available, run the \`gate\` skill against it (JSX/TSX needs a running build to render; otherwise do a visual review against the rubric and flag obvious slop)`

  done({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext:
        `[design-gate] A UI artifact (${name}) was just produced. Before it ships, ${how}. ` +
        `Surface the verdict to the user inline — pass, or flagged with the located fixes — and do NOT hard-block; the person decides.`,
    },
  })
} catch {
  process.exit(0)
}
