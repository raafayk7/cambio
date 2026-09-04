---
name: rubric-principles
description: |
  The two-tier principle rubric — the spine of the design-evaluator gate. Read by the MAP and JUDGE
  stages. Principles-first: each rule states what it is, its TIER, and (for default-tier rules) what a
  CONTROLLED break looks like vs an ACCIDENTAL one. Constraint-tier = near-inviolable, violation is a
  near-automatic fail. Default-tier = strong defaults good design can earn the right to break.
  Grounded in WCAG 2.1 AA, Nielsen's 10 heuristics, Gestalt, Butterick (typography), Refactoring UI
  (hierarchy/spacing), and Carbonteq's own exemplar corpus.
---

# The rubric — principles first, two tiers

**How the tiers are used by the Judge:**

- **Constraint tier** → a violation is a near-automatic FAIL. Cite it plainly. Not eligible for a
  "controlled break" defense (except where noted).
- **Default tier** → a violation is NOT an auto-fail. The Judge assesses whether the break is
  **controlled** (intentional, consistent, the rest of the composition is disciplined, the break
  creates a clear effect → allowed) or **accidental** (one of several things going wrong, nothing
  holding the composition → flag). Every such call is marked explicitly and routed to a human.

**The corpus's central lesson, encoded here:** the discriminator between good and bad is almost never
the _technique_ (gradients, AI imagery, overlap, dark mode all appear in good designs) — it's
_execution + intent_. So most surface features live in the default tier and are judged on control,
not presence. Only genuinely measurable, near-inviolable rules are constraint tier.

---

## CONSTRAINT TIER (measurable / near-inviolable → near-automatic fail)

### C1 — Contrast & legibility

**Rule:** Text and meaningful UI must meet WCAG 2.1 AA — text 4.5:1 (3:1 large), UI/graphics 3:1;
information not conveyed by color alone. **Measured by hard-checks (binary; 4.49 fails).**
_Why near-inviolable:_ illegible is illegible; no intent rescues text nobody can read. Corpus p18
("low visibility of text"), p8 ("selected state too light") fail here.

### C2 — Touch targets

**Rule:** Interactive targets ≥ 24px minimum dimension (hard fail under 24; 24–44px advisory).
**Measured by hard-checks.**

### C3 — Slop convergence _(HYBRID — conditional constraint; confirmed with Eman)_

**Rule:** When slop markers **converge** (≥3 markers, or ≥2 high-weight — see ai-slop/markers.json):

- **If convergence co-occurs with a constraint fail (C1 contrast or C2 touch target)** → it's a
  **constraint-tier flag**: the design both _looks_ templated and is _measurably_ broken. Name the
  drivers; near-automatic fail.
