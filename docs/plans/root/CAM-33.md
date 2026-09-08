# CAM-33 — MIT license + public-repo readiness

- **Linear:** [CAM-33](https://linear.app/raafayk7/issue/CAM-33/mit-license-public-repo-readiness-history-secrets-scan-vendored)
- **Scope:** repo-meta — no backend or frontend application code changes
- **Child plans:** none (task touches no `packages/domain`, `packages/application`,
  `packages/contracts`, `apps/api`, or `apps/web` code; everything lives at the
  repo root, in git history, and in `.agents/skills/VENDORED.md`)
- **ADRs:** none needed — every decision this task forces is either fully
  determined by an existing ADR (the LICENSE landing path applies ADR-0028's
  carve-out test, it doesn't extend it) or a task-scoped call recorded in the
  Decision Log below.

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

After this task, the repo is safe and legal to flip public: an MIT `LICENSE`
file exists at the root, the entire git history (all 260 commits across every
local and `origin/*` branch) has been scanned for secrets with results
triaged, every third-party payload vendored under `.agents/` has a verified
public-redistribution basis recorded in `VENDORED.md`, the README no longer
tells visitors the repo is an empty scaffold, and a manual runbook exists for
the actual GitHub visibility flip (which stays a human action, not something
this task automates). Verify by reading `LICENSE`, `README.md`, and
`.agents/skills/VENDORED.md` after implementation, and by reading the scan
output captured in this plan's Validation section.

## Context & orientation

- **No `LICENSE` file exists today.** `git ls-files` and a root listing both
  confirm it. Copyright holder is Raafay Kazmi, year 2026 (from the Linear
  ticket).
- **`README.md`** (105 lines) is otherwise presentable but its second line —
  "Current state: **scaffold only**. No game logic exists yet, by design." —
  is stale: CAM-32 shipped a live production deploy (Render api + Vercel web)
  and the game is fully playable. User confirmed (2026-09-08) fixing this one
  line is in scope; a full README rewrite is not.
- **No `gitleaks` or `trufflehog` binary is installed locally.** Docker
  29.8.0 is available and already a project dependency (Postgres runs in it),
  so the scan runs via
  `docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source=/repo --log-opts=--all --report-format=json --report-path=/repo/<scratch>/gitleaks-report.json`
  (or equivalent) rather than a local install. `--log-opts=--all` (or
  `git log --all`) is required — default gitleaks git-mode only walks
  `HEAD`'s ancestry, and this repo carries 27 branches (local + `origin/*`,
  see below) with task branches that never merged.
- **Branch topology** (`git branch -a` / `git ls-remote --heads origin`,
  captured 2026-09-08): `main`, `development`, `release-v0`, and 24
  `raafaykazmi/cam-*` task branches, all present both locally and on
  `origin`, plus one extra remote-only branch `origin/cam-32/gate-proof`.
  Total unique commits across all refs: **260**
  (`git rev-list --all | wc -l`) — a small, fast history to scan.
- **`.env` has never been committed** (`git log --all --full-history -- .env`
  returns nothing) — the working `.env`/`.env.example` split is clean. This
  doesn't mean the scan is a formality: secrets can leak as hardcoded strings
  in source, scripts, or docs, not just via a committed dotfile.
- **Secret-shaped env vars to cross-reference against scan findings**
  (names only, from `.env.example`): `SESSION_SECRET` (ADR-0018's HMAC
  session secret), `TOPIC_SECRET` (ADR-0023's capability-topic secret),
  `REALTIME_JWT_SECRET`, `DATABASE_URL` / `TEST_DATABASE_URL` (may embed a
  password), and `VITE_REALTIME_APIKEY` (the Supabase anon key — per
  ADR-0032 this one is **designed to be public**; a match here is an
  expected finding, not a leak, and should be labeled as such in the report
  rather than raised as a blocker).
- **Vendored third-party audit surface** — `.agents/skills/VENDORED.md` is
  the existing ledger; verified against the actual tree:
  - `emilkowalski/skills` (MIT) → `.agents/skills/{animate,review-animations,
find-animation-opportunities,animation-vocabulary}` — attribution
    recorded, verbatim/prettier-ignored. Low risk.
  - `impeccable` (Apache-2.0) → `.agents/skills/impeccable/` +
    `.agents/agents/impeccable-*.md` — Apache NOTICE retained per
    `VENDORED.md`. Low risk.
  - **`design-gate` + `ai-tells`, dissolved from Carbonteq's plugin — the
    finding that matters.** ADR-0029 states outright: _"design-gate is
    UNLICENSED internal Carbonteq code."_ UNLICENSED grants no
    redistribution rights by default. Tracked in git today:
    `docs/design/resources/design-gate-plugin.zip` (the pristine source
    zip), `docs/design/resources/ai-tells/{SKILL.md,catalog.md}`
    (Carbonteq's original, pre-adaptation), and the dissolved first-party
    config derived from it: skills `gate`, `intent-prep`, `design-context`,
    `rubric-principles`, `hard-checks`, `annotated-exemplars`, `ai-slop`,
    the adapted `ai-tells`, agents `decompose`/`map`/`judge`, and
    `.agents/scripts/design-gate/` (its `node_modules/` is gitignored, so
    that part is not a tracked-file concern). No LICENSE/README/permission
    note exists anywhere in `docs/design/resources/` today. **User
    confirmed (2026-09-08) they hold Carbonteq's permission to redistribute
    this material publicly** — see Decision Log. This task records that
    basis in `VENDORED.md`; it does not change any code.
- **Landing path decided:** the whole ticket — LICENSE, README fix,
  `VENDORED.md` update, and the runbook this plan carries — rides the
  normal ADR-0008 flow (task branch → PR → `release-v0`), not the ADR-0028
  main carve-out. User confirmed (2026-09-08): LICENSE isn't harness
  tooling or CI/deployment config (the two categories ADR-0028/0043 cover),
  and there's no functional urgency to land it on `main` today since the
  manual public flip already happens only after `release-v0` merges into
  `development`.
- **Out of scope, per the ticket:** the home-screen GitHub-link line
  ([CAM-34](https://linear.app/raafayk7/issue/CAM-34), related, needs the
  release-branch design system) and actually flipping visibility (user does
  that manually on GitHub after v0 is live).

## Functional contract

1. A `LICENSE` file exists at the repo root containing the standard OSI MIT
   license text, with `Copyright (c) 2026 Raafay Kazmi`.
2. A full-history secrets scan has been run covering all 260 commits across
   every local branch and every `origin/*` ref (including the remote-only
   `cam-32/gate-proof`), and its output is captured verbatim in this plan's
   Validation section. Every finding is triaged in that section:
   - Any match against the Supabase anon JWT (`VITE_REALTIME_APIKEY`
     shape, per ADR-0032) is labeled **expected — public by design**, not a
     leak.
   - Any match that looks like `SESSION_SECRET`, `TOPIC_SECRET`,
     `REALTIME_JWT_SECRET`, a service-role key, or a `DATABASE_URL`/
     `TEST_DATABASE_URL` password is reported to the user as a **blocker**.
     The implementer does not rewrite history or rotate keys unilaterally —
     that choice is the user's per the ticket.
   - A clean scan (no findings outside the expected anon-JWT case) is
     itself recorded as the validation evidence, not silently assumed.
3. `.agents/skills/VENDORED.md` is updated with a new note recording the
   Carbonteq permission-to-redistribute basis (who confirmed it, when, and
   that it covers the plugin zip, `docs/design/resources/ai-tells/`, and
   every skill/agent dissolved from them) — see Decision Log for the exact
   content. `impeccable`'s Apache-2.0 NOTICE and `emilkowalski/skills`'s MIT
   attribution are re-verified present (not re-derived) and unchanged.
4. `README.md`: the "Current state: scaffold only..." line is corrected to
   reflect that v0 is built and live, and an MIT license line is added
   (near the top, alongside the existing docs pointers). No other README
   restructuring.
5. This plan document carries a **Public-flip runbook** section (see below)
   listing the manual GitHub steps the user performs after v0 is live: set
   `development` as the default branch, flip visibility to public, enable
   Issues. Nothing here is automated by this task.
6. `pnpm turbo build typecheck lint test` passes — expected to be a no-op
   confirmation since nothing here touches app code, but it's the gate
   regardless.

### Acceptance criteria

- [ ] `LICENSE` exists at repo root, MIT text, correct copyright line.
- [ ] Full-history gitleaks (or trufflehog) run completed; results pasted
      into Validation; every finding triaged (expected-anon-JWT vs.
      blocker); a clean result is explicitly recorded, not assumed.
- [ ] Any blocker finding is reported to the user in this plan and in the
      Linear issue **before** the task is considered done — implementation
      does not proceed to close out CAM-33 with an unresolved blocker.
- [ ] `.agents/skills/VENDORED.md` updated with the Carbonteq
      redistribution-permission note.
- [ ] `README.md` stale scaffold line corrected; MIT note added.
- [ ] Public-flip runbook present in this plan (see below) and echoed in
      the close-out Linear comment.
- [ ] `pnpm turbo build typecheck lint test` passes.

## Plan of work

Single milestone — everything here is small enough not to need
parallelization or a freeze point:

1. **File additions.** Add `LICENSE` (MIT, Raafay Kazmi, 2026) and fix the
   README's stale scaffold line + add the MIT note. Two small, independent
   file edits.
2. **Secrets scan.** Run the dockerized gitleaks scan across all refs
   (`--log-opts=--all` / `git log --all` equivalent — confirm whichever
   flag the pinned gitleaks version actually uses before relying on it).
   Paste full output into Validation. Triage every finding per the
   Functional Contract's rules. **Stop and report to the user before
   continuing** if anything beyond the expected anon-JWT match turns up —
   do not rewrite history or rotate secrets without their explicit call.
3. **Vendored-license audit.** Walk `VENDORED.md` against the actual tree
   (already largely verified during planning — see Context). Confirm
   `impeccable` and `emilkowalski/skills` attribution is intact and
   unchanged. Add the Carbonteq permission note (exact wording in Decision
   Log). If anything about the Carbonteq material is unclear at
   implementation time beyond what's already resolved here, stop and ask —
   don't guess, per the ticket.
4. **Runbook.** Write the Public-flip runbook (below) — this plan section
   is itself the deliverable per the ticket ("a short checklist in the
   ticket/plan").
5. **Gate, ship.** Run `pnpm turbo build typecheck lint test`, commit,
   open the PR into `release-v0` per `/ship`, echo the runbook and scan
   result summary in the Linear close-out comment.

## Public-flip runbook

_(manual steps the user performs on GitHub after `release-v0` has merged
into `development` and v0 is confirmed live — not automated by this task)_

1. Repo Settings → General → Default branch → change from `main` to
   `development`.
2. Repo Settings → General → Danger Zone → Change repository visibility →
   Public. Confirm the secrets-scan result in this plan is clean (or that
   every flagged item was resolved) before doing this step.
3. Repo Settings → General → Features → enable **Issues**.
4. Spot-check: reload the repo home page logged out (private/incognito) to
   confirm `LICENSE` is detected by GitHub's license badge and the README
   renders as expected to a visitor with zero context.

## Validation

- Paste the full gitleaks (or trufflehog) output here once run, plus the
  triage table (finding → expected-anon-JWT / blocker / false-positive).
- Confirm `LICENSE` parses as OSI-standard MIT (diff against the canonical
  text, e.g. `choosealicense.com/licenses/mit`).
- Load `README.md` rendered (GitHub preview or a local markdown renderer)
  and confirm the corrected line and MIT note read cleanly.
- Diff `VENDORED.md` before/after to confirm only the intended note was
  added.
- `pnpm turbo build typecheck lint test` — full gate, bare (never piped).

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [ ] 2026-09-08 — `/plan` completed: interview, exploration, and plan
      write-up done. No child plans, no ADRs. Awaiting `/implement`.

## Decision log

- 2026-09-08 — **LICENSE lands via the normal release flow, not the
  ADR-0028 main carve-out** — user confirmed. Rationale: LICENSE is neither
  harness tooling nor CI/deployment config (the two categories ADR-0028 and
  its ADR-0043 extension actually cover), and there's no functional
  urgency to land it on `main` today — the manual public flip already
  happens only after `release-v0` merges into `development`, so the normal
  flow delivers LICENSE to `development` in time regardless.
- 2026-09-08 — **Carbonteq `design-gate`/`ai-tells` material: user
  confirmed they hold Carbonteq's permission to redistribute this
  UNLICENSED-marked material publicly.** Recorded in `VENDORED.md` (the
  existing home for provenance/license facts) rather than editing
  ADR-0029 — ADR-0029's Decision section documents why the material was
  vendored, not its redistribution terms, and its Consequences section
  already flags "revisit if Carbonteq ships a licensed release," so a
  `VENDORED.md` note is the more precise home. No ADR amendment needed:
  this doesn't change the vendoring decision, it clears a legal condition
  around it.
- 2026-09-08 — **README's stale "scaffold only" line is in scope for this
  task** — user confirmed. Bounded to that one line plus adding the MIT
  note; not a broader README rewrite (explicitly out of scope per the
  ticket).
- 2026-09-08 — **Scanner: gitleaks via `docker run zricethezav/gitleaks`**,
  not trufflehog. Neither is installed locally; the ticket permits either.
  Gitleaks' git-mode CLI is simpler for a full-history, all-refs scan and
  Docker is already a project dependency, so no new local tool install is
  needed.
- 2026-09-08 — **No child plans, no ADRs.** This task touches no
  `packages/domain`, `packages/application`, `packages/contracts`,
  `apps/api`, or `apps/web` code, so the backend/frontend child-plan split
  doesn't apply — everything stays in this root plan. Every decision this
  task forces is either fully determined by an existing ADR (LICENSE
  landing-path applies ADR-0028's existing test rather than extending it)
  or a task-scoped call recorded above.

## Surprises & discoveries

_(anything found mid-implementation that the plan didn't predict — wrong
assumptions, upstream bugs, better approaches. Evidence included.)_

## Outcomes & retrospective

_(filled at the end, typically by `/review`: what shipped, what was cut,
what should carry into the next task.)_
