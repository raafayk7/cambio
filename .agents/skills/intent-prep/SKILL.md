---
name: intent-prep
description: |
  PREVENTION half of the design gate — now a DELEGATION + calibration layer, not a competing ban-list.
  Triggers when someone signals they're about to produce a UI ("make a dashboard", "build this
  screen", "design a landing page", "build a component"). It hands the actual CRAFT to the proven
  generation skills (impeccable for craft; motion goes to the animation skills), then layers in this
  team's calibration (design-context dials + the corpus exemplars) so output matches Carbonteq's bar.
  Generation lift comes from those skills; this skill orchestrates them and points at the gate. No
  auto output-gating here — the /gate (or the auto-gate hook) verifies the result.
---

# intent-prep — delegate the craft, add the calibration, hand off to the gate

We do not out-generate the dedicated design skills, and we don't maintain a thin clone of their
anti-slop rules. When a prompt signals UI intent, this skill **delegates generation** to the skills
that do it best, then adds the two things they don't have: _this team's_ taste calibration and the
downstream gate.

## When to trigger (fuzzy is fine — the gate is the safety net)

"build/make/design a <screen/page/dashboard/component/landing/form/app UI>", "create a UI for…",
"turn this into a screen". A miss only costs the prep advantage. Don't trigger on non-UI code.

## Step 0 — Cambio precedence (outranks everything below)

**The design system decides what gets built.** Components, tokens, motion
feel, and copy come from `design-system/` via the `design-system` skill —
its creation gate applies before any generation skill runs. Everything in
this file governs _execution quality_ of what the system specifies, never
identity. When a generic recommendation conflicts with a deliberate
Cambio choice (cream paper, poster display face), surface the conflict —
never auto-"fix". (Same rule as "production doc beats prototype".)

## Step 1 — Delegate the craft to the generation skills

Invoke the generation skill(s) to actually produce the design:

- **`impeccable`** — primary craft engine (its real command surface:
  `/impeccable shape` for direction on a new surface, `/impeccable audit`
  and `/impeccable polish` on produced output; `init` maintains
  `PRODUCT.md`). Non-reflex craft discipline, motion, the full flow —
  this is where the visible quality lift comes from. (The upstream
  reference to a `/impeccable craft` command was stale — no such
  entrypoint exists.)
- For **motion specifically**, the animation skills (`animate`,
  `review-animations`) govern execution quality — impeccable is not a
  motion specialist.

(Upstream delegated to `awesome-design` and offered `taste-skill` as an
alternative; both were evaluated and rejected for this repo per ADR-0029
— the moodboard already solved design direction, and taste-skill overlaps
with a GSAP mandate that collides with ADR-0027.)

If impeccable isn't available, fall back to the inline anti-slop direction
in `design-context` + `../ai-slop/markers.json` bans — but the dedicated
skills are strongly preferred.

## Step 2 — Layer in Carbonteq calibration (what the generic skills don't know)

On top of the generation skill's output direction, add:

- **The Design Read + dials** (`design-context`) — state the one-line read and set the dials so the
  generation matches the _kind_ of design (dense dashboard vs bold specimen vs trust-first form).
- **The corpus exemplars** (`../annotated-exemplars/corpus.json` good set: p6, p9, p11, p13, p14, p15,
  p16, p17, p19, p20, p21) — these encode _this company's_ bar, which a generic skill can't infer.
- **The shared bans** (`../ai-slop/markers.json`) as a final cross-check the generation honored them —
  same single source the gate detects against, so prevention and detection never drift.

## Step 3 — Hand off to the gate

Prevention is probabilistic; it makes slop less likely, not impossible. The **`/gate`** (or the
auto-gate hook in the package) runs on the actual output as the authoritative check — it measures
accessibility, detects residual slop, and judges against the corpus. Generation lifts the baseline;
the gate catches what even good generation misses (e.g. a real not-color-alone / contrast gap an
impeccable-built page can still ship).

## Division of labor (why this composition)

- **Generation skills** → make it good (the craft, the visible lift).
- **design-context** → make it fit the design _kind_ (contextual dials, shared with the gate).
- **annotated-exemplars** → make it fit _Carbonteq_ (calibration the generic skills lack).
- **the gate** → verify and measure (the part generation skills don't do) — advisory: it surfaces
  the verdict and the person decides, per the gate skill's enforcement model.
  Don't duplicate the generation skills here; orchestrate them and own the calibration + verification.
