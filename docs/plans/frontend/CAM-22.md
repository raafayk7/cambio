# CAM-22 — Copy link fails outside secure contexts — clipboard fallback (frontend)

- **Root plan:** [root/CAM-22.md](../root/CAM-22.md) — the functional
  contract lives there; this document is implementation detail for the
  frontend side (the only side this task touches).

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

Two files change, plus one test file gains cases. No new files.

- [packages/ui/src/components/text-field.tsx](../../../packages/ui/src/components/text-field.tsx) —
  `TextField` is currently a plain function component:

  ```ts
  export interface TextFieldProps
    extends React.InputHTMLAttributes<HTMLInputElement>, VariantProps<typeof textFieldVariants> {}
  export function TextField({ className, variant, ...props }: TextFieldProps) {
    return <input className={cn(textFieldVariants({ variant }), className)} {...props} />
  }
  ```

  No `ref` prop is declared, and a repo-wide grep confirms no component in
  `packages/ui/src/components` forwards refs today (no `forwardRef` import
  anywhere in the package). Per the root plan's Decision Log, this gets a
  plain `ref` prop (React 19 accepts `ref` as an ordinary prop on function
  components — no `forwardRef` wrapper), not a `forwardRef`-wrapped rewrite.

  **Verified: the ref survives `FieldScaffold`'s clone.** Every `TextField`
  usage in `apps/web` (grep: `apps/web/src/components/gallery/generic.tsx`,
  `apps/web/src/components/identity/name-form.tsx`,
  `apps/web/src/containers/lobby/lobby-screen.tsx`,
  `apps/web/src/containers/room/room-screen.tsx`) renders it as the single
  child of `FieldScaffold`
  ([packages/ui/src/components/field-scaffold.tsx](../../../packages/ui/src/components/field-scaffold.tsx)).
  `FieldScaffold` calls `React.cloneElement(child, { id, ...ariaProps })`
  (line 58) — the config object it passes does **not** include a `ref` key,
  and `React.cloneElement` preserves the original element's `ref` in that
  case. So a `ref` attached to the `<TextField>` JSX element in
  `room-screen.tsx` reaches the rendered `<input>` unchanged by the
  scaffold wrapping. This was a real risk worth checking before committing
  to the approach — it checks out.

