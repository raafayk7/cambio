# AI Tells Catalog — what I actually default to

This is the grading rubric for the `ai-tells` skill. Each of the 10 categories is scored 0–3 based on the evidence in the codebase:

- **0** — absent. Pattern not present.
- **1** — used once and defensible. A single italic accent on the hero is fine. One eyebrow label is fine.
- **2** — pattern repeats. Same move shows up in 2–3 places.
- **3** — it's the whole aesthetic. The page is built around this.

Total possible: **30**. Lower is better.

The catalog reflects honest introspection on what I (Claude) reach for under-specified — not the cartoon "AI slop" trope list. Cartoon tropes (bento grids, purple aurora, glassmorphism, marquees) are catalogued separately at the bottom as "NOT from me."

---

## 1. Editorial minimalism reflex (my #1 default)

When the brief is vague and the user says "premium", "calm", "thoughtful", "modern", or nothing at all, I reach for this stack:

- Cream / warm off-white background — `#FAF7F2`, `#F8F5F0`, `#faf9f6`, `bg-stone-50`, `bg-neutral-50`, `bg-amber-50/30`. Almost never pure white.
- Near-black ink instead of pure black — `text-stone-900`, `text-neutral-900`, `#1a1a1a`, `#0a0a0a`
- Tons of vertical whitespace — `py-24` / `py-32` on every section
- Generous max-width — `max-w-6xl mx-auto px-6` as the section shell

**Score 3/3 if:** cream background + near-black ink + the py-24/32 rhythm all present.
**Score 2/3 if:** cream + black-but-not-pure-black, or the spacing rhythm without cream.
**Score 1/3 if:** one of these in isolation (e.g., just stone-50 on a single section).

---

## 2. Typography defaults

