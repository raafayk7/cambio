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
 * Contracts so far: the health check (Task 1) and the temporary-user auth
 * shapes (CAM-4). Commands and events arrive with the rules engine.
 */
export * from "./Health.js"
export * from "./User.js"
