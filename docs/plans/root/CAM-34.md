# CAM-34 — Home screen: source-code line linking the GitHub repo

- **Linear:** [CAM-34](https://linear.app/raafayk7/issue/CAM-34/home-screen-source-code-line-linking-the-github-repo)
- **Scope:** frontend
- **Child plans:** [frontend](../frontend/CAM-34.md)
- **ADRs:** none needed — every decision here is task-scoped, reversible, and
  doesn't select between real architectural alternatives (see the `adr`
  skill's bar). All calls are recorded in the Decision Log below.

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

Anyone visiting Cambio's lobby screen can find a small, unobtrusive line
pointing them at the GitHub repo and inviting feedback/bug reports. Observe
it by loading `/` (the lobby) in any session state and finding a single link
reading "Source code and feedback on GitHub" inside the centered content
column, below whatever else is showing (skeleton, error, name form, or
create/join panels).

## Context & orientation

- The lobby screen lives at
  [apps/web/src/containers/lobby/lobby-screen.tsx](../../../apps/web/src/containers/lobby/lobby-screen.tsx),
  mounted by the `/` route
  ([apps/web/src/routes/index.tsx:9-11](../../../apps/web/src/routes/index.tsx)).
  `LobbyScreen` renders `<AppShell scene="courtyard" ...>` wrapping a
  `<div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 p-5">`
  that holds a `content` variable branching on session state (skeleton /
  page error / unauthenticated `NameForm` / authenticated create-room +
  join-room panels) — see lobby-screen.tsx:80-161.
- **No footer or secondary-content slot exists anywhere in this app.**
  `AppShell` ([packages/ui/src/components/app-shell.tsx:103-161](../../../packages/ui/src/components/app-shell.tsx))
  is strictly header + `<main>{children}</main>`; the design doc
  ([design-system/components/core/app-shell.md](../../../design-system/components/core/app-shell.md))
  confirms this is deliberate (r4: "lobby and room screens use this shell
  unchanged and inherit nothing from it"). This was surfaced to the user
  during planning per the task's own creation-gate note ("if exploration
  reveals no obvious home-screen slot, stop and surface options") — resolved
  by interview, see Decision Log.
- The design system already has a registered `Link` component
  ([packages/ui/src/components/link.tsx](../../../packages/ui/src/components/link.tsx),
  doc: [design-system/components/core/link.md](../../../design-system/components/core/link.md))
  with **zero current call sites** anywhere in the app — this is its first
  real usage. It renders a plain `<a>` (or a Radix `Slot` via `asChild`) and
  forwards all anchor props, so `href`/`target`/`rel` pass straight through.
  No new component, token, or icon is introduced by this task.
- There is no existing external-link pattern in the codebase to follow (repo-wide
  search for `<a `, `target="_blank"`, `rel=` returned zero hits before this
  task) — `target="_blank"` + `rel="noreferrer noopener"` is established
  here as the hygiene default per the issue's own scope note.
- Existing lobby tests:
  [apps/web/test/lobby-screen.test.tsx](../../../apps/web/test/lobby-screen.test.tsx)
  (210 lines, role/text-based Testing Library queries, no snapshots). No
  overlap between the new copy ("Source code and feedback on GitHub") and
  existing query strings (`"shuffle up, {name}"`, "Create room", "Join
  room", "How to play", "Try again").
- Relevant skills: `frontend-architecture` (client-as-projection-renderer —
  this is pure static chrome, no `viewFor`/contracts involvement),
  `design-system` (Link component + creation gate already resolved above).

## Functional contract

1. The lobby screen renders exactly one `Link` (the design-system
   component) with visible text **"Source code and feedback on GitHub"**,
   `href="https://github.com/raafayk7/cambio/tree/development"`,
   `target="_blank"`, and `rel="noreferrer noopener"`.
2. This link is present in **every** lobby screen state: first-load
   skeleton, page error (`session.isError`), unauthenticated (`NameForm`),
   and authenticated (create-room/join-room panels) — i.e. it sits outside
   the state-branching `content` variable, not duplicated inside each
   branch.
3. The link renders centered, immediately below the `AppShell` header (i.e.
   as the first child inside `AppShell`'s content, before the centered
   `mx-auto max-w-md` column) — not inside `AppShell` itself, and `AppShell`
   gains no new prop, slot, or header region. (Revised mid-implementation
   from "below the panels" — see Decision Log.)
4. No new design-system component, token, or icon is introduced. The line
   uses the existing `Link` component unmodified and ordinary Tailwind
   utility classes already in use elsewhere (e.g. `text-sm`, `text-center`)
   for the wrapping element's spacing/size only — never for color (color
   comes entirely from `Link`'s own default styling).
5. All existing lobby-screen tests continue to pass unmodified.

### Acceptance criteria

- [x] Link renders with the exact copy, href, and attributes above, in all
      four lobby states.
- [x] `AppShell` (packages/ui) has no changes — diff confined to
      `lobby-screen.tsx` and its test file.
- [x] Existing `lobby-screen.test.tsx` assertions pass unmodified (3 gained
      an appended presence assertion — see the frontend child plan's
      Surprises entry); a new test asserts the link's role, accessible name,
      `href`, `target`, and `rel`.
- [x] `pnpm turbo build typecheck lint test` passes.

## Plan of work

Single milestone — this is a one-file UI addition with no contracts,
backend, or cross-package surface. Add the link element as a sibling to
`{content}` inside `LobbyScreen`'s existing centered column, add one test
asserting its presence/attributes, then run the full gate.

## Validation

- New test in `apps/web/test/lobby-screen.test.tsx` (or a case added to an
  existing `describe` block) renders `LobbyScreen` and asserts
  `screen.getByRole("link", { name: "Source code and feedback on GitHub" })`
  has the expected `href`, `target`, and `rel` — run once per representative
  state if the assertion isn't trivially state-independent (the authenticated
  state is sufficient given the contract requires the link outside the
  branch, not duplicated per-branch).
- `pnpm turbo build typecheck lint test --filter @cambio/web --filter @cambio/ui`
  (or the bare full gate) must pass.

## Progress

- [x] 2026-09-09 00:10 — Implemented: `Link` added to `lobby-screen.tsx` as
      a sibling to the state-branching `content`, pointing at
      `https://github.com/raafayk7/cambio/tree/development` with
      `target="_blank"` / `rel="noreferrer noopener"`. Test coverage added
      for all four lobby states. Full gate green: `pnpm turbo build
typecheck lint test` — 25/25 tasks, 284/284 web tests, `packages/ui`
      untouched.

## Decision log

- 2026-09-08 — No footer/secondary-content slot exists in `AppShell` or
  anywhere else in the app; per the task's own creation-gate note, this was
  surfaced to the user rather than inventing one. Resolved: the line lives
  inside `LobbyScreen`'s existing centered content column, as a sibling to
  the state-branching content, not via any `AppShell` change. — rationale:
  keeps the change confined to one screen, matches AppShell's documented
  intent that per-screen bottom content belongs to the screen, not the
  shell.
- 2026-09-08 — Single combined link (not two separate "view source" /
  "report an issue" links). — rationale: user's explicit choice; keeps the
  line to one small element, GitHub's own Issues tab is one click away from
  any repo page.
- 2026-09-08 — Copy: "Source code and feedback on GitHub" (whole phrase is
  the link text). — rationale: user's explicit choice; sentence case,
  functional-UI register per voice.md, no poster caps/exclamation.
- 2026-09-08 — `href` points at
  `https://github.com/raafayk7/cambio/tree/development`, not the bare repo
  root `https://github.com/raafayk7/cambio` given in the issue text. —
  rationale: user's explicit choice — `development` is the branch that
  matches what's actually deployed to production (per ADR-0041/0042's
  deploy pipeline), so linking there shows visitors the code that's
  actually running rather than whatever happens to be on `main`.
- 2026-09-08 — Text-only, no GitHub icon/mark. — rationale: user's explicit
  choice; no GitHub mark exists in `packages/ui/src/lib/marks.tsx`'s mark
  language, and adding one would require going through the design system's
  creation gate for a net-new icon — out of proportion for a "tiny task by
  design."
- 2026-09-08 — `target="_blank"` + `rel="noreferrer noopener"` established
  as this app's first external-link hygiene pattern (no prior art existed to
  follow). — rationale: standard, low-risk default; nothing about this
  choice is Cambio-specific enough to warrant an ADR, and it's trivially
  reversible.
