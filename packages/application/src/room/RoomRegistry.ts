import { Cause, Context, Deferred, Duration, Effect, Exit, Fiber, Layer, Queue } from "effect"
import {
  type Command,
  type GameConfig,
  type GameId,
  GameRepository,
  type GameState,
  type GameVersion,
  type UserId,
  type UserRepository,
} from "@cambio/domain"
import { ClockPort } from "../ports/Clock.js"
import { type RealtimePublisherPort } from "../ports/RealtimePublisher.js"
import { type SeedPort } from "../ports/Seed.js"
import { executeGameCommand } from "../use-cases/ExecuteGameCommand.js"
import { joinLobby, type LobbyChanged } from "../use-cases/JoinLobby.js"
import { leaveLobby } from "../use-cases/LeaveLobby.js"
import { type GameAdvanced, startGame } from "../use-cases/StartGame.js"

/**
 * The per-room actor registry (HANDOFF §6, ADR-0020): one lazily-created
 * actor per room — an unbounded `Queue` of envelopes consumed by a single
 * fiber — serializes every command and lobby mutation for that room, so slam
 * races are deterministic: first-in-queue wins, ordering is
 * server-authoritative rather than latency-dependent.
 *
 * Mechanics (each an ADR-0020 decision):
 *   - **Replies via `Deferred`** — each envelope carries its own typed
 *     `Deferred`; the actor completes it with the use case's Exit, so typed
 *     errors (and defects) survive to the caller unchanged.
 *   - **Cached state** — the actor holds `{ state, version }` after each
 *     successful save and loads only at bootstrap; that load IS the
 *     "rebuild on first command after restart" story. One fiber per room
 *     makes the cache race-free.
 *   - **`VersionConflict`: surface + invalidate, never retry** — but the
 *     invalidation is followed by an eager reload in the same envelope
 *     (CAM-26, ADR-0037, S2), so a live `SlamWindow`'s timer is re-armed
 *     immediately rather than waiting on a next command that might never
 *     arrive.
 *   - **Lazy slam-close** — the engine never auto-closes the window, so
 *     before a queued command while the cached phase is `SlamWindow` with
 *     `now >= closesAt`, the actor first executes `CloseSlamWindow` as its
 *     own persisted + published batch. Skipped for `Slam` (so a late slammer
 *     gets the engine's `SlamTooLate`, not `WrongPhase`) and for an explicit
 *     `CloseSlamWindow`. The timer fiber merely enqueues the same close
 *     earlier — an optimization, never the authority (ADR-0011).
 *   - **Arm on load, and on read** (CAM-26, ADR-0037, S1/S3/S4) — every
 *     bootstrap that populates the cache (the `Execute` restart path, and
 *     the reply-less `Poke` envelope enqueued by `GET /games/:gameId/view`)
 *     re-arms the timer, so a persisted, past-due `SlamWindow` closes
 *     promptly even with no player command in flight. `Poke` is idempotent
 *     and never resurrects a dead room beyond a no-op: a failed bootstrap
 *     load or an already-`Ended` phase evicts the room via the same
 *     empty-queue path below, rather than lingering.
 *   - **Eviction on end** — game `Ended` or lobby abandoned removes the
 *     actor once its queue is drained; a later message finds a fresh actor
 *     whose bootstrap reads rows/state and whose reply is a typed error.
 *   - **A room can fail, never hang** — use-case calls are exit-guarded and
 *     always complete the reply (defects included); a defect escaping the
 *     guard fails the envelope's reply and tears the actor down, and an
 *     `ensuring` finalizer on every exit unregisters the room and
 *     interrupts stranded envelopes, so no caller awaits a dead room.
 */

type ExecuteError = Effect.Effect.Error<ReturnType<typeof executeGameCommand>>
type JoinError = Effect.Effect.Error<ReturnType<typeof joinLobby>>
type LeaveError = Effect.Effect.Error<ReturnType<typeof leaveLobby>>
type StartError = Effect.Effect.Error<ReturnType<typeof startGame>>

export interface StartInput {
  readonly starterId: UserId
  readonly config: GameConfig
}

