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
  join-room panels) — see lobby-screen.tsx:71-158.
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
3. The link lives inside the existing centered content column
   (`mx-auto max-w-md` div in `LobbyScreen`), as a sibling below `{content}`
   — not inside `AppShell`, and `AppShell` itself gains no new prop, slot,
   or footer region.
4. No new design-system component, token, or icon is introduced. The line
   uses the existing `Link` component unmodified and ordinary Tailwind
   utility classes already in use elsewhere (e.g. `text-sm`, `text-center`)
   for the wrapping element's spacing/size only — never for color (color
   comes entirely from `Link`'s own default styling).
5. All existing lobby-screen tests continue to pass unmodified.

### Acceptance criteria

- [ ] Link renders with the exact copy, href, and attributes above, in all
      four lobby states.
- [ ] `AppShell` (packages/ui) has no changes — diff confined to
      `lobby-screen.tsx` and its test file.
- [ ] Existing `lobby-screen.test.tsx` assertions pass unmodified; a new
      test asserts the link's role, accessible name, `href`, `target`, and
      `rel`.
- [ ] `pnpm turbo build typecheck lint test` passes.

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

- [ ] YYYY-MM-DD HH:MM — step description

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

## Surprises & discoveries

_(none yet — filled during implementation)_

## Outcomes & retrospective

_(filled at the end, typically by `/review`)_
