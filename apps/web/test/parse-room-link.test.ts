import { describe, expect, it } from "vitest"

import { parseRoomLink } from "../src/containers/lobby/parse-room-link.js"

const ID = "3f2c8a44-9d1e-4b6a-8c55-2e7f0a1b3c4d"

describe("parseRoomLink (L1)", () => {
  it("accepts a full room URL", () => {
    expect(parseRoomLink(`http://localhost:3000/room/${ID}`)).toBe(ID)
    expect(parseRoomLink(`https://cambio.example/room/${ID}`)).toBe(ID)
  })

  it("accepts a scheme-less pasted link", () => {
    expect(parseRoomLink(`localhost:3000/room/${ID}`)).toBe(ID)
    expect(parseRoomLink(`cambio.example/room/${ID}`)).toBe(ID)
  })

  it("accepts a bare UUID, trimmed and case-normalized", () => {
    expect(parseRoomLink(`  ${ID.toUpperCase()}  `)).toBe(ID)
  })

  it("returns null for garbage", () => {
    expect(parseRoomLink("")).toBeNull()
    expect(parseRoomLink("   ")).toBeNull()
    expect(parseRoomLink("not a link")).toBeNull()
    expect(parseRoomLink("http://localhost:3000/room/not-a-uuid")).toBeNull()
    expect(parseRoomLink("http://localhost:3000/other/path")).toBeNull()
    expect(parseRoomLink(`${ID}extra`)).toBeNull()
  })
})
