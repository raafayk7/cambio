# Design references

Source material for the Cambio design system (CAM-13) and the frontend AI
harness (CAM-14). Imported September 2026 from Raafay's moodboard and the
Carbonteq Design department's tooling so the design system's provenance is
version-controlled alongside the code it produces.

## Direction (short version)

Flat mid-century / 50s-advert illustration of the LUMS Khoka courtyard — cream
paper, terracotta brick, deep-green picnic tables and umbrellas, card-suit
border chrome. The nostalgia anchor: playing Cambio with friends at the Khoka
tables. The game renders on a top-down khoka table. Decisions the references
do not settle (table turquoise vs green, typography, five-player seating) are
tracked in CAM-13 and resolved by Raafay, never defaulted.

## `moodboard/`

Four Pinterest-sourced sets:

| Folder                | Contents                                                                                  | Role                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `card-illustrations/` | Vintage matchbox labels, modernist decks, 60s book covers, minimalist poster art          | Style reference: limited flat-ink palettes, geometric suits, paper texture, bold display type |
| `lums-photos/`        | The real Khoka courtyard at LUMS                                                          | Place reference                                                                               |
| `lums-illustrated/`   | AI illustrations of the Khoka in the card-illustration style; includes the top-down table | The art direction itself; the top-down table is the game-board layout blueprint               |

Images 9–11 in `lums-illustrated/` are hi-res regenerations produced
during CAM-17 as **production sources**: image9 (courtyard scene →
`packages/ui/src/assets/scene-courtyard.webp`), image10 (top-down paving
→ `packages/ui/src/assets/scene-paving.webp`), image11 (table + benches
with alpha → `apps/web/src/assets/table-top.webp`). Regenerate at
≥ these dimensions and re-compress if the art ever changes.
| `card-game-ui/` | Classic card game UIs (MS Hearts, FreeCell, bridge app, pixel card) | **Layout reference only** — radial table arrangement, information clarity. Not style. |

## `resources/`

Carbonteq Design department tooling:

- `Design-System-MD-Format.pdf` — the target format for `design-system/`: one
  always-loaded router file, routed component/pattern/token files, the
  creation gate, Minimum Viable States/Components floors.
- `design-md-setup-prompt.md` — the 6-phase interview used to extract the
  design system from this moodboard. Governing rule: the user decides, the
  agent extracts.
- `ai-tells/` — original audit skill (Claude design-default forensics). The
  TanStack-adapted version lives in the harness (CAM-14); this is the source.
- `design-gate-plugin.zip` — the design evaluation plugin (decompose → map →
  judge, WCAG hard checks). Installed via the harness in CAM-14; kept here as
  the vendored source.

External companion (not vendored): impeccable —
<https://github.com/pbakaus/impeccable>.
