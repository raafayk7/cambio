# CAM-28 — fill-coverage-row.mjs corrupts 3-column coverage tables

- **Linear:** [CAM-28](https://linear.app/raafayk7/issue/CAM-28)
- **Scope:** harness/tooling _(neither backend nor frontend — a single script
  under `.agents/scripts/`, lands on `main` per ADR-0028; see [[Decision
  log]](#decision-log))_
- **ADRs:** none needed — this is a bugfix to existing plan-tooling
  detection logic, not a new pattern, library choice, or HANDOFF §9
  resolution. Doesn't meet the `adr` skill's bar; the design call (count-based
  autodetect vs. header-name matching) is recorded in the Decision log
  instead.

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, `node .agents/scripts/fill-coverage-row.mjs <plan.md> <CLAUSE> --test … --asserted …` fills a coverage-table row correctly regardless of whether the table has the 3-column shape (`Clause | Test | Asserted`, what nearly every plan doc actually uses) or the legacy 4-column shape (`Clause | Planned approach | Test | Asserted`, what the script's own comment assumed). Today it silently corrupts 3-column rows into malformed 4-cell rows under a 3-column header. Observe it working by running the script against a scratch 3-column table (reproduction steps below) and confirming the row stays 3 cells with the right content in the right place.

## Context & orientation

- **The bug, reproduced during planning** (scratch files under
  `/tmp/.../scratchpad`, not committed): a 3-column table
  (`| Clause | Test (file + name) | What is asserted |`) run through the
  unmodified script with `--test "…" --asserted "…"` produces:

  ```
  | 1.1    | planned: will test via foo.test.ts | foo.test.ts > does the thing | the thing happens |
  ```

  a 4-cell row under a 3-column header — `--test`'s value landed in what was
  the (empty) Asserted cell, and `--asserted`'s value became a phantom fifth
  segment after the closing pipe. Also confirmed the legacy 4-column header
  shape (`Clause`, `Planned approach`, `Test`, `Asserted`) still fills
  correctly today — that's the regression baseline this fix must not break.

- **[fill-coverage-row.mjs](../../../.agents/scripts/fill-coverage-row.mjs)**
  — the only file this task touches. It's a positional cell-splice script:
  splits the matched row on `|`, assumes `cells[2]/cells[3]/cells[4]` are
  Planned/Test/Asserted (4-column layout) unconditionally, and rejects rows
  with fewer than 5 pipe-delimited segments (`cells.length < 5`) — which is
  exactly why a 3-column row (4 segments) _should_ already fail loudly but
  doesn't: 4 segments is `< 5`, so today's guard should catch it... **but it
  doesn't**, because a 3-column markdown row still parses to 5 segments
  (`"" | Clause | Test | Asserted | ""` — leading and trailing empty strings
  from the outer pipes). The guard only rules out rows with _no_ pipes at
  all; it can't distinguish 3-column from 4-column. This is the root cause,
  not a separate bug — the fix is column-shape detection, not a stricter
  count check.

- **Callers**, both must keep working unchanged:
  - [.agents/commands/implement.md:57-60](../../../.agents/commands/implement.md)
    — the only documented caller, always passes `--test`/`--asserted`, never
    `--planned`.
  - [.agents/templates/child-plan.md:42-56](../../../.agents/templates/child-plan.md)
    — the current template's coverage table is **3-column only**
    (`| Clause | Test (file + name) | What is asserted |`); the
    "planned-approach note" it describes is written by hand into the Test
    cell at plan time, not via a script flag. The 4-column shape only
    survives in already-closed-out plans from before this template
    simplified (CAM-3 through CAM-10, CAM-20) — none of those need re-editing,
    but the script should stay correct for them since the issue explicitly
    asks for shape detection, not a one-way migration.
  - No other file in the repo references this script
    (`grep -rln fill-coverage-row .agents/ docs/` → only the script itself and
    `implement.md`).

- **Test convention for `.agents/scripts/`**: no framework — see
  [.agents/scripts/design-gate/hardcheck.test.js](../../../.agents/scripts/design-gate/hardcheck.test.js)
  (plain `node file.test.js`, hand-rolled `check(name, cond)` counter, pure
  functions imported and exercised directly) and
  [.agents/hooks/block-piped-gate.test.sh](../../../.agents/hooks/block-piped-gate.test.sh)
  (same idea, shell). This task follows the `.test.js`-import pattern, which
  means extracting the cell-mapping logic out of the top-level CLI body into
  importable functions (see Plan of work).

- **Harness routing (ADR-0028):** `.agents/scripts/fill-coverage-row.mjs` is
  byte-identical between `main` and `release-v0` (verified during planning:
  `git diff origin/main origin/release-v0 -- .agents/scripts/fill-coverage-row.mjs`
  → empty), so the guard rail clears and this change lands directly on
  `main`, no task branch, no PR — same routing CAM-14 used. Close-out must
  include the merge-down (`main` → `development` → `release-v0`) and a
  fresh-session smoke test on `release-v0`, per ADR-0028's consequences.

## Functional contract

1. **3-column table, `--test`/`--asserted`:** given a coverage table with
   header `| Clause | Test (file + name) | What is asserted |`, running the
   script with `--test "T" --asserted "A"` against a matching clause row
   fills exactly the Test and Asserted cells (row stays 3 cells / 4
   pipe-delimited segments after fill) and leaves any existing content in
   the Clause cell untouched.
2. **4-column table, `--planned`/`--test`/`--asserted` (regression):** given
   a coverage table with header
   `| Clause | Planned approach | Test | Asserted |`, running the script
   with any combination of `--planned`/`--test`/`--asserted` fills exactly
   those named cells (row stays 4 cells / 5 segments) — unchanged from
   today's correct behavior.
3. **4-column table, `--test`/`--asserted` only:** on a 4-column table,
   omitting `--planned` leaves the Planned-approach cell's existing content
   untouched and still fills Test/Asserted in the right cells (not shifted
   left by the missing flag).
4. **`--planned` on a 3-column table is a usage error, not a guess:**
   passing `--planned` against a 3-column table exits non-zero with a
   message explaining the table has no separate Planned-approach column
   (the note belongs in the Test cell, written by hand) — it does not
   silently drop the flag or splice it into another cell.
5. **Unsupported column count still fails loudly:** a header row that is
   neither 3 nor 4 columns produces a clear non-zero-exit error naming the
   two supported shapes, not a silent corrupt write.
6. **Unchanged existing behaviors:** missing `<plan.md>`/`<CLAUSE>` args,
   clause not found in the file, and "nothing to fill" (`--test`/`--asserted`/
   `--planned` all omitted) keep today's exit codes and messages.
7. **Formatting:** after a successful fill, the script still runs
   `prettier --write` on the file (unchanged).

### Acceptance criteria

- [x] All seven contract clauses above hold, demonstrated by
      `.agents/scripts/fill-coverage-row.test.mjs`
      (`✓ ALL PASS — 9 passed, 0 failed`).
- [x] The scratch repro from planning (3-column table +
      `--test`/`--asserted`) re-run post-fix produces a correctly-shaped
      3-cell row, not the 4-cell corruption documented above.
- [x] The 4-column regression case (also reproduced during planning) still
      fills correctly.
- [x] `pnpm turbo build typecheck lint test` passes — 19/19 tasks green,
      including the repo-wide `//:format:check` (prettier) leg.
- [ ] Close-out: merge-down `main` → `development` → `release-v0` completed,
      and a fresh session on `release-v0` can run the script against a
      3-column table without corruption (ADR-0028 close-out requirement).

## Plan of work

Single milestone, single file plus its test — no lanes, no parallelization.

1. **Refactor `fill-coverage-row.mjs` for shape detection**, in place:
   - Extract the row-mutation logic out of the top-level script body into a
     pure, exported function — something like
     `fillRow(headerCells, rowCells, opts)` — that: (a) counts the header's
     content cells to decide 3-column vs. 4-column (a 3-column markdown
     header line splits to 5 `|`-delimited segments counting the two outer
     empties, a 4-column header to 6), (b) maps `--test`/`--asserted` (and
     `--planned` for 4-column only) onto the correct positional indices for
     that shape, (c) returns a clear error descriptor (not a thrown
     exception the CLI has to guess about) for: `--planned` on a 3-column
     shape, and any header shape that's neither 3 nor 4 columns.
   - Guard the script's top-level CLI logic (arg parsing, file read/write,
     the `prettier --write` call) behind an
     `import.meta.url === pathToFileURL(process.argv[1]).href` check so the
     test file can `import` the pure function without triggering a CLI run.
   - Update the header comment (currently: "Cells are positional: | Clause |
     Planned approach | Test | What is asserted |") to describe both
     supported shapes and point at the two callers in Context & orientation.
2. **Add `.agents/scripts/fill-coverage-row.test.mjs`**, following the
   `hardcheck.test.js` pattern (plain `node` script, no framework,
   hand-rolled `check(name, cond)` counter, non-zero exit on any failure):
   - Unit cases against the exported `fillRow` (or equivalently-named)
     function, covering contract clauses 1-5 directly (3-column fill,
     4-column fill with all three flags, 4-column fill without `--planned`,
     `--planned` on 3-column → error, unsupported column count → error).
   - One end-to-end smoke case that round-trips a real temp file through the
     unmodified CLI path (`execFileSync("node", [scriptPath, ...])` against a
     3-column scratch file under `os.tmpdir()`), reading the file back
     afterward to confirm the fully-integrated path (arg parsing → fill →
     write → prettier) produces the correct 3-cell row — this is the one
     case the pure-function unit tests can't cover, and it's the exact shape
     of the original bug report.
3. **Re-run the planning-time repro** (3-column and 4-column scratch cases)
   against the fixed script to confirm clauses 1 and 2 by direct
   observation, not just the test suite.
4. **Gate + close-out**: `pnpm turbo build typecheck lint test`, then the
   ADR-0028 merge-down (`main` → `development` → `release-v0`) and
   fresh-session smoke test.

## Validation

- `node .agents/scripts/fill-coverage-row.test.mjs` — all cases pass (this
  script has no wired-in CI; it's run manually, same as
  `hardcheck.test.js`/`block-piped-gate.test.sh`). Record the actual passed
  count in Progress when run.
- Manual repro re-run (step 3 above) — paste the before/after row text into
  Progress or Surprises as evidence, matching the probe-verify discipline
  this plan itself followed during planning.
- `pnpm turbo build typecheck lint test` — expected to pass; this file isn't
  part of any workspace package, so it only interacts with the gate via the
  repo-wide `prettier --check` task. Confirm that leg specifically.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-07 06:20 — Refactored `fill-coverage-row.mjs`: extracted a pure
      `fillRow(headerCells, rowCells, opts)` export that detects 3- vs
      4-column shape from header cell count, maps `--test`/`--asserted`/
      `--planned` to the right positions per shape, and returns
      `{ error }` (never throws) for `--planned` on a 3-column table or any
      unsupported column count. The CLI body now locates the header row by
      walking back from the matched row to the preceding separator line,
      then to the header above it, and is guarded behind
      `import.meta.url === pathToFileURL(process.argv[1]).href` so it
      doesn't run on import. Header comment rewritten to document both
      shapes.
- [x] 2026-09-07 06:22 — Added `.agents/scripts/fill-coverage-row.test.mjs`
      (no framework, `hardcheck.test.js` pattern): 9 checks — 3-column fill,
      Clause-cell-untouched, `--planned`-on-3-column error, 4-column fill
      with all three flags (regression), 4-column fill without `--planned`
      (no shift), 2-column and 5-column unsupported-shape errors, and two
      CLI-level smoke checks that round-trip a real temp file through the
      unmodified subprocess path. `node .agents/scripts/fill-coverage-row.test.mjs`
      → `✓ ALL PASS — 9 passed, 0 failed`.
- [x] 2026-09-07 06:24 — Re-ran the planning-time repro by hand against the
      fixed script: 3-column table + `--test`/`--asserted` now produces
      `| 1.1 | foo.test.ts > does the thing | the thing happens |` (3 cells,
      no phantom 4th segment — matches contract clause 1); the 4-column case
      still fills all three named cells correctly (clause 2, regression
      confirmed); `--planned` against the 3-column table exits 1 with the
      documented error message and leaves the file byte-for-byte unchanged
      (clause 4).

## Decision log

- 2026-09-07 — **Column-count autodetection over header-name matching** —
  the header row's cell _count_ (3 vs. 4) is enough to disambiguate the only
  two shapes that exist anywhere in the repo's history (verified: no plan
  doc currently checked out uses any other shape, and the current template
  is 3-column only). Matching on header cell _text_ ("Planned approach",
  "Asserted", etc.) would be more robust to hypothetical future header
  reword but there's no evidence that's ever happened or is planned — count
  autodetection is what the issue itself proposed, is simpler, and is fully
  sufficient for the two shapes in play.
- 2026-09-07 — **`--planned` on a 3-column table errors instead of guessing
  a destination cell** — the current template's convention is that the
  planned-approach note lives in the Test cell, written by hand at plan
  time, never through this script (`implement.md`'s documented invocation
  never passes `--planned`). Silently folding `--planned`'s value into the
  Test cell would invent behavior nothing calls for and risks clobbering the
  hand-written note already there; an explicit error is safer and matches
  "no thrown exceptions the caller can't act on" in spirit even though this
  is a CLI script, not backend code.
- 2026-09-07 — **Root plan only, no child plan** — this task touches exactly
  one file under `.agents/scripts/`, outside `apps/api` and `apps/web`
  entirely; neither the backend nor frontend layer skills apply, and there's
  no second file or cross-cutting concern that would benefit from a
  separate implementation-detail document. Confirmed with the user during
  planning (see plan-mode interview).
- 2026-09-07 — **Merge-down deferred past `/implement`'s close-out** —
  checked CAM-14 (the only prior harness task with this ADR-0028 routing):
  its final review-fix-cycle commit landed on `main` and was **already**
  present on `development`/`release-v0` by the time of inspection, with no
  merge commit in between — i.e. the merge-down happened as a fast-forward
  sometime after the full `/implement` → `/review` → fix cycle concluded on
  `main`, not as a step inside `/implement`'s close-out. Following that
  precedent: this task's merge-down + fresh-session smoke test stays
  unchecked at `/implement` close-out and is called out explicitly for
  whoever runs `/review` (or does the merge-down by hand afterward) rather
  than performed now, since running it mid-review-cycle would propagate
  code that hasn't passed review yet.

## Surprises & discoveries

_(anything found mid-implementation that the plan didn't predict — wrong
assumptions, upstream bugs, better approaches. Evidence included.)_

- 2026-09-07 (planning) — the existing `cells.length < 5` guard was
  originally assumed to be the mechanism that (incorrectly) accepts
  3-column rows; tracing it during Context & orientation showed it's not a
  near-miss threshold bug — a 3-column row _also_ produces 5 segments after
  splitting on `|` (leading/trailing empties from the outer pipes), so the
  guard is simply unable to distinguish the two shapes at all, by design.
  Worth recording so `/implement` doesn't waste time trying to "fix the
  threshold."

## Outcomes & retrospective

_(filled at the end, typically by `/review`: what shipped, what was cut,
what should carry into the next task.)_