- **If convergence occurs without any constraint fail** → it's a **strong default-tier signal**,
  judged for control. **If the Judge reads it as accidental (generic, nothing disciplined holding it),
  it FLAGS the design on its own — a clean-but-generic page should still be flagged (Eman's call).**
  Only a _controlled_ convergence (the markers are clearly intentional and the composition is
  disciplined) escapes the flag.
  **Critical guardrail:** a **single** marker is NEVER a flag. The corpus shows gradients, AI imagery,
  dark+glow, glass, and overlap all in _good_ designs. Convergence is the signal; isolated markers are
  just observations. Always state drivers so a human can override.

> **Note:** Token self-consistency is **NOT** constraint-tier (Eman's call). Hard-checks still
> _measure_ drift, but it feeds the Judge as **default rule D10** (judged for control), never an
> auto-fail. A bold design may use irregular spacing on purpose.

---

## DEFAULT TIER (strong defaults; breakable when the break is controlled)

For each: **rule**, then **controlled vs accidental** tell.

### D1 — Visual hierarchy

**Rule:** The eye should have a clear path; the most important element should dominate (size, weight,
color, position). Heading and CTA shouldn't read at the same level. _(Gestalt figure-ground;
Refactoring UI.)_

- **Controlled break** — a stark size jump or unusual emphasis used deliberately for editorial effect,
  with everything else disciplined (corpus p16: "size difference is stark but intentional →
  editorial"; p6: "hierarchy lets the eye follow a path").
- **Accidental** — three equal-weight elements competing, CTA same size as heading (corpus p22), no
  focal point.

### D2 — Proximity & grouping

**Rule:** Related things sit together; unrelated things are separated. _(Gestalt — proximity is
weighted highest; common region.)_

- **Controlled** — deliberate tight/loose grouping that clarifies structure.
- **Accidental** — even spacing everywhere so nothing groups; related items drifting apart.

### D3 — Alignment & spacing rhythm

**Rule:** Elements align to a system; spacing follows a consistent rhythm; padding is balanced.
_(Butterick; Refactoring UI.)_

- **Controlled** — a broken grid or asymmetry that creates energy/focus while the rest holds (corpus
  p6 layout break; p17 overlapping cards with shadows "properly merged").
- **Accidental** — misalignment with nothing else holding the composition; cramped/uneven padding
  (corpus p18, p23 "CTA padding too much").

### D4 — Typography craft

**Rule:** A clear type scale; comfortable line length; ≤ ~2–3 families; weight/size (not new fonts)
for emphasis. _(Butterick.)_

- **Controlled** — an unconventional but consistent type system that carries the brand (corpus p13,
  p21 "editorial", p20 "font weight for emphasis").
- **Accidental** — 4+ competing typefaces (corpus p3, p5), mismatched hand-drawn font (p8), text too
  big with no system (p3).

### D5 — Restraint / aesthetic-minimalism

**Rule:** Every element earns its place; no decorative clutter. _(Nielsen #8.)_

- **Controlled** — maximalism/boldness used on purpose and coherently (a loud brutalist or vintage
  piece can be restrained in _discipline_ even if loud in style — corpus p9, p19).
- **Accidental** — surfaces stacked on surfaces, effects with no purpose (corpus p23 "too many
  surfaces on top of surfaces"), gratuitous gradients/glow.

### D6 — Consistency & conventions

**Rule:** One consistent component system; respect established UI conventions unless breaking them
serves the user. _(Nielsen #4.)_

- **Controlled** — a convention broken knowingly for a clear gain, applied consistently.
- **Accidental** — inconsistent button styles / too many button types (corpus p3, p8), random
  one-off treatments.

### D7 — Personality / character / intent _(corpus's dominant axis — now a blocking default rule, Eman's call)_

**Rule:** The design should feel intentional and brand-specific — not generic/template. This is the
single most frequent theme in the corpus ("personality", "character", "intentional", "on brand",
"feels human, not AI"). A design that reads as generic/template/"could be anything" can be **flagged**.

- **Controlled / present** — a distinctive move that could only belong to this product (corpus p6, p9,
  p11, p13, p19, p20).
- **Accidental / absent** — "no personality", "generic", "template", "could be anything" (corpus p4,
  p18, p23). → flag.
- **⚠ Reliability + guardrail (still applies):** "feels generic" is the least statically-reliable
  call, so when the Judge flags on personality it MUST (a) cite the concrete evidence that makes it
  read generic — usually the converged slop markers (emoji icons, eyebrows, em-dashes, generic copy,
  templated grids), not a bare vibe; (b) state confidence; (c) set `human_review: true`. It may block,
  but never as an unevidenced assertion — ground it in located markers so Eman can audit and override.

### D8 — Craft of execution (depth, effects, imagery)

**Rule:** Effects (depth, overlays, light, texture, glass, motion-blur, AI art) must be executed
_well_ and serve the design. The corpus judges these on execution, not presence.

- **Controlled / well-executed** — gradient adds depth (p11), grey/black surfaces create depth
  without slop (p14), overlay lets text show over an image (p14), motion-blur complements the feel
  (p15, p21), AI/anime/pixel art styled so it doesn't read as AI (p6, p20).
- **Accidental / poorly-executed** — "glass effect not working, feels shabby" (p10, p22), gradient
  "looks bad" (p5), imagery "too perfect without human touch" (p10).
- **⚠ Reliability:** execution quality is largely a visual judgment from the screenshot; medium
  reliability. Mark confidence; route close calls to a human.

### D9 — Usability heuristics (visible subset)

**Rule:** Nielsen's interaction heuristics — visibility of status, user control, error prevention,
recognition-over-recall, help users recover. _(Nielsen 1–7, 9–10.)_

- **⚠ Scope:** most of these are _behavioral_ and not detectable from a static artifact. The gate
  enforces only what's visible (e.g. an unlabeled icon-only control = recognition risk; no visible
  error affordance). Note the rest as out-of-scope for a static gate; don't hallucinate behavior.

### D10 — Token self-consistency (moved here from constraint tier — Eman's call)

**Rule:** Spacing/size/color should sit on a coherent per-project scale. **Measured by hard-checks**
(per-project drift, not a company standard), but judged for control — not an auto-fail.

- **Controlled** — deliberate irregular spacing/scale that serves a bold layout, applied coherently.
- **Accidental** — unsystematic spacing, cramped/off-balance padding, a sprawling palette with no
  system (corpus p7 "padding off balance", p18 "padding is poor", p23 "CTA padding too much").

---

## INFORMATIONAL (surfaced for a human — NEVER blocks, never fails a design)

> Personality/character was **promoted to blocking default rule D7** (Eman's call) — it is no longer
> here. Only conformance remains informational.

### I2 — Conformance / distance from exemplars

**What:** How stylistically close/far the design is from the corpus. A principled design can look
nothing like any exemplar and still be excellent. **Surface as a note only** ("passes principles;
stylistically distant from our references — worth a designer's glance"). Never blocks.

---

## How Map uses this

For each Decompose observation: name the principle (C#/D#), its tier, and satisfied/violated + why.
Pass tier through so the Judge knows what's eligible for a controlled-break defense.

## How Judge uses this

- **Constraint violation (C1/C2)** → near-auto fail, cited plainly.
- **Slop convergence (C3, hybrid)** → constraint flag if it co-occurs with a C1/C2 fail; otherwise a
  default-tier signal that **still flags when read as accidental** (clean-but-generic is a flag).
  Always name the drivers.
- **Default violation (D1–D10, incl. D7 personality)** → controlled-vs-accidental call, marked
  explicitly and human-routed, using the tells above + the annotated-exemplars controlled-break set
  (p6, p16, p17). **D7 personality may flag**, but only with cited marker evidence + confidence +
  `human_review`.
- **Informational (I2 conformance only)** → surface as a note for a human; **never fails or flags.**
- **Argue, never score.** Cite the principle + tier, locate the element, say controlled-or-mistake +
  why, give a concrete fix.
