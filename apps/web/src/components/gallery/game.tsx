import type { Reveal } from "@cambio/contracts"
import { Button } from "@cambio/ui"
import * as React from "react"

import { DiscardPile } from "../game/discard-pile.js"
import { DrawDeck } from "../game/draw-deck.js"
import { FlightLayer, useFlights } from "../game/flight/flight-layer.js"
import { Hand } from "../game/hand.js"
import { HeldCard } from "../game/held-card.js"
import { PlayingCard } from "../game/playing-card.js"
import { ScoreSheet } from "../game/score-sheet.js"
import { Seat } from "../game/seat.js"
import { SlamTimer } from "../game/slam-timer.js"
import { TableSurface } from "../game/table-surface.js"
import { TurnIndicator } from "../game/turn-indicator.js"
import { Section, StateCard } from "./helpers.js"

/**
 * The 9 game-object sections (F5.1). Fixture values are CardSlug/view
 * shapes from contracts — realistic wire data, entitled faces only.
 * Backs and vacancies are designed for the green table, so card states
 * mount on a surface.table ground.
 */
function TableGround({ children }: { children: React.ReactNode }) {
  return <div className="w-fit rounded-md bg-surface-table p-3">{children}</div>
}

const PLAYER_A = "11111111-1111-4111-8111-111111111111"
const PLAYER_B = "22222222-2222-4222-8222-222222222222"
const PLAYER_C = "33333333-3333-4333-8333-333333333333"

const FIXTURE_NAMES: Record<string, string> = {
  [PLAYER_A]: "Nadia",
  [PLAYER_B]: "Sam",
  [PLAYER_C]: "Raafay",
}

const FIXTURE_REVEAL: Reveal = {
  hands: [
    {
      playerId: PLAYER_A,
      cards: [
        { slotIndex: 0, card: "KH" },
        { slotIndex: 1, card: "3S" },
      ],
    },
    {
      playerId: PLAYER_B,
      cards: [
        { slotIndex: 0, card: "KD" },
        { slotIndex: 1, card: "AC" },
      ],
    },
    { playerId: PLAYER_C, cards: [{ slotIndex: 2, card: "7C" }] },
  ],
  scores: [
    { playerId: PLAYER_A, total: 1 },
    { playerId: PLAYER_B, total: -1 },
    { playerId: PLAYER_C, total: 7 },
  ],
  winners: [PLAYER_B],
}

export function PlayingCardSection() {
  const [peeking, setPeeking] = React.useState(false)
  const peekTimer = React.useRef<number | undefined>(undefined)
  React.useEffect(() => () => window.clearTimeout(peekTimer.current), [])
  return (
    <Section
      title="playing-card"
      note="The 7-state floor. A face-down card's value does not exist in the payload — face-up needs a slug."
    >
      <StateCard label="face-down">
        <TableGround>
          <PlayingCard face="down" />
        </TableGround>
      </StateCard>
      <StateCard label="face-up (red / black)">
        <TableGround>
          <div className="flex gap-2">
            <PlayingCard face="up" card="KH" />
            <PlayingCard face="up" card="AS" />
            <PlayingCard face="up" card="TD" />
          </div>
        </TableGround>
      </StateCard>
      <StateCard label="peeking (flip, hold, flip back)">
        <TableGround>
          <button
            type="button"
            className="block cursor-pointer"
            onClick={() => {
              setPeeking(true)
              window.clearTimeout(peekTimer.current)
              peekTimer.current = window.setTimeout(() => setPeeking(false), 2000)
            }}
            aria-label="Peek at the card"
          >
            {peeking ? <PlayingCard face="peeking" card="7H" /> : <PlayingCard face="down" />}
          </button>
        </TableGround>
      </StateCard>
      <StateCard label="selected">
        <TableGround>
          <PlayingCard face="down" selected />
        </TableGround>
      </StateCard>
      <StateCard label="slam-eligible (value stays hidden)">
        <TableGround>
          <PlayingCard face="down" slamEligible />
        </TableGround>
      </StateCard>
      <StateCard label="in-flight">
        <TableGround>
          <PlayingCard face="down" inFlight />
        </TableGround>
      </StateCard>
      <StateCard label="leaving-play (reveals while traveling)">
        <TableGround>
          <PlayingCard face="up" card="9C" leavingPlay />
        </TableGround>
      </StateCard>
      <StateCard label="mini (score-sheet scale)">
        <TableGround>
          <PlayingCard face="up" card="KD" size="sm" />
        </TableGround>
      </StateCard>
    </Section>
  )
}

