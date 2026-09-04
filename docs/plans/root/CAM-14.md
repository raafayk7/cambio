# CAM-14 — Frontend AI harness: architecture skill, design-gate, ai-tells, styling-stack ADR

- **Linear:** [CAM-14](https://linear.app/raafayk7/issue/CAM-14)
- **Scope:** frontend
- **Child plans:** [frontend](../frontend/CAM-14.md)
- **ADRs:** 0027 (Tailwind v4 @theme tokens), 0028 (harness lands on main),
  0029 (design tooling vendored first-party)

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, an agent session opened anywhere in the repo has the
frontend half of the AI harness: it can discover the design system, knows
the frontend architecture rules, and is watched by the design tooling
(design-gate nudge, ai-tells audit, impeccable craft linting, Emil's
animation skills). Observe it working by opening a fresh session on
`release-v0` after the merge-down and confirming the new skills load and
the design-system router answers "where do I find the button spec".

**This task deviates from normal flow (ADR-0028): all work commits
directly to `main` — no task branch, no PR against `release-v0` — and the
merge-down `main` → `development` → `release-v0` is part of the definition
of done.** The plan docs and ADRs land on `main` with the work for the
same reason: tools read the checked-out working tree.

## Context & orientation

- **Harness today:** `AGENTS.md` (frontend note at §"Frontend note" says
  frontend skills are "deliberately deferred" — CAM-14 discharges it);
  `.agents/{skills,commands,hooks,templates,settings.json}` symlinked into
  `.claude/` (`commands`, `skills`, `settings.json` only; hooks are
  referenced by `$CLAUDE_PROJECT_DIR` path from settings.json). Seven
  skills exist, all backend-side plus `adr`/`cambio-rules`.
- **Design system (CAM-13, release-v0 only):** `design-system/` — router
  `design-system.md`, 26 core components, `references/tokens.md` +
  `voice.md`, 3 pattern files. Referenced by **nothing** outside
  `docs/design/` — unreachable by an untold agent. On `main` the folder
  does not exist (it arrives via a later release merge; the routing skill
  must say so).
- **Frontend scaffold:** Tailwind v4.3.3 + `@tailwindcss/vite` already
  wired (`apps/web/vite.config.ts`, `packages/ui/src/styles.css` with a
  stock-shadcn `@theme` block marked "replace wholesale");
  TanStack Start 1.168 / Router / Query, React 19; `packages/ui` is a real
  ESLint layer (`packages/config/eslint.base.js` — `web` may import
  `contracts`+`ui`; `ui` may import nothing app-specific). `apps/web` has
  **no test script** — nothing frontend rides `turbo test` yet.
- **Vendored sources:** `docs/design/resources/ai-tells/` (Next.js-flavored
  audit skill + catalog), `docs/design/resources/design-gate-plugin.zip`
  (skills, 4 agents, Playwright render/hardcheck scripts, hooks). External:
  impeccable 4.x (Apache-2.0), emilkowalski/skills (MIT).
- **Governing docs:** HANDOFF §1 (rules, feeds PRODUCT.md), §3.1 (import
  boundary); ADR-0007 (harness structure — amended by this task),
  ADR-0008 (branching — amended by ADR-0028), ADR-0021/0023
  (viewFor/channel discipline, which the frontend skill restates for the
  client side); the `hidden-information` skill.
- **Known defects inherited and fixed en route (ADR-0029):** design-gate's
  undocumented `command`+`args` hook format; its intent-prep delegating to
  `/impeccable craft` (not a real command — real surface is
  `/impeccable init|shape|audit|polish|critique|…`); its SessionStart
  Chromium auto-download (not lifted); ai-tells' dangling references to
  three skills that don't exist here.

## Functional contract

When this task is done:

1. **AGENTS.md** has a frontend section replacing the "Frontend note"
   deferral; `## Sources of truth` lists `design-system/` (with the
   absent-on-main caveat); the `## Skills` roster lists every new skill;
   the hooks narrative in `## Development` covers the design-gate nudge;
   the stale `web :3100` port claim is corrected to the probe-verified
   actual default.
2. **A `frontend-architecture` skill** exists in `.agents/skills/`,
   follows house format (single-line description with trigger clause,
   80–120 line body), and encodes: the client is a projection renderer,
   not a second clean architecture; pages/containers/components layering
   with logic in custom hooks and data-fetching separated from
   presentation (Carbonteq portal overview + best-practices, cited);
   the `apps/web` vs `packages/ui` split; the rule that the only
   lint-enforced frontend boundary is the workspace-import row — every
   claim of the form "X is enforced" is probe-verified before being
   written (architecture skill's enforcement-claim rule). The existing
   `architecture` skill routes to it.
3. **A `design-system` routing skill** exists: routes agents into
   `design-system/design-system.md` (wraps, does not duplicate, its
   decision map); states that the design system lives on release branches
   and an absent folder means you're on `main` — don't invent; names the
   creation gate and the hidden-information design-law link.
4. **ADRs 0027/0028/0029** exist with status proposed; `docs/adr/README.md`
   indexes them; ADR-0008 carries an amendment line pointing at 0028;
   ADR-0007 carries an amendment discharging its "frontend skills
   deferred" consequence and refreshing its skill/command roster.
5. **The adapted `ai-tells` skill** lives in `.agents/skills/ai-tells/`:
   house frontmatter; every Next.js-ism replaced with TanStack Start / repo
   paths; the three dangling sibling-skill references removed; catalog
   re-scoped so the repo's legitimate `cn()` helper and `@theme` block stop
   being tells; a calibration note that Cambio's cream palette is
   defensibly intentional (derived from references, arrives with
   terracotta/brick/green — not stone-neutral minimalism); grading anchored
   to `design-system/references/tokens.md` + `voice.md` rather than the
   five-section landing-page frame. The original under
   `docs/design/resources/` is untouched.
6. **design-gate is dissolved into first-party config** (ADR-0029): its
   skills and agents under `.agents/`, scripts vendored, the PostToolUse
   auto-nudge lifted into `.agents/settings.json` in the documented
   single-string hook format and **verified live**: it emits its nudge on a
   `.tsx`/`.html` write and stays silent on `.test.tsx`/`.md`/backend
   files; it coexists with the markdown-formatter hook. No SessionStart
   auto-download exists; Playwright setup is a documented manual step. The
   intent-prep delegation names a real impeccable command. Gate verdicts
   documented as advisory.
7. **impeccable is installed** at project scope, relocated under
   `.agents/` with symlinks verified intact; `PRODUCT.md` is authored from
   HANDOFF §1 + the design direction (no init boilerplate);
   `npx impeccable detect` runs statically against the repo and its
   invocation/refresh path is documented.
8. **Emil's four animation skills** (`animate`, `review-animations`,
   `find-animation-opportunities`, `animation-vocabulary`) are vendored
   with MIT attribution; none of the excluded eight are present.
9. **Precedence is written into the harness** (AGENTS.md + the affected
   skills): the design system outranks impeccable and Emil's skills,
   always; generic flags against deliberate identity are surfaced as
   conflicts, never auto-"fixed"; ai-slop stays internal to the gate
   pipeline while ai-tells is the repo-facing audit.
10. **Workflow plumbing knows the frontend exists:** `implement.md` and
    `review.md` skill rosters include the frontend skills;
    the child-plan template's example skill list names them.
11. **Quality gate:** `pnpm turbo build typecheck lint test` passes on
    `main` after the harness lands, and on `release-v0` after the
    merge-down; all new markdown is prettier-convergent (no inline code
    span broken across lines).
12. **Merge-down complete:** `main` → `development` → `release-v0`, the
    `docs/adr/README.md` index conflict resolved by hand; a
    **fresh-session smoke test on `release-v0`** confirms from cold: new
    skills discoverable, commands load, the design-system router resolves,
    the auto-nudge hook fires.

### Acceptance criteria

- [x] All 12 contract clauses verified — coverage table in the child plan
      filled with the probes that ran. Live-detection verified
      empirically: skills appear in the listing the moment SKILL.md
      lands; a settings.json hook fired on the very next Write. (The
      commands-need-restart half is untestable from inside one session;
      the fresh-context smoke tests stand in.)
- [x] `pnpm turbo build typecheck lint test` passes on `main` (exit 0
      after every milestone).
- [x] `ls -la .claude/` shows exactly four symlinks
      (commands/skills/settings.json/agents); the impeccable installer's
      replacement of the skills symlink was caught and reversed (M6).
- [x] `pnpm turbo build typecheck lint test` passes on `release-v0` after
      merge-down (exit 0).
- [x] Fresh smoke test on `release-v0` passed 5/5 — via a fresh-context
      subagent; the sandbox exposes no `claude` CLI for a literally-cold
      run (see child plan M8 note; the next real session is the final
      cold check).
- [x] Nothing user-level is load-bearing: all payloads under `.agents/`,
      hooks in `.agents/settings.json`, no plugin registrations; per-
      machine extras are Node 22 + optional Playwright setup (documented
      in AGENTS.md).

## Plan of work

All milestones execute **on `main`** (ADR-0028). M1 is complete at plan
commit time. Order matters: docs and first-party skills before third-party
installs (installers may disturb `.claude/`; verify symlinks after each),
verification before merge-down.

- **M1 — Decisions on record** (done with this commit): ADRs 0027–0029,
  index rows, 0008/0007 amendment lines, plan docs.
- **M2 — AGENTS.md + workflow plumbing:** frontend section, sources of
  truth, skills roster, hooks narrative, port fix; `implement.md` /
  `review.md` / child-plan template rosters.
- **M3 — First-party skills:** `frontend-architecture` (+ routing entry in
  `architecture`), `design-system` router skill.
- **M4 — ai-tells adaptation** into `.agents/skills/ai-tells/`.
- **M5 — design-gate dissolution:** vendor skills/agents/scripts, lift and
  fix the hook, correct intent-prep, document Playwright setup; verify the
  nudge empirically.
- **M6 — impeccable:** project install, relocate to `.agents/`, re-verify
  symlinks, author PRODUCT.md, document detect/update flow.
- **M7 — Emil's skills:** copy four, attribute, confirm exclusions.
- **M8 — Verification on main:** full gate; live-detection self-check;
  fresh-session smoke test on `main`.
- **M9 — Merge-down + release smoke test:** `main` → `development` →
  `release-v0` (resolve the ADR index conflict); gate + fresh-session
  smoke test on `release-v0`; Linear close-out.

File-level detail lives in the [frontend child plan](../frontend/CAM-14.md).

## Validation

No vitest suites — the deliverables are harness config, verified by
behavior probes recorded in the child plan's Contract coverage table:

- The **gate** on both branches (clause 11) is the compile check.
- **Hook probes** (clause 6): scripted Write of a scratch `.tsx` and a
  scratch `.test.tsx`, observing nudge presence/absence.
- **Fresh-session smoke tests** (clauses 6, 12): from cold, list skills,
  invoke the design-system router question, confirm command load.
- **Symlink audit** after every installer (`ls -la .claude/`,
  `git status` for unexpected real directories).
- **prettier convergence**: `pnpm format` then `pnpm format:check` twice on
  the new markdown set.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-04 — Planning: explorers mapped repo + external tools; user
      interviews settled landing (main, direct commits), vendoring
      (in-repo, dissolve design-gate, relocate impeccable), skill shape
      (new `frontend-architecture`), anti-slop split; ADRs 0027–0029
      written.
- [x] 2026-09-04 19:50 — Implementation complete, M2–M9 all green
      (commits `ff45c23`…`427f638` on main, merge `7d92a60` on
      release-v0). Milestone detail in the child plan's Progress; all
      branches pushed. Awaiting `/review CAM-14`.

## Decision log

- 2026-09-04 — **Plan docs + ADRs land on main**, not release-v0 — the
  implement session runs on main and tools read the working tree; release
  gets them via merge-down. (User call, round 1.)
- 2026-09-04 — **Direct commits to main, no PR** — matches existing harness
  convention, now recorded as ADR-0028. (User call, round 1.)
- 2026-09-04 — **New `frontend-architecture` skill** rather than extending
  `architecture` — matches router-plus-layer-skills pattern; every backend
  layer already has its own skill. (User call, round 2.)
- 2026-09-04 — **design-gate dissolved, impeccable relocated, Emil's
  copied** — see ADR-0029 for full rationale. (User call, round 2.)
- 2026-09-04 — **Anti-slop roles split** — ai-slop internal to the gate
  pipeline, adapted ai-tells repo-facing; never both on one artifact by
  default. (User call, round 2.)
- 2026-09-04 — **Emil middle-set excluded** (`emil-design-eng`,
  `improve-animations`, `animate-expo`, `prototype`) — not on the issue's
  include list; overlap or irrelevance; trivially added later. (Planner
  call; recorded in ADR-0029.)
- 2026-09-04 — **ADR-0007 amended during implementation, not at plan
  time** — its roster amendment should describe skills that actually
  exist. (Planner call.)
- 2026-09-04 — **Vendored sources extracted from `release-v0` via
  `git show`** — `docs/design/` and `design-system/` do not exist on
  `main`, so M4–M6 read their sources from the release branch without
  checking those paths out onto `main`. (Child-plan discovery, confirmed.)
- 2026-09-04 — **design-gate `baseline.md` + `eval.js` dropped** in the
  dissolution — their `tests/validation` ground-truth corpus is absent
  from the zip, so the eval harness cannot run; recoverable from the
  pristine zip on `release-v0`. (Child-plan default, confirmed.)
- 2026-09-04 — **Vendored gate skills keep upstream prose/frontmatter** —
  functional fixes only; house format applies to first-party skills and
  the ai-tells adaptation. (Child-plan scoping, confirmed.)
- 2026-09-04 — Premise corrections from exploration, absorbed into the
  contract: intent-prep never references PRODUCT.md (PRODUCT.md is
  impeccable's artifact, authored via its init flow); design-gate's
  hardcheck reads computed styles, not Tailwind classes (ADR-0027
  rationale adjusted); the Carbonteq design-system-philosophy URL has no
  `/architecture/` segment.

## Surprises & discoveries

_(anything found mid-implementation that the plan didn't predict — wrong
assumptions, upstream bugs, better approaches. Evidence included.)_

- Planning-time: `apps/web` has no `test` script — any "frontend is
  gated" claim must not imply tests exist. Out of CAM-14 scope to add;
  noted for CAM-15.
- Planning-time: the stale "web :3100" claim in AGENTS.md traces to this
  machine's `.env` (`WEB_PORT=3100`) overriding the `.env.example`/vite
  default of 3000 — the correction must state the fresh-clone default.
- M6: **open item for the user** — `.impeccable/` is gitignored; whether
  the detector config (`.impeccable/config.json`, once one exists) should
  instead be committed so ignore-rules travel with the repo is
  deliberately unresolved. No config file was created by install/detect.
- M6: impeccable's PostToolUse hook produced no visible output on a
  scratch `.tsx` outside the repo — plausibly correct (its detector scans
  project files; the hook is file-guarded and exits quietly). Its first
  real exercise will be CAM-15's in-repo UI writes; if it never surfaces
  anything there, investigate.
- M5/M6: two prettier postures for vendored code, recorded in
  `.prettierignore`: the dissolved design-gate fork is formatted (we own
  it; upstream diffs go against the pristine zip), while impeccable and
  Emil's skills are prettier-ignored (refreshed wholesale;
  byte-identical to upstream).

## Outcomes & retrospective

**Review verdict (2026-09-04): fix-then-ship.** All 12 contract clauses
**satisfied** (contract reviewer, re-verified probes) and independent
verification passed: forced full gate exit 0 on `main` (0 cached), forced
test run on `release-v0` against live Postgres + Realtime — 402 tests /
58 files, all green. ADR discipline clean (same-commit index updates,
amendments header-only). Branch state clean: every CAM-14 file
byte-identical on main/development/release-v0. The findings are
skill/doc-accuracy defects in the harness content itself — exactly the
class this repo treats as load-bearing, since future sessions trust
skills blindly.

### Findings (ranked, all OPEN; the fix cycle works from this list and

marks each RESOLVED with the branch taken)

