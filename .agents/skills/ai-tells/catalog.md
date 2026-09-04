# AI Tells Catalog — what Claude actually defaults to (Cambio edition)

Grading rubric for the `ai-tells` skill, adapted from Carbonteq's original
(pristine copy: `docs/design/resources/ai-tells/` on release branches).
Each of the 10 categories is scored 0–3 on the evidence in the codebase:

- **0** — absent. Pattern not present.
- **1** — used once and defensible.
- **2** — pattern repeats. Same move shows up in 2–3 places.
- **3** — it's the whole aesthetic. The surface is built around this.

Total possible: **30**. Lower is better.

The catalog reflects honest introspection on what Claude reaches for
under-specified — not the cartoon "AI slop" trope list (those are
catalogued at the bottom as "NOT from me"). **Cambio-wide rule:** any hit
that is also an off-token value is a double defect — cite it as both.

---

## 1. Editorial minimalism reflex (the #1 default)

Under a vague brief ("premium", "calm", "thoughtful"), Claude reaches for
cream + near-black + `py-24/32` whitespace + `max-w-6xl mx-auto` shells.

**Cambio calibration — read before scoring.** This product's ground _is_
cream: `surface.page` is derived from physical references and ships with
terracotta, brick, and deep green. Cream itself is never the tell. Score
this category on:

- **off-token cream** — `bg-stone-50`, `bg-amber-50`, `bg-neutral-50`,
  literal hexes (`#FAF7F2`, `#F8F5F0`) instead of the semantic-role
  utilities;
- **stone-neutral minimalism** — near-black-on-cream with a lone
  emerald/indigo accent and none of the system's palette; a page that
  reads "calm SaaS", not "worn card table".

**Score 3/3 if:** off-token cream + generic near-black ink + the
py-24/32 rhythm carry the whole surface.
**Score 2/3 if:** off-token neutrals repeat, or system cream is used but
stripped of its companion palette.
**Score 1/3 if:** one off-token neutral in isolation.

---

## 2. Typography defaults

- Italic serif accent word in a sans headline (`italic font-serif` around
  a "feeling" word)
- Instrument Serif / Fraunces / EB Garamond / DM Serif / Playfair loaded
  for that one accent; Geist as default sans (the Vercel template smell)
- Eyebrow label above headlines — `text-xs uppercase tracking-[0.2em]`
- `font-medium` headlines with `tracking-tight` and a big size jump
- Three-tier rhythm every section: eyebrow → mixed-italic headline →
  muted subhead at `max-w-2xl`

Cambio's faces are **Alfa Slab One (display) + Archivo (UI)** — any other
family in source is simultaneously a tell and a token violation.

**3/3:** italic serif accent + eyebrow + three-tier rhythm all present.
**2/3:** italic accent + a smuggled serif pairing without the eyebrow.
**1/3:** just the eyebrow, or one italic accent.

---

## 3. Color defaults

- Single accent — almost always emerald, indigo, or amber
- shadcn neutral tokens (`bg-background`, `text-muted-foreground`,
  `border-border`) — in this repo those utilities died with the stock
  `@theme` (ADR-0027); their presence means off-system styling
- Flat stone/neutral/zinc greys for text and borders

Cambio's accents are **green-table acts / red alarms / mustard focus** —
an emerald-or-indigo accent system is precisely the tell.

**3/3:** monochrome neutral palette + single emerald/indigo/amber accent.
**2/3:** monochrome without the system palette.
**1/3:** one generic accent used sparingly.

---

## 4. Layout defaults

- Centered hero: pill badge → headline → subhead → two CTAs
- Three-up feature grid — icon in tinted square + heading + 2-line body
- "How it works" numbered steps (01/02/03)
- CTA section before footer; minimal three-column footer

A game lobby is not a landing page — hero/CTA shapes appearing on game
screens mean the model fell back to its landing-page muscle memory.

**3/3:** centered hero + three-up features + numbered steps.
**2/3:** centered hero + three-up features.
**1/3:** any one in isolation.

---

## 5. Component / shape defaults

- `rounded-xl/2xl/3xl` softness — Cambio's scale is `radius.sm` (3px) /
  `radius.md` (6px) / `radius.card`; soft-friendly roundness is foreign
- Hairline grey borders, not shadows — the system uses ink borders and
  **zero-blur solid offset shadows** (`elevation.*`); a
  `shadow-[0_1px_2px_rgba(0,0,0,0.04)]` whisper-shadow is the tell
- Pill badge with leading dot; icon in a tinted square; trailing
  ArrowRight on buttons; solid-primary + ghost button pair

**3/3:** tinted-square icons + hairline-bordered cards + pill-with-dot +
ArrowRight buttons all present.
**2/3:** the tinted-icon-square pattern repeats.
**1/3:** one or two in isolation.

---

## 6. Motion defaults

