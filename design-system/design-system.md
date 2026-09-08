# Cambio Design System — router

The only always-loaded file. Everything verbose is routed. Born from the
moodboard in CAM-13; the human decides, the agent extracts.

## Decision map

| Task language                           | Load                                                       |
| --------------------------------------- | ---------------------------------------------------------- |
| Form or inputs?                         | `patterns/forms.md` + `core/field-scaffold.md` + the field |
| Page-level states? empty? error?        | `patterns/screen-states.md`                                |
| What ground does this screen get?       | `patterns/scenes.md`                                       |
| Exact values (color/type/space/motion)? | `references/tokens.md`                                     |
| Copy, terminology, capitalization?      | `references/voice.md`                                      |
| Cards, table, seats, slam, scores?      | the game-object file in `components/core/`                 |
| Using any component?                    | read its file's Revisions; build the current version       |
| New component, token, or pattern?       | **STOP.** Creation gate below.                             |

## Operating rules

- Production design system beats prototype; doc beats prototype on rules.
  Never resolve a conflict silently — flag it.
- No component fits? Check the extensions index below. Still nothing? Flag
  the gap. Never invent.
- Every visual value maps to a token. No hardcoded values, anywhere.
- Hidden information is design law: no component may display or hint at
  card values the viewer is not entitled to, and nothing may persist what a
  player once saw (memory fidelity). When in doubt, load the
  `hidden-information` skill.

## Creation gate

You may NOT create, modify, or extend anything canonical on your own:
components, tokens, or patterns.

- Every element in your output maps to a registered component, or is
  composed purely from registered ones.
- Every visual value maps to a token. No hardcoded values.

If nothing fits:

1. STOP. Do not improvise an unregistered component, token, or pattern.
2. Name the gap: what's needed, why nothing fits, the closest existing
   component or token, the delta required.
3. Wait. Only an explicit instruction from the user — "yes, create it" /
   "extend X" — lets you proceed.

When told to proceed: write the file in the component-file format below
(delta-only for extensions, status: draft), and add one line to the
extensions index.

Component-file format (extensions are delta-only; net-new files carry the
full set; a file is not done until it covers every state its class
requires):

    name: slug
    status: draft        draft | proven | retired
    version: 1
    extends: parent | none

    ## Anatomy       parts & structure
    ## States        every state for its class (MVS)
    ## Variants      if any
    ## Rules         must / must-not, the invisible logic
    ## Revisions     what changed, + re-check on breaking

## Status glossary

- **draft** — new, not yet proven. May change.
- **proven** — used in real screens and held up. Safe to reuse.
- **retired** — superseded. Don't use; kept so old refs resolve.

## Minimum Viable States

| Class       | Required states                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Static      | default only, explicitly no others                                                                                              |
| Interactive | default · hover · focus · active · disabled                                                                                     |
| Input       | Interactive + empty · filled · error · read-only                                                                                |
| Overlay     | open · closing/dismiss · overflow                                                                                               |
| Async/data  | populated · loading · empty · error · partial                                                                                   |
| Game object | per-object floor in its file; playing-card: face-down · face-up · peeking · selected · slam-eligible · in-flight · leaving-play |
| Page/screen | loaded · first-load skeleton · first-use empty · no-results empty · page error · partial failure · no-access · **reconnecting** |

First-use empty ≠ no-results empty — both required, different copy. No AI
surface class: this product has no AI features.

## Minimum Viable Components

Generic core (17): panel · badge · divider — button · link — text-field ·
select · toggle · field-scaffold — modal · toast — list · table · loading ·
empty-state · alert — app-shell.

Game objects (9): playing-card · hand · draw-deck · discard-pile ·
table-surface · seat · slam-timer · turn-indicator · score-sheet.

Deliberately excluded, expected as first extensions through the gate: tabs,
pagination, tooltip, textarea, radio, dropdown-menu.

## Extensions index

- `components/extensions/how-to-play-guide.md` — the complete rules,
  hosted in `modal` (CAM-30).
