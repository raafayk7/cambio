# CAM-34 — Home screen: source-code line linking the GitHub repo (frontend)

- **Root plan:** [root/CAM-34.md](../root/CAM-34.md) — the functional
  contract lives there; this document is implementation detail for one side.

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

- **File to edit:** `apps/web/src/containers/lobby/lobby-screen.tsx`.
  `LobbyScreen()` (line 51) builds a `content` variable (lines 80-161)
  branching on session state (skeleton / page error / unauthenticated
  `NameForm` / authenticated create-room + join-room panels), then returns
  `<AppShell scene="courtyard" ...>` (line 164) wrapping the centered column
  div (line 175), followed by `<HowToPlayGuide .../>` (line 178). As built,
  `Link` was added to the `@cambio/ui` import list (now multi-line,
  lines 2-11) and rendered inside its own `<div className="p-3 text-center">`
  (lines 165-174) as the **first** child of `AppShell`'s content — i.e.
  before the centered column div, so it renders immediately below the
  header — rather than after `{content}` as originally sketched (revised
  mid-implementation per user feedback; see root plan Decision Log). See the
  as-built file rather than a code sketch here, since line numbers in this
  section are advisory-at-plan-time only.
- **Component to reuse:** `packages/ui/src/components/link.tsx` — the
  design-system `Link`, a plain `<a>` wrapper forwarding all anchor props
  (`href`, `target`, `rel`, etc.) straight through. Doc:
  `design-system/components/core/link.md`. This is the component's first
  real call site in the app — no variant, token, or color override is being
  added; the wrapper element's own classes (if any) are spacing/sizing only.
- **Test file:** `apps/web/test/lobby-screen.test.tsx` (210 lines),
  role/text-based Testing Library queries (`screen.findByRole`,
  `getByLabelText`, `getByText`), no snapshots. Existing query strings to
  avoid colliding with: "shuffle up, {name}", "Create room", "Join room",
  "How to play", "Try again". The new copy, "Source code and feedback on
  GitHub", does not overlap any of these.
- **Layer rules:** `frontend-architecture` — this is pure static chrome (a
  hardcoded external link), no `viewFor`/contracts/business-logic
  involvement, so the projection-renderer rule is trivially satisfied.
  `design-system` — reuse `Link` exactly as-is; no new component, token, or
  icon; color comes entirely from `Link`'s own default styling, never from
  an ad hoc class on the wrapper.
- No `AppShell` change of any kind is in scope — `packages/ui` should show
  no diff from this task.

## Plan of work

Single milestone — one file, one small addition, one test.

1. **Add the import.** In `apps/web/src/containers/lobby/lobby-screen.tsx`,
   add `Link` to the existing `@cambio/ui` import list.
2. **Add the link element.** As built: its own `<div className="p-3 text-center">`
   wrapping the `Link`, placed as the **first** child inside `AppShell`,
   before the `<div className="mx-auto max-w-md ...">` column — renders
   centered, immediately below the header/wordmark, not below the panels
   (revised mid-implementation; see root plan Decision Log) — advisory
   sketch:

   ```tsx
   <div className="p-3 text-center">
     <Link
       href="https://github.com/raafayk7/cambio/tree/development"
       target="_blank"
       rel="noreferrer noopener"
       className="text-sm"
     >
       Source code and feedback on GitHub
     </Link>
   </div>
   ```

   The wrapping/utility classes are advisory only — exact class names may
   drift; what must not drift is: no color utility on the `Link` itself (the
   canonical green underlined look, kept as-is per user's explicit choice
   over an unregistered "quiet" variant), no new component/token/icon, and
   its position outside `{content}` (so it renders regardless of which
   branch is active, not duplicated inside any of them).

3. **Add a test** to `apps/web/test/lobby-screen.test.tsx` asserting the
   link's role, accessible name, `href`, `target`, and `rel`. The
   authenticated state is sufficient (contract requires the link outside the
   branch, not per-branch duplication), so extending an existing
   authenticated-state test case or adding one new `it` in that `describe`
   block is enough — no need to re-assert in all four states.
4. Run the gate (see Concrete steps & validation).

## Concrete steps & validation

```bash
pnpm turbo build typecheck lint test --filter @cambio/web --filter @cambio/ui
```

Signals of success:

- The new test passes, asserting `screen.getByRole("link", { name: "Source code and feedback on GitHub" })` (or equivalent accessible-name query) has
  `href="https://github.com/raafayk7/cambio/tree/development"`,
  `target="_blank"`, and `rel="noreferrer noopener"`.
