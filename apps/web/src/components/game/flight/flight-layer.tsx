import { cn } from "@cambio/ui"
import * as React from "react"

import { PlayingCard } from "../playing-card.js"
import { findAnchor } from "./anchors.js"
import { cssTransform, planFlight } from "./flip.js"
import type { FlightOutcome, FlightPlan, FlightRect, FlightSpec } from "./flip.js"

/**
 * flight-layer.tsx — the overlay runner (ADR-0034, root plan G2).
 *
 * An absolutely-positioned overlay for the table root: one `PlayingCard`
 * per active flight spec, FLIP-animated on `duration.track`/`ease.snap`
 * (transform only, per `flip.ts`'s plan). Face is per entitlement and
 * STRUCTURAL — a value-free spec has no card field at all, so it renders
 * `face="down"`; there is no "in flight but value present" shape, mirroring
 * `PlayingCard` itself.
 *
 * `prefers-reduced-motion` (matchMedia — the repo's first JS motion gate;
 * `motion-reduce:` utilities can't gate a JS-driven transform) drops
 * movement entirely: origin and destination anchors each get the canon
 * cross-fade + `accent.focus` highlight for the same duration instead, and
 * no card renders in the overlay at all.
 *
 * Movement itself is untestable in jsdom (ADR-0030: it measures no
 * layout) — `measure` is injectable so tests can drive real, non-zero
 * rects and assert structure (a back renders, a face renders, cancellation
 * clears the layer), never the pixels in motion.
 */

// ---- useFlights: the imperative queue the future game hook will own -----

export interface UseFlightsResult {
  active: ReadonlyArray<FlightSpec>
  /** Queues a flight. Specs are frozen at enqueue time (ADR-0034) — this
   * never mutates a spec already in `active`. */
  enqueue: (spec: FlightSpec) => void
  /** Settles one flight: its `onDone(outcome)` fires and it leaves
   * `active`. `FlightLayer` calls this when a flight completes or its
   * destination has unmounted; a consumer may also call it directly to
   * force an early cancellation. Settling twice is a no-op. */
  settle: (id: string, outcome: FlightOutcome) => void
  /** Cancels every active flight — called automatically on unmount, so a
   * flight never outlives the surface that queued it. */
  cancelAll: () => void
}

export function useFlights(): UseFlightsResult {
  const [active, setActive] = React.useState<ReadonlyArray<FlightSpec>>([])
  // Mirrors `active` for the unmount cleanup below: React may drop a
  // functional setState updater on an already-unmounted component without
  // ever invoking it, so cancel-on-unmount must not depend on that firing.
  const activeRef = React.useRef(active)
  activeRef.current = active

  const settle = React.useCallback((id: string, outcome: FlightOutcome) => {
    setActive((current) => {
      const settled = current.find((flight) => flight.id === id)
      if (settled === undefined) return current
      settled.onDone?.(outcome)
      return current.filter((flight) => flight.id !== id)
    })
  }, [])

  const cancelAll = React.useCallback(() => {
    setActive((current) => {
      current.forEach((flight) => flight.onDone?.("cancelled"))
      return []
    })
  }, [])

  const enqueue = React.useCallback((spec: FlightSpec) => {
    setActive((current) => [...current, spec])
  }, [])

  React.useEffect(() => {
    return () => {
      activeRef.current.forEach((flight) => flight.onDone?.("cancelled"))
    }
  }, [])

  return { active, enqueue, settle, cancelAll }
}

// ---- prefers-reduced-motion: the repo's first JS motion gate ------------

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function usePrefersReducedMotion(): boolean {
  // Server snapshot is always false — no window exists there, and the
  // reduced-motion branch is a client-observed condition (useConnection
  // precedent, apps/web/src/hooks/use-connection.ts).
  return React.useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, () => false)
}

// ---- the overlay itself ---------------------------------------------------

function defaultMeasure(element: Element): FlightRect {
  return element.getBoundingClientRect()
}

function relativeTo(rect: FlightRect, origin: FlightRect): FlightRect {
  return {
    top: rect.top - origin.top,
    left: rect.left - origin.left,
    width: rect.width,
    height: rect.height,
  }
}

