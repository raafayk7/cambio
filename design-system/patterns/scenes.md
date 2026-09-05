# Pattern: scene depth

How much of the khoka each screen shows — decided per screen class in the
CAM-13 interview. The `app-shell` owns these grounds; screens declare a
depth, never paint their own.

| Screen class              | Scene depth                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Lobby / menus             | Full illustrated courtyard (brick, benches, foliage, umbrellas).                                             |
| Room (waiting)            | Table + paving with scene at the edges — the table is set, people gather.                                    |
| Game                      | Top-down table on the checkered paving (the image7 blueprint). Nothing beyond the paving competes with play. |
| Forms / modals / settings | Plain `surface.page` cream with suit-chrome framing (`panel` chrome variant, sparingly).                     |

Rules:

- Scene art never carries information — it is ground. Anything a player
  needs to notice renders in components, on tokens.
- The dusk "khoka at night" scene is reserved for the future dark theme —
  do not use it as a light-theme variant.
- Scene illustrations are moodboard-style painterly flat with paper
  grain; no photographs, no depth-of-field. (CAM-17 revision: the
  production scene grounds ARE the moodboard — hi-res painted
  regenerations of lums-illustrated images 9/10, shipped as WebP; the
  game-facing paving and table assets are strictly top-down so nothing
  fights the orthographic play view.)
- Content sitting on an illustrated scene floats on the `panel` wash
  variant (panel.md r2) so the painting stays visible; display headings
  move inside the wash rather than landing on the artwork.