type Envelope =
  | {
      readonly _tag: "Execute"
      readonly command: Command
      readonly reply: Deferred.Deferred<GameAdvanced, ExecuteError>
    }
  | {
      readonly _tag: "Join"
      readonly userId: UserId
      readonly reply: Deferred.Deferred<LobbyChanged, JoinError>
    }
  | {
      readonly _tag: "Leave"
      readonly userId: UserId
      readonly reply: Deferred.Deferred<LobbyChanged, LeaveError>
    }
  | {
      readonly _tag: "Start"
      readonly input: StartInput
      readonly reply: Deferred.Deferred<GameAdvanced, StartError>
    }
  /** Internal timer enqueue — no reply; an illegal-when-processed close is dropped. */
  | { readonly _tag: "TimerClose" }
  /**
   * Liveness nudge from a read (CAM-26, ADR-0037) — no reply. Bootstraps the
   * cache if cold, runs `closeIfDue`, and re-arms. Idempotent: a second poke
   * finds the phase already advanced and does nothing.
   */
  | { readonly _tag: "Poke" }

export class RoomRegistry extends Context.Tag("@cambio/application/RoomRegistry")<
  RoomRegistry,
  {
    readonly execute: (
      gameId: GameId,
      command: Command,
    ) => Effect.Effect<GameAdvanced, ExecuteError>
    readonly join: (gameId: GameId, userId: UserId) => Effect.Effect<LobbyChanged, JoinError>
    readonly leave: (gameId: GameId, userId: UserId) => Effect.Effect<LobbyChanged, LeaveError>
    readonly start: (gameId: GameId, input: StartInput) => Effect.Effect<GameAdvanced, StartError>
    /**
     * Reply-less liveness nudge (CAM-26, ADR-0037): enqueue-only, cannot
     * fail. Handling it bootstraps the actor's cache if cold, runs
     * `closeIfDue`, and re-arms the timer — the mechanism behind
     * poke-on-read (`GET /games/:gameId/view`).
     */
    readonly poke: (gameId: GameId) => Effect.Effect<void>
    /**
     * Live actors right now — observability for tests and ops (it is how
     * eviction is asserted), never part of the §6 room semantics.
     */
    readonly roomCount: Effect.Effect<number>
  }
>() {}

type Deps = GameRepository | UserRepository | ClockPort | SeedPort | RealtimePublisherPort

const failureTag = (cause: Cause.Cause<{ readonly _tag: string }>): string | null => {
  const failure = Cause.failureOption(cause)
  return failure._tag === "Some" ? failure.value._tag : null
}

