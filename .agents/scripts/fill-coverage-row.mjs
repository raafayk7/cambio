#!/usr/bin/env node
// fill-coverage-row.mjs — fill one row of a child plan's Contract coverage
// table without fighting prettier's table re-padding (CAM-18 lesson: the
// reflowed column widths make Edit-tool string matches brittle; every
// session ended up hand-writing this script).
//
//   node .agents/scripts/fill-coverage-row.mjs <plan.md> <CLAUSE> \
//     --test "<file + test names>" --asserted "<one-phrase assertion>" \
//     [--planned "<replace the planned-approach cell too>"]
//
// Finds the row whose first cell is exactly <CLAUSE>, fills the named
// cells, rewrites the file, and runs prettier --write on it.
//
// Two coverage-table shapes exist in this repo (CAM-28): the current
// template (.agents/templates/child-plan.md) is 3-column —
// | Clause | Test (file + name) | What is asserted | — with the
// plan-time "planned approach" note written by hand into the Test cell.
// Older plans (CAM-3 through CAM-10, CAM-20) predate that simplification
// and use the 4-column shape — | Clause | Planned approach | Test |
// What is asserted |. The header row's cell count disambiguates the two;
// --planned only makes sense against a 4-column table, since the 3-column
// shape has no cell for it to write into.
import { execFileSync } from "node:child_process"
import { readFileSync, realpathSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

// headerCells / rowCells: the raw `line.split("|")` arrays, so each has a
// leading and trailing "" from the outer pipes (a 3-column row is 5 cells,
// a 4-column row is 6). Returns { cells } on success or { error } on
// failure; never throws — the CLI decides how to report.
export function fillRow(headerCells, rowCells, opts) {
  const columns = headerCells.length - 2
  if (columns !== 3 && columns !== 4) {
    return {
      error: `unsupported coverage table shape: header has ${columns} columns, expected 3 (Clause | Test | Asserted) or 4 (Clause | Planned approach | Test | Asserted)`,
    }
  }
  if (opts.planned && columns === 3) {
    return {
      error:
        "this table has no separate Planned-approach column (3-column shape) — the planned-approach note belongs hand-written in the Test cell, not passed via --planned",
    }
  }
  const cells = [...rowCells]
  if (columns === 3) {
    if (opts.test) cells[2] = ` ${opts.test} `
    if (opts.asserted) cells[3] = ` ${opts.asserted} `
  } else {
    if (opts.planned) cells[2] = ` ${opts.planned} `
    if (opts.test) cells[3] = ` ${opts.test} `
    if (opts.asserted) cells[4] = ` ${opts.asserted} `
  }
  return { cells }
}

function main() {
  const [, , file, clause, ...rest] = process.argv
  if (!file || !clause) {
    console.error("usage: fill-coverage-row.mjs <plan.md> <CLAUSE> --test ... --asserted ...")
    process.exit(2)
  }
  const opts = {}
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) opts[rest[i].slice(2)] = rest[++i]
  }
  if (!opts.test && !opts.asserted && !opts.planned) {
    console.error("nothing to fill: pass --test / --asserted / --planned")
    process.exit(2)
  }

  const lines = readFileSync(file, "utf8").split("\n")
  const index = lines.findIndex((line) => line.startsWith(`| ${clause} `))
  if (index === -1) {
    console.error(`no coverage row starts with "| ${clause} " in ${file}`)
    process.exit(1)
  }
  let headerIndex = index - 1
  while (headerIndex >= 0 && !/^\s*\|[\s:|-]+\|\s*$/.test(lines[headerIndex])) headerIndex--
  headerIndex--
  if (headerIndex < 0 || !lines[headerIndex].includes("|")) {
    console.error(`could not find the header row above the coverage row for ${clause} in ${file}`)
    process.exit(1)
  }

  const headerCells = lines[headerIndex].split("|")
  const rowCells = lines[index].split("|")
  const result = fillRow(headerCells, rowCells, opts)
  if (result.error) {
    console.error(result.error)
    process.exit(1)
  }
  lines[index] = result.cells.join("|")
  writeFileSync(file, lines.join("\n"))
  execFileSync("npx", ["prettier", "--write", file], { stdio: "inherit" })
  console.log(`filled ${clause} in ${file}`)
}

// realpathSync matters here: import.meta.url is already the resolved real
// path, but process.argv[1] is whatever the caller typed — invoking the
// script through a symlink used to make this comparison false, so main()
// silently never ran (exit 0, no output, nothing written). Resolving both
// sides makes symlink invocation work like direct invocation, and a
// genuinely missing/broken argv[1] now throws loudly instead (CAM-28 F1).
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main()
