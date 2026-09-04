---
name: design-system
description: Router into design-system/, the visual law of Cambio — every component, token, pattern, and copy rule for the UI, entered through its decision map. Use this before ANY visual work — building or styling a component, picking a color, spacing, motion, or type value, writing UI copy, adding a screen state — even tiny tweaks, because every visual value must map to a token, nothing canonical may be invented, and the folder only exists on release branches.
---

# Design system (router)

The design system lives in **`design-system/`** at the repo root. Its
entry point is `design-system/design-system.md` — a one-page router with
a decision map from task ("building a form", "need an exact value",
"writing copy") to the file that governs it. **Enter through that map;
this skill does not duplicate it.** Component specs live under
`components/core/`, exact values in `references/tokens.md`, copy rules in
`references/voice.md`, screen patterns in `patterns/`.

## Branch reality — check before anything else

The design system lives on **release branches only**. If `design-system/`
is absent from the working tree, you are on `main` or `development`:
**stop and say so.** Do not invent components, tokens, or patterns from
memory, and do not reconstruct them from this skill — read-only access to
the canonical files is available via
`git show release-v0:design-system/design-system.md` (substitute the
current release branch), but changes to the system happen on the release
branch, never here.

## The creation gate

You may **not** create, modify, or extend anything canonical — a
component, token, variant, or pattern — on your own. The procedure is in
the router's "Creation gate" section: STOP, name the gap, wait for the
user's explicit call. This holds under time pressure and "it's just one
small variant" pressure; an off-system value that ships is a defect, not
a shortcut.

## Non-negotiables carried by the system

- **Every visual value maps to a token.** No hardcoded colors, spacing,
  radii, shadows, easings, or durations — Tailwind utilities come from
  the `@theme` variables (ADR-0027).
- **Hidden information is design law.** No component may hint at card
  values the viewer is not entitled to; peeked cards render briefly and
  are never persisted. When in doubt, load the `hidden-information`
  skill — `components/core/playing-card.md` is the worked example.
- **Production doc beats prototype**, and **the design system outranks
  the tooling**: impeccable, the gate family, and the animation skills
  judge execution quality, never identity. When a generic flag hits a
  deliberate choice (cream paper, poster display face), surface the
  conflict — never auto-"fix".

## Routing

- `frontend-architecture` — where the rendering code lives
- `ai-tells` — auditing produced UI against this system
- `animate` / `review-animations` — motion execution quality (the system
  decides what moves and how it feels; they govern curves and durations)