- [apps/web/src/containers/room/room-screen.tsx](../../../apps/web/src/containers/room/room-screen.tsx) —
  `SeatedRoom` (function starts ~line 90). Relevant pieces as they stand
  today:
  - `pushToast` helper (~line 114) already exists for both toast variants.
  - `copyLink` (~line 119-130) calls
    `navigator.clipboard.writeText(roomUrl).then(onSuccess, onFailure)`
    directly — reading `.writeText` off an `undefined`
    `navigator.clipboard` throws synchronously, before the `.then` chain
    exists, so the existing rejection branch never runs in the actual bug
    scenario (root plan's root-cause note).
  - The room-link `TextField` (~line 155-162) is `readOnly`, already has
    `onFocus={(event) => event.target.select()}`, and has no `ref` today.
  - `FieldScaffold label="Room link"` (~line 154) is how the field is
    queryable in tests via `getByLabelText("Room link")` — this labeling is
    unaffected by anything in this task.

- `apps/web/test/room-screen.test.tsx` — the suite's shared fixtures:
  `memberBootstrap()` (stubs `GET /me` + `GET /lobbies/:id`, ~line 33-37),
  `setupFake()` (fake realtime client), `renderApp`/`stubApi` from
  `./support/harness.js`, and a top-level `afterEach` (~line 25-28) that
  calls `vi.unstubAllGlobals()` — this cleans up any `vi.stubGlobal` call
  automatically, including one on `navigator`. The nearest pattern for
  "render seated room, click a button, assert the result" is the 422
  `BadPlayerCount` test (~line 276-297): `setupFake()` →
  `userEvent.setup()` → `stubApi({...memberBootstrap fields...})` →
  `renderApp(...)` → `user.click(await screen.findByRole("button", {
name: "..." }))` → assert.

  **Checked and worth recording:** no test anywhere in the repo (grepped
  `apps/web/test`, `apps/web/src`, `packages/ui/test`, `packages/ui/src`
  for `"Link copied"`) exercises `copyLink`'s success branch by clicking
  the button — the only two existing references to that string are the
  `pushToast` call site itself and the static gallery/toast fixtures. jsdom
  (30.0.1, this suite's environment) does not implement the Clipboard API,
  so `navigator.clipboard` is `undefined` in every test's `jsdom` window
  unless a test stubs it — meaning any test that clicked "Copy link" before
  this fix would already have hit the exact synchronous-throw bug this task
  fixes. This is why the bug shipped in CAM-17 undetected. The root plan
  originally claimed clause 3 was "already covered by existing behavior";
  that premise didn't hold, and the root plan has since been corrected to
  require a third, resolving-promise test case (step 3 below now includes
  it).

- Relevant skills: **`frontend-architecture`** — this fix stays
  presentation-only; no state migrates into `use-room.ts` or any hook, no
  new hook is created, `copyLink` and the new `useRef` stay local to
  `SeatedRoom`'s render function exactly as they are today (just a
  handler and a ref, not derived game state). **`design-system`** — no new
  tokens, copy, or component variants are introduced; the toast wording is
  pinned unchanged by the root plan's Decision Log and the `TextField`
  visual spec (`design-system/components/core/text-field.md`, cited in the
  component's own doc comment) is untouched — this task only adds a
  behavioral prop, never a class or variant.

## Plan of work

One milestone, three sequential steps (matches the root plan's Plan of
work numbering exactly):

### 1. `TextField` ref prop (`packages/ui`)

File: `packages/ui/src/components/text-field.tsx`.

- Add an optional `ref?: React.Ref<HTMLInputElement>` to `TextFieldProps`
  (either inline on the existing interface or via a small intersection
  type — implementer's call, whichever reads cleaner given the existing
  `VariantProps` intersection).
- Destructure `ref` out in the function's parameter list alongside
  `className` and `variant`, and pass `ref={ref}` to the rendered
  `<input>` next to the existing `className`/`{...props}` spread. Order
  matters only in that `ref` must not be part of the `...props` spread
  (it already won't be, once destructured).
- Do not wrap the component in `forwardRef` — keep it a plain function
  component, per the root plan's Decision Log.
- No behavior or visual change for any existing consumer: every current
  call site omits `ref`, so this is purely additive. This is also this
  step's own validation — see Concrete steps & validation below.

This step lands and typechecks alone before step 2 touches it, since it's
the one change with a blast radius beyond this task (every `TextField`
consumer across `apps/web`).

### 2. `copyLink` fallback guard (`apps/web`)

File: `apps/web/src/containers/room/room-screen.tsx`, inside `SeatedRoom`.

- Add `const linkRef = React.useRef<HTMLInputElement>(null)` near the
  existing `toasts`/`toastSeq` state (~line 109-110) — `React` is already
  imported as a namespace (`import * as React from "react"`, line 16), so
  no new import is needed.
- Add `ref={linkRef}` to the room-link `TextField` instance (~line 155),
  alongside its existing `readOnly`, `className`, `value`, and `onFocus`
  props. Leave `onFocus={(event) => event.target.select()}` exactly as is
  — focusing the ref triggers this handler, which is the whole point.
- Rewrite `copyLink` to:
  1. Guard the missing-API case before calling `writeText` at all:
     something shaped like
     `if (!navigator.clipboard?.writeText) { <focus + alarm toast>; return }`.
     This is the actual root-cause fix — reading `.writeText` off
     `undefined` throws synchronously, so this has to happen before any
     `.then` chain is reached, not inside one.
  2. Keep calling `navigator.clipboard.writeText(roomUrl).then(...)` for
     the case where the API exists; the success branch is unchanged
     (`pushToast({ variant: "success", message: "Link copied" })`); the
     rejection branch must produce the identical outcome as the guard
     branch (focus + alarm toast).
  - The guard branch and the rejection branch end up doing the exact same
    two things (focus `linkRef`, push the identical alarm toast) — factor
    that into one small local function or constant inside `copyLink` (or
    just above it) so the toast message string exists once, not twice.
    Exact shape (helper function vs. inline closure vs. a `const`
    `copyFailed = () => {...}`) is the implementer's call; the constraint
    is: the alarm toast message text must be byte-identical between both
    call sites, ideally by construction (one string literal, not two).
- No other prop or behavior on `SeatedRoom` changes. `roomUrl` computation,
  `pushToast`, and every other button on this screen are untouched.

### 3. Tests (`apps/web`)

File: `apps/web/test/room-screen.test.tsx`.

- Add a new `describe` block for the copy-link fallback, placed near the
  other `SeatedRoom`-focused tests (the 422 test's `describe` block, or a
  new sibling one — implementer's call on grouping, but keep it out of
  the `describe("member bootstrap ...")` block since this isn't a
  bootstrap concern).
- Three cases, all following the 422 test's exact setup pattern
  (`setupFake()` → `userEvent.setup()` → `stubApi(memberBootstrap-shaped
fields)` → `renderApp(`/room/${GAME_ID}`)` → click), with the stub
  applied to `navigator` **before** `renderApp` (matching how the
  first-load-skeleton test at ~line 358-367 stubs `fetch` before
  rendering):
  1. **Missing API:**
     `vi.stubGlobal("navigator", { ...navigator, clipboard: undefined })`.
  2. **Rejecting promise:**
     `vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } })`.
  3. **Resolving promise (clause 3 — new coverage, not a pre-existing
     regression check):**
     `vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })`.
  - All three rely on the file's existing top-level `afterEach(() => {
vi.unstubAllGlobals(); ... })` for cleanup — no new `afterEach` needed
    and none should be added.
- Cases 1–2 click `screen.getByRole("button", { name: "Copy link" })` and
  assert, per clauses 1–2 of the root-plan contract:
  - The alarm toast text appears:
    `await screen.findByText("Couldn't copy. Select the link and copy it yourself.")`.
    (Root-plan-confirmed: assert by message text via `findByText`, not by
    role or a toast variant attribute — `Toast`
    (`packages/ui/src/components/toast.tsx`) renders `role="status"` with
    no `data-variant`, and the existing `packages/ui/test/toast.test.tsx`
    already asserts this way.)
  - The room-link field ends up focused: get it via
    `screen.getByLabelText("Room link")` (already the pattern at test
    ~line 84) and assert `document.activeElement === input`. Optionally
    also assert the full value is selected
    (`input.selectionStart === 0 && input.selectionEnd ===
input.value.length`) if that proves reliable in jsdom — treat this as
    a nice-to-have, not a hard requirement, since `document.activeElement`
    alone already pins "focus was called," which is the thing this task
    adds.
- Case 3 clicks the same button and asserts, per clause 3:
  - The success toast text appears: `await screen.findByText("Link copied")`.
  - No assertion about focus/selection state — clause 3 explicitly requires
    none.

## Concrete steps & validation

Run from the repo root. Package names (confirmed from `package.json`):
`@cambio/web` and `@cambio/ui`.

1. After step 1 (`packages/ui` change):
   `pnpm turbo build typecheck lint test --filter @cambio/ui` — expect a
   clean build/typecheck/lint and the existing `packages/ui/test` suite
   (7 files: `alert`, `app-shell`, `field-scaffold`, `modal`, `smoke`,
   `toast`, plus setup) still green with no count regression. There is no
   `text-field.test.tsx` today and this step does not add one (per root
   plan's Validation: the change is additive/behavior-preserving, covered
   by the full gate exercising every consumer, not a dedicated unit test).
2. After step 2 (`room-screen.tsx` change), before tests are added:
   `pnpm turbo build typecheck lint --filter @cambio/web` — expect a clean
   typecheck/lint; `test` is expected to still pass since no test yet
   exercises the new branches (a red state here would mean the refactor
   broke the existing 422/leave/reconnecting suites, which must not
   happen).
3. After step 3 (tests added): `pnpm turbo test --filter @cambio/web` —
   expect the three new cases passing plus the full existing
   `room-screen.test.tsx` suite (currently: member-bootstrap,
   join-on-visit ×2, leave, reconnecting, room-states ×2 — 7 tests before
   this task) still green, count now +3.
4. Final gate, whole repo, run bare (never piped — see AGENTS.md):
   `pnpm turbo build typecheck lint test`. This is the actual close-out
   signal for clause 4 (every `TextField` consumer across `apps/web`
   still builds/typechecks/lints/tests clean) and for the acceptance
   criteria in the root plan.
5. Optional manual smoke (root plan calls this recommended, not required):
   serve the app on a LAN IP
   (`pnpm dev` with `WEB_PORT` as needed, then open
   `http://<lan-ip>:<port>/room/<id>` from a second device on the same
   network — a genuine insecure-context origin) and confirm clicking
   "Copy link" selects the link text and shows the "Couldn't copy…" toast.

