---
name: annotated-exemplars
description: |
  The graded exemplar bank for the design-evaluator gate. Read by the JUDGE. 23 real designs (12 good,
  10 bad, 1 mixed) from Carbonteq, each carrying Eman's verbatim "why" (corpus.json). Two jobs:
  (1) calibrate the quality bar — what "personality", "restraint", "intentional" mean HERE;
  (2) demonstrate LEGITIMATE BREAKS — designs that break a default rule on purpose and still work.
  Exemplars are graded EVIDENCE of principles, never the definition of correctness. The Judge must be
  able to pass a principled design unlike any exemplar, and fail one that mimics an exemplar's look but
  violates the principle. Conformance/distance is INFORMATIONAL, never blocking.
---

# Annotated exemplars — calibration, not a template

`corpus.json` is the source of truth: 23 entries, each with `page`, `verdict`, and Eman's verbatim
`caption`. **Do not treat resemblance to these as correctness.** They are graded evidence of _why_
designs work or fail here. The "why" transfers; the look does not.

## THE load-bearing lesson: execution + intent, not the technique

Across this corpus the **same surface technique appears on both the good and bad side.** What
separates them is _execution and intentionality_. This is the single most important thing the Judge
must internalize — never flag a design for using a technique; judge how well and how deliberately it's
used.

| Technique                   | BAD when…                                                                         | GOOD when…                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Gradient**                | gradient text/buttons, purple-blue wash, "looks bad", no intent (p2, p4, p5, p10) | adds depth/texture with intent (p7 "good use of gradient in bg", p11 "texture on gradient adds depth") |
| **AI-generated imagery**    | "too perfect without human touch", reads as AI (p5, p8, p10)                      | styled so it doesn't read as AI; anime/pixel/editorial; "more human made" (p6, p20, p21)               |
| **Dark mode + light/glow**  | default dark + glow = "AI forward" (p2, p3)                                       | grey/black surfaces create real depth without slop (p14, p20)                                          |
| **Glass / frosted panels**  | "not working, feels shabby", borders don't match theme (p10, p22, p7-partial)     | tactile, consistent (p23 notes claymorphism controls _do_ feel tactile)                                |
| **Overlap / broken layout** | n/a (when it fails it's just misalignment)                                        | deliberate, disciplined elsewhere, creates focus (p6, p16, p17)                                        |
| **Bold / loud style**       | clutter, "too many surfaces" (p23)                                                | coherent maximalism — brutalist (p9), vintage newspaper (p19)                                          |

When the Judge sees a marker (from ai-slop), it must ask the corpus's question: _is this executed and
intended like the GOOD column, or the BAD column?_ — not _is the marker present?_

## Job 1 — Calibrate the quality bar (Eman's vocabulary)

**What makes a design GOOD here** (recurring in good captions): personality / character; intentional
choices; clear visual hierarchy ("eyes follow a path"); depth done well (surfaces, overlays, texture,
light); on-brand / brand elements that stand out; editorial type (font + stark size contrast);
"feels human, not AI"; restraint in typography.

**What makes a design BAD here** (recurring in bad captions): generic / template / "no personality";
gradient text & buttons; purple/blue (or hot-pink) gradients; poorly-executed glass; default
dark+glow; too many fonts; AI-looking imagery; inconsistent / too many button styles; heading and CTA
the same size; low-contrast text; poor/unbalanced padding; "surfaces on top of surfaces".

These calibrate how the Judge interprets default-tier rules (D5 restraint, D8 craft) and the
informational personality read (I1) — they do **not** become pass/fail thresholds themselves.

## Job 2 — Legitimate breaks (the controlled-break reference set)

These are GOOD designs that **break a default rule on purpose.** Use them as the reference for what a
_controlled_ break looks like when judging a design you've never seen.

- **p6 (Algen)** — breaks **D3 alignment / traditional layout**. Works because: visually distinct,
  organic shapes add personality, and **hierarchy still lets the eye follow a path** — the rest is
  disciplined. _Controlled._
- **p16 (National Museum)** — breaks **D1 hierarchy / D3** with a **stark** small-vs-large size jump
  and text layered behind/in front of the image. Works because: "that's intentional and creates an
  editorial style", and the layering creates real depth. _Controlled._
- **p17 (Eyewear)** — breaks **D3** with **overlapping cards**. Works because: shadows are "properly
  merged with bg", the thin font fits the design language — disciplined execution. (Even here Eman
  notes one accidental miss: button padding feels unaligned → a real D10 nit inside a good design.)

**Contrast with accidental breaks:** p18 (misaligned, cramped padding, "un-imaginative", nothing
holding it) and p23 ("surfaces on top of surfaces", generic) break similar rules but _nothing else is
disciplined_ → accidental → flag. Same observable fact (broken grid / overlap), opposite verdict —
decided by whether the rest of the composition holds.

## Job 3 — Conformance is informational (never blocking)

A design can honor every principle yet look nothing like these 23 — and still be good (a legitimate
new style; the corpus itself spans brutalist, vintage, editorial, pixel, mobile). Surface distance
from exemplars only as a note: _"passes principles; stylistically distant from our references — worth
a designer's glance."_ Never fail a design for not resembling the bank.

## How the Judge should cite exemplars

When making a controlled-vs-accidental call, reference the closest exemplar by page + reason:
_"Reading this overlap as controlled — like p17, the shadows are merged and the type system holds —
not accidental like p18 where nothing else is disciplined."_ Grounds the verdict in evidence, not
vibes.

## Maintenance

- `corpus.json` captions are **verbatim ground truth** — never paraphrase or edit them.
- Page images are derivable from `exemplars.pdf` (PyMuPDF render) if a human or a future vision-judge
  wants to look; the captions carry the transferable reasoning for the text pipeline.
