import { Either, Option } from "effect"
import { ALL_CARD_SLUGS } from "../../src/Card.js"
import { type Command } from "../../src/Command.js"
import { dealGame } from "../../src/Deal.js"
import { applyCommand, type EngineResult } from "../../src/Engine.js"
import { type GameConfig } from "../../src/GameConfig.js"
import { type GameEvent } from "../../src/GameEvent.js"
import { type GameState } from "../../src/GameState.js"
import { Timestamp, type UserId } from "../../src/Ids.js"
import { ts, uid } from "../fixtures.js"
import { legalCandidates } from "./candidates.js"
import { emptyCounters, recordStep, type SimCounters } from "./counters.js"
import { stepViolations } from "./invariants.js"
import { chooseSlam, chooseTurnCommand, defaultKnobs, type PolicyKnobs } from "./policy.js"
import { makeDriverRng } from "./rng.js"

/**
 * The randomized-game driver (C1): plays one complete game from `dealGame`
 * to `Ended`, choosing among `legalCandidates` with its own seeded rng
 * (ADR-0013). Pure and deterministic — identical `SimParams` produce
 * identical traces, events, and final states (C1.1). Any violation, engine
 * disagreement, or cap hit throws `SimFailure` carrying full repro info
 * (C1.5).
 */
export interface SimParams {
  readonly gameSeed: number
  readonly driverSeed: number
  /** 2–5 (§1.1); roster is `uid(0)…uid(n-1)` unless `initial` overrides it. */
  readonly playerCount: number
  readonly config: GameConfig
  /** Hard termination backstop (C1.4); default 5000 (EndToEnd precedent). */
  readonly stepCap?: number
  readonly knobs?: PolicyKnobs
  /** Start from a constructed mid-game state instead of a deal (Coverage scenarios). */
  readonly initial?: {
    readonly state: GameState
    readonly roster: ReadonlyArray<UserId>
  }
  /** Observation hook (fuzzing rides real states here); must not mutate. */
  readonly onStep?: (state: GameState, now: Timestamp, step: number) => void
}

export interface StepRecord {
  readonly command: Command
  readonly at: Timestamp
}

export interface GameRun {
  readonly finalState: GameState
  readonly roster: ReadonlyArray<UserId>
  readonly trace: ReadonlyArray<StepRecord>
  readonly events: ReadonlyArray<GameEvent>
  readonly steps: number
  readonly turns: number
  readonly counters: SimCounters
}

/** Repro info by construction: seeds + step + the command trace (C1.5). */
export class SimFailure extends Error {
  readonly gameSeed: number
  readonly driverSeed: number
  readonly step: number
  readonly trace: ReadonlyArray<StepRecord>

  constructor(args: {
    readonly reason: string
    readonly gameSeed: number
    readonly driverSeed: number
    readonly step: number
    readonly trace: ReadonlyArray<StepRecord>
    readonly cause?: unknown
  }) {
    const tail = args.trace
      .slice(-5)
      .map((r) => `${r.command._tag}@${r.at}`)
      .join(" → ")
    super(
      `[sim] ${args.reason} at step ${args.step} ` +
        `(gameSeed=${args.gameSeed}, driverSeed=${args.driverSeed}); ` +
        `last commands: ${tail === "" ? "(none)" : tail}`,
      args.cause === undefined ? undefined : { cause: args.cause },
    )
    this.name = "SimFailure"
    this.gameSeed = args.gameSeed
    this.driverSeed = args.driverSeed
    this.step = args.step
    this.trace = args.trace
  }
}

const FULL_DECK_SORTED: ReadonlyArray<string> = [...ALL_CARD_SLUGS].sort()

/** Deterministic per-game seed derivation for batches: `[base + 2i, base + 2i + 1]`. */
export const seedPair = (base: number, i: number): readonly [number, number] => [
  base + 2 * i,
  base + 2 * i + 1,
]

/** Cycle player counts 2→5 across a batch so every table size gets exercised. */
export const playerCountFor = (i: number): number => 2 + (i % 4)

/** Simulated ms between ordinary steps; slam windows use their own instants. */
const STEP_MS = 25

