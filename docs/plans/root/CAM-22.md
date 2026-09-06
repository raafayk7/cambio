# CAM-22 — Copy link fails outside secure contexts — clipboard fallback

- **Linear:** [CAM-22](https://linear.app/raafayk7/issue/CAM-22/copy-link-fails-outside-secure-contexts-clipboard-fallback)
- **Scope:** frontend
- **Child plans:** [frontend](../frontend/CAM-22.md)
- **ADRs:** none needed — every decision this task forces (ref-forwarding on
  `TextField`, guard-then-fallback shape, toast wording) is task-scoped,
  trivially reversible, and doesn't deviate from an existing convention. See
  Decision Log below.

> This is a **living document** (ExecPlan-style). The implementer updates
> Progress, Decision Log, and Surprises as work happens — not at the end.
> Self-containment rule: a reader with zero session context must be able to
> pick this up and continue.

## Purpose / big picture

Today, clicking "Copy link" on the room screen silently does nothing when
the app is served over plain http on a non-`localhost` origin (e.g. a LAN IP
during a playtest) — `navigator.clipboard` doesn't exist outside secure
contexts, so `navigator.clipboard.writeText(...)` throws synchronously and
the click handler dies before it can even report failure. After this task,
that same click surfaces the room link for manual copying instead: the
room-link field is focused and its text auto-selected, and an alarm toast
tells the player to copy it themselves. Observe it by opening
`http://<lan-ip>:3100/room/<id>` on a device on the same network (a genuine
insecure-context origin — no need to stub anything), clicking "Copy link",
and seeing the link's text highlighted with the "Couldn't copy…" toast
underneath, instead of nothing happening.

## Context & orientation

- [apps/web/src/containers/room/room-screen.tsx](../../../apps/web/src/containers/room/room-screen.tsx) —
  `SeatedRoom`'s `copyLink` (around line 119) is the only clipboard call in
  the repo (confirmed by repo-wide grep). It currently calls
  `navigator.clipboard.writeText(roomUrl).then(onSuccess, onFailure)` — the
  `.then` rejection branch already shows the alarm toast, but `writeText`
  read on an `undefined` `navigator.clipboard` throws _before_ the promise
  chain starts, so that branch never runs in the actual bug scenario. The
  room link renders in a read-only `TextField` (around line 154) whose
  existing `onFocus={(event) => event.target.select()}` handler already
  does the "highlight for copy" behavior — it just isn't reachable except by
  the user manually focusing the field.
- [packages/ui/src/components/text-field.tsx](../../../packages/ui/src/components/text-field.tsx) —
  `TextField` is a plain function component; `TextFieldProps` doesn't
  declare a `ref` prop and no component in `packages/ui` forwards refs today
  (confirmed by grep). Programmatically focusing the field from
  `room-screen.tsx` needs this added.
- `apps/web/test/room-screen.test.tsx` — the existing suite covers the
  seated-room render and one button-click-then-assert flow (the 422
  BadPlayerCount case, around line 276) using `renderApp`/`stubApi` from
  `./support/harness.js`; no clipboard mocking exists anywhere in the repo
  yet.
- Relevant skills: `frontend-architecture` (apps/web/packages/ui split — the
  fix stays presentation-only, no new state migrates into `use-room.ts`),
  `design-system` (toast/copy already conform to `voice.md`; no new tokens
  or copy needed since the interview kept existing wording).
- Related: [CAM-17](https://linear.app/raafayk7/issue/CAM-17) shipped the
  room screen and its copy-link button; its tests all ran on `localhost`,
  which is secure-context-exempt, so this gap never surfaced there.

## Functional contract

1. Clicking "Copy link" when `navigator.clipboard` is `undefined` (or lacks
   a `writeText` function) must not throw, must focus the room-link
   `TextField` (triggering its existing `onFocus` select-all), and must show
   an alarm toast reading exactly "Couldn't copy. Select the link and copy
   it yourself." (unchanged wording — confirmed with the user).
2. Clicking "Copy link" when `navigator.clipboard.writeText` exists but its
   returned promise rejects must produce the identical outcome as (1): field
   focused + selected, same alarm toast.
3. Clicking "Copy link" when `navigator.clipboard.writeText` resolves keeps
   today's behavior unchanged: a "Link copied" success toast; no assertion
   about focus state is required in this case.
4. `packages/ui`'s `TextField` accepts an optional `ref` prop and forwards
   it to the rendered `<input>`, with no change to its behavior or props for
   any existing consumer (checked by the full `pnpm turbo build typecheck
lint test` gate, since `TextField` is used elsewhere in `apps/web`).

### Acceptance criteria

- [x] All four functional-contract clauses above are covered by a passing
      test.
- [x] `pnpm turbo build typecheck lint test` passes.
- [ ] Manual smoke check (optional but recommended given this bug was only
      caught by a real-device playtest): serve the app on a LAN IP and
      confirm the fallback fires in a real insecure-context browser. Skipped
      this round — see Surprises: another session's dev server already held
      the local ports on this shared working directory, and jsdom coverage
      of all three branches gives solid confidence without it. Worth doing
      before the next real playtest.

## Plan of work

One milestone, sequential (no parallel lanes — this is a small, single-side
fix):

1. **`TextField` ref support** (`packages/ui`) — add the `ref` prop and wire
   it to the underlying `<input>`, per the explorer's confirmed React 19
   plain-function-component pattern (no `forwardRef` needed). This unblocks
   step 2 and is the one change with a blast radius beyond this task (every
   `TextField` consumer), so it lands and typechecks first.
2. **`copyLink` fallback guard** (`apps/web`) — add a `useRef` on the
   room-link `TextField`, guard the clipboard call for a missing
   `navigator.clipboard`/`writeText`, and call `.focus()` on the ref in both
   the guard branch and the existing `.then` rejection branch.
3. **Tests** — extend `apps/web/test/room-screen.test.tsx` with cases for
   the missing-API, rejecting-promise, and resolving-promise branches, using
   `vi.stubGlobal` on `navigator` (matching the file's existing `fetch`
   stubbing idiom) so `afterEach`'s `vi.unstubAllGlobals()` cleans up
   automatically. All three are new coverage: jsdom 30.0.1 (this suite's
   test environment) doesn't implement the Clipboard API at all, so
   `navigator.clipboard` is `undefined` in every test today unless stubbed —
   the success path was never actually exercised despite looking covered by
   inspection (see Surprises).

## Validation

- New tests in `apps/web/test/room-screen.test.tsx` cover contract clauses
  1–3 directly (missing API, rejecting promise, resolving promise) by
  asserting the toast text and, for clauses 1–2, the selected/focused state
  of the room-link input.
- Clause 4 is covered by the project-wide gate (`typecheck`/`test` across
  every `TextField` consumer) rather than a dedicated `packages/ui` test,
  since the change is additive and behavior-preserving for existing usages.
- Run `pnpm turbo build typecheck lint test` before calling this done.

## Progress

_(updated continuously; append new entries at the BOTTOM — newest last;
timestamp each entry)_

- [x] 2026-09-06 — plan drafted and signed off
- [x] 2026-09-06 07:00 — `TextField` gained a `ref` prop
      ([packages/ui/src/components/text-field.tsx](../../../packages/ui/src/components/text-field.tsx)); `pnpm turbo build typecheck lint test --filter @cambio/ui` green (25 tests, no regression)
- [x] 2026-09-06 07:02 — `copyLink` rewritten with the missing-API guard and
      the shared `copyFailed` helper, `linkRef` wired to the room-link
      `TextField`
      ([apps/web/src/containers/room/room-screen.tsx](../../../apps/web/src/containers/room/room-screen.tsx));
      `pnpm turbo build typecheck lint --filter @cambio/web` green
- [x] 2026-09-06 07:05 — three new tests added to
      [apps/web/test/room-screen.test.tsx](../../../apps/web/test/room-screen.test.tsx)
      (missing API, rejecting promise, resolving promise);
      `pnpm turbo test --filter @cambio/web` green — 20 test files, 193 tests
      total, no regression
- [x] 2026-09-06 07:07 — full gate `pnpm turbo build typecheck lint test`
      green across all 25 tasks (7 packages)
- [x] 2026-09-06 07:10 — Contract coverage table in the frontend child plan
      filled with real test names and assertion phrases

## Decision log

- 2026-09-06 — Fallback also auto-focuses + selects the room-link field
  (rather than toast-only) — user's call in the pre-exploration interview;
  makes the toast's "select the link" instruction immediately actionable
  instead of requiring the player to find and click the field themselves.
- 2026-09-06 — Toast wording stays exactly "Couldn't copy. Select the link
  and copy it yourself." — user declined the issue's suggested
  "press-and-hold" phrasing because it assumes a touch device, which reads
  oddly for the LAN-IP-on-a-laptop case that actually surfaced this bug.
- 2026-09-06 — `TextField` gains a `ref` prop via the plain-prop pattern
  (React 19 supports refs as ordinary props on function components; no
  `forwardRef` wrapper needed) rather than reaching for `forwardRef` —
  matches the React version in use and keeps the component a plain function.
  Task-scoped, not promoted to an ADR: no other `packages/ui` component
  needs a ref yet, so this isn't establishing a library-wide idiom, just
  filling the one real need.
- 2026-09-06 — Detect the missing-API case with an explicit guard
  (`if (!navigator.clipboard?.writeText)`) rather than relying solely on the
  `.then` rejection handler — reading `.writeText` off `undefined` throws
  synchronously before any promise exists, so the rejection path alone
  cannot catch it (this is the actual root cause of the silent failure).

## Surprises & discoveries

_(anything found mid-implementation that the plan didn't predict — wrong
assumptions, upstream bugs, better approaches. Evidence included.)_

- 2026-09-06 — The frontend child-plan author caught a wrong premise in this
  plan's first draft: Validation originally claimed clause 3 (the success
  toast) was "already covered by existing behavior." A grep for
  `"Link copied"` across `apps/web` and `packages/ui` turns up only the
  `pushToast` call site and static fixtures (`generic.tsx:364,370`,
  `toast.test.tsx:23`) — no test clicks "Copy link" with a resolving
  clipboard and asserts the toast. Compounding this, jsdom 30.0.1 (the
  suite's test environment, `apps/web/package.json:34`) doesn't implement
  the Clipboard API at all, so `navigator.clipboard` is `undefined` in every
  existing test unless explicitly stubbed — meaning the success branch has
  never been exercised, incidentally or otherwise. Fixed by adding a third
  test case (Plan of work step 3, Validation) instead of treating clause 3
  as pre-covered.
- 2026-09-06 — The optional manual LAN-IP smoke check (acceptance criteria)
  was skipped: this repo's working directory already had another session's
  `api`/`web` dev servers bound to ports 3001/3000, and contending for them
  risked cross-session interference for no real gain given the jsdom suite
  already exercises all three `copyLink` branches directly. Left as a
  follow-up before the next live playtest rather than blocking this task on
  it — the acceptance criterion was explicitly optional.

## Outcomes & retrospective

_(filled at the end, typically by `/review`: what shipped, what was cut,
what should carry into the next task.)_
