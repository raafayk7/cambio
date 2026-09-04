---
name: ai-slop
description: |
  Slop DETECTOR for the design-evaluator gate. Read by the DECOMPOSE stage. Scans rendered UI code
  (+ its screenshot + hard-check facts) for the templated-AI markers defined in markers.json and
  reports which ones are present, with file:line / element locations. It DETECTS and REPORTS only —
  it does not score and does not pass a verdict. The JUDGE decides, and only on CONVERGENCE.
  Adapted from the `ai-tells` skill; catalog.md carries the Claude-default definitions.
allowed-tools: Read, Glob, Grep, Bash
---

# ai-slop — marker detection (perception, not judgment)

> **Cambio note (ADR-0029):** this skill is **gate-internal** — it exists
> for the Decompose stage's marker sweep and is never invoked as the
> repo-facing audit. That role belongs to `ai-tells`, which is calibrated
> to this repo (cream is `surface.page`, not a marker). They do not both
> run on the same artifact by default.

You run inside **Decompose**. Your job: report the slop markers actually present, as observations —
the same way Decompose reports fonts and spacing. You do **not** decide whether the design is slop;
that's the Judge's call, made only when markers **converge**.

## Two reasons this skill is deliberately conservative

1. **A single marker is never slop.** Minimalism, one gradient, one italic accent, one clean dark
   theme — all can be excellent. The corpus proves it: gradients, AI imagery, dark+glow, and overlap
   appear in _good_ designs too. The discriminator is execution + intent, which is the Judge's job.
   So you report each marker as a neutral observation; you never conclude.
2. **The marker set is broader than pure-Claude tells.** This team flags both Claude's own defaults
   (cream/eyebrow/italic-serif — see catalog.md) _and_ the "cartoon-slop" tropes Claude disowns
   (purple/blue gradient, gradient text, poor glass, hot-pink). Both are first-class here. The
   authoritative list is `markers.json` — read it before scanning.

## Inputs you get from the pipeline

- The **source code** of the design (HTML/JSX).
- The **rendered screenshot** (`<name>.png`) — look at it for the `visual_cues`.
- The **hard-check facts** (`<name>.hardcheck.json`) — some markers are already computed there
  (too-many-fonts, low-contrast-text, poor-padding/spacing drift). Fold those in; don't recompute.

## Procedure

1. **Read `markers.json`.** It is the single source of truth (also drives intent-prep prevention).
2. **Static sweep (code):** for each marker's `code_cues`, run `rg -n` over the source (skip
   node_modules). Record every `path:line` hit. If `rg` is absent, use Grep.
3. **Visual sweep (screenshot):** for each marker's `visual_cues`, inspect the rendered PNG and note
   whether it's present and where (region). This catches what code can't (imagery that "looks AI",
   glass that "feels shabby").
4. **Fold in computed markers** from `hardcheck.json` (fonts>3, contrast fails, spacing drift).
5. **Emit the marker report** (below). Apply the convergence_rule from markers.json to set a
   `convergence` summary — but frame it as a signal for the Judge, not a verdict.

## Output contract (hand to Map → Judge as part of the Decompose breakdown)

```json
{
  "slop_markers_found": [
    {
      "id": "gradient-text",
      "label": "Gradient fill on text",
      "weight": "high",
      "evidence": [
        "src/Hero.tsx:24 (bg-clip-text text-transparent)",
        "screenshot: headline letters"
      ],
      "source": ["cartoon-slop", "corpus"]
    }
  ],
  "convergence": {
    "count": 4,
    "high_weight_count": 2,
    "meets_threshold": true,
    "drivers": ["gradient-text", "purple-blue-gradient-bg", "poor-glassmorphism", "too-many-fonts"],
    "note": "FOR THE JUDGE: convergence threshold met (>=3 markers / >=2 high-weight). This is a strong slop signal to weigh as constraint-tier — but state drivers so a human can sanity-check, and do not treat any single marker as disqualifying."
  }
}
```

## Hard rules

- **Report, don't judge.** No "this is slop / this is good." Markers + locations + convergence signal.
- **Cite location for every marker** (path:line or screenshot region). No location → don't claim it.
- **Never flag on a single marker.** Convergence only — that's the whole guardrail against dinging
  genuine minimalism.
- One marker can have both code and visual evidence; record both.