## Contract coverage

_(maintained by `/implement`, verified by `/review`)_

| Clause                                                                                         | Test (file + name)                                                                                                                                                           | What is asserted                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Missing `navigator.clipboard`/`writeText` → no throw, field focused+selected, alarm toast   | `apps/web/test/room-screen.test.tsx` > `copy link fallback (CAM-22)` > `focuses and selects the room-link field and shows the alarm toast when the clipboard API is missing` | Alarm toast text "Couldn't copy. Select the link and copy it yourself." appears (`findByText`); room-link input (`getByLabelText("Room link")`) equals `document.activeElement` |
| 2. `writeText` rejects → identical outcome to clause 1                                         | `apps/web/test/room-screen.test.tsx` > `copy link fallback (CAM-22)` > `focuses and selects the room-link field and shows the alarm toast when writeText rejects`            | Same two assertions as clause 1, with `writeText` stubbed via `vi.fn().mockRejectedValue(...)` instead of an absent `navigator.clipboard`                                       |
| 3. `writeText` resolves → unchanged success toast, no focus assertion required                 | `apps/web/test/room-screen.test.tsx` > `copy link fallback (CAM-22)` > `shows the success toast when writeText resolves`                                                     | Success toast text "Link copied" appears (`findByText`); no focus/selection assertion made                                                                                      |
| 4. `TextField` accepts optional `ref`, forwards to `<input>`, no change for existing consumers | _(none dedicated — covered by the full-repo gate across all `TextField` consumers)_                                                                                          | n/a                                                                                                                                                                             |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-06 — child plan drafted from root/CAM-22.md, no code written
- [x] 2026-09-06 07:00 — step 1 done: `ref` prop added to `TextField`
      (`packages/ui/src/components/text-field.tsx`), no `forwardRef`, per
      the plan. `pnpm turbo build typecheck lint test --filter @cambio/ui`
      green.
