# Pattern: screen states

How a screen satisfies the page/screen row of the Minimum Viable States
table. Every screen answers all of these before it is done.

| Page state       | Recipe                                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| loaded           | The screen.                                                                                                                                                           |
| first-load       | `loading` skeletons matching the real layout; shell renders immediately.                                                                                              |
| first-use empty  | `empty-state` in `first-use` mode — onboarding energy + primary action.                                                                                               |
| no-results empty | `empty-state` in `no-results` mode — "no matches" + how to clear. Never the first-use CTA.                                                                            |
| page error       | Full-region `alert` (alarm) + retry; shell stays.                                                                                                                     |
| partial failure  | Failed region gets an inline `alert`; healthy regions render. Never a full-page error for a partial failure.                                                          |
| no-access        | Plain cream `panel`: what this is, why you can't see it, where to go.                                                                                                 |
| reconnecting     | `alert` (reconnecting variant) under the header; the screen stays live and visibly current-as-of. Required for every screen (CAM-13) — realtime is load-bearing here. |

Rules:

- First-use empty and no-results empty are different states with different
  copy — both required, never merged.
- The game screen's partial failure is the seat: a player's connection
  state renders at their seat (`seat` disconnected state), not as a page
  banner.
