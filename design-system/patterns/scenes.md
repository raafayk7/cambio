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
- Scene illustrations are moodboard-style flat ink with paper grain; no
  photographs, no gradients, no depth-of-field.