function destinationBox(plan: FlightPlan): FlightRect {
  return {
    top: plan.box.top + plan.end.translateY,
    left: plan.box.left + plan.end.translateX,
    width: plan.box.width * plan.end.scaleX,
    height: plan.box.height * plan.end.scaleY,
  }
}

function HighlightBox({
  rect,
  visible,
  onTransitionEnd,
}: {
  rect: FlightRect
  visible: boolean
  onTransitionEnd?: () => void
}) {
  return (
    <div
      aria-hidden
      data-flight-highlight="true"
      onTransitionEnd={onTransitionEnd}
      className="pointer-events-none absolute rounded-sm outline-3 outline-offset-2 outline-accent-focus outline-solid transition-opacity duration-track ease-snap motion-reduce:transition-none"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        opacity: visible ? 1 : 0,
      }}
    />
  )
}

function Flight({
  root,
  spec,
  measure,
  reducedMotion,
  onSettle,
}: {
  root: HTMLElement
  spec: FlightSpec
  measure: (element: Element) => FlightRect
  reducedMotion: boolean
  onSettle: (id: string, outcome: FlightOutcome) => void
}) {
  const [plan, setPlan] = React.useState<FlightPlan | null>(null)
  const [playing, setPlaying] = React.useState(false)
  const settledRef = React.useRef(false)

  const settleOnce = React.useCallback(
    (outcome: FlightOutcome) => {
      if (settledRef.current) return
      settledRef.current = true
      onSettle(spec.id, outcome)
    },
    [onSettle, spec.id],
  )

  // Runs once per mounted flight (ADR-0034: a spec is frozen at enqueue
  // time and never retargeted, so there is nothing here to react to).
  React.useEffect(() => {
    const originEl = findAnchor(root, spec.originId)
    const destinationEl = findAnchor(root, spec.destinationId)
    if (originEl === null || destinationEl === null) {
      settleOnce("cancelled")
      return
    }
    const rootRect = measure(root)
    const nextPlan = planFlight(
      relativeTo(measure(originEl), rootRect),
      relativeTo(measure(destinationEl), rootRect),
    )
    if (nextPlan.cancelled) {
      settleOnce("cancelled")
      return
    }
    setPlan(nextPlan)
    // Two-step FLIP: paint at `start` (identity — looks like the origin),
    // then flip to `end` on the next frame so the browser has a starting
    // value to transition FROM.
    const raf = requestAnimationFrame(() => setPlaying(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  if (plan === null) return null

  if (reducedMotion) {
    return (
      <>
        <HighlightBox
          rect={plan.box}
          visible={playing}
          onTransitionEnd={() => settleOnce("completed")}
        />
        <HighlightBox rect={destinationBox(plan)} visible={playing} />
      </>
    )
  }

  return (
    <div
      aria-hidden
      className="absolute top-0 left-0 origin-top-left transition-transform duration-track ease-snap motion-reduce:transition-none"
      style={{
        top: plan.box.top,
        left: plan.box.left,
        width: plan.box.width,
        height: plan.box.height,
        transform: cssTransform(playing ? plan.end : plan.start),
      }}
      onTransitionEnd={() => settleOnce("completed")}
    >
      <PlayingCard {...spec.face} inFlight size="md" />
    </div>
  )
}

export interface FlightLayerProps {
  /** The table root: anchors are resolved and rects measured within it.
   * `null` while the root hasn't mounted yet — the layer renders nothing. */
  root: HTMLElement | null
  active: ReadonlyArray<FlightSpec>
  /** Fired once per flight when it completes or is cancelled (a missing
   * anchor, or a degenerate rect) — the consumer should remove it from
   * `active` (this is exactly `useFlights().settle`). */
  onSettle: (id: string, outcome: FlightOutcome) => void
  /** Injectable for jsdom (no real layout — ADR-0030): defaults to
   * `getBoundingClientRect`. */
  measure?: (element: Element) => FlightRect
  className?: string
}

export function FlightLayer({
  root,
  active,
  onSettle,
  measure = defaultMeasure,
  className,
}: FlightLayerProps) {
  const reducedMotion = usePrefersReducedMotion()
  if (root === null) return null

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      {active.map((spec) => (
        <Flight
          key={spec.id}
          root={root}
          spec={spec}
          measure={measure}
          reducedMotion={reducedMotion}
          onSettle={onSettle}
        />
      ))}
    </div>
  )
}