- 2026-09-08 — No visually-hidden "(opens in new tab)" text added. —
  rationale: WCAG SC 3.2.5 (notifying users of new windows) is AAA, not the
  AA baseline the `hard-checks` skill enforces; skipped as out of scope for
  this task's quality bar.
- 2026-09-09 — The link sits directly on the courtyard scene backdrop, not
  inside a `Panel` wash surface (unlike every heading/form on this screen,
  per panel.md r2's "never on bare artwork" convention). Verified rather
  than assumed: `.agents/scripts/design-gate/hardcheck.js` against a live
  render reports PASS (0 constraint fails) with one advisory — "text over
  image — contrast not statically verifiable" — and a visual check shows
  the rendered color (`rgb(54, 99, 74)`, the Link component's own default)
  against the courtyard's light pavement is clearly legible with a wide
  margin. — rationale: wrapping one small unobtrusive line in a wash panel
  would add visual weight out of proportion to the task ("tiny task by
  design") and there's no existing pattern for a bare-text-on-wash treatment
  this small; flagged here rather than silently deviating from the
  panel-wash convention, since the convention exists for exactly this kind
  of contrast risk. Worth a second look at `/review` if the courtyard art
  changes.
- 2026-09-09 — Mid-implementation revision (user feedback after seeing the
  first render): moved the link from below the create/join panels to
  centered, immediately below the header/wordmark — same courtyard-scene
  legibility question, re-verified with the same hard-check tooling (still
  PASS, same single contrast advisory). Kept the canonical green underlined
  `Link` styling rather than introducing a "quiet" bold-black variant —
  user's explicit choice between the two, offered because the
  bold-black/no-underline look they initially asked for (matching the
  mid-game power-hint text at
  [game-screen.tsx:698](../../../apps/web/src/containers/game/game-screen.tsx))
  would have been an unregistered `Link` appearance (link.md: "underline
  always on... Variants: None"), which the creation gate requires stopping
  for. Surfaced instead of silently applied; user chose to keep the
  registered look and fix placement instead. Functional contract clause 3
  updated to match.

## Surprises & discoveries

_(none yet — filled during implementation)_

## Outcomes & retrospective

_(filled at the end, typically by `/review`)_
