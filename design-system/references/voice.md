# voice.md — copy rules, terminology, error style

How Cambio talks. Extracted from the moodboard's copy artifacts ("bar",
"READ 'EM AND WEEP", poster titles) and the canonical rules vocabulary during
CAM-13; register mix decided in the interview.

## Tone

Warm, playful, a little deadpan — card-table banter among friends, never
smug and never mean (slams are competitive; the copy isn't). The personality
lives in a few loud moments; functional copy stays plain so the loud moments
land.

Anti-slop rules: no over-promise adjectives (effortless, seamless,
delightful), no triplet taglines, no ✨, no exclamation inflation — `!` is
reserved for the two shout moments below.

## Register map (decided: the mix)

| Register          | Where                                                           | Example                              |
| ----------------- | --------------------------------------------------------------- | ------------------------------------ |
| Poster caps       | The two shout moments: a Cambio call and a slam. Screen titles. | `CAMBIO!` · `SLAM!` · `SCORES`       |
| Lowercase display | Ambient flavor: lobby greeting, empty states, loading lines     | `deal me in` · `shuffling…`          |
| Sentence case     | All functional UI: buttons, forms, helpers, errors, toasts      | `Join room` · `Room code not found.` |

Rationale: the board shows all three registers (poster titles, matchbox
lowercase, plain labels); mapping each to a job keeps flavor from leaking
into places where clarity pays the bill.

## Terminology (canonical — from the rules, never variants)

| Say                      | Never                                |
| ------------------------ | ------------------------------------ |
| call Cambio              | knock, cabo, close, finish           |
| slam                     | snap, burn, match, throw-in          |
| slam window              | reaction time, snap phase            |
| power card               | special card, ability card           |
| peek                     | reveal, scry, inspect                |
| blind-swap               | trade, steal                         |
| draw deck / discard pile | stock, waste, talon                  |
| keep                     | pick up (for the zero-card take)     |
| penalty card             | punishment, fine                     |
| fizzle                   | cancel, skip (for a no-target power) |
| slot                     | position, cell                       |
| room                     | lobby (the lobby is the room list)   |

Player-facing copy uses player language, not engine language: "Nadia looked
at one of your cards", never "PeekOpponent resolved".

## The memory-faithful rule (copy edition)

The UI never remembers for the player. No copy may restate a card value after
its reveal ends — no "you saw a 7 here", no history log of values, no
tooltips on face-down cards. Copy may reference _events_ ("Nadia peeked at
slot 2"), never _values_. Remembering is the game.

## Buttons

- Verb first, object if needed: `Deal me in` · `Join room` · `Start game` ·
  `Call Cambio` · `Slam`.
- One primary action per surface; the primary says what happens, not "OK" /
  "Confirm" / "Submit".
- Destructive/irreversible actions name their consequence: `Call Cambio —
ends the game`.

## Errors

Plain sentence case: what went wrong, then how to fix it. No apologies, no
"oops", no blame, no jargon.

- `Room code not found. Check the code and try again.`
- `That slam was wrong — penalty card added to your hand.` (game rule, not a
  failure: state it flatly, the sting is the game's)
- Never: `Oops! Something went wrong 😅`

## Numbers, dates, names

- Scores use a true minus sign: `−2`, never `-2`; always tabular (`numeral`
  token role). Zero is `0`, no styling that implies "good" — 0 loses to
  negatives.
- Card names: rank + suit symbol where space allows (`K♥`), spelled out in
  running copy ("king of hearts").
- Times: relative and short (`12s left`); the slam window shows seconds only.
- Player names render as given — never title-cased or truncated silently.