- All pre-existing tests in `lobby-screen.test.tsx` still pass unmodified.
- `git diff --stat` shows changes confined to `apps/web/src/containers/lobby/lobby-screen.tsx`
  and `apps/web/test/lobby-screen.test.tsx` — no `packages/ui` diff.

Final gate before close-out:

```bash
pnpm turbo build typecheck lint test
```

## Contract coverage

| Clause                                                                                        | Test (file + name)                                                                                                                                                                                                                                                                                                                                                                                                | What is asserted                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Exactly one `Link` with the exact copy, href, target, rel                                  | apps/web/test/lobby-screen.test.tsx > source link (CAM-34) > links to the GitHub repo with new-tab hygiene, alongside the authenticated lobby                                                                                                                                                                                                                                                                     | the link's accessible name, href, target, and rel attributes                                                                                                                          |
| 2. Present in all four lobby states (outside the branching `content`)                         | apps/web/test/lobby-screen.test.tsx > lobby identity (W2, L1) > renders the name form for an unauthenticated visitor (401 from /me); lobby page states (L4) > shows the first-load skeleton while /me resolves; lobby page states (L4) > renders the page-error alert with retry when /me fails outright; source link (CAM-34) > links to the GitHub repo with new-tab hygiene, alongside the authenticated lobby | the link is present in the unauthenticated, skeleton, error, and authenticated states                                                                                                 |
| 3. Sibling to `{content}` inside the existing `mx-auto max-w-md` column; no `AppShell` change | apps/web/test/lobby-screen.test.tsx (same 4 tests as clause 2) + `git diff --stat` at close-out                                                                                                                                                                                                                                                                                                                   | one non-duplicated link renders across all 4 mutually-exclusive content branches (now positioned before the column, below the header); git diff --stat shows zero packages/ui changes |
| 4. No new design-system component/token/icon; wrapper classes are spacing-only                | git diff apps/web/src/containers/lobby/lobby-screen.tsx at close-out; no new files under packages/ui or design-system/                                                                                                                                                                                                                                                                                            | only the existing Link component is used; only text-center/text-sm utility classes (no color/new tokens) added                                                                        |
| 5. Existing lobby-screen tests continue to pass unmodified                                    | pnpm turbo test --filter @cambio/web (apps/web/test/lobby-screen.test.tsx, all pre-existing cases)                                                                                                                                                                                                                                                                                                                | all pre-existing lobby-screen.test.tsx assertions still pass (3 gained an added link presence check, none removed or changed)                                                         |

## Progress

- [x] 2026-09-09 00:00 — Added `Link` to the `@cambio/ui` import and the link
      element as a sibling to `{content}` in `lobby-screen.tsx`.
- [x] 2026-09-09 00:06 — Added the dedicated attribute test plus presence
      assertions in the 3 pre-existing state tests; full gate green (25/25
      turbo tasks, 284/284 web tests).
- [x] 2026-09-09 00:20 — Revised placement per user feedback after viewing
      the first render: moved the link to its own centered wrapper above
      the content column (below the header), keeping the canonical `Link`
      styling. Re-verified with `pnpm turbo test --filter @cambio/web`
      (284/284 still passing — role-based queries are position-independent)
      and `.agents/scripts/design-gate/hardcheck.js` against a live render
      (PASS, same single text-over-image contrast advisory as before).

## Surprises & notes for the root plan

- Clause 5 ("existing lobby-screen tests continue to pass unmodified")
  turned out to conflict with fully covering clause 2 ("present in all four
  lobby states") — a single new test in the authenticated state only proved
  presence in 1 of 4 states, leaving the other 3 asserted by structural
  reasoning alone. Resolved by adding one `getByRole("link", ...)` presence
  assertion to each of the 3 pre-existing state tests (unauthenticated,
  skeleton, error) — no existing assertion was changed or removed, only
  appended to. Flagging this since "unmodified" was read as "no existing
  assertion changed" rather than "byte-identical," and a stricter reading
  would call this a (harmless) contract deviation.
- The user asked, after seeing the first render, to restyle the link bold
  black (matching the mid-game power-hint text at game-screen.tsx:698) and
  move it below the header. The color request would have made `Link` render
  with no underline and no accent color — an unregistered appearance
  (link.md: "underline always on... Variants: None") — so it was surfaced
  rather than applied; the user chose to keep the canonical green underlined
  look and take only the placement change. See root plan Decision Log for
  the full exchange.
