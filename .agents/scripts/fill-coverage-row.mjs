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
// cells, rewrites the file, and runs prettier --write on it. Cells are
// positional: | Clause | Planned approach | Test | What is asserted |.
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"

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
const cells = lines[index].split("|")
if (cells.length < 5) {
  console.error(`row for ${clause} does not have 4 cells — is this the coverage table?`)
  process.exit(1)
}
if (opts.planned) cells[2] = ` ${opts.planned} `
if (opts.test) cells[3] = ` ${opts.test} `
if (opts.asserted) cells[4] = ` ${opts.asserted} `
lines[index] = cells.join("|")
writeFileSync(file, lines.join("\n"))
execFileSync("npx", ["prettier", "--write", file], { stdio: "inherit" })
console.log(`filled ${clause} in ${file}`)