- Fade-up on every section (`opacity: 0, y: 20` → visible, `duration:
0.5`, `easeOut`), stagger-children lists, hover `y: -2` cards
- Rarely anything with intent

Cambio's motion law is **papery snap** — `ease.snap`
`cubic-bezier(.2,0,0,1)`, `duration.snap` 140ms / `duration.track` 340ms,
motion as game mechanic (see the animation skills). Soft 500ms easeOut
fades are off-system twice over.

**3/3:** the fade-up on three+ surfaces with identical config.
**2/3:** fade-up twice with identical config.
**1/3:** one fade-up, or hover-translate only.

---

## 7. Copy defaults

- Triplet taglines with parallel verbs; "The X for Y who Z" subheads
- Em-dashes as rhythmic tic; italicized feeling-words
- Soft over-promises: _effortless, seamless, thoughtful, delightful,
  calm, intentional, crafted, reimagined_; ✨ in badges

`design-system/references/voice.md` **bans** the over-promise adjectives,
triplet taglines, and ✨ outright — every hit here is a voice violation
with a file to cite, not just a vibe.

**3/3:** triplet tagline + multiple over-promise words + em-dash tic + ✨.
**2/3:** triplet tagline + over-promise vocabulary.
**1/3:** a few soft words or one decorative em-dash.

---

## 8. Structural / screen-level rhythm

The original tell is the five-section landing page (hero → 3-up features
→ numbered steps → callout → CTA/footer). Cambio has no landing page —
its surfaces are **lobby, room, game table, score sheet** — so score this
category on:

- landing-page shapes transplanted onto game screens (a hero with two
  CTAs above the fold of a lobby);
- **identical rhythm across screens** — lobby, room, and score screens
  opening with the same eyebrow/headline/subhead stack;
- ignoring the scene-depth pattern (`design-system/patterns/scenes.md`:
  lobby full courtyard → table+paving → forms plain cream) in favor of
  one homogeneous shell.

**3/3:** landing-page shape on a game screen, or one rhythm stamped on
every screen.
**2/3:** two screens sharing a transplanted rhythm.
**1/3:** one landing-ism in isolation.

---

## 9. Stack / file-system tells

Re-scoped for this repo — the original's rows are mostly sanctioned here:

- `cn()` from `clsx` + `tailwind-merge` in `packages/ui/src/lib/utils.ts`
  — **legitimate shadcn plumbing, not a tell.** Score 0.
- The `@theme` block in `packages/ui/src/styles.css` — **the sanctioned
  token home (ADR-0027), not a tell.** Audit its _contents_ against
  `design-system/references/tokens.md` instead: a token in `@theme` that
  tokens.md doesn't know is the finding.
- `framer-motion` / `lucide-react` / `next` / `next/font` — none are in
  the sanctioned stack; any appearing in a `package.json` or import is a
  real finding (the original's "quartet" tell inverted: here even one is
  foreign).
- `components/ui/*` files that match shadcn exactly but were hand-written
  — still a tell if they bypass `packages/ui`.

**3/3:** a foreign stack member imported and load-bearing.
**2/3:** a foreign dependency added but barely used.
**1/3:** shadcn-shaped hand-written files outside `packages/ui`.

---

## 10. The micro-tells (small but unmistakable)

- `Sparkles` imported anywhere; `ArrowRight` on every button
- Pill badge with leading colored dot
- `text-balance` and `tracking-tight` on every headline
- Section padding always exactly `py-24`/`py-32`
- Placeholders as `bg-stone-200 aspect-video rounded-xl`
- `{/* Hero */}`, `{/* Features */}`, `{/* CTA */}` section comments

**3/3:** four or more present. **2/3:** two or three. **1/3:** one.

---

## NOT from me — flag separately

Meme-tropes Claude doesn't actually default to. If present, they came
from a template, a different prompt, or a different model — flag
`path:line` in the report's "NOT from me" section:

bento grids; purple→pink→blue aurora gradients; glassmorphism
(`backdrop-blur-xl bg-white/60`); animated noise/grain overlays; marquee
logo clouds; invented stats strips; letter-avatar testimonial walls;
"Powered by AI" badges; gradient text (`bg-clip-text text-transparent`);
neon glows; floating blurred gradient blobs; animated dotted-grid hero
backgrounds.

---

## Calibration notes

- **One accent move is not a 3.** Don't punish a good move for being
  recognizable.
- **The trifecta matters more than any single tell** — but in Cambio the
  trifecta is _off-token_ cream + smuggled serif + eyebrow. System cream
  with terracotta/brick/green is the product's identity; say so in
  "Defensibly intentional" and move on.
- **Grade against the system when you can.** On release branches, read
  `design-system/references/tokens.md` and `voice.md` first; a tell that
  is also a token or voice violation cites both. On `main` (folder
  absent) run pattern-only and state that limitation in the verdict.
- **If the user asked for something specific**, some defaults are
  correct — record them under "Defensibly intentional", don't recommend
  changing patterns that serve the brief.