- [x] 2026-09-06 07:02 — step 2 done: `linkRef` + guard wired into
      `copyLink` (`apps/web/src/containers/room/room-screen.tsx`). The
      guard branch and the `.then` rejection branch share one
      `copyFailed()` local function (focus + alarm toast), so the toast
      message string exists once, per the plan's constraint.
      `pnpm turbo build typecheck lint --filter @cambio/web` green.
- [x] 2026-09-06 07:05 — step 3 done: three tests added to
      `apps/web/test/room-screen.test.tsx` under a new
      `describe("copy link fallback (CAM-22)", ...)` block — missing API,
      rejecting promise, resolving promise — following the 422 test's setup
      pattern with `vi.stubGlobal("navigator", ...)` applied before
      `renderApp`. `pnpm turbo test --filter @cambio/web` green (20 files,
      193 tests, +3 from before).
- [x] 2026-09-06 07:10 — Contract coverage table filled with real test
      names and assertion phrases for clauses 1–3.

## Surprises & notes for the root plan

- **Resolved:** this plan originally flagged that clause 3 (the success
  toast) had no test coverage before or after this task, contradicting the
  root plan's original Validation claim that it was "already covered by
  existing behavior." A repo-wide grep for `"Link copied"` (across
  `apps/web/test`, `apps/web/src`, `packages/ui/test`, `packages/ui/src`)
  found only the `pushToast` call site itself and static fixtures
  (`packages/ui/test/toast.test.tsx`'s hardcoded toast list,
  `apps/web/src/components/gallery/generic.tsx`'s style-gallery demo) — no
  test anywhere clicked "Copy link" with a resolving `writeText` and
  asserted the success toast. jsdom 30.0.1 (this suite's test environment)
  also doesn't implement the Clipboard API at all, so no existing test
  could have exercised the success branch even incidentally. The root plan
  has since been corrected to require a third, resolving-promise test case,
  and this child plan (Plan of work step 3, Concrete steps, Contract
  coverage) now includes it. No further action needed.
