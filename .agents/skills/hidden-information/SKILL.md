---
name: hidden-information
description: The security discipline for Cambio's hidden game state — the viewFor projection rule, realtime channel topology, and the "never send it at all" invariant. Read this before touching ANY code that sends data to clients — routes, realtime publishing, contracts schemas, event payloads — even for seemingly unrelated changes, because one leaked field lets anyone with devtools open win every game.
---

# Hidden information

Cambio is a hidden-information game. `decks.cards` literally contains the
shuffled future of the game; `user_cards` contains everyone's hands. The
entire product collapses if a client can read state it isn't entitled to —
not "cheating is possible" collapses, but "anyone with the network tab open
wins every game" collapses. These rules exist to make that impossible by
construction.

## The prime invariant: never send it at all

Card values a player is not entitled to **must not exist in any payload sent
to that player**. Not hidden by CSS, not present-but-unrendered, not
sent-then-filtered client-side, not "encrypted for later". If the bytes reach
the browser, assume they are read.

Entitlement is game logic: a player may currently see a card's value because
they drew it, or peeked at it via a 7/8/9/10/Q, or it was publicly revealed
by a slam. The server's `card_peeks` table plus public reveal history is what
decides — never the client.

## viewFor: one projection, one place

There is a single server-side function `viewFor(playerId, gameState)` that
produces everything a given player may see. Every payload that leaves the
server for a client goes through it. Do not build per-route or per-handler
redaction — scattered redaction is how a field slips through. If a new
feature needs the client to know something new, the change happens in
`viewFor` (and its output schema in `contracts`), where it can be reviewed as
an entitlement decision.

Test it adversarially: for each phase, assert what a _non_-entitled player's
view does **not** contain.

## Channel topology

Supabase Realtime, **Broadcast mode only**, with the API server as the only
publisher:

- **Room channel** — public events every player receives: whose turn, which
  slots swapped (movements, not values), that a peek occurred (not what was
  seen), slam results, phase transitions.
- **Per-player channel** — private payloads: the value of a card you drew or
  peeked, your own known cards.

The classification question for every new event: _is this payload identical
for all players?_ If yes → room channel. If no → it must go per-player,
through `viewFor`. Never "mostly public with one private field" — split the
event.

## Hard prohibitions

- **No Postgres Changes replication to clients, ever.** RLS gates rows; it
  cannot express "this player may see this card because they peeked three
  turns ago" — that's game logic, not a row predicate.
- **No Supabase anon-key database access from the browser.** The service key
  lives only in `apps/api`; clients get no direct database access of any
  kind.
- **`apps/web` never imports `domain` or `application`** (compile-enforced) —
  the domain types themselves contain full state. Client-visible shapes are
  designed in `contracts`, which means every client-visible field is an
  explicit, reviewable decision.

## Knowledge follows cards, not slots (§4.4)

Blind swaps are publicly visible as **slot movements**. If everyone saw
player 1's slot A swap with player 2's slot C, anyone who knew slot A held a
3 now knows player 2's slot C holds a 3. Model belief against **card
identity** (`cardSlug`), propagated through the public swap history — never
as `(player, slot) → value`. This applies to the server's view construction
and to the future bot's belief state.

## Memory fidelity (UI rule)

A peeked card is shown briefly, then never again — remembering it is the
game. No persistent markers, tooltips, or "cards you know" panels. The server
records peeks (`card_peeks`) for view construction and bot use, **not** to
assist the human player. Don't "improve UX" by weakening this.
