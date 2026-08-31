import { describe, expect, it } from "@effect/vitest"
import {
  BadPlayerCount,
  EmptySlotTarget,
  GameAlreadyEnded,
  type GameError,
  InvalidGiveSlot,
  KeepRequiresEmptyHand,
  MustResolvePower,
  NoCardToDraw,
  NotYourTurn,
  PowerDiscardNotTakeable,
  SlamTooLate,
  WindowStillOpen,
  WrongPeekTarget,
  WrongPhase,
} from "../src/GameError.js"
import { slot, ts, uid } from "./fixtures.js"

const p0 = uid(0)
const p1 = uid(1)

describe("GameError", () => {
  it("constructs every class with its fields and _tag", () => {
    const errors: ReadonlyArray<GameError> = [
      new BadPlayerCount({ count: 6 }),
      new GameAlreadyEnded({ calledBy: p0 }),
      new NotYourTurn({ playerId: p1, activePlayerId: p0 }),
      new WrongPhase({ commandTag: "Slam", phaseTag: "AwaitingDraw" }),
      new PowerDiscardNotTakeable({ rank: "J" }),
      new MustResolvePower({ power: "Q" }),
      new EmptySlotTarget({ target: { playerId: p0, slotIndex: slot(1) } }),
      new WrongPeekTarget({ power: "7", target: { playerId: p1, slotIndex: slot(0) } }),
      new KeepRequiresEmptyHand({ playerId: p0 }),
      new InvalidGiveSlot({ playerId: p0, giveSlot: null }),
      new SlamTooLate({ closesAt: ts(1000), at: ts(2000) }),
      new WindowStillOpen({ closesAt: ts(2000), at: ts(1000) }),
      new NoCardToDraw(),
    ]

    expect(new Set(errors.map((e) => e._tag)).size).toBe(13)
    const late = errors.find((e) => e._tag === "SlamTooLate")
    expect(late).toBeDefined()
    if (late?._tag === "SlamTooLate") expect(late.closesAt).toBe(ts(1000))
  })

  it("narrows on _tag in a switch", () => {
    const describeError = (err: GameError): string => {
      switch (err._tag) {
        case "NotYourTurn":
          return `active player is ${err.activePlayerId}`
        default:
          return err._tag
      }
    }
    expect(describeError(new NotYourTurn({ playerId: p1, activePlayerId: p0 }))).toBe(
      `active player is ${p0}`,
    )
    expect(describeError(new NoCardToDraw())).toBe("NoCardToDraw")
  })
})