- **F1 (open) — `frontend-architecture` narrows the hidden-information
  prime rule.** The "prime rule, restated" section drops the verbatim
  clauses "not hidden by CSS, not present-but-unrendered, not
  sent-then-filtered client-side" and omits both client-relevant hard
  prohibitions (no Postgres Changes replication to clients; no Supabase
  anon-key/browser DB access) despite naming realtime wiring in scope. A
  future session reading only this skill gets a weaker rule. Fix:
  restore the clauses verbatim and add the two prohibitions. Related
  A3-lite: `design-system` skill says "hint at" where the canonical
  router says "display or hint at".
- **F2 (open) — `frontend-architecture` styling paragraph contradicts
  canon.** It attributes a "four-tier model raw → primitive → semantic →
  component" to `tokens.md` (which has exactly two layers; the four-tier
  vocabulary is the Carbonteq portal's) and says "every design token is
  a CSS variable in the `@theme` block", flattening ADR-0027's split
  (primitives as plain custom properties; only roles promoted via
  `@theme inline`). CAM-15 implements the mapping and will read one of
  these. Fix: re-attribute the four-tier model; restate the ADR's split.
- **F3 (open) — vendored design-gate `package.json` defects.**
  `"postinstall": "playwright install chromium"` re-introduces the auto
  Chromium download ADR-0029 rejected — the documented step 1
  (`npm install --omit=dev` in AGENTS.md, gate skill, ADR-0029) silently
  triggers step 2's download. And its three npm scripts point at
  `scripts/*.js` while the vendored layout is flat, so all three fail
  (`test:hardcheck` has no other npm path). Fix: strip `postinstall`
  (we own the fork; ledger the fix in VENDORED.md) and correct the
  paths.
