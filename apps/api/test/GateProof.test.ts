import { describe, expect, it } from "vitest"

// CAM-32 C1/C2 proof: deliberately red. This commit exists only to prove
// the PR gate blocks on failure; it is reverted in the next commit and
// the PR is closed unmerged.
describe("gate proof (throwaway)", () => {
  it("deliberately fails", () => {
    expect(true).toBe(false)
  })
})
