// Unit + smoke tests for coverage-table shape detection (CAM-28).
// Run: node .agents/scripts/fill-coverage-row.test.mjs
// No framework, no deps beyond node itself.
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fillRow } from "./fill-coverage-row.mjs"

let passed = 0,
  failed = 0
function check(name, cond) {
  if (cond) {
    passed++
  } else {
    failed++
    console.error(`  ✗ ${name}`)
  }
}

const split = (line) => line.split("|")

// --- 3-column shape (current template) ---
const header3 = split("| Clause | Test (file + name) | What is asserted |")
const row3 = split("| 1.1 | planned: will test via foo.test.ts | |")

check(
  "3-column: --test/--asserted fills the right two cells, stays 3 columns",
  (() => {
    const { cells, error } = fillRow(header3, row3, {
      test: "foo.test.ts > does the thing",
      asserted: "the thing happens",
    })
    return (
      !error &&
      cells.length === row3.length &&
      cells[2].trim() === "foo.test.ts > does the thing" &&
      cells[3].trim() === "the thing happens"
    )
  })(),
)

check(
  "3-column: Clause cell is untouched",
  fillRow(header3, row3, { test: "x", asserted: "y" }).cells[1] === row3[1],
)

check(
  "3-column: --planned is a usage error, not a guess",
  (() => {
    const { cells, error } = fillRow(header3, row3, { planned: "some note" })
    return cells === undefined && typeof error === "string" && error.includes("Planned-approach")
  })(),
)

// --- 4-column shape (legacy plans: CAM-3 through CAM-10, CAM-20) ---
const header4 = split("| Clause | Planned approach | Test | Asserted |")
const row4 = split("| 1.1 | do X | | |")

check(
  "4-column: --planned/--test/--asserted fills all three, stays 4 columns (regression)",
  (() => {
    const { cells, error } = fillRow(header4, row4, {
      planned: "do X",
      test: "foo.test.ts > does the thing",
      asserted: "the thing happens",
    })
    return (
      !error &&
      cells.length === row4.length &&
      cells[2].trim() === "do X" &&
      cells[3].trim() === "foo.test.ts > does the thing" &&
      cells[4].trim() === "the thing happens"
    )
  })(),
)

check(
  "4-column: --test/--asserted without --planned leaves the planned cell untouched, doesn't shift",
  (() => {
    const filledRow4 = split("| 1.1 | do X | | |")
    const { cells, error } = fillRow(header4, filledRow4, {
      test: "foo.test.ts > does the thing",
      asserted: "the thing happens",
    })
    return (
      !error &&
      cells[2] === filledRow4[2] &&
      cells[3].trim() === "foo.test.ts > does the thing" &&
      cells[4].trim() === "the thing happens"
    )
  })(),
)

// --- unsupported shapes ---
check(
  "2-column header: clear error, no cells returned",
  (() => {
    const header2 = split("| Clause | Asserted |")
    const { cells, error } = fillRow(header2, split("| 1.1 | |"), { asserted: "y" })
    return cells === undefined && typeof error === "string" && error.includes("unsupported")
  })(),
)

check(
  "5-column header: clear error, no cells returned",
  (() => {
    const header5 = split("| Clause | A | B | C | D |")
    const { cells, error } = fillRow(header5, split("| 1.1 | | | | |"), { test: "y" })
    return cells === undefined && typeof error === "string" && error.includes("unsupported")
  })(),
)

