import type { CardSlug } from "@cambio/contracts"

import type { AnchorId } from "./anchors.js"

/**
 * flip.ts — the pure FLIP planner (ADR-0034, root plan G2).
 *
 * Pure functions from two DOMRect-shaped rects to a flight's transform
 * plan: no DOM access, no React, nothing here reads the real page (jsdom
 * measures no layout — ADR-0030), so this module is unit-tested on plain
 * numbers, the `table-geometry.ts`/`seat-arc.ts` precedent.
 *
 * The technique: the overlay renders a fixed box sized to the ORIGIN
 * rect, then animates its `transform` from `start` (identity — the box
 * looks exactly like the origin element) to `end` (translate by the
 * corner delta, scale by the size ratio) — which lands it exactly on the
 * destination rect. `transform-origin` must be top-left for the scale to
 * register the box's edges correctly; that is the layer's job, not this
 * module's.
 */

/** The subset of DOMRect this module needs. Real code passes a real
 * DOMRect (`getBoundingClientRect`); tests pass plain object literals. */
export interface FlightRect {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

export interface FlightTransform {
  readonly translateX: number
  readonly translateY: number
  readonly scaleX: number
  readonly scaleY: number
}

const IDENTITY_TRANSFORM: FlightTransform = { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 }

export interface FlightPlan {
  /** The overlay's un-transformed box: the origin rect. Rendering sets
   * top/left/width/height to this once and animates only `transform` —
   * never re-measuring mid-flight. */
  readonly box: FlightRect
  readonly start: FlightTransform
  readonly end: FlightTransform
  /** True when either rect was degenerate (zero width/height — jsdom's
   * default, or an anchor that never laid out). The plan is a safe
   * identity no-op, never NaN; the layer must treat this as cancelled and
   * must not animate it. */
  readonly cancelled: boolean
}

function isDegenerate(rect: FlightRect): boolean {
  return !(rect.width > 0) || !(rect.height > 0)
}

/**
 * Plans a flight from `origin` to `destination`. Degenerate input (either
 * rect has zero width or height) plans to a cancelled no-op rather than
 * producing `NaN`/`Infinity` transforms from a division by zero.
 */
export function planFlight(origin: FlightRect, destination: FlightRect): FlightPlan {
  if (isDegenerate(origin) || isDegenerate(destination)) {
    return { box: origin, start: IDENTITY_TRANSFORM, end: IDENTITY_TRANSFORM, cancelled: true }
  }
  return {
    box: origin,
    start: IDENTITY_TRANSFORM,
    end: {
      translateX: destination.left - origin.left,
      translateY: destination.top - origin.top,
      scaleX: destination.width / origin.width,
      scaleY: destination.height / origin.height,
    },
    cancelled: false,
  }
}

/** Renders a `FlightTransform` as a CSS `transform` value. */
export function cssTransform(transform: FlightTransform): string {
  return `translate(${transform.translateX}px, ${transform.translateY}px) scale(${transform.scaleX}, ${transform.scaleY})`
}

/** A flight's face, mirroring `PlayingCard`'s own entitlement union
 * (playing-card.md): value-free is structural — no `card` field exists at
 * all on the down variant, never a value hidden behind a flag. */
export type FlightFace =
  { readonly face: "down" } | { readonly face: "up"; readonly card: CardSlug }

/** How a flight's queue resolved it. Most consumers don't need to branch
 * on this — `onDone` fires either way — but it is available for the ones
 * that do (e.g. a slot that should only clear its `inFlightSlot` prop
 * once a flight genuinely lands). */
export type FlightOutcome = "completed" | "cancelled"

/**
 * A queued flight, frozen at enqueue time (ADR-0033/0034): everything the
 * layer needs to render and finish the flight lives here — the anchor ids
 * it travels between and the face it shows. A spec is never mutated or
 * retargeted after creation: a newer snapshot or an unmounted destination
 * can only complete or cancel THIS spec, never redirect it to a different
 * anchor or a different card. That immutability is the interruption
 * policy — there is no separate "retarget" code path to have a bug in.
 */
export interface FlightSpec {
  readonly id: string
  readonly face: FlightFace
  readonly originId: AnchorId
  readonly destinationId: AnchorId
  readonly onDone?: (outcome: FlightOutcome) => void
}