export function HandSection() {
  return (
    <Section title="hand" note="Slot grids in rows of 2 — holes stay holes; indices never reflow.">
      <StateCard label="populated (own, 2×2)">
        <TableGround>
          <Hand variant="own" playerId={PLAYER_C} slots={[0, 1, 2, 3]} />
        </TableGround>
      </StateCard>
      <StateCard label="opponent (smaller, same anatomy)">
        <TableGround>
          <Hand variant="opponent" playerId={PLAYER_A} slots={[0, 1, 2, 3]} />
        </TableGround>
      </StateCard>
      <StateCard label="holes stay holes (slots 0, 2, 5)">
        <TableGround>
          <Hand variant="opponent" playerId={PLAYER_A} slots={[0, 2, 5]} />
        </TableGround>
      </StateCard>
      <StateCard label="empty (still in the game)">
        <TableGround>
          <Hand variant="opponent" playerId={PLAYER_A} slots={[]} />
        </TableGround>
      </StateCard>
      <StateCard label="awaiting-give (slot 1)">
        <TableGround>
          <Hand variant="opponent" playerId={PLAYER_A} slots={[0, 2, 3]} awaitingGiveSlot={1} />
        </TableGround>
      </StateCard>
      <StateCard label="slam window (backs pulse; entitled face excluded)">
        <TableGround>
          <Hand
            variant="own"
            playerId={PLAYER_C}
            slots={[0, 1, 2, 3]}
            slamWindow
            faces={[{ slotIndex: 2, card: "8H" }]}
          />
        </TableGround>
      </StateCard>
      <StateCard label="growing (penalty arrives in-flight, slot 4)">
        <TableGround>
          <Hand variant="own" playerId={PLAYER_C} slots={[0, 1, 2, 3]} inFlightSlot={4} />
        </TableGround>
      </StateCard>
      <StateCard label="shrinking (slammed card leaves face-up, slot 1)">
        <TableGround>
          <Hand
            variant="own"
            playerId={PLAYER_C}
            slots={[0, 2, 3]}
            leaving={{ slotIndex: 1, card: "9H" }}
          />
        </TableGround>
      </StateCard>
      <StateCard label="inert (no hover affordance — not your turn)">
        <TableGround>
          <Hand
            variant="own"
            playerId={PLAYER_C}
            slots={[0, 1, 2, 3]}
            inert
            onSlotClick={() => {}}
          />
        </TableGround>
      </StateCard>
      <StateCard label="targeting (CAM-18 T3 — slot 0 already picked for a J/Q swap)">
        <TableGround>
          <Hand
            variant="own"
            playerId={PLAYER_C}
            slots={[0, 1, 2, 3]}
            selectedSlots={[0]}
            onSlotClick={() => {}}
          />
        </TableGround>
      </StateCard>
      <StateCard label="give-target (CAM-18 step 13 — empty slots become clickable too)">
        <TableGround>
          <Hand
            variant="opponent"
            playerId={PLAYER_A}
            slots={[0, 2, 3]}
            emptySlotsClickable
            onSlotClick={() => {}}
          />
        </TableGround>
      </StateCard>
    </Section>
  )
}

