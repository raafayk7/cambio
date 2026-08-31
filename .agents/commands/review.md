---
description: Review an implemented Linear task against its functional contract and the architecture skills
argument-hint: CAM-xxx
---

Review the implementation of **$ARGUMENTS** on two axes: does it satisfy the
plan's functional contract, and does it conform to this repo's architecture.
This command is conformance-focused; generic bug-hunting is `/code-review`'s
job and can be run separately.

## 1. Load

Read `docs/plans/root/$ARGUMENTS.md` (the Functional Contract and Validation
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

## 4. Adjudicate and report

Merge findings, deduplicate, and verify each finding yourself before
reporting it — read the code; drop anything that doesn't hold up. Rank:
contract violations and hidden-information leaks first, then architecture
violations, then deviations-not-logged, then advisory notes.

Write the results into the root plan's **Outcomes & Retrospective** section
(what passed, findings, anything deferred). Post a Linear comment on
$ARGUMENTS with the verdict; if the verdict is ship, move the issue to
**Development Done**, otherwise leave it in **In Progress** for the fix
cycle. Then report to the user: overall verdict first
(ship / fix-then-ship / re-plan), findings with evidence, and what you ran.
Do not fix findings in this command — the user decides what gets addressed.