- **F4 (open) — enforcement claim false on `main`.** `frontend-
architecture`: "the effect-only policy covers backend layers only" —
  `main`'s `eslint.base.js` has no such policy (it lands with CAM-11/12
  on release-v0); probe-verified false where the skill lives. Fourth
  instance of the unverified-enforcement-claim scar. Fix: branch-
  accurate rewording; also cite the release-v0 regression test by
  file + name for the boundary claim (E4).
- **F5 (open) — `intent-prep` stale delegations.** Frontmatter
  description (the string the skill listing surfaces) still says
  "awesome-design for brand references" — rejected per ADR-0029 and
  contradicted by the skill's own body; and ":83 the gate → verify,
  measure, and enforce the floor" contradicts the advisory model stated
  in gate/AGENTS.md/ADR-0029. Fix: reword both.
- **F6 (open) — AGENTS.md staleness.** "formatting is enforced, not
  aspirational" is unqualified now that `.prettierignore` exempts ~70k
  vendored lines; and the symlink-convention sentences (:9 "skills and
  commands", :66) predate the `agents`/`scripts` additions. Fix: qualify
  with a pointer to `.prettierignore`/VENDORED.md; extend the
  convention sentences.
- **F7 (open) — false probe claim in the child plan.** The coverage
  table and M5 text claim "`CLAUDE_PLUGIN_ROOT` grep clean" — the grep
  returns 2 comment hits inside the upstream impeccable payload
  (`staleness-deep.mjs:279,281`). The true claim is "clean excluding the
  upstream impeccable payload". Multi-instance claim: close by sweeping
  every phrasing across both plan docs (table row, M5 plan text, M5
  Progress entry), not by spot-fix.
- **F8 (open) — `PRODUCT.md` cites release-only ADRs without caveat.**
  Evidence-on-Hand lists "ADRs 0009–0012, 0021–0023" which don't exist
  on `main`; the neighboring design-system line carries a "(release
  branches)" caveat, this line doesn't. Fix: same caveat.
