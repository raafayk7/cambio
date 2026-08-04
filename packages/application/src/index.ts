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
 * Task 1 is scaffolding only, so there are no use cases yet — just the two
 * infrastructure ports needed to prove the layering compiles. The realtime
 * publisher port arrives with the event types it publishes.
 */
export * from "./ports/Clock.js"
export * from "./ports/IdGenerator.js"