// --- end-to-end smoke: the exact shape of the original bug report ---
// Pure-function tests above can't see the file-read/write/prettier path;
// this round-trips a real file through the unmodified CLI.
const scriptPath = new URL("./fill-coverage-row.mjs", import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), "fill-coverage-row-test-"))
const planFile = join(dir, "plan.md")
writeFileSync(
  planFile,
  [
    "# test",
    "",
    "## Contract coverage",
    "",
    "| Clause | Test (file + name) | What is asserted |",
    "| ------ | ------------------- | ----------------- |",
    "| 1.1 | planned: will test via foo.test.ts | |",
    "",
  ].join("\n"),
)
execFileSync("node", [
  scriptPath,
  planFile,
  "1.1",
  "--test",
  "foo.test.ts > does the thing",
  "--asserted",
  "the thing happens",
])
const filled = readFileSync(planFile, "utf8")
const filledRow = filled.split("\n").find((line) => line.startsWith("| 1.1"))
check(
  "CLI smoke: 3-column row stays 3 cells after fill (no phantom 4th cell)",
  filledRow !== undefined && filledRow.split("|").length === header3.length,
)
check(
  "CLI smoke: Test and Asserted land in the right cells",
  filledRow !== undefined &&
    filledRow.includes("foo.test.ts > does the thing") &&
    filledRow.includes("the thing happens") &&
    !filledRow.includes("the thing happens | ") /* would indicate a 5th segment */,
)
// --- CLI-level: unchanged existing behaviors (CAM-28 F2 — these three had
// zero coverage of any kind at review time) ---
const runCli = (args) => {
  const result = spawnSync("node", [scriptPath, ...args], { encoding: "utf8" })
  return { status: result.status, stderr: result.stderr }
}

check(
  "CLI: missing args exits 2 with the usage message",
  (() => {
    const { status, stderr } = runCli([])
    return status === 2 && stderr.includes("usage: fill-coverage-row.mjs")
  })(),
)

const unchangedFile = join(dir, "unchanged.md")
writeFileSync(
  unchangedFile,
  [
    "| Clause | Test (file + name) | What is asserted |",
    "| ------ | ------------------- | ----------------- |",
    "| 1.1 | | |",
    "",
  ].join("\n"),
)
const beforeUnchanged = readFileSync(unchangedFile, "utf8")

check(
  "CLI: clause not found exits 1 with a clear message, file untouched",
  (() => {
    const { status, stderr } = runCli([unchangedFile, "9.9", "--test", "x", "--asserted", "y"])
    return (
      status === 1 &&
      stderr.includes('no coverage row starts with "| 9.9 "') &&
      readFileSync(unchangedFile, "utf8") === beforeUnchanged
    )
  })(),
)

check(
  "CLI: nothing-to-fill exits 2, file untouched",
  (() => {
    const { status, stderr } = runCli([unchangedFile, "1.1"])
    return (
      status === 2 &&
      stderr.includes("nothing to fill") &&
      readFileSync(unchangedFile, "utf8") === beforeUnchanged
    )
  })(),
)

// --- CLI-level: the header-not-found path this diff introduced (no
// contract clause named it, and it had no test at any level at review time) ---
const noHeaderFile = join(dir, "no-header.md")
writeFileSync(noHeaderFile, "| 1.1 | | |\n")

check(
  "CLI: a coverage row with no header above it exits 1 with a clear message",
  (() => {
    const { status, stderr } = runCli([noHeaderFile, "1.1", "--test", "x", "--asserted", "y"])
    return status === 1 && stderr.includes("could not find the header row")
  })(),
)

// --- CLI-level: symlink invocation (CAM-28 F1 regression test) ---
// import.meta.url is resolved through symlinks by Node, but process.argv[1]
// isn't — comparing them directly used to make main() silently never run
// when the script was invoked via a symlink (exit 0, no output, file
// untouched). Exercises the realpathSync fix directly, through the exact
// invocation shape that broke.
const linkedScript = join(dir, "linked.mjs")
symlinkSync(scriptPath, linkedScript)
const symlinkFile = join(dir, "symlink.md")
writeFileSync(
  symlinkFile,
  [
    "| Clause | Test (file + name) | What is asserted |",
    "| ------ | ------------------- | ----------------- |",
    "| 1.1 | | |",
    "",
  ].join("\n"),
)
const symlinkResult = spawnSync(
  "node",
  [linkedScript, symlinkFile, "1.1", "--test", "symlink test", "--asserted", "symlink assertion"],
  { encoding: "utf8" },
)
const symlinkFilled = readFileSync(symlinkFile, "utf8")
check(
  "CLI via symlink: fills the row instead of silently no-opping",
  symlinkResult.status === 0 &&
    symlinkFilled.includes("symlink test") &&
    symlinkFilled.includes("symlink assertion"),
)

rmSync(dir, { recursive: true, force: true })

console.log(`\n${failed === 0 ? "✓ ALL PASS" : "✗ FAILURES"} — ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
