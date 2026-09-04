---
name: hard-checks
description: |
  The deterministic, constraint-tier checks for the design-evaluator gate. Read by the DECOMPOSE
  stage. These are REAL LOGIC, not model reasoning — the design is rendered in headless Chromium and
  measured. Decompose runs the scripts and folds the results in as FACTS (measured value + pass/fail
  + tier), never as opinions. Covers WCAG contrast, touch targets, and per-project token
  self-consistency.
allowed-tools: Bash, Read
---

# hard-checks — measured facts, not judgment

The most absolute end of the **constraint tier**. Where the rest of the gate argues, these _measure_.
Run them first; they feed Decompose as facts, and in production a constraint-tier failure can short-
circuit before spending Opus reasoning.

## What gets checked (thresholds are locked)

| Check                                           | Threshold                                             | Tier                                |
| ----------------------------------------------- | ----------------------------------------------------- | ----------------------------------- |
| Text contrast (normal)                          | ≥ 4.5:1                                               | constraint (binary — 4.49 fails)    |
| Text contrast (large ≥24px, or ≥18.66px & ≥700) | ≥ 3:1                                                 | constraint                          |
| Text over gradient/image                        | not statically verifiable                             | advisory (flag for a look)          |
| Touch target (min dimension)                    | < 24px fails; 24–44px advisory; ≥44px pass            | constraint / advisory               |
| Token self-consistency (spacing)                | off-token vs project file, or drift off inferred grid | **default (signal, not auto-fail)** |
| Palette breadth / font count                    | >18 colors / >3 fonts                                 | advisory                            |

> **Only contrast and touch targets are constraint-tier** (they decide `gate: pass/fail`). Token
> self-consistency is **measured but reported as a default-tier signal** (`defaultSignals[]`) — Eman's
> call: a bold design may use irregular spacing on purpose, so the Judge weighs it under D10 rather
> than auto-failing. Palette/font breadth are advisories.

Tokens are **per-project** (no company global). With a `tokens/<project>.json` (`{"spacing":[...]}`),
the check tests membership. Without one, it infers the project's own grid (8/4px) and flags
**internal drift** — an unsystematic scale — not deviation from any company standard.

## How to run (two steps)

```bash
# 1. Render → screenshot + computed-style facts
node "$CLAUDE_PROJECT_DIR/.agents/scripts/design-gate/render.js" --file path/to/design.html --out /tmp/gate/<name>
#    (or --url http://localhost:3000 , or --html '<...>')

# 2. Measure → constraint-tier verdicts
node "$CLAUDE_PROJECT_DIR/.agents/scripts/design-gate/hardcheck.js" --facts /tmp/gate/<name>.facts.json [--tokens <project-tokens.json>]
```

Outputs `<name>.hardcheck.json`. The `.png` is also handed to Decompose (perception) and ai-slop
(visual cues). JSX must be built to HTML first (plain HTML/URL is direct).

## What Decompose does with the result

- Fold every `constraintFails[]` entry in as a fact: _"contrast 1.88:1 at `p.pad` (needs 4.5:1) —
  constraint fail."_ No softening, no "consider."
- Fold `advisories[]` in as noted facts (e.g. text over a gradient → contrast unverifiable).
- Pass `observed` (fonts, palette, spacingScale, radii) downstream — Map/Judge and ai-slop use it.
- **Do not re-derive these by eye.** If the script measured it, the number is the truth.

## Why deterministic

A model eyeballing a screenshot guesses at contrast and sizes — exactly the spatial precision VLMs
are weakest at. Rendering and measuring removes that guesswork, so the constraint tier is trustworthy
and the Opus stages spend their reasoning only on the genuinely judgmental default-tier calls.

## Not covered (v1 honesty)

- **Not-color-alone** (e.g. links distinguished only by hue): partially surfaced via contrast, but
  not fully detected statically. Decompose should note color-only affordances from the screenshot.
- Dynamic/interaction states (hover, focus, error) — static render only.
