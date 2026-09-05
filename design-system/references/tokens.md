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
size scales with the card, not the page.

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

| Token            | Value                        | Used for                                                      |
| ---------------- | ---------------------------- | ------------------------------------------------------------- |
| `ease.snap`      | `cubic-bezier(0.2, 0, 0, 1)` | every card/object movement — the papery snap                  |
| `duration.snap`  | `140ms`                      | short moves: flip, select, discard, UI response               |
| `duration.track` | `340ms`                      | moves players must follow: deals, J/Q swaps, slam resolutions |
| `duration.peek`  | game-config, not a token     | how long a peeked card shows — gameplay tuning owns it        |

Decisions and rationales (CAM-13 interview):

- **Papery snap ("M1 crisp") over flick and stop-motion** — decisive cut-out
  character while staying continuous, because tracking a moving card _is_ the
  memory game; stepped motion looked great and tracked worse.
- **Two durations only** — one fast, one followable; a wider menu invites
  per-feature drift.
- `prefers-reduced-motion`: movement collapses to cross-fades **plus** a
  `accent.focus` highlight on origin and destination slots — the information
  the animation carried must survive, only the motion goes.

## Breakpoints

_(approved CAM-13; provisional until CAM-15)_ Responsive from day one
(CAM-13 decision):
`compact < 720px` (portrait phones — radial table compresses),
`regular ≥ 720px`, `wide ≥ 1200px`. Components declare compact behavior in
their files; the 4-bench radial arrangement is presentation-only and never
constrains player count (5 players seat fine; backend is never capped).
