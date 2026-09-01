/**
 * `@cambio/contracts` — the wire types shared by `apps/api` and `apps/web`.
 *
 * This package exists because `web` needs command and event schemas but must
 * never see the domain: the domain contains full game state including other
 * players' cards. Keeping them separate makes information leakage a compile
 * error rather than a code-review question (§3.1).
 *
 * Consequences for anything added here:
 *
 *   - It may import `effect` and nothing else. Not `@cambio/domain`.
 *   - Every schema is a *redacted* view. A card value only appears in a
 *     contract if the recipient is entitled to it; values a player may not see
 *     must not exist in the payload at all — not hidden, not present-but-
 *     unrendered, not sent-then-filtered client-side (§5).
 *
 * Contracts so far: the health check (Task 1), the temporary-user auth
 * shapes (CAM-4), and the game wire language (CAM-6) — commands, the
 * room/per-player event split, the viewFor snapshot, channel grants,
 * reply envelopes, and the error body.
 */
export * from "./Channel.js"
export * from "./Error.js"
export * from "./GameCommand.js"
export * from "./GameEvents.js"
export * from "./GamePrimitives.js"
export * from "./GameView.js"
export * from "./Health.js"
export * from "./Responses.js"
export * from "./User.js"
