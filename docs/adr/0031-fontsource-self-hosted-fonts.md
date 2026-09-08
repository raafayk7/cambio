# 0031 — Design-system fonts are self-hosted via @fontsource packages

- **Status:** accepted
- **Date:** 2026-09-04
- **Task:** CAM-15

## Context

The design system's typography (`design-system/references/tokens.md`)
specifies two faces: Alfa Slab One (the `display` role, weight 400 only)
and Archivo (the `ui` and `numeral` roles, weights 400/500/600/700 with
tabular numerals). Neither is loaded anywhere — no `@font-face`, no font
files, no CDN links exist in the repo — so every surface silently falls
back to Rockwell/system-ui, and the identity the CAM-13 moodboard chose
never actually renders. CAM-15 builds the component layer and must make
the faces real. The delivery mechanism matters beyond aesthetics: the
design-gate's rendered path screenshots pages headlessly (waiting for
network idle), and ADR-0029 established the posture that tooling inputs
live in the repo rather than arriving over the network at run time.

## Decision

We self-host both faces via **@fontsource packages** —
`@fontsource/alfa-slab-one` (400) and `@fontsource/archivo` (400/500/600/ 700) — as dependencies of `packages/ui`, imported at the top of
`packages/ui/src/styles.css` alongside the token layer. The `@theme` font
tokens reference the loaded families with the fallback stacks from
tokens.md. Fonts ship through the app bundle like any other asset: no
third-party origin at run time, identical rendering in dev, production,
offline work, and the headless gate.

**Alternatives rejected:**

- **Google Fonts `<link>` in `__root.tsx`** — zero packages, but makes
  every render (including the gate's `networkidle` screenshots and offline
  development) depend on a third-party origin, and leaks visitor requests
  to Google for no benefit at this scale.
- **Hand-rolled `@font-face` with committed woff2 files** — same runtime
  properties as fontsource, but the subsetting, unicode-range splitting,
  and license files become manual maintenance that fontsource already does
  as versioned npm metadata.

## Consequences

Font weights are explicit imports — adding a weight is a visible diff, not
a CDN query-string tweak, which keeps the tokens.md weight vocabulary
(400/500/600/700, display locked to 400) enforceable by inspection. Bundle
carries the font payload (woff2, a few hundred KB total); acceptable for a
game client and revisitable with subsetting if it ever measures as a
problem. The design-gate renders true typography with no network. We
commit to keeping the fontsource versions pinned like any dependency;
revisit only if a face leaves the fontsource catalog or licensing changes.
