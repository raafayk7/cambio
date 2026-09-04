---
name: design-context
description: |
  Shared "Design Read + dials" used two directions by the gate. PREVENTION: intent-prep sets the
  target read/dials before generation. EVALUATION: Decompose INFERS the read/dials from the produced
  artifact ("what was this trying to be?"), and the Judge uses them to make default-tier strictness
  CONTEXTUAL — the same principle judged harder or looser depending on the kind of design. This is how
  the gate operationalizes "contextual, not global." Single source — never fork the dial definitions.
  (Dial idea adapted from leonxlnx/taste-skill; the strictness mapping is ours, for evaluation.)
---

# design-context — read the room, then judge it in context

A spacing break that's a mistake on a public-sector form can be craft on an agency hero. The rubric's
default tier is "breakable when controlled" — _this_ skill supplies the context that decides how
readily a break reads as controlled. One definition, used at generation (prevention) and at evaluation
(the gate).

## 1. The Design Read (one line)

State the design as: **"Reading this as: \<page kind> for \<audience>, \<vibe> language, leaning \<aesthetic/system>."**

- **Page kind** — landing (SaaS / consumer / agency / event), portfolio, dashboard / data UI, form,
  editorial/blog, marketing page, redesign.
- **Audience** — B2B procurement, design-conscious consumer, recruiter scanning a portfolio,
  general public, internal operator. _The audience picks the aesthetic, not the gate's taste._
- **Vibe** — words the artifact signals (minimalist/Linear-style, premium/Apple-y, playful/Awwwards,
  brutalist, editorial, dark-tech, trust-first).
- **Quiet constraints** — accessibility-critical, public-sector, regulated, kids', trust-first
  commerce. These OVERRIDE aesthetic latitude (be strict).

## 2. The three dials (1–10)

- **DESIGN_VARIANCE** — 1 = perfect symmetry/convention · 10 = asymmetric/experimental
- **VISUAL_DENSITY** — 1 = airy/art-gallery · 10 = packed/cockpit data
- **MOTION_INTENSITY** — 1 = static · 10 = cinematic _(mostly informational for the static gate)_

### Inference table (signals → dials)

| Signal                                                  | VARIANCE | DENSITY | MOTION |
| ------------------------------------------------------- | -------- | ------- | ------ |
| minimalist / clean / calm / editorial / Linear-style    | 5–6      | 2–3     | 3–4    |
| premium consumer / Apple-y / luxury / brand             | 7–8      | 3–4     | 5–7    |
| playful / Dribbble / Awwwards / experimental / agency   | 9–10     | 3–4     | 8–10   |
| landing / portfolio / marketing (default)               | 7–9      | 3–5     | 6–8    |
| dashboard / data table / admin / operator UI            | 4–6      | 7–9     | 2–4    |
| trust-first / public-sector / regulated / a11y-critical | 3–4      | 4–5     | 2–3    |

## 3. Strictness mapping (EVALUATION — how dials modulate the Judge)

The inferred dials change how readily a **default-tier** break reads as controlled vs accidental.
Constraint tier (C1 contrast, C2 touch) is **never** relaxed by context.

| Inferred intent                                          | Judge should…                                                                                                                                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **High DESIGN_VARIANCE** (agency/experimental/portfolio) | be MORE permissive on D1 stark hierarchy, D3 grid-break/asymmetry/overlap, D5 boldness — these are likely _controlled_ (cf. corpus p6/p16/p17). Still require discipline elsewhere. |
| **Low DESIGN_VARIANCE** (trust-first/public-sector/B2B)  | be STRICTER — breaks read as _accidental_; expect convention, alignment, restraint. Bold moves need strong justification.                                                           |
| **High VISUAL_DENSITY** (dashboard/data)                 | judge D3 spacing rhythm + D10 token consistency STRICTLY (dense must be _systematic_); D5 restraint strict; do NOT expect generous whitespace; legibility (C1) matters even more.   |
| **Low VISUAL_DENSITY** (airy hero/gallery)               | generous whitespace is EXPECTED, not "dead space" — don't flag empty regions as a D3 problem; sparse is the point.                                                                  |
| **Quiet constraints present**                            | override latitude — judge strictly regardless of other dials.                                                                                                                       |

> The dials describe what the design was _trying_ to be. At evaluation the gate INFERS them from the
> artifact (Decompose), names them, and the Judge applies the mapping — always stating the inferred
> read so a human can correct a wrong inference. A wrong read should never silently flip a verdict.

## 4. Used two directions (single source)

- **Prevention (intent-prep):** set the _target_ read + dials before generating, to steer output.
- **Evaluation (gate):** Decompose _infers_ the read + dials from the artifact; Judge applies §3.
  Both read THIS file. If the dials or inference change, they change here, once.
