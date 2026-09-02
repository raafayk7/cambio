import { expect } from "@effect/vitest"
import type { PlayerGameView } from "@cambio/contracts"
import { applyCommand, type Command, type GameState } from "@cambio/domain"
import { ts } from "@cambio/domain/testing"
import { Either } from "effect"

import { clearPublisherJournal, type makeTestApp } from "./http.js"

/**
 * Shared e2e plumbing (extracted from EndToEndGame.test.ts for CAM-7,
 * backend plan decision 9): player creation, wire encoding, the local-replay
 * `apply`, and the lobby create/join/start boilerplate. Command CHOOSERS stay
 * per-suite — the acceptance script filters slams out, the slam suite seeks
 * them — only the mechanical plumbing is shared.
 */

export type TestApp = Awaited<ReturnType<typeof makeTestApp>>["app"]

export interface Player {
  readonly userId: string
  readonly cookie: string
}

export const makePlayers = async (
  app: TestApp,
  names: ReadonlyArray<string>,
): Promise<ReadonlyArray<Player>> => {
  const players: Array<Player> = []
  for (const name of names) {
    const res = await app.inject({ method: "POST", url: "/users", payload: { name } })
    expect(res.statusCode).toBe(201)
    players.push({
      userId: (res.json() as { userId: string }).userId,
      cookie: res.cookies.find((c) => c.name === "cambio_session")!.value,
    })
  }
  return players
}

/** Wire body for a domain command: the issuer field simply does not exist. */
export const toWire = (command: Command): Record<string, unknown> => {
  switch (command._tag) {
    case "CallCambio":
    case "TakeDiscard":
    case "DrawFromDeck":
    case "DiscardHeld":
    case "KeepHeld":
      return { _tag: command._tag }
    case "SwapHeld":
      return { _tag: "SwapHeld", slotIndex: command.slotIndex }
    case "PowerPeek":
      return { _tag: "PowerPeek", target: command.target }
    case "PowerSwap":
      return { _tag: "PowerSwap", first: command.first, second: command.second }
    case "Slam":
      return { _tag: "Slam", target: command.target, giveSlot: command.giveSlot }
    case "CloseSlamWindow":
      throw new Error("CloseSlamWindow never goes over the wire")
    default:
      return command satisfies never
  }
}

export const normalize = (view: PlayerGameView): PlayerGameView =>
  view.phase._tag === "SlamWindow" ? { ...view, phase: { ...view.phase, closesAt: 0 } } : view

export const apply = (state: GameState, command: Command, at: number): GameState => {
  const result = applyCommand(state, command, ts(at))
  if (Either.isLeft(result)) {
    throw new Error(`local replay rejected ${command._tag}: ${result.left._tag}`)
  }
  return result.right[0]
}

/**
 * Create players, a lobby, join everyone, and start the game. Clears the
 * publisher journal immediately before the start POST so suites that read
 * the journal see the game from its first event batch.
 */
export const setupGame = async (app: TestApp, names: ReadonlyArray<string>) => {
  const players = await makePlayers(app, names)
  const [creator, ...joiners] = players
  const created = await app.inject({
    method: "POST",
    url: "/lobbies",
    cookies: { cambio_session: creator!.cookie },
  })
  expect(created.statusCode).toBe(201)
  const gameId = (created.json() as { lobby: { id: string } }).lobby.id
  for (const joiner of joiners) {
    const joined = await app.inject({
      method: "POST",
      url: `/lobbies/${gameId}/join`,
      cookies: { cambio_session: joiner.cookie },
    })
    expect(joined.statusCode).toBe(200)
  }
  clearPublisherJournal()
  const startRes = await app.inject({
    method: "POST",
    url: `/lobbies/${gameId}/start`,
    cookies: { cambio_session: creator!.cookie },
  })
  expect(startRes.statusCode).toBe(200)
  const byId = new Map(players.map((p) => [p.userId, p]))
  return { gameId, players, byId, startRes }
}