export const simulateGame = (params: SimParams): GameRun => {
  const stepCap = params.stepCap ?? 5000
  const knobs = params.knobs ?? defaultKnobs
  const rng = makeDriverRng(params.driverSeed)
  const roster =
    params.initial?.roster ??
    Array.from({ length: params.playerCount }, (_, seat) => uid(seat))
  const trace: Array<StepRecord> = []
  const events: Array<GameEvent> = []
  let steps = 0
  let turns = 0
  let slamsThisWindow = 0
  let counters = emptyCounters()

  const fail = (reason: string, cause?: unknown): never => {
    throw new SimFailure({
      reason,
      gameSeed: params.gameSeed,
      driverSeed: params.driverSeed,
      step: steps,
      trace,
      cause,
    })
  }

  let state: GameState
  if (params.initial !== undefined) {
    state = params.initial.state
  } else {
    const dealt = dealGame(roster, params.gameSeed, params.config, ts(0))
    if (Either.isLeft(dealt)) return fail(`deal rejected: ${dealt.left._tag}`)
    state = dealt.right[0]
    events.push(...dealt.right[1])
  }

  // C2.1 verbatim: every starting state — dealt or constructed — must
  // partition the full 52-card deck; from here every step is checked.
  const initialViolations = stepViolations(state, roster, FULL_DECK_SORTED)
  if (initialViolations.length > 0) {
    return fail(`initial state invalid: ${initialViolations.join("; ")}`)
  }

  let now = ts(0)

  while (state.phase._tag !== "Ended") {
    if (steps >= stepCap) return fail(`step cap ${stepCap} reached without game end (C1.4)`)
    steps++

    let command: Command
    let at: Timestamp
    if (state.phase._tag === "SlamWindow") {
      // Window discipline (C1.3): act at closesAt − 1, close at closesAt.
      const inWindow = Timestamp.make(state.phase.closesAt - 1)
      const slams = legalCandidates(state, inWindow)
      const chosen = chooseSlam(state, slams, rng, slamsThisWindow, knobs)
      if (Option.isSome(chosen)) {
        command = chosen.value
        at = inWindow
        slamsThisWindow++
      } else {
        command = { _tag: "CloseSlamWindow" }
        at = state.phase.closesAt
      }
    } else {
      at = Timestamp.make(now + STEP_MS)
      const candidates = legalCandidates(state, at)
      // No stuck states (C3.2): outside a window some legal command must exist.
      if (candidates.length === 0) return fail("no legal candidates in a non-window phase (C3.2)")
      command = chooseTurnCommand(state, candidates, rng, turns, knobs)
    }

    if (at < now) return fail(`clock went backwards: ${now} → ${at} (C1.3)`)
    now = at

    // An engine THROW (vs a typed Either.left) is a defect; wrap it so the
    // failure still carries seeds + step + trace (C1.5).
    let result: EngineResult
    try {
      result = applyCommand(state, command, at)
    } catch (error) {
      return fail(
        `engine threw for ${command._tag}: ${String(error)} — engine defect (C7.1: stop and ask)`,
        error,
      )
    }
    if (Either.isLeft(result)) {
      return fail(
        `chosen candidate ${command._tag} rejected with ${result.left._tag} — ` +
          "legality/engine disagreement; if this reproduces, treat as an engine gap (C7.1: stop and ask)",
      )
    }
    const [nextState, stepEvents] = result.right

    counters = recordStep(counters, state, command, stepEvents)
    trace.push({ command, at })
    events.push(...stepEvents)
    for (const event of stepEvents) {
      if (event._tag === "TurnAdvanced") turns++
      if (event._tag === "SlamWindowOpened") slamsThisWindow = 0
    }
    state = nextState

    // The §4.5 invariants hold after every accepted command (C2.1, C2.2).
    const violations = stepViolations(state, roster, FULL_DECK_SORTED)
    if (violations.length > 0) return fail(violations.join("; "))
    params.onStep?.(state, at, steps)
  }

  return {
    finalState: state,
    roster,
    trace,
    events,
    steps,
    turns,
    counters: { ...counters, games: 1, steps, turns },
  }
}
