# 0027 — Tailwind v4 @theme CSS variables carry the design-system tokens

- **Status:** proposed
- **Date:** 2026-09-04
- **Task:** CAM-14

## Context

CAM-13 landed the design system: a token vocabulary in
`design-system/references/tokens.md` with two layers — named primitives
(`cream-scene #f6dcae`, `green-table #36634a`, …) and semantic roles that
reference them (`surface.page`, `ink.primary`, `accent.alarm`) — plus
non-scalar tokens (`radius.card: 6% of card width`, zero-blur offset
elevation shadows, `ease.snap`/`duration.snap` motion values). The dark
theme is deferred and specified to land as a **re-mapping of semantic roles
to a new primitive set**, never as per-component repaints — which is why
every component references roles, not primitives.

Meanwhile `apps/web` is not choosing a styling stack from scratch: Tailwind
v4.3.3 and `@tailwindcss/vite` are already wired end to end
(`apps/web/vite.config.ts`, `apps/web/src/styles.css`,
`packages/ui/src/styles.css`), CSS-first with no `tailwind.config.*`. The
`@theme` block in `packages/ui/src/styles.css` holds stock shadcn tokens
with an explicit note: "Replace wholesale when the design lands rather than
accreting overrides here." CAM-14 must decide the styling stack formally so
CAM-15 (UI core components) can build on it, and so the audit tooling
installed alongside (impeccable's static detector, the adapted ai-tells
regex catalog) has a mechanically checkable substrate.

## Decision

We keep **Tailwind v4, CSS-first**, and express the entire design-system
token vocabulary as **CSS variables in the `@theme` block** of
`packages/ui/src/styles.css`:

- The stock shadcn token set is **replaced wholesale**, per its own
  instruction — default namespaces the design system doesn't use are wiped
  (`--color-*: initial;` style) so off-system utilities like `bg-stone-50`
  do not exist to be reached for.
- **Primitives** live as plain CSS custom properties; **semantic roles**
  are the tier promoted to utilities, aliasing primitives via
  `@theme inline` so the deferred dark theme lands as a role re-mapping
  with no component edits — preserving the tokens.md indirection in the
  executable form.
- **Non-scalar tokens** (`radius.card` as a percentage of card width, the
  zero-blur offset elevation shadows, motion easing/durations) become
  custom utilities (`@utility`) or component-level CSS built on the
  variables — they are not forced into Tailwind scale values.
- `design-system/references/tokens.md` remains the documented source of
  truth (values, rationale, WCAG notes); `packages/ui/src/styles.css` is
  its executable mirror. CAM-15 performs the actual mapping; divergence
  between the two files is a defect.

**Alternatives rejected:**

- **Panda CSS** — the Carbonteq portal's worked examples use it, but it
  would be a second styling system alongside what is already wired, and the
  portal's surrounding stack prescriptions (Next.js/ANTD) are explicitly
  excluded for Cambio.
- **CSS modules / vanilla-extract** — lose class-level auditability: the
  anti-slop and hardcoded-value checks work by reading utility classes and
  CSS variables statically.
- **Keeping shadcn defaults and overriding incrementally** — explicitly
  warned against in the file itself; accretes two competing vocabularies.

A note on rationale drift from the original brief: the design-gate
hardcheck renderer turned out to be styling-agnostic (it reads computed
styles from a rendered page, not Tailwind classes). The mechanical-
checkability argument stands on impeccable's static detector, the ai-tells
regexes, and the greppability of off-token utilities — not on design-gate.

## Consequences

"No hardcoded values, anywhere" (the design-system operating rule) becomes
mechanically checkable: any arbitrary-value utility (`bg-[#...]`,
`p-[13px]`) or utility from a wiped namespace is an audit flag, not a
judgment call. New tokens go through the design-system creation gate first,
then get a variable in `@theme` — never the reverse. We commit to keeping
tokens.md and styles.css convergent, and to expressing future themes as
role re-mappings. Revisit if Tailwind's utility model proves unable to
express the game-object states (7-state card floor) without fighting it.
