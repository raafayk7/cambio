import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { formatScore, ScoreSheet } from "../src/components/game/score-sheet.js"

/**
 * score-sheet.md + root plan F3.5: renders only from reveal data, orders
 * by total (never card count), ties produce plural winners, zero is not
 * styled as winning, and scores use the true minus (voice.md).
 */
const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"
const C = "33333333-3333-4333-8333-333333333333"

const names: Record<string, string> = { [A]: "Nadia", [B]: "Sam", [C]: "Raafay" }

const reveal = {
  hands: [
    { playerId: A, cards: [{ slotIndex: 0, card: "KS" as const }] },
    {
      playerId: B,
      cards: [
        { slotIndex: 0, card: "KH" as const },
        { slotIndex: 1, card: "KD" as const },
      ],
    },
    { playerId: C, cards: [] },
  ],
  // Rule-consistent totals (HANDOFF §1: black kings −1, red kings −2):
  // A holds KS → −1; B holds KH+KD → −4; C holds nothing → 0.
  scores: [
    { playerId: A, total: -1 },
    { playerId: B, total: -4 },
    { playerId: C, total: 0 },
  ],
  winners: [B],
}

describe("ScoreSheet", () => {
  it("orders rows by total ascending — card count is irrelevant", () => {
    render(<ScoreSheet reveal={reveal} playerName={(id) => names[id] ?? "?"} />)
    const rows = screen.getAllByRole("listitem")
    expect(rows.map((row) => row.textContent?.slice(0, 3))).toEqual(["Sam", "Nad", "Raa"])
  })

  it("marks only the winners — zero can lose to negatives", () => {
    render(<ScoreSheet reveal={reveal} playerName={(id) => names[id] ?? "?"} />)
    const rows = screen.getAllByRole("listitem")
    expect(rows.map((row) => row.getAttribute("data-winner"))).toEqual(["true", "false", "false"])
  })

  it("ties are representable: plural winner rows", () => {
    const tied = { ...reveal, winners: [B, C] }
    render(<ScoreSheet reveal={tied} playerName={(id) => names[id] ?? "?"} />)
    const winners = screen
      .getAllByRole("listitem")
      .filter((row) => row.getAttribute("data-winner") === "true")
    expect(winners).toHaveLength(2)
  })

  it("negative totals render with a true minus sign (−), never a hyphen", () => {
    expect(formatScore(-4)).toBe("−4")
    expect(formatScore(0)).toBe("0")
    expect(formatScore(13)).toBe("13")
    render(<ScoreSheet reveal={reveal} playerName={(id) => names[id] ?? "?"} />)
    expect(screen.getByText("−4")).toBeInTheDocument()
  })

  // r2 (CAM-18 E2): the `revealing` entrance — structural only, per
  // ADR-0030 (jsdom asserts state/structure, never the animation itself).
  describe("the revealing entrance (r2)", () => {
    it("defaults to already-settled (`final`) when `revealing` is omitted — the pre-existing tests above never see a `revealing` beat", () => {
      render(<ScoreSheet reveal={reveal} playerName={(id) => names[id] ?? "?"} />)
      const sheet = screen.getByText("SCORES").closest("[data-state]")
      expect(sheet).toHaveAttribute("data-state", "final")
    })

    it("mounts face-down and `revealing` when asked to dramatize the entrance, then settles to face-up and `final`", async () => {
      render(<ScoreSheet reveal={reveal} playerName={(id) => names[id] ?? "?"} revealing />)
      const sheet = screen.getByText("SCORES").closest("[data-state]")
      if (sheet === null) throw new Error("score sheet root not found")

      const totalCards = reveal.hands.reduce((sum, hand) => sum + hand.cards.length, 0)

      expect(sheet).toHaveAttribute("data-state", "revealing")
      // Every mini card starts face-down — nothing rank/suit is on screen
      // yet, even though the reveal data is already known.
      expect(sheet.querySelectorAll('[data-face="down"]')).toHaveLength(totalCards)
      expect(sheet.querySelectorAll('[data-face="up"]')).toHaveLength(0)

      await waitFor(() => expect(sheet).toHaveAttribute("data-state", "final"))
      expect(sheet.querySelectorAll('[data-face="up"]')).toHaveLength(totalCards)
      expect(sheet.querySelectorAll('[data-face="down"]')).toHaveLength(0)
    })
  })
})