export function DeckAndDiscardSection() {
  return (
    <Section title="draw-deck · discard-pile" note="The table's center pair.">
      <StateCard label="deck populated">
        <TableGround>
          <DrawDeck count={32} />
        </TableGround>
      </StateCard>
      <StateCard label="deck low (count ≤ 5)">
        <TableGround>
          <DrawDeck count={3} />
        </TableGround>
      </StateCard>
      <StateCard label="deck empty (reshuffle imminent)">
        <TableGround>
          <DrawDeck count={0} />
        </TableGround>
      </StateCard>
      <StateCard label="deck clickable (CAM-18 T1 — the draw affordance)">
        <TableGround>
          <DrawDeck count={32} onClick={() => {}} />
        </TableGround>
      </StateCard>
      <StateCard label="deck draw (CAM-18 CH1 — the top is mid-flight)">
        <TableGround>
          <DrawDeck count={32} state="draw" />
        </TableGround>
      </StateCard>
      <StateCard label="discard populated (thrown angles)">
        <TableGround>
          <DiscardPile top="9D" underCount={2} />
        </TableGround>
      </StateCard>
      <StateCard label="discard empty (nothing to act on)">
        <TableGround>
          <DiscardPile />
        </TableGround>
      </StateCard>
      <StateCard label="discard slam-target">
        <TableGround>
          <DiscardPile top="9D" underCount={1} slamTarget />
        </TableGround>
      </StateCard>
      <StateCard label="discard clickable (CAM-18 T1 — the take affordance)">
        <TableGround>
          <DiscardPile top="9D" underCount={1} onClick={() => {}} />
        </TableGround>
      </StateCard>
      <StateCard label="discard receiving (CAM-18 CH1 — a card is settling in)">
        <TableGround>
          <DiscardPile top="9D" underCount={1} receiving />
        </TableGround>
      </StateCard>
    </Section>
  )
}

export function HeldCardSection() {
  return (
    <Section
      title="held-card"
      note="The one spot a drawn or taken card sits while its holder decides (CAM-18 T2)."
    >
      <StateCard label="entitled (you drew it)">
        <TableGround>
          <HeldCard card="7H" label="You drew" />
        </TableGround>
      </StateCard>
      <StateCard label="unentitled (deck source — a back, structurally)">
        <TableGround>
          <HeldCard label="Nadia is holding" />
        </TableGround>
      </StateCard>
      <StateCard label="public (discard source — everyone sees it)">
        <TableGround>
          <HeldCard card="9D" label="Nadia is holding" />
        </TableGround>
      </StateCard>
    </Section>
  )
}

export function SeatSection() {
  return (
    <Section title="seat" note="Public state only — never values, never running scores.">
      <StateCard label="default">
        <Seat name="Nadia" seatIndex={0} cardCount={4} />
      </StateCard>
      <StateCard label="active-turn">
        <Seat name="Sam" seatIndex={1} cardCount={3} state="active-turn" />
      </StateCard>
      <StateCard label="acting">
        <Seat name="Raafay" seatIndex={2} cardCount={5} state="acting" />
      </StateCard>
      <StateCard label="disconnected (game does not pause)">
        <Seat name="Zara" seatIndex={3} cardCount={4} state="disconnected" />
      </StateCard>
      <StateCard label="left">
        <Seat name="Omar" seatIndex={4} state="left" />
      </StateCard>
      <StateCard label="own (unprivileged)">
        <Seat name="You" seatIndex={0} cardCount={4} own />
      </StateCard>
    </Section>
  )
}

export function TableSurfaceSection() {
  const seatsFor = (count: number) =>
    Array.from({ length: count }, (_, index) => (
      <Seat
        key={index}
        name={Object.values(FIXTURE_NAMES)[index % 3] ?? "Player"}
        seatIndex={index}
        cardCount={4}
        {...(index === 1 ? { state: "active-turn" as const } : {})}
      />
    ))
  return (
    <Section
      title="table-surface"
      note="Seat-arc redistribution: benches are scenery; 2–5 seats space radially, viewer bottom-center. Below `regular` the arc compresses."
    >
      <StateCard label="in-game · 5 players (the resolved fifth seat)" wide>
        <div className="scene-paving rounded-md p-4">
          <TableSurface
            seats={seatsFor(5)}
            viewerSeatIndex={0}
            center={
              <div className="flex items-center gap-3">
                <DrawDeck count={17} />
                <DiscardPile top="9D" underCount={1} />
              </div>
            }
          />
        </div>
      </StateCard>
      <StateCard label="seating · 3 players (benches are scenery, not slots)" wide>
        <div className="scene-paving rounded-md p-4">
          <TableSurface seats={seatsFor(3)} viewerSeatIndex={1} state="seating" />
        </div>
      </StateCard>
      <StateCard label="game-over (table dims)" wide>
        <div className="scene-paving rounded-md p-4">
          <TableSurface seats={seatsFor(2)} viewerSeatIndex={0} state="game-over" />
        </div>
      </StateCard>
    </Section>
  )
}

