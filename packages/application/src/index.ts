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
 * Contents: the clock, id-generation, seed, and realtime-publisher ports;
 * CAM-4's session signer port; the user/session use cases (ADR-0018); and
 * CAM-5's game lifecycle — lobby use cases, `executeGameCommand`, and the
 * per-room actor registry (ADR-0019/0020).
 */
export * from "./ports/Clock.js"
export * from "./ports/IdGenerator.js"
export * from "./ports/RealtimePublisher.js"
export * from "./ports/Seed.js"
export * from "./ports/SessionSigner.js"
export * from "./use-cases/CreateTemporaryUser.js"
export * from "./use-cases/VerifySession.js"
