# tokens.md — color, type, spacing, elevation, motion

Source of truth for every visual value. No component or screen may hardcode a
value that exists here; new values go through the creation gate in
`design-system.md`. Extracted from `docs/design/moodboard/` during CAM-13;
each decided value carries its one-line rationale.

Dark theme ("khoka at night", the dusk photo in `lums-photos/`) is deferred to
a later release. It lands as a re-mapping of the **semantic roles** below to a
new primitive set — never as per-component repaints. That is why every
component references roles, not primitives.

## Color — primitives

Sampled from the moodboard by dominant-color extraction (CAM-13 session).
Values keep the board's warm cast deliberately — print, not screen, is the
reference.

| Primitive      | Value     | Sampled from                                                            |
| -------------- | --------- | ----------------------------------------------------------------------- |
| `cream-scene`  | `#f6dcae` | illustrated sky / paper ground                                          |
| `cream-card`   | `#eee9d2` | card faces, suit-chrome frames                                          |
| `tan-paving`   | `#d3a266` | paving-plaid field tiles (the painted paving asset's light tile family) |
| `terracotta`   | `#b3613a` | paving warm squares                                                     |
| `brick-deep`   | `#8e4224` | building shadow side                                                    |
| `brick-bright` | `#be5d2e` | building lit side                                                       |
| `green-table`  | `#36634a` | tabletop (top-down reference, image7)                                   |
| `green-deep`   | `#27311e` | furniture shadow, dark foliage                                          |
| `olive`        | `#5d5d31` | tree canopy midtone                                                     |
| `red-card`     | `#a52418` | suit wallpaper red                                                      |
| `red-bright`   | `#e03322` | matchbox label field                                                    |
| `ink`          | `#0d0d08` | suit black, outlines                                                    |
| `mustard`      | `#f8ba66` | striped card backs, khoka lamp light                                    |

## Color — semantic roles

| Role                | Primitive                 | Used for                                                                                                                                                      |
| ------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `surface.page`      | `cream-scene`             | app background outside the table                                                                                                                              |
| `surface.raised`    | `cream-card`              | cards, panels, modals, chrome frames                                                                                                                          |
| `surface.table`     | `green-table`             | the table-green family (the play surface itself ships as a painted asset since table-surface r2; the role still grounds card demos and table-adjacent chrome) |
| `surface.warm`      | `terracotta`/`tan-paving` | scene chrome, the paving-plaid pairing, banners                                                                                                               |
| `ink.primary`       | `ink`                     | text, outlines, black suits                                                                                                                                   |
| `ink.muted`         | `olive`                   | secondary text, captions                                                                                                                                      |
| `ink.inverse`       | `cream-card`              | text on green/red/brick surfaces                                                                                                                              |
| `accent.action`     | `green-table`             | primary buttons, links, affirmative energy                                                                                                                    |
| `accent.alarm`      | `red-bright`              | slam window, destructive acts, errors (large)                                                                                                                 |
| `accent.alarm-deep` | `red-card`                | alarm surfaces carrying small text                                                                                                                            |
| `accent.suit-red`   | `red-card`                | hearts & diamonds pips — never UI meaning                                                                                                                     |
| `accent.focus`      | `mustard`                 | focus rings, active-turn highlight                                                                                                                            |

Decisions and rationales (CAM-13 interview):

- **Table is deep green, not remembered turquoise** — green is the only value
  the references actually show; turquoise appears nowhere on the board.
- **Green acts, red alarms** — primary actions take the table green so bright
  red stays exclusively slam/danger energy and never dilutes.
- **Mustard is focus/attention, not decoration** — it is the board's lamp-light
  color and reads as "look here" against both creams and the green.
- **Suit red is quarantined** — `accent.suit-red` renders pips only, so a red
  heart never reads as an error and vice versa.

### Contrast rules (verified WCAG ratios, CAM-13)

- `ink` on any cream/tan surface: AAA. `ink.muted` on creams: AA (≥5.1:1) —
  fine for body, do not shrink below 12px.
- `ink.inverse` on `green-table` / `brick-deep`: AA (≥5.6:1).
- `ink.inverse` on `red-bright` is **3.7:1 — large/bold text only** (the
  display face qualifies). Small text on an alarm surface must use
  `accent.alarm-deep` (6.0:1) or `ink` on `mustard` (11.3:1).

## Typography

Chosen from rendered specimens on the real palette (CAM-13 specimen board),
not from font names.

| Role      | Face           | Fallback stack                                 | Rationale (one line)                                                 |
| --------- | -------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| `display` | Alfa Slab One  | `'Alfa Slab One', 'Rockwell', serif`           | The matchbox-label fat slab — the board's most distinctive artifact. |
| `ui`      | Archivo        | `'Archivo', system-ui, sans-serif`             | Sturdy warm grotesque; wide weight range; clean tabular numerals.    |
| `numeral` | Archivo (tnum) | as `ui` + `font-variant-numeric: tabular-nums` | Scores must align in columns; minus signs are data, not punctuation. |

Roles:

- `display` — game title, big moments (SLAM!, CAMBIO!), card ranks, poster
  headings. Weight 400 only (the face has one weight; that's the point).
- `ui` — everything else. Weights: 400 body, 500 emphasis, 600 buttons/labels,
  700 sparingly.
- `numeral` — score tables, totals, timers. Always tabular; negative scores
  use a true minus sign (−), see `voice.md`.

Type scale _(approved CAM-13; provisional until CAM-15 renders real
components — adjustments land as revisions)_: 12 / 14 / 15 (body) / 17 / 22 /
28 / 44 / 64px, 1.5 line-height for body, 1.1 for display sizes. Card rank
size scales with the card — floored at 12px, the scale's smallest step, so
tiny footprints stay legible (CAM-21 design-gate fix: rank/pip read
`max(card-proportional, 12px)`; the floor bites only below a 40px card,
i.e. `card-sm`, at both breakpoints — the score-sheet minis included).

## Spacing

_(approved CAM-13; provisional until CAM-15 renders real components)_
Base unit 4px; scale `4 8 12 16 24 32 48 64`.
Density is generous — the board's flat fields breathe; cramped UI would read
as digital, not print.

## Shape

- `radius.sm: 3px` — buttons, inputs, small chips (crisp print corner).
- `radius.md: 6px` — panels, modals.
- `radius.card: 6% of card width` — the playing-card corner is the signature
  shape and scales with the card _(ratio approved CAM-13; provisional until
  CAM-15 renders real cards)_.
- Borders: `1.5px` solid `ink` on interactive objects, `2px` on frames.
  Borders, not shadows, carry emphasis — per the framed-label references.
- Card footprints (`--card-width`, read by `radius.card` and every
  playing-card size utility): `card-lg` / `card-md` are responsive —
  regular keeps `96px` / `64px`; compact reads `48px` / `32px`, forced by
  the 360×640 fold budget (CAM-21, gate-approved, interview 2026-09-06;
  tuned down from an initial `64px`/`32px` at the M5 rendered pass once
  the measured budget came up short — root plan Surprises). `card-sm`
  (`32px`) is unchanged at both breakpoints. `--size-table-art-compact`
  (`158px` — CAM-21 tuned it down from an initial `160px` to `128px` at
  the M5 rendered pass for fold budget, then CAM-20's design-gate pass
  raised it back to `158px`, a newly re-measured value rather than a
  revert, once `128px` was found to leave the deck+discard pair
  effectively flush against the tabletop disc — see table-surface.md r6.
  **CAM-27/ADR-0038 (r7): the value's role changed from a max-width CAP
  to a `min-width`/`min-height` FLOOR** — the number itself is
  untouched, but the table art now sizes fluidly via container-query
  units (`width: min(100%, 100cqh)` on a `container-type: size` frame,
  table-surface.md r7) and never renders smaller than this floor,
  growing with available height at every taller compact viewport
  instead of staying pinned): the compact-only minimum size of the table
  art — square asset, so it's also the height floor. It (like the
  surface's tightened root gap) belongs to the game screen's DOCKED
  composition only (`viewerSeat="external"`, table-surface.md r4 as
  amended at review) — the room screen's default path keeps the
  uncapped `w-3/4` art and `gap-4`.
- `card-frame` (the shared card/slot footprint utility — `playing-card.md`,
  `hand.md`): `width: --card-width`, `aspect-ratio: 5 / 7` — the playing-card
  proportion — plus `radius.card`. `card-frame-rotated` (CAM-20,
  gate-approved 2026-09-06) is its canonical sibling for a side-bench
  opponent's rotated hand (`hand.md` r3, ADR-0036 §5): identical
  conventions, `aspect-ratio: 7 / 5` — the width/height-reversed
  footprint a rotated card's painted shape needs at the same
  `--card-width`. The user chose minting this new utility over the two
  alternatives raised (a shared `--card-aspect` variable on `card-frame`
  itself, or tuning bench spacing without a new footprint token).
- **Art-registration constants** (CAM-20 review fix cycle, F9): a small
  family of pixel values measured against the painted table asset rather
  than drawn from the spacing scale — they register CSS boxes onto raster
  art, so they cannot be `@theme` tokens, but they are canon and live
  here so no one mistakes them for magic numbers. All are
  regular-breakpoint, arbitrary-value utilities, each with a derivation
  pin or source-comment derivation:
  - **Bench inset literals** `8.5%`/`91.5%`
    (`table-surface.tsx` `BENCH_POSITION_CLASS`) = `50 ∓ BENCH_INSET_PCT`
    (41.5, `table-geometry.ts`); pinned in lockstep by
    `table-geometry.test.ts`.
  - **Side-bench arc offsets** 23–65px (`hand.tsx`
    `SIDE_BENCH_ARC_CLASS`): per-row `relative` offsets on the slot
    anchors fitting the bench crescent's sagitta — 4-row `40/57/57/40`,
    5-row `32/48/65/48/32` (formula-generated), 6-row
    `23/40/57/57/40/23` (rendered-verified 2026-09-07). Derivation and
    measurement provenance in the `hand.tsx` block comment; canon in
    `hand.md` r5.
  - **Call Cambio dock offset** `calc(50% + 324px)`
    (`game-screen.tsx`): half the own hand's full-row width
    (`ROW_WIDTH`·96px card-lg + 5·8px gaps)/2 + one 16px clearance step;
    derivation pinned in `game-screen.test.tsx`.
  - **Own-seat dock nudge** `-4px`
    (`game-screen.tsx` `translate-y-[calc(-50%-4px)]`): one 4px spacing
    step raising the docked group inside the 900px reference viewport
    (design-gate fix, regular finding 1); deliberately NOT folded into
    the shared `BENCH_ANCHOR_CLASS.bottom` (pinned in
    `game-screen.test.tsx`).

## Elevation

Offset solid shadows, zero blur — the illustration style's cut-out shadow.
Never use blurred material shadows.

| Token              | Value                         | Used for                   |
| ------------------ | ----------------------------- | -------------------------- |
| `elevation.flat`   | none                          | most things                |
| `elevation.raised` | `3px 3px 0 rgba(13,13,8,.35)` | cards on the table, panels |
| `elevation.float`  | `6px 7px 0 rgba(13,13,8,.35)` | dragged card, open modal   |

## Motion

Motion is a **mechanic**: deals, swaps, peeks, and the slam window carry
game-state information players memorize. These tokens are gameplay-legibility
values, not polish. Flourish (celebrations, ambient juice) is deferred to a
later release and gets its own tokens then.

| Token             | Value                        | Used for                                                                            |
| ----------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| `ease.snap`       | `cubic-bezier(0.2, 0, 0, 1)` | every card/object movement — the papery snap                                        |
| `duration.snap`   | `140ms`                      | short moves: flip, select, discard, UI response                                     |
| `duration.track`  | `340ms`                      | moves players must follow: deals, J/Q swaps, slam resolutions                       |
| `duration.peek`   | `2800ms`                     | how long a peeked card holds face-up before flipping back                           |
| `duration.reveal` | `1200ms`                     | the public reveal-hold: the slam reveal, skip beats, the which-slot-was-peeked beat |

Decisions and rationales (CAM-13 interview):

- **Papery snap ("M1 crisp") over flick and stop-motion** — decisive cut-out
  character while staying continuous, because tracking a moving card _is_ the
  memory game; stepped motion looked great and tracked worse.
- **Two interaction durations + one reveal-hold** — one fast, one followable,
  for every _movement or state-change_ an interaction triggers; a wider menu
  there invites per-feature drift. `duration.peek` is a different kind of
  value — it holds a reveal open rather than gating a transition — so it
  joins the vocabulary as its own token instead of stretching `duration.snap`
  or `duration.track` to mean something they don't (CAM-18 G3; and
  `duration.reveal` joins it as the public-glance hold, r3).
- `prefers-reduced-motion`: movement collapses to cross-fades **plus** a
  `accent.focus` highlight on origin and destination slots — the information
  the animation carried must survive, only the motion goes.

### Revisions

- r2 (CAM-18, G3, 2026-09-05): `duration.peek` promoted from "game config,
  not a token" to a real motion token, `2800ms` — long enough to read a
  rank and suit at a glance, short enough to keep the turn moving. Round-1
  user decision: a fixed client duration (the peek reveal ends on a timer),
  rejecting both a server-owned `peekDurationMs` in `GameConfig` (a backend
  touch for a display concern) and tap-to-dismiss (more interaction during
  a window the player is trying to memorize, not act on). The "two
  durations only" line is amended to "two interaction durations + one
  reveal-hold" — see above.
- r3 (CAM-18 review F6, 2026-09-06, user-approved creation-gate call):
  `duration.reveal` = `1200ms`, the PUBLIC reveal-hold — how long the
  whole table stares at a publicly revealed card or beat (the §1.5 slam
  reveal, the DrawSkipped beat, the public which-slot-was-peeked beat).
  Distinct from `duration.peek` by semantics, not just length: peek is a
  private MEMORIZATION window, reveal is a public GLANCE that keeps the
  window moving. The decision line now reads "two interaction durations
  - two holds (private peek, public reveal)"; a JS-timed hold is design
    vocabulary — the same principle that minted `duration.peek` in r2.

## Breakpoints

_(approved CAM-13; provisional until CAM-15)_ Responsive from day one
(CAM-13 decision):
`compact < 720px` (portrait phones — radial table compresses),
`regular ≥ 720px`, `wide ≥ 1200px`. Components declare compact behavior in
their files; the 4-bench radial arrangement is presentation-only and never
constrains player count (5 players seat fine; backend is never capped).
