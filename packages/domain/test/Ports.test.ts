import { describe, expect, it } from "@effect/vitest"
import { Either, Schema } from "effect"
import {
  GameRepository,
  GameNotFound,
  StorageError,
  VersionConflict,
} from "../src/GameRepository.js"
import { UserRepository, UserNotFound } from "../src/UserRepository.js"
import { GameId, GameVersion } from "../src/Ids.js"
import { uid } from "./fixtures.js"

/** The ADR-0015 aggregate ports (C2.3): tags, error vocabulary, version brand. */

const gid = Schema.decodeUnknownSync(GameId)("00000000-0000-4000-8000-000000000099")

describe("repository ports (C2.3, ADR-0015)", () => {
  it("tags are namespaced by the declaring package", () => {
    expect(GameRepository.key).toBe("@cambio/domain/GameRepository")
    expect(UserRepository.key).toBe("@cambio/domain/UserRepository")
  })

  it("errors are tagged and carry their fields", () => {
    const conflict = new VersionConflict({
      gameId: gid,
      expected: GameVersion.make(3),
      actual: GameVersion.make(5),
    })
    expect(conflict._tag).toBe("VersionConflict")
    expect(conflict.expected).toBe(3)
    expect(conflict.actual).toBe(5)

    const missing = new GameNotFound({ gameId: gid })
    expect(missing._tag).toBe("GameNotFound")
    expect(missing.gameId).toBe(gid)

    const storage = new StorageError({ operation: "games.save", cause: "boom" })
    expect(storage._tag).toBe("StorageError")
    expect(storage.operation).toBe("games.save")

    const noUser = new UserNotFound({ userId: uid(0) })
    expect(noUser._tag).toBe("UserNotFound")
  })

  it("GameVersion decodes 0 and rejects negatives", () => {
    const decode = Schema.decodeUnknownEither(GameVersion)
    expect(Either.isRight(decode(0))).toBe(true)
    expect(Either.isRight(decode(7))).toBe(true)
    expect(Either.isLeft(decode(-1))).toBe(true)
    expect(Either.isLeft(decode(1.5))).toBe(true)
  })
})