- Italic serif accent word in a sans headline — `<span className="italic font-serif">` wrapping one or two "feeling" words (_beautifully_, _effortlessly_, _finally_, _starlight_, _crafted_)
- Instrument Serif, Fraunces, EB Garamond, DM Serif Display, or Playfair loaded from `next/font/google` for that one accent
- Geist (and Geist Mono if there's code on the page) as the default sans — the Vercel template smell
- Eyebrow label above headlines — `text-xs uppercase tracking-[0.2em] text-muted-foreground` (or `tracking-wider`/`tracking-widest`)
- `font-medium` on headlines, not `font-bold`, with `tracking-tight` and a big size jump (`text-5xl md:text-7xl`)
- Three-tier rhythm repeating every section: eyebrow → mixed-italic headline → muted subhead capped at `max-w-2xl`

**Score 3/3 if:** italic serif accent + eyebrow + the three-tier rhythm all present.
**Score 2/3 if:** italic accent + Geist+serif font pairing without the eyebrow.
**Score 1/3 if:** just the eyebrow, or just the italic accent once.

---

## 3. Color defaults

- Single accent color — almost always **emerald**, **indigo**, or **amber**. Rarely red. Never pink.
- shadcn neutral tokens used even when shadcn isn't installed: `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`
- No real gradients — flat surfaces, occasionally a subtle one-color radial behind the hero
- Stone/neutral/zinc-based grays for body text and borders

**Score 3/3 if:** monochrome cream/stone palette + single emerald-or-indigo-or-amber accent.
**Score 2/3 if:** the palette is monochrome but the accent is missing or generic.
**Score 1/3 if:** mostly neutral with one of these accents used sparingly.

---

## 4. Layout defaults

- Centered hero: pill badge → headline → subhead → two CTAs (solid primary + ghost) → optional "trusted by" line
- Three-up feature grid — icon in a tinted square + heading + 2-line body, repeated 3× (sometimes 6×)
- "How it works" with numbered steps — `01 / 02 / 03` in muted serif, each step a short title + body
- CTA section before footer — centered, same eyebrow/headline rhythm, single button
- Minimal footer — three or four small columns

**Score 3/3 if:** centered hero + three-up features + numbered steps all present.
**Score 2/3 if:** centered hero + three-up features (the most common pair).
**Score 1/3 if:** any one of these in isolation.

---

## 5. Component / shape defaults

- `rounded-xl` for cards, `rounded-lg` for buttons/inputs, `rounded-full` for pills — `rounded-2xl/3xl` only when going for "soft and friendly"
- Borders, not shadows — `border border-border` or `border-stone-200` on cards. Shadows when present are subtle: `shadow-[0_1px_2px_rgba(0,0,0,0.04)]`
- Pill badge with leading dot — `<span className="size-1.5 rounded-full bg-emerald-500" />` + small text ("New", "Beta", "Live")
- Lucide icon in a tinted square — `<div className="size-10 rounded-lg bg-stone-100"><Sparkles className="size-5" /></div>`
- Button with trailing `ArrowRight` from lucide, `gap-2`
- Two-button hero pair — solid primary + ghost "Learn more"

**Score 3/3 if:** tinted-square-icon pattern + bordered cards + pill-with-dot + ArrowRight button all present.
**Score 2/3 if:** the tinted-icon-square pattern repeats across multiple cards.
**Score 1/3 if:** one or two of these in isolation.

---

## 6. Motion defaults

- framer-motion `whileInView` fade-up on every section — `initial={{ opacity: 0, y: 20 }}` → `whileInView={{ opacity: 1, y: 0 }}`, `transition={{ duration: 0.5, ease: "easeOut" }}`, `viewport={{ once: true }}`
- Stagger children in lists — `staggerChildren: 0.1`
- Subtle hover on cards — `whileHover={{ y: -2 }}` or `transition-transform hover:-translate-y-0.5`
- Rarely scroll-driven parallax, spring physics, or anything more ambitious

**Score 3/3 if:** the fade-up appears on three or more sections with the same `y: 20`, `duration: 0.5` pattern.
**Score 2/3 if:** fade-up appears twice with identical config.
**Score 1/3 if:** one fade-up, or hover-translate on cards only.

---

## 7. Copy defaults

- Triplet taglines with parallel verbs — "Build faster. Ship smarter. Sleep better." / "Design once. Deploy anywhere. Iterate freely."
- Em-dashes as rhythmic tic — used for cadence, not for clause separation
- Italicized feeling-words in headlines — _beautifully_, _thoughtfully_, _effortlessly_, _finally_, _intentionally_
- "The X for Y who Z" subhead formula
- Two-to-three word feature titles as noun phrases ("Smart Routing", "Live Preview", "Built-in Auth")
- Verb-first feature bullets, all same tense, all same length (±2 words)
- Soft over-promises: _effortless_, _seamless_, _thoughtful_, _delightful_, _calm_, _intentional_, _crafted_, _reimagined_
- ✨ in badges or section labels — I use it more than I admit, less than the meme suggests

**Score 3/3 if:** triplet tagline + multiple soft-over-promise words + em-dash tic + ✨ all present.
**Score 2/3 if:** triplet tagline + over-promise vocabulary.
**Score 1/3 if:** a few soft over-promise words or one em-dash used decoratively.

---

## 8. Structural / page-level rhythm

The default five-section landing page I produce when not given an outline:

1. Hero (eyebrow + italic-mixed headline + subhead + two CTAs)
2. Features 3-up (icon-in-square + heading + body)
3. How it works (01 / 02 / 03 numbered steps)
4. Secondary callout / quote / single-feature spotlight
5. CTA section (centered, same eyebrow rhythm) → footer

**Score 3/3 if:** the page matches this exact shape, in this order.
**Score 2/3 if:** three of these five sections are present and recognizable.
**Score 1/3 if:** the hero matches but the rest diverges.

---

## 9. Stack / file-system tells

- `next/font/google` importing Geist + Instrument_Serif (or Geist + Fraunces) in `app/layout.tsx` — near-deterministic giveaway
- `framer-motion` + `lucide-react` + `tailwindcss@4` + `next@15` in `package.json` — the canonical Claude-generated quartet
- `lib/utils.ts` with a `cn()` built from `clsx` + `tailwind-merge`, even without shadcn installed
- `components/ui/*` files that match shadcn exactly but were hand-written
- Tailwind config (or `globals.css` `@theme` block in Tailwind 4) defining `--font-sans` and `--font-serif` CSS vars

**Score 3/3 if:** the full quartet + Geist+serif font import + cn() helper all present.
**Score 2/3 if:** the quartet without the font-import combo.
**Score 1/3 if:** just framer-motion + lucide on a Next project (very common but on its own not damning).

---

## 10. The micro-tells (small but unmistakable)

- `Sparkles` from lucide imported anywhere
- `ArrowRight` on every button
- A `Badge` component (or inline span) with a pill shape and a leading colored dot
- `text-balance` on headlines (a tasteful detail I reach for habitually)
- `tracking-tight` on every headline
- Section padding always exactly `py-24` or `py-32`
- Image placeholders with `bg-stone-200 aspect-video rounded-xl`
- Comment blocks above sections that say `{/* Hero */}`, `{/* Features */}`, `{/* CTA */}`

**Score 3/3 if:** four or more micro-tells present.
**Score 2/3 if:** two or three present.
**Score 1/3 if:** one present.

---

## NOT from me — flag separately

These show up in AI-design memes but I don't actually reach for them. If they're in the codebase, they came from a template, a different prompt, or a different model. Flag the `path:line` in the "NOT from me" report section so the user knows where to investigate.

- Bento grids (uneven `grid-cols-3` with `col-span-2` cells)
- Purple → pink → blue aurora gradients (`from-purple-500 via-pink-500 to-blue-500`)
- Glassmorphism (`backdrop-blur-xl bg-white/60 border border-white/40`)
- Animated noise / grain SVG overlay
- Marquee logo cloud
- Big stats strip with invented numbers ("10k+ users · 99.9% uptime")
- Testimonial wall with single-letter avatars in colored circles
- "Powered by AI" badges
- Gradient text on headlines (`bg-clip-text text-transparent bg-gradient-to-r`)
- Neon glow effects (`drop-shadow-[0_0_20px_rgb(...)]`)
- Floating gradient blob backgrounds (`absolute blur-3xl opacity-30`)
- Animated grid / dotted background as a hero treatment

---

## Calibration notes

- **One italic accent word** in a single headline is not a 3. It's a 1. Don't punish a good move just because it's recognizable.
- **The trifecta matters more than any single tell.** Cream background + italic serif + eyebrow, repeated across the page, is the diagnostic combination. Any one of these alone is just taste.
- **Stack tells are background radiation.** Most Next.js projects look stack-similar; weight categories 1–8 more heavily than 9 when forming the verdict.
- **If the user asked Claude to build something specific** ("a calm reading app", "an editorial portfolio"), some of these defaults are _correct_. Note this in the "Defensibly intentional" section of the report — don't recommend changing patterns that serve the brief.
