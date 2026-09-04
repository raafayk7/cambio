# Product

<!-- impeccable:product-schema 1 -->

## Platform

Web application (desktop and mobile browsers). TanStack Start + React SPA
served alongside a Fastify API; realtime play over Supabase Realtime
broadcast channels. No native apps.

## Users

Friend groups of 2–5 playing the card game Cambio together remotely —
people who already know each other, often already on a voice call. Casual
players, not a gaming audience: they want to get into a room and play a
hand in under a minute. Temp-user identity (no accounts, no profiles) —
a session cookie is the player.

## Product Purpose

Play Cambio — a hidden-information, memory-based card game (lowest score
wins) — online with friends, faithfully to the group's playtested house
rules. The digital version's job is to deal, enforce the rules, keep
hidden information genuinely hidden, and get out of the way of the
banter.

## Positioning

Not a casino app, not a gamified product, not a platform. A single
well-made table for one specific game, the way the group actually plays
it (this variant deliberately differs from published Cambio/Cabo rules —
no opening peek, specific power-card and slam behavior). The competition
is "let's just play in person"; the product wins on faithfulness and
zero friction, not features.

## Operating Context

Sessions are short and social: create or join a room by code, play one
or more rounds, leave. Players may be on phones with flaky connections —
reconnecting is a first-class page state, and a dropped player must be
able to rejoin a live game. Turns are fast; the slam window is a
time-limited reflex moment measured in seconds — latency and motion
timing are gameplay-relevant, not cosmetic.

## Capabilities and Constraints

- Full rules engine server-side (HANDOFF §1 is canonical): turns, power
  cards (7/8 peek own, 9/10 peek other, J blind swap, Q peek + swap),
  slamming with penalties, Cambio call ending the game instantly, deck
  reshuffle, zero-card hands, ties.
- **Hidden information is a hard constraint:** a player's client only
  ever receives what that player is entitled to see (`viewFor`
  projection). Peeked cards are shown briefly and never persisted —
  remembering is the game; the UI must not help.
- Memory fidelity means no "cards you know" panels, markers, or history
  aids of any kind.
- Slam timing: fixed windows from game config; every slam attempt
  publicly reveals the slammed card momentarily.
- No spectator mode, no chat, no accounts, no AI features (explicit
  non-goals for now).

## Brand Commitments

Warm, physical, slightly worn — a courtyard card table among friends,
not a SaaS dashboard and not a casino. The visual identity (cream paper
ground, terracotta/brick/deep green, poster slab display face, papery
snap motion) is decided and canonical in `design-system/` — that folder,
not this file, is the visual authority. Voice: warm, playful, a little
deadpan; poster caps reserved for the two shout moments (`CAMBIO!`,
`SLAM!`); no over-promise adjectives, no ✨.

## Evidence on Hand

- `docs/HANDOFF.md` §1 — canonical, in-person playtested rules.
- `design-system/` (release branches) — moodboard-derived identity with
  decision rationale recorded per component; sampled from physical
  references (LUMS courtyard photos, card stock, posters).
- `docs/design/moodboard/` — the four reference sets the system was
  extracted from.
- ADRs 0009–0012, 0021–0023 — playtest-derived rule and
  hidden-information decisions.

## Product Principles

1. **The rules are law and they are this group's rules** — never
   "correct" behavior toward published variants.
2. **Hidden means never sent** — privacy is structural (server
   projection), not visual.
3. **Memory is the skill being exercised** — the UI never remembers for
   the player.
4. **Motion is a mechanic** — the slam window and card movement carry
   gameplay information; timing values are gameplay tuning, not
   decoration.
5. **Friction to the table is the enemy** — room code in, playing within
   a minute, reconnect without drama.

## Accessibility & Inclusion

WCAG 2.1 AA as the floor: token pairings are contrast-verified (the one
known large-text-only pairing is documented in the token reference);
touch targets sized for phones; color never the sole carrier of game
state (rank/suit text accompanies suit color; the slam window has a
visible timer, not only a color change). Tabular numerals for scores.
The time-pressure mechanic (slamming) is inherent to the game, but its
window duration is server-configurable per room.
