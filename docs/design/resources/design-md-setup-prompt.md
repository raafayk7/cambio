# Build my Design MD from these references

I'm going to give you a **mood board / set of references** — colors, type, UI examples, the visual direction I want. Your job is to **extract the design system that's implicit in those references** and write it down in the Design MD format below: a design system structured for you (an AI agent) to route through, not read top to bottom.

You are not the designer here. **I am.** Your job is to read what the references show, propose what follows from them, and write it down once I confirm. Every token, component, and rule must be **derived from the references I give you** — never from your own taste or defaults.

## How you must work with me (read this first — it governs everything)

- **Never make a design decision on your own.** Surface the options, give me a recommendation with your reasoning, and let _me_ choose. I am the decision-maker; you are extracting and recording my decisions.
- **Ask clarifying questions whenever anything is ambiguous or missing.** If the references don't clearly show something, stop and ask me — do not fill the gap with a default. Silence in the references means "ask," never "guess."
- **Assume I may not be a designer.** Explain choices in plain language, lay out the trade-offs simply, and tell me what each decision will affect downstream. Your job is to make me a confident decision-maker, not to decide for me.
- **One step at a time.** Work through the phases in order. Don't generate the whole system at once. Build a piece, show me, ask your questions, take my answers, then move on.
- **Mark anything inferred.** If you propose a value the references only imply, label it clearly as _inferred — please confirm_. Never present something you decided as if it were already settled.

The mood board is the source of truth for what things look like. **I am the source of truth for every decision the mood board doesn't settle.**

## Core principles (these govern what you build, and how the finished system behaves)

1. **One always-loaded file, everything else routed.** `design-system.md` is the only file read on every request — keep it to roughly one page. Component specs, tokens, and patterns live in separate files that get loaded only when a task needs them.
2. **You compose from the system; only I change it.** Once the system exists, you may never create, modify, or extend anything canonical — components, tokens, or patterns — on your own. No hardcoded values; every visual value maps to a token. When nothing fits, you STOP, name what's missing, and wait for my explicit "yes, build it." This rule lives inside the Design MD, and you follow it while building it.
3. **Status is self-set:** draft (new, unproven) → proven (used and held up) → retired (superseded). No approval step.

## The folder we're building

```
design-system/
├── design-system.md     ← always loaded: the router + the rules
├── components/
│   ├── core/            ← the official component set, one file each
│   └── extensions/      ← project-born components, delta files only
├── patterns/            ← recipes: forms, screen-states, navigation…
└── references/
    ├── tokens.md        ← color, type, spacing, elevation, motion
    └── voice.md         ← copy rules, terminology, error-message style
```

## Phase 1 — Read the references

Look at everything I gave you and tell me back, in plain language, what you actually see:

- **Color** — the palette, and which colors seem to be doing what (background, text, primary action, borders, status).
- **Type** — typefaces, the size/weight hierarchy, how headings vs. body are treated.
- **Spacing & shape** — density, rounding, border style, elevation/shadow use.
- **Mood & voice** — the personality, and any copy visible in the references (tone, capitalization, terminology).
- **Components visible** — what UI elements actually appear in the references (buttons, inputs, cards, etc.).

Then tell me **what the references do NOT show** that we'll need to decide together, and ask me about those gaps. Wait for my answers before continuing.

## Phase 2 — Extract the references files (tokens + voice)

From what you saw and what I confirmed, draft:

- **`tokens.md`** — color (primitives + semantic roles, light/dark if shown), typography (families, scale, weights, roles), spacing scale, border radii, elevation, motion. Use values you can read off the references directly. For anything the board only implies, propose a value, mark it _inferred — please confirm_, and ask me. Never present an invented value as decided.
- **`voice.md`** — tone, terminology, capitalization, error-message style, button-label conventions, date/number formats. Pull what the references show; ask me about anything you'd otherwise be guessing.

Show me each file, ask your questions, take my edits, then continue.

## Phase 3 — Set the two floors

Put both in the main file. Present each as a proposal for me to approve or change — not as final.

**Minimum Viable States** — the smallest set of states each component class must have, or it's undesigned. Baseline (walk me through it and adjust with me):

| Class                            | Required states                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Static (badge, divider, card)    | default only                                                                                             |
| Interactive (button, link, tab)  | default, hover, focus, active, disabled                                                                  |
| Input (field, select, toggle)    | Interactive + empty, filled, error, read-only                                                            |
| Overlay (modal, drawer, toast)   | open, dismiss, overflow                                                                                  |
| Async/data (table, list, widget) | populated, loading, empty, error, partial                                                                |
| AI surface (only if relevant)    | idle, working, streaming, complete, error, refusal, interrupted                                          |
| **Page / screen**                | loaded, first-load (skeleton), first-use empty, no-results empty, page error, partial failure, no-access |

Flag the page row to me: first-use empty (no data yet) and no-results empty (a filter returned nothing) are different states — both required.

**Minimum Viable Components** — the ~21 components needed before screens can be built by composition alone: card, badge, divider; button (primary/secondary/ghost/icon), link, tabs; text field, textarea, select, checkbox, radio, toggle, field scaffold (label + helper + error); modal, dropdown, tooltip, toast; table, list, pagination, loading (spinner + skeleton), empty state, alert; app shell. Add an AI module (prompt input, streaming block, steps indicator, citation chip, refusal block) only if my product needs it. Confirm the list with me before building.

## Phase 4 — Build the core component files

For each core component, write one file in `components/core/`, styled from `tokens.md` (never hardcoded), in this exact format:

```
name: <slug>
status: draft        (draft | proven | retired)
version: 1
extends: none        (or a parent, for extensions)

## Anatomy      — parts & structure
## States       — every state its class requires (from the table)
## Variants     — if any
## Rules        — must / must-not, the invisible logic
## Revisions    — what changed; on a breaking change, what to re-check
```

A file isn't done until it covers every state its class requires. Build a few at a time, show me, ask where the references leave a component's behavior unclear, then continue.

## Phase 5 — Write the main file (`design-system.md`)

Keep it to roughly one page. It contains, in this order:

1. **Decision map** — task-language routing tailored to what we built: "Building a form? → patterns/forms.md + core/text-field.md", "Need exact values? → references/tokens.md", "Using a component? → read its revisions, build the current version", "New component or token? → STOP, read the creation gate."
2. **Operating rules** — production system beats prototype; never resolve a conflict silently; no component fits → check extensions index, then flag the gap, never invent.
3. **Creation gate** — the full STOP-and-ask rule from principle 2, plus the component-file format from Phase 4.
4. **Status glossary** — draft / proven / retired, one line each.
5. **Minimum Viable States table** (from Phase 3).
6. **Minimum Viable Components list** (from Phase 3).
7. **Extensions index** — one line per extension; empty for now.

## Phase 6 — Verify, then hand it over

Check and report:

- Is `design-system.md` about one page? If it's bloating, what should move to a routed file?
- Does every core component cover all states its class requires?
- Does every visual value trace to a token — nothing hardcoded?
- Could the screens I'm about to build (and common screens generally) be assembled from the core set alone? If not, what's missing — and is that a gap to flag to me, or a component I should ask you about adding?

Then give me the finished folder, file by file. After this, I'll ask you to build two specific screens **using only this system** — so everything those screens need should either already exist in core, or be something you stop and ask me about.

---

**Start with Phase 1. Read my references, tell me what you see, and ask me about anything they don't settle. Do not move past Phase 1 until I answer.**
