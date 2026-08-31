import { describe, expect, it } from "@effect/vitest"
import { Either, Option } from "effect"
import { type Command } from "../../src/Command.js"
import { applyCommand } from "../../src/Engine.js"
import { decodeGameConfig } from "../../src/GameConfig.js"
import { occupiedSlots } from "../../src/GameState.js"
import { Timestamp } from "../../src/Ids.js"
import { checkCommand, legalCommandKinds } from "../../src/Legality.js"
import { legalCandidates } from "./candidates.js"
import { playerCountFor, seedPair, simulateGame } from "./driver.js"
import { randomCommand, sampleFillings } from "./fuzz.js"
import { makeDriverRng } from "./rng.js"

/**
 * Illegal-command robustness (C4): probes ride real game states via the
 * driver's `onStep` hook. `applyCommand` is pure, so probing cannot perturb
 * the runs — and the fuzz seeds are offset from the main batch so no games
 * are shared. Everything is seeded: these tests are deterministic.
 */
const FUZZ_GAMES = 25
const FUZZ_BASE = 20260831 + 1_000_000

const config = decodeGameConfig({ slamWindowMs: 4000 })

describe("illegal-command fuzzing", () => {
  it("illegal commands return typed GameErrors and never mutate state (C4.1)", () => {
    const fuzzRng = makeDriverRng(424242)
    const seenErrors = new Set<string>()

    for (let i = 0; i < FUZZ_GAMES; i++) {
      const [gameSeed, driverSeed] = seedPair(FUZZ_BASE, i)
      simulateGame({
        gameSeed,
        driverSeed,
        playerCount: playerCountFor(i),
        config,
        onStep: (state, now, step) => {
          if (step % 3 !== 0) return
          for (let k = 0; k < 3; k++) {
            const command = randomCommand(state, fuzzRng)
            const snapshot = structuredClone(state)
            const verdict = checkCommand(state, command, now)
            let result
            try {
              result = applyCommand(state, command, now)
            } catch (error) {
              throw new Error(
                `engine THREW for ${command._tag} (gameSeed=${gameSeed}, driverSeed=${driverSeed}, step ${step})`,
                { cause: error },
              )
            }
            if (Option.isSome(verdict)) {
              if (!Either.isLeft(result)) throw new Error("checkCommand rejected but engine accepted")
              expect(result.left._tag).toBe(verdict.value._tag)
              seenErrors.add(result.left._tag)
            } else {
              expect(Either.isRight(result)).toBe(true)
            }
            expect(state, "probed state must be untouched").toStrictEqual(snapshot)
          }

          // Window-clock probes: a slam at closesAt is too late; a close
          // before closesAt is premature (ADR-0011 boundaries).
          if (state.phase._tag === "SlamWindow") {
            const closesAt = state.phase.closesAt
            const target = occupiedSlots(state)[0]
            if (target !== undefined) {
              const late = applyCommand(
                state,
                { _tag: "Slam", playerId: state.players[0]!.id, target, giveSlot: null },
                closesAt,
              )
              if (!Either.isLeft(late)) throw new Error("late slam accepted")
              expect(late.left._tag).toBe("SlamTooLate")
              seenErrors.add(late.left._tag)
            }
            const premature = applyCommand(
              state,
              { _tag: "CloseSlamWindow" },
              Timestamp.make(closesAt - 1),
            )
            if (!Either.isLeft(premature)) throw new Error("premature close accepted")
            expect(premature.left._tag).toBe("WindowStillOpen")
            seenErrors.add(premature.left._tag)
          }
        },
      })
    }

    // The generator's mix reaches every illegal shape the root plan names.
    for (const required of [
      "NotYourTurn",
      "WrongPhase",
      "EmptySlotTarget",
      "UnknownPlayer",
      "SlamTooLate",
      "WindowStillOpen",
    ]) {
      expect([...seenErrors], `error tag ${required} observed`).toContain(required)
    }
  })

  it("legalCommandKinds agrees with checkCommand (C4.2)", () => {
    const fuzzRng = makeDriverRng(777)
    const PLAYER_TAGS = [
      "CallCambio",
      "TakeDiscard",
      "DrawFromDeck",
      "SwapHeld",
      "DiscardHeld",
      "KeepHeld",
      "PowerPeek",
      "PowerSwap",
      "Slam",
    ] as const satisfies ReadonlyArray<Command["_tag"]>

    for (let i = 0; i < FUZZ_GAMES; i++) {
      const [gameSeed, driverSeed] = seedPair(FUZZ_BASE + 500_000, i)
      simulateGame({
        gameSeed,
        driverSeed,
        playerCount: playerCountFor(i),
        config,
        onStep: (state, now, step) => {
          if (step % 5 !== 0 || state.phase._tag === "Ended") return
          const candidates = legalCandidates(state, now)
          for (const player of state.players) {
            const kinds = legalCommandKinds(state, player.id, now)
            for (const tag of PLAYER_TAGS) {
              const mine = candidates.filter(
                (c) => c._tag === tag && "playerId" in c && c.playerId === player.id,
              )
              if (kinds.includes(tag)) {
                // Every listed tag admits candidates, and every candidate the
                // driver fills is accepted (C1.2 at scale).
                expect(mine.length, `${tag} listed but no candidate filled`).toBeGreaterThan(0)
                for (const c of mine) {
                  expect(
                    Option.isNone(checkCommand(state, c, now)),
                    `filled ${tag} candidate rejected`,
                  ).toBe(true)
                }
              } else {
                expect(mine, `${tag} unlisted but candidates filled`).toHaveLength(0)
                for (const c of sampleFillings(state, player.id, tag, fuzzRng, 8)) {
                  expect(
                    Option.isSome(checkCommand(state, c, now)),
                    `unlisted ${tag} filling accepted`,
                  ).toBe(true)
                }
              }
            }
          }
          // CloseSlamWindow has no issuer: checked directly against the clock.
          if (state.phase._tag === "SlamWindow") {
            const closesAt = state.phase.closesAt
            expect(Option.isSome(checkCommand(state, { _tag: "CloseSlamWindow" }, now))).toBe(
              now < closesAt,
            )
            expect(
              Option.isNone(checkCommand(state, { _tag: "CloseSlamWindow" }, closesAt)),
            ).toBe(true)
          } else {
            expect(Option.isSome(checkCommand(state, { _tag: "CloseSlamWindow" }, now))).toBe(true)
          }
        },
      })
    }
  })
})