export function SlamTimerSection() {
  const [demoWindow, setDemoWindow] = React.useState<{ closesAt: number; durationMs: number }>()
  const [resolving, setResolving] = React.useState(false)
  return (
    <Section
      title="slam-timer"
      note="Drains linearly to a fixed close — no refills, no resets (ADR-0011). Duration is game config."
    >
      <StateCard label="hidden (the default almost always)">
        <SlamTimer />
        <p className="text-sm text-ink-muted">(renders nothing)</p>
      </StateCard>
      <StateCard label="live demo">
        <div className="flex flex-col items-start gap-2">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setDemoWindow({ closesAt: Date.now() + 8000, durationMs: 8000 })}
            >
              Open an 8s window
            </Button>
            <Button variant="secondary" onClick={() => setResolving((current) => !current)}>
              Toggle resolving
            </Button>
          </div>
          <TableGround>
            <SlamTimer
              {...(demoWindow !== undefined ? { window: demoWindow } : {})}
              resolving={resolving}
            />
          </TableGround>
        </div>
      </StateCard>
    </Section>
  )
}

export function FlightDemoSection() {
  const [root, setRoot] = React.useState<HTMLElement | null>(null)
  const flights = useFlights()
  const nextFlightId = React.useRef(0)

  const fireFlight = (entitled: boolean) => {
    nextFlightId.current += 1
    flights.enqueue({
      id: `demo-${nextFlightId.current}`,
      face: entitled ? { face: "up", card: "AS" } : { face: "down" },
      originId: "deck",
      destinationId: "discard",
    })
  }

  return (
    <Section
      title="flight layer (deck → discard)"
      note="The FLIP mechanism (flight/flip.ts + flight-layer.tsx, ADR-0034): two data-flight-anchor points, one queued flight, animated on duration.track/ease.snap. Under prefers-reduced-motion the card never moves — both anchors get the accent.focus cross-fade highlight instead, for the same duration."
    >
      <StateCard label="live demo" wide>
        <div className="flex flex-col items-start gap-3">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => fireFlight(false)}>
              Fly a face-down card
            </Button>
            <Button variant="secondary" onClick={() => fireFlight(true)}>
              Fly a face-up card (A♠)
            </Button>
          </div>
          <div
            ref={setRoot}
            className="scene-paving relative flex w-full max-w-md items-center justify-between rounded-md p-6"
          >
            {/* DrawDeck/DiscardPile self-anchor (CAM-18 T1/T2 r2) — no wrapping div needed. */}
            <DrawDeck count={17} />
            <DiscardPile top="9D" underCount={1} />
            <FlightLayer root={root} active={flights.active} onSettle={flights.settle} />
          </div>
        </div>
      </StateCard>
    </Section>
  )
}

export function TurnIndicatorSection() {
  return (
    <Section title="turn-indicator" note="The single textual source of phase truth.">
      <StateCard label="your-turn">
        <TurnIndicator state="your-turn">Your turn. Draw or take the discard</TurnIndicator>
      </StateCard>
      <StateCard label="other-turn">
        <TurnIndicator state="other-turn">Nadia's turn</TurnIndicator>
      </StateCard>
      <StateCard label="slam-window">
        <TurnIndicator state="slam-window">Slam window open</TurnIndicator>
      </StateCard>
      <StateCard label="game-over">
        <TurnIndicator state="game-over">Nadia called Cambio</TurnIndicator>
      </StateCard>
    </Section>
  )
}

export function ScoreSheetSection() {
  return (
    <Section
      title="score-sheet"
      note="Only at reveal. Ordered by total; red kings −2, black kings −1 self-explain via the minis."
    >
      <StateCard label="final (winner marked)">
        <ScoreSheet reveal={FIXTURE_REVEAL} playerName={(id) => FIXTURE_NAMES[id] ?? "?"} />
      </StateCard>
      <StateCard label="tie (plural winners)">
        <ScoreSheet
          reveal={{ ...FIXTURE_REVEAL, winners: [PLAYER_A, PLAYER_B] }}
          playerName={(id) => FIXTURE_NAMES[id] ?? "?"}
        />
      </StateCard>
    </Section>
  )
}

export function GameSections() {
  return (
    <>
      <PlayingCardSection />
      <HandSection />
      <DeckAndDiscardSection />
      <HeldCardSection />
      <SeatSection />
      <TableSurfaceSection />
      <FlightDemoSection />
      <SlamTimerSection />
      <TurnIndicatorSection />
      <ScoreSheetSection />
    </>
  )
}
