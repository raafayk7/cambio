---
description: Review an implemented Linear task against its functional contract and the architecture skills
argument-hint: CAM-xxx [extra instructions…]
---

> **Arguments:** the issue id is `$1` — the first whitespace-delimited token
> of the invocation. Every `$1` below means that id and nothing else. The
> full invocation was “$ARGUMENTS”; anything in it beyond the id is the
> user's accompanying instruction — honor it alongside or after this
> workflow, and never substitute it into ids, file paths, branch names, or
> Linear lookups. (A multi-line invocation once expanded into every id slot
> of this template and produced garbled paths — this rule is the fix.)

Review the implementation of **$1** on two axes: does it satisfy the
plan's functional contract, and does it conform to this repo's architecture.
This command is conformance-focused; generic bug-hunting is `/code-review`'s
job and can be run separately.

## 1. Load

Read `docs/plans/root/$1.md` (the Functional Contract and Validation
sections are the review baseline), the child plans, referenced ADRs, and the
diff of the work: the task branch against the current release branch (per
the Linear ["Release
History"](https://linear.app/raafayk7/document/release-history-932e3ba2f8c1)
document, MCP `get_document` id `release-history-932e3ba2f8c1`), e.g.
`git diff release-v0...HEAD`,
plus any uncommitted changes. If there is no root plan, stop and say so.

## 2. Fan out reviewers

For **each side the task touched** (backend and/or frontend), launch two
read-only subagents in parallel — four total for fullstack:

- **Contract reviewer:** receives the root plan's Functional Contract +
  acceptance criteria and the relevant diff. For each contract statement,
  verdict: satisfied / violated / not verifiable, with file:line evidence.
  The child plan's Contract coverage table is the starting checklist —
  verify each mapped test actually pins its clause and flag unmapped
  clauses; do not grade coverage by grepping clause ids out of test titles.
  Also flags implemented behavior the contract never asked for.
- **Architecture reviewer:** receives the diff and the governing skills
  (`architecture` plus the layer skills for the files touched; always
  include `hidden-information` if any client-facing payload, contracts
  schema, or realtime code changed). Treats each skill rule as a checklist
  item; reports violations with file:line and the rule violated. Import
  boundaries, purity of domain, ports placement, typed errors, soft-delete
  discipline, and never-send-it-at-all are the recurring high-value checks.

## 3. Verify independently

While reviewers run, execute the gate and the plan's validation commands
yourself: `pnpm turbo build typecheck lint test` plus anything the
Validation section lists. Reviewer claims about tests are not evidence;
command output is.

**A turbo cache hit is not a fresh run.** After a passing `/implement`, the
gate's `test` task is cached, so a plain `pnpm turbo … test` may report green
without executing anything — which means the container-dependent suites
(Postgres, and any realtime/broadcast integration tests) did not actually
run against live infrastructure this cycle. Force those to execute: bring the
containers up, then `pnpm turbo test --filter=<pkg> --force` (or the package's
own `vitest run`) for every side whose suite needs infra. Treat a cached
result as unverified until you have re-run it fresh at least once during the
review. If the plan's Validation section names knobs (e.g. a raised
simulation/adversarial count), run at least one pass with the knob raised.

**Timing and concurrency claims need an executed probe.** A finding, fix,
or verdict about timer, queue, clock, or race behavior must be backed by
at least one probe actually run against the real code (a throwaway test,
deleted after) — never code reading alone. CAM-7's reviewers audited the
timer logic hard from source and were sound as far as reading goes; a
five-minute probe then found a zero-duration-timer behavior none of them
could see, which had three assertions passing on scheduling margins.

## 4. Adjudicate and report

Merge findings, deduplicate, and verify each finding yourself before
reporting it — read the code; drop anything that doesn't hold up. Rank:
contract violations and hidden-information leaks first, then architecture
violations, then deviations-not-logged, then advisory notes.

When a finding is "a document claims X falsely", report the **claim**, not
the citation: grep every plan doc and ADR the task touches for all
phrasings of X and list each instance in the finding. A later fix cycle
fixes cited lines and misses the rest (CAM-4's fix cycle missed a fourth
instance of a three-instance finding); whoever fixes it must re-run the
same sweep before closing, and a re-review verifies the sweep, not the
spot-fix.

**Skill staleness sweep:** if any finding revealed a skill or command
stating something the code now contradicts, fix that sentence in this
cycle's scope or file a harness issue for it — a flagged-but-unowned stale
skill is a finding without a fix, and skills are the docs every future
session trusts blindly.

Write the results into the root plan's **Outcomes & Retrospective** section
(what passed, findings, anything deferred). Post a Linear comment on
$1 with the verdict; if the verdict is ship, move the issue to
**Development Done**, otherwise leave it in **In Progress** for the fix
cycle. Then report to the user: overall verdict first
(ship / fix-then-ship / re-plan), findings with evidence, and what you ran.
Do not fix findings in this command — the user decides what gets addressed.
On a ship verdict, suggest `/ship $1` as the next step.
