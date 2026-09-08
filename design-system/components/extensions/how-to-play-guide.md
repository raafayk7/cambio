name: how-to-play-guide
status: draft
version: 3
extends: modal

The complete rules, always one tap away. Class: **Overlay** (hosted
entirely in the canon `Modal` — a content pattern, not a new overlay
primitive).

## Anatomy

- Hosted in `Modal` at canon width (`max-w-md`, 28rem — root plan Decision
  Log D6; revisit through the creation gate only if a rendered check shows
  the tables genuinely failing at this width, never improvised as a size
  variant). Title "How to play" in the default `ui` face (sentence case,
  voice.md) — reference material, not a shout moment.
- Body: typeset sections (heading + paragraphs) plus the `table` component
  for the scoring table, the powers table, and the slam-outcome table
  (root plan D9 — text and tables only, no card illustrations or new
  art). Sections, in order: **about Cambio** (r2, a short orienting intro —
  what the game is, lowest score wins — before any rule detail), setup,
  scoring, taking a turn, power cards, slamming, rare situations (zero
  cards, fizzles, empty discard, reshuffle), how the game ends.
- **r2 (corrected r3):** the scoring table's Card column colors
  hearts/diamonds glyphs in `accent.suit-red` (never the whole cell) —
  the same quarantined-red rule `playing-card.tsx` already applies to a
  card's suit pip, so "King ♥, King ♦" reads with its red pips exactly as
  a real card would, not as plain ink. The powers table's Card column
  carries no suit glyphs and renders plain.
- No footer — the ✕/Esc/scrim escapes the canon `Modal` already provides
  are enough; a "Close" button would add a primary action with nothing to
  say.
- Opened from the `MarkHelp` icon-button in `AppShell` (`app-shell.md` r5)
  on the lobby, room, and game screens.

## States

- `open` / `closing` — the canon `Modal` states, unchanged.
- `overflow` — the **normal** state: the body scrolls under the pinned
  title, exactly like the gallery's "House rules" overflow demo. The full
  guide is long by design; nothing here is meant to fit without scrolling.

## Rules

- **Copy is authored from the `cambio-rules` skill and the ADRs it cites
  (0009–0012, 0036, 0039, 0040) — re-verified against them on every edit,
  never from priors or other Cambio/Cabo variants.** This variant
  deliberately differs from published Cambio/Cabo (no opening peek, no
  caller bonus/penalty, no final round, 2–4 players, suit-split king
  scores).
- **Memory-faithful.** The guide never offers or implies a tracking aid —
  no "cards you've seen" list, no per-card history. It may state the rule
  that peeks are brief and remembering is the game (voice.md's
  memory-faithful rule applies to this surface exactly as it does to live
  play).
- **Available in every phase, including the slam window** (`modal.md` r2:
  the guide is the opt-in reference overlay that rule's exception names).
  It is never disabled or force-closed by game state.
- **Voice.md terminology is binding**: canonical terms only (power card,
  peek, blind-swap, slam window, draw deck/discard pile, slot, fizzle —
  never "special card"/"reveal"/"trade"), true minus sign on scores
  (`−1`, `−2`), sentence case throughout, card names spelled out in
  running copy. **One carve-out (r3):** "reveal" may describe the
  _public_ momentary or terminal showing of cards — a slammed card's
  flash, the endgame's all-hands showdown — which is a distinct concept
  from a peek; canon itself says "publicly reveals" (HANDOFF §1.5).
  "Reveal" must never be used where "peek" is meant.

## Revisions

- r1: initial (CAM-30).
- r2 (CAM-30 follow-up, user-directed): added the "about Cambio" intro
  section ahead of setup; colored hearts/diamonds glyphs in the scoring
  table's Card column with `accent.suit-red`, matching `playing-card.tsx`'s
  own suit-pip color rule.
- r3 (CAM-30 review fix): corrected the r2 Anatomy line — suit coloring
  applies to the scoring table only, matching the code and the r2 entry
  above (the "and powers" overstatement licensed behavior the code never
  had); documented the "reveal" carve-out in the voice rule (public
  momentary/terminal reveals are a distinct concept from peeks and use
  canon's own word).
