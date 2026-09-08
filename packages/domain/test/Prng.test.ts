import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { ALL_CARD_SLUGS } from "../src/Card.js"
import { PrngState, prngStateFromSeed, shuffle } from "../src/Prng.js"

describe("prngStateFromSeed", () => {
  it("is deterministic: same seed, same state", () => {
    expect(prngStateFromSeed(42)).toStrictEqual(prngStateFromSeed(42))
  })

  it("differs across seeds", () => {
    expect(prngStateFromSeed(1)).not.toStrictEqual(prngStateFromSeed(2))
  })

  it("round-trips through the schema", () => {
    const state = prngStateFromSeed(7)
    const decode = Schema.decodeUnknownSync(PrngState)
    const encode = Schema.encodeSync(PrngState)
    expect(decode(encode(state))).toStrictEqual(state)
  })
})

describe("shuffle", () => {
  it("permutes: same multiset, untouched input", () => {
    const input = [...ALL_CARD_SLUGS]
    const [out] = shuffle(input, prngStateFromSeed(42))
    expect(input).toStrictEqual([...ALL_CARD_SLUGS])
    expect([...out].sort()).toStrictEqual([...ALL_CARD_SLUGS].sort())
    expect(out).not.toStrictEqual(input)
  })

  it("is deterministic: same state, same order and same output state", () => {
    const s = prngStateFromSeed(42)
    const [a, sa] = shuffle(ALL_CARD_SLUGS, s)
    const [b, sb] = shuffle(ALL_CARD_SLUGS, s)
    expect(a).toStrictEqual(b)
    expect(sa).toStrictEqual(sb)
    expect(sa).not.toStrictEqual(s)
  })

  it("differs across seeds", () => {
    const [a] = shuffle(ALL_CARD_SLUGS, prngStateFromSeed(1))
    const [b] = shuffle(ALL_CARD_SLUGS, prngStateFromSeed(2))
    expect(a).not.toStrictEqual(b)
  })
})
