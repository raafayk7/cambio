import { describe, expect, it } from "@effect/vitest"
import { Either } from "effect"
import {
  ALL_CARD_SLUGS,
  decodeCardSlug,
  decodeCardSlugEither,
  rank,
  score,
  suit,
} from "../src/Card.js"

describe("CardSlug", () => {
  it("is exactly 52 distinct slugs", () => {
    expect(ALL_CARD_SLUGS).toHaveLength(52)
    expect(new Set(ALL_CARD_SLUGS).size).toBe(52)
  })

  it("parses every one of the 52 slugs", () => {
    for (const slug of ALL_CARD_SLUGS) {
      expect(decodeCardSlug(slug)).toBe(slug)
    }
  })

  it("rejects anything that is not one of the 52", () => {
    for (const bad of ["", "S", "1S", "AX", "as", "10S", "AS ", "JOKER"]) {
      expect(Either.isLeft(decodeCardSlugEither(bad))).toBe(true)
    }
  })

  it("derives rank and suit from the slug", () => {
    expect(rank(decodeCardSlug("AS"))).toBe("A")
    expect(suit(decodeCardSlug("AS"))).toBe("S")
    expect(rank(decodeCardSlug("TD"))).toBe("T")
    expect(suit(decodeCardSlug("TD"))).toBe("D")
    expect(rank(decodeCardSlug("KH"))).toBe("K")
    expect(suit(decodeCardSlug("KH"))).toBe("H")
  })
})

describe("score", () => {
  // The four cases named in §10's acceptance criteria.
  it("scores the acceptance-criteria cards", () => {
    expect(score(decodeCardSlug("KH"))).toBe(-2)
    expect(score(decodeCardSlug("KS"))).toBe(-1)
    expect(score(decodeCardSlug("QS"))).toBe(11)
    expect(score(decodeCardSlug("AS"))).toBe(0)
  })

  it("distinguishes kings by suit, not rank (§1.2)", () => {
    expect(score(decodeCardSlug("KS"))).toBe(-1)
    expect(score(decodeCardSlug("KC"))).toBe(-1)
    expect(score(decodeCardSlug("KH"))).toBe(-2)
    expect(score(decodeCardSlug("KD"))).toBe(-2)
  })

  it("scores jacks and queens alike at 11 despite differing rank", () => {
    expect(score(decodeCardSlug("JC"))).toBe(11)
    expect(score(decodeCardSlug("QC"))).toBe(11)
  })

  it("scores pips at face value", () => {
    expect(score(decodeCardSlug("2H"))).toBe(2)
    expect(score(decodeCardSlug("9H"))).toBe(9)
    expect(score(decodeCardSlug("TH"))).toBe(10)
  })

  it("is total over all 52 cards", () => {
    for (const slug of ALL_CARD_SLUGS) {
      expect(Number.isFinite(score(decodeCardSlug(slug)))).toBe(true)
    }
  })
})