- **Advisory (fixer's discretion):** E3 — "Lint enforces exactly one
  frontend rule" is literally wrong (Zod ban, type-import rules also
  apply to web/ui); say "one _architectural_ rule". E2 — the
  `.claude/`-path vs `.agents/`-path convention split for impeccable's
  hook entries is undocumented, and the `[ ! -f … ] ||` guards mean a
  broken symlink no-ops silently; worth a note in VENDORED.md.

### What passed without findings

Dissolution surface consistency (no dangling references to dropped
pieces; agent names match the gate pipeline), ai-tells adaptation
(every design-system fact verified against release-v0 sources), ADR
discipline, PRODUCT.md rule accuracy vs HANDOFF §1 (spot-checks all
exact), hook behavior (probe matrix re-run independently by the
reviewer), symlink integrity, precedence rule present at every required
site.

### Carry into next tasks

- CAM-15 must implement ADR-0027's token mapping from the ADR, not from
  any skill paraphrase (F2's lesson).
- The literally-cold fresh-session check happens implicitly the next
  time a real session opens on either branch — if skills/commands fail
  to load from cold, treat as a CAM-14 regression.
- impeccable's hook has not yet fired on a real in-repo UI write; watch
  during CAM-15.
- Open item for the user (unresolved by design): commit vs ignore
  `.impeccable/config.json` once one exists.
