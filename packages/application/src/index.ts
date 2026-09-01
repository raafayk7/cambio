/**
 * `@cambio/application` — use cases and infrastructure ports.
 *
 * Layering (§3.1): this package may import `@cambio/domain`, `@cambio/contracts`
 * and `effect`, and nothing else. Note the split that is easy to get wrong:
 *
 *   - **Repository** ports live in `domain`.
 *   - **Infrastructure** ports (clock, id generation, realtime publisher,
 *     logger) live here.
 *   - Implementations of both live in `apps/api/src/infra`.
 *
 * Contents so far: the clock and id-generation ports (Task 1), plus CAM-4's
 * session signer port and the repo's first use cases — create-temporary-user
 * and verify-session (ADR-0018). The realtime publisher port arrives with
 * the event types it publishes.
 */
export * from "./ports/Clock.js"
export * from "./ports/IdGenerator.js"
export * from "./ports/SessionSigner.js"
export * from "./use-cases/CreateTemporaryUser.js"
export * from "./use-cases/VerifySession.js"