export const RoomRegistryLive: Layer.Layer<RoomRegistry, never, Deps> = Layer.scoped(
  RoomRegistry,
  Effect.gen(function* () {
    const scope = yield* Effect.scope
    const context = yield* Effect.context<Deps>()
    const clock = yield* ClockPort
    const games = yield* GameRepository
    /** Guards room creation/eviction so no envelope is ever lost or stranded. */
    const lock = yield* Effect.makeSemaphore(1)
    const rooms = new Map<GameId, { readonly queue: Queue.Queue<Envelope> }>()

    const runRoom = (gameId: GameId, queue: Queue.Queue<Envelope>) => {
      // Owned by this single fiber — that is what makes them race-free.
      let cache: { readonly state: GameState; readonly version: GameVersion } | null = null
      let timer: Fiber.RuntimeFiber<void> | null = null
      let evict = false

      const clearTimer = Effect.suspend(() => {
        const current = timer
        timer = null
        return current === null ? Effect.void : Fiber.interrupt(current)
      })

      /** (Re)arm the close timer iff the cached phase is an open SlamWindow. */
      const manageTimer = Effect.gen(function* () {
        yield* clearTimer
        const phase = cache?.state.phase
        if (phase !== undefined && phase._tag === "SlamWindow") {
          const now = yield* clock.now
          timer = yield* Effect.fork(
            Effect.sleep(Duration.millis(Math.max(0, phase.closesAt - now))).pipe(
              Effect.andThen(Queue.offer(queue, { _tag: "TimerClose" })),
              Effect.asVoid,
            ),
          )
        }
      })

      /**
       * Reload the cache from persistence, swallowing failure (cache stays
       * null — there is no reply to fail here). Used to bootstrap a `Poke`
       * on a cold actor and to re-arm after a `VersionConflict` invalidates
       * the cache (S2, CAM-26): a conflict must not leave a live window
       * timer-less until the next command happens to arrive.
       */
      const reload = Effect.gen(function* () {
        const loaded = yield* Effect.exit(games.load(gameId).pipe(Effect.provide(context)))
        cache = Exit.isSuccess(loaded) ? loaded.value : null
      })

      /**
       * Close the slam window iff the authority says it is due
       * (`ClockPort.now >= closesAt` — never the timer). Its own persisted
       * + published batch; failures are dropped silently (the other path
       * won, or the game moved on).
       */
      const closeIfDue = Effect.gen(function* () {
        const phase = cache?.state.phase
        if (cache === null || phase === undefined || phase._tag !== "SlamWindow") return
        const now = yield* clock.now
        if (now < phase.closesAt) return
        const exit = yield* Effect.exit(
          executeGameCommand({
            gameId,
            command: { _tag: "CloseSlamWindow" },
            cached: cache,
          }).pipe(Effect.provide(context)),
        )
        if (Exit.isSuccess(exit)) {
          cache = { state: exit.value.state, version: exit.value.version }
        } else if (failureTag(exit.cause) === "VersionConflict") {
          yield* reload
        }
      })

      const handle = (envelope: Envelope): Effect.Effect<void> =>
        Effect.gen(function* () {
          switch (envelope._tag) {
            case "Execute": {
              if (cache === null) {
                // Bootstrap: rebuild from persisted state (§6 restart story).
                const loaded = yield* Effect.exit(games.load(gameId).pipe(Effect.provide(context)))
                if (Exit.isFailure(loaded)) {
                  return yield* Deferred.failCause(envelope.reply, loaded.cause)
                }
                cache = loaded.value
                // S1 (CAM-26): arm on load — a cached SlamWindow always ends
                // up with a timer, independent of what the command does next.
                yield* manageTimer
              }
              const tag = envelope.command._tag
              if (tag !== "Slam" && tag !== "CloseSlamWindow") yield* closeIfDue
              const exit = yield* Effect.exit(
                executeGameCommand({
                  gameId,
                  command: envelope.command,
                  cached: cache ?? undefined,
                }).pipe(Effect.provide(context)),
              )
              if (Exit.isSuccess(exit)) {
                cache = { state: exit.value.state, version: exit.value.version }
                if (exit.value.state.phase._tag === "Ended") evict = true
              } else if (failureTag(exit.cause) === "VersionConflict") {
                // S2 (CAM-26): re-arm after conflict — reload eagerly, in
                // this same envelope, so the trailing manageTimer below sees
                // fresh state rather than leaving a live window timer-less
                // until (if ever) another command arrives.
                yield* reload
              }
              yield* Deferred.done(envelope.reply, exit)
              return yield* manageTimer
            }
            case "Join": {
              const exit = yield* Effect.exit(
                joinLobby({ gameId, userId: envelope.userId }).pipe(Effect.provide(context)),
              )
              return yield* Deferred.done(envelope.reply, exit)
            }
            case "Leave": {
              const exit = yield* Effect.exit(
                leaveLobby({ gameId, userId: envelope.userId }).pipe(Effect.provide(context)),
              )
              if (Exit.isSuccess(exit) && exit.value.lobby.status === "abandoned") evict = true
              return yield* Deferred.done(envelope.reply, exit)
            }
            case "Start": {
              const exit = yield* Effect.exit(
                startGame({
                  gameId,
                  starterId: envelope.input.starterId,
                  config: envelope.input.config,
                }).pipe(Effect.provide(context)),
              )
              if (Exit.isSuccess(exit)) {
                cache = { state: exit.value.state, version: exit.value.version }
              }
              yield* Deferred.done(envelope.reply, exit)
              return yield* manageTimer
            }
            case "TimerClose": {
              yield* closeIfDue
              return yield* manageTimer
            }
            case "Poke": {
              // S3/S4 (CAM-26): bootstrap if cold, judge the clock, re-arm.
              // Idempotent — a second poke finds the phase already advanced
              // (or the actor already gone) and does nothing further.
              if (cache === null) yield* reload
              if (cache === null || cache.state.phase._tag === "Ended") {
                // A dead-or-unloadable room must not linger just because it
                // was poked (ADR-0037): ANY failed load lands here —
                // usually no game row (unknown id, or a lobby-only room the
                // route never pokes in practice), but also a transient
                // StorageError, since `reload` swallows every failure
                // identically — as does an already-Ended game. All drain
                // via the existing empty-queue eviction path below, never a
                // special case; eviction is free because rooms are
                // reconstructible from rows, and `evict`, once set, stays
                // set for this actor's life (a fresh actor rebuilds on the
                // next envelope).
                evict = true
              }
              yield* closeIfDue
              return yield* manageTimer
            }
            default:
              return envelope satisfies never
          }
        })

      const loop = Effect.gen(function* () {
        let running = true
        while (running) {
          const envelope = yield* Queue.take(queue)
          // Defect guard: handle() completes the reply on every typed path.
          // If it DIES instead, complete this envelope's reply with the
          // cause so its caller never hangs, then let the actor die too —
          // its state is unknown; the ensuring-cleanup below unregisters
          // the room so the next message gets a fresh actor rebuilt from
          // persisted state.
          const handled = yield* Effect.exit(handle(envelope))
          if (Exit.isFailure(handled)) {
            if (envelope._tag !== "TimerClose" && envelope._tag !== "Poke") {
              // Cause<never> (defect/interrupt only) fits any reply's E.
              yield* Deferred.failCause(
                envelope.reply as unknown as Deferred.Deferred<never, never>,
                handled.cause,
              )
            }
            return yield* Effect.failCause(handled.cause)
          }
          if (evict) {
            // Evict only with an empty queue, under the creation lock — an
            // envelope offered concurrently is either processed here (typed
            // error from the ended room) or lands on a fresh actor.
            const removed = yield* lock.withPermits(1)(
              Effect.suspend(() =>
                Queue.size(queue).pipe(
                  Effect.map((size) => {
                    if (size === 0) {
                      rooms.delete(gameId)
                      return true
                    }
                    return false
                  }),
                ),
              ),
            )
            if (removed) {
              yield* clearTimer
              running = false
            }
          }
        }
      })

      // Runs on EVERY exit — graceful eviction, defect, or layer-scope
      // interruption: unregister the room (identity-checked, under the
      // creation lock so no sender is mid-offer), interrupt the timer, and
      // interrupt any stranded envelopes so no caller ever awaits a dead
      // room's Deferred.
      const cleanup = clearTimer.pipe(
        Effect.andThen(
          lock.withPermits(1)(
            Effect.gen(function* () {
              if (rooms.get(gameId)?.queue === queue) rooms.delete(gameId)
              const leftovers = yield* Queue.takeAll(queue)
              yield* Queue.shutdown(queue)
              for (const left of leftovers) {
                if (left._tag !== "TimerClose" && left._tag !== "Poke") {
                  // Union of invariant Deferred types — interrupt is shape-agnostic.
                  yield* Deferred.interrupt(
                    left.reply as unknown as Deferred.Deferred<unknown, unknown>,
                  )
                }
              }
            }),
          ),
        ),
      )

      return loop.pipe(Effect.ensuring(cleanup))
    }

    /**
     * Get-or-create the room and run `use` against it, all under the
     * creation lock in one atomic step — the same lock the eviction paths
     * take, so a room can never be deleted out from under a concurrent
     * enqueue. Shared by `send` (awaits a reply) and `poke` (fire-and-forget).
     */
    const withRoom = <A, E>(
      gameId: GameId,
      use: (room: { readonly queue: Queue.Queue<Envelope> }) => Effect.Effect<A, E>,
    ): Effect.Effect<A, E> =>
      lock.withPermits(1)(
        Effect.gen(function* () {
          let room = rooms.get(gameId)
          if (room === undefined) {
            const queue = yield* Queue.unbounded<Envelope>()
            // Forked into the layer scope: actors outlive callers and are
            // interrupted (with their timer children) at layer shutdown.
            yield* runRoom(gameId, queue).pipe(Effect.forkIn(scope))
            room = { queue }
            rooms.set(gameId, room)
          }
          return yield* use(room)
        }),
      )

    const send = <A, E>(
      gameId: GameId,
      make: (reply: Deferred.Deferred<A, E>) => Envelope,
    ): Effect.Effect<A, E> =>
      Effect.gen(function* () {
        const reply = yield* Deferred.make<A, E>()
        yield* withRoom(gameId, (room) => Queue.offer(room.queue, make(reply)))
        return yield* Deferred.await(reply)
      })

    return {
      execute: (gameId, command) =>
        send<GameAdvanced, ExecuteError>(gameId, (reply) => ({ _tag: "Execute", command, reply })),
      join: (gameId, userId) =>
        send<LobbyChanged, JoinError>(gameId, (reply) => ({ _tag: "Join", userId, reply })),
      leave: (gameId, userId) =>
        send<LobbyChanged, LeaveError>(gameId, (reply) => ({ _tag: "Leave", userId, reply })),
      start: (gameId, input) =>
        send<GameAdvanced, StartError>(gameId, (reply) => ({ _tag: "Start", input, reply })),
      poke: (gameId) =>
        withRoom(gameId, (room) => Queue.offer(room.queue, { _tag: "Poke" })).pipe(Effect.asVoid),
      roomCount: Effect.sync(() => rooms.size),
    }
  }),
)
