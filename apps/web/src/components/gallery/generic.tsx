import {
  Alert,
  AppShell,
  Badge,
  Button,
  Divider,
  EmptyState,
  FieldScaffold,
  Link,
  List,
  ListRow,
  Loading,
  MarkSettings,
  Modal,
  Panel,
  Select,
  Skeleton,
  Table,
  TableCell,
  TableHeaderCell,
  TableRow,
  TableSkeletonRow,
  TableStatusRow,
  TextField,
  Toast,
  ToastStack,
  type ToastItem,
  Toggle,
} from "@cambio/ui"
import * as React from "react"

import { Section, StateCard } from "./helpers.js"

/** The 17 generic-core sections, every class-floor state mounted (F5.1). */

const SELECT_OPTIONS = [
  { value: "5", label: "5 seconds" },
  { value: "8", label: "8 seconds" },
  { value: "12", label: "12 seconds" },
]

export function ButtonSection() {
  return (
    <Section
      title="button"
      note="Interactive floor — hover, focus, and the sit-down press are live; interact to see them."
    >
      <StateCard label="primary">
        <Button>Join room</Button>
      </StateCard>
      <StateCard label="secondary">
        <Button variant="secondary">Copy link</Button>
      </StateCard>
      <StateCard label="ghost">
        <Button variant="ghost">Cancel</Button>
      </StateCard>
      <StateCard label="icon">
        <Button variant="icon" aria-label="Settings">
          <MarkSettings className="size-4" />
        </Button>
      </StateCard>
      <StateCard label="danger">
        <Button variant="danger">Leave game</Button>
      </StateCard>
      <StateCard label="danger · display face (the Slam composition)">
        <Button variant="danger" className="ground-alarm font-display text-xl font-normal">
          Slam
        </Button>
      </StateCard>
      <StateCard label="disabled">
        <Button disabled>Join room</Button>
      </StateCard>
    </Section>
  )
}

export function LinkSection() {
  return (
    <Section title="link" note="Links navigate; buttons act. Underline always on.">
      <StateCard label="default">
        <Link href="#link">Rules of Cambio</Link>
      </StateCard>
      <StateCard label="disabled">
        <Link aria-disabled>Rules of Cambio</Link>
      </StateCard>
    </Section>
  )
}

export function BadgeSection() {
  return (
    <Section title="badge" note="Badges state facts, never actions — and never hidden-state hints.">
      <StateCard label="attention">
        <Badge variant="attention">Your turn</Badge>
      </StateCard>
      <StateCard label="info">
        <Badge variant="info">Spectating</Badge>
      </StateCard>
      <StateCard label="alarm">
        <Badge variant="alarm">Slam window</Badge>
      </StateCard>
      <StateCard label="positive">
        <Badge variant="positive">Connected</Badge>
      </StateCard>
      <StateCard label="count">
        <Badge variant="count">4</Badge>
      </StateCard>
    </Section>
  )
}

export function DividerSection() {
  return (
    <Section title="divider" note="Prefer whitespace first.">
      <StateCard label="section (2px)" wide>
        <Divider />
      </StateCard>
      <StateCard label="row (1px at 25%)" wide>
        <Divider weight="row" />
      </StateCard>
      <StateCard label="ornament (ceremonial only)" wide>
        <Divider variant="ornament" />
      </StateCard>
    </Section>
  )
}

export function PanelSection() {
  return (
    <Section title="panel" note="Static — default only. Never nested more than two deep.">
      <StateCard label="default">
        <Panel className="w-3xs">Body copy on raised paper.</Panel>
      </StateCard>
      <StateCard label="default · titled">
        <Panel className="w-3xs" title="Room details">
          Body copy on raised paper.
        </Panel>
      </StateCard>
      <StateCard label="plain (grouping without a box)">
        <Panel variant="plain" className="w-3xs">
          Body copy, ground only.
        </Panel>
      </StateCard>
      <StateCard label="chrome (one per screen)">
        <Panel variant="chrome" className="w-3xs" title="deal me in" titleFace="display">
          The ceremonial dress.
        </Panel>
      </StateCard>
    </Section>
  )
}

export function FieldScaffoldSection() {
  return (
    <Section title="field-scaffold" note="Every input renders inside a scaffold — no bare fields.">
      <StateCard label="default + helper">
        <FieldScaffold label="Player name" helper="Shown at the table.">
          <TextField placeholder="e.g. Nadia" />
        </FieldScaffold>
      </StateCard>
      <StateCard label="required">
        <FieldScaffold label="Player name" required>
          <TextField placeholder="e.g. Nadia" />
        </FieldScaffold>
      </StateCard>
      <StateCard label="error (replaces helper)">
        <FieldScaffold
          label="Room code"
          helper="Ask the host for the code."
          error="Room code not found. Check the code and try again."
        >
          <TextField variant="code" defaultValue="KHOKA" />
        </FieldScaffold>
      </StateCard>
      <StateCard label="disabled">
        <FieldScaffold label="Player name" helper="Shown at the table." disabled>
          <TextField placeholder="e.g. Nadia" disabled />
        </FieldScaffold>
      </StateCard>
      <StateCard label="read-only">
        <FieldScaffold label="Player name">
          <TextField defaultValue="Nadia" readOnly />
        </FieldScaffold>
      </StateCard>
    </Section>
  )
}

export function TextFieldSection() {
  return (
    <Section title="text-field" note="Placeholders are examples, never instructions.">
      <StateCard label="empty">
        <TextField placeholder="e.g. KHOKA" aria-label="Room code" />
      </StateCard>
      <StateCard label="filled">
        <TextField defaultValue="Nadia" aria-label="Player name" />
      </StateCard>
      <StateCard label="error">
        <TextField aria-invalid defaultValue="ZZZZ" aria-label="Room code" />
      </StateCard>
      <StateCard label="disabled">
        <TextField disabled placeholder="e.g. KHOKA" aria-label="Room code" />
      </StateCard>
      <StateCard label="read-only">
        <TextField readOnly defaultValue="Nadia" aria-label="Player name" />
      </StateCard>
      <StateCard label="code variant">
        <TextField variant="code" defaultValue="KHOKA" aria-label="Room code" />
      </StateCard>
    </Section>
  )
}

export function SelectSection() {
  return (
    <Section title="select" note="≤ 7 options or rethink the control. Open it to see the ♦ pip.">
      <StateCard label="empty">
        <Select options={SELECT_OPTIONS} placeholder="Slam window" aria-label="Slam window" />
      </StateCard>
      <StateCard label="filled">
        <Select options={SELECT_OPTIONS} defaultValue="8" aria-label="Slam window" />
      </StateCard>
      <StateCard label="error">
        <Select
          options={SELECT_OPTIONS}
          placeholder="Slam window"
          aria-invalid
          aria-label="Slam window"
        />
      </StateCard>
      <StateCard label="disabled">
        <Select
          options={SELECT_OPTIONS}
          placeholder="Slam window"
          disabled
          aria-label="Slam window"
        />
      </StateCard>
      <StateCard label="read-only">
        <Select options={SELECT_OPTIONS} defaultValue="8" readOnly aria-label="Slam window" />
      </StateCard>
    </Section>
  )
}

export function ToggleSection() {
  const [sound, setSound] = React.useState(true)
  return (
    <Section title="toggle" note="The label states the thing controlled, never the current value.">
      <StateCard label="live (off/on)">
        <Toggle checked={sound} onCheckedChange={setSound} aria-label="Sound" />
      </StateCard>
      <StateCard label="on">
        <Toggle checked aria-label="Sound" />
      </StateCard>
      <StateCard label="off">
        <Toggle checked={false} aria-label="Sound" />
      </StateCard>
      <StateCard label="disabled">
        <Toggle checked={false} disabled aria-label="Sound" />
      </StateCard>
      <StateCard label="read-only">
        <Toggle checked readOnly aria-label="Sound" />
      </StateCard>
      <StateCard label="error (save failed)">
        <Toggle checked error aria-label="Sound" />
      </StateCard>
    </Section>
  )
}

export function ModalSection() {
  const [open, setOpen] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [overflowOpen, setOverflowOpen] = React.useState(false)
  return (
    <Section title="modal" note="Esc, ✕, and scrim all close — except destructive-confirm.">
      <StateCard label="open">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Open settings modal
        </Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Settings"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setOpen(false)}>Save settings</Button>
            </>
          }
        >
          <p>Sound, motion, and table talk live here later.</p>
        </Modal>
      </StateCard>
      <StateCard label="confirm (destructive framing)">
        <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
          Open confirm modal
        </Button>
        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          variant="confirm"
          title="Call Cambio — ends the game"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Keep playing
              </Button>
              <Button variant="danger" onClick={() => setConfirmOpen(false)}>
                Call Cambio
              </Button>
            </>
          }
        >
          <p>Everyone reveals. Lowest total wins.</p>
        </Modal>
      </StateCard>
      <StateCard label="overflow (body scrolls, header/footer pinned)">
        <Button variant="secondary" onClick={() => setOverflowOpen(true)}>
          Open overflow modal
        </Button>
        <Modal
          open={overflowOpen}
          onClose={() => setOverflowOpen(false)}
          title="House rules"
          footer={<Button onClick={() => setOverflowOpen(false)}>Close rules</Button>}
        >
          {Array.from({ length: 24 }, (_, index) => (
            <p key={index} className="mb-2">
              Rule line {index + 1} — the body scrolls inside the panel.
            </p>
          ))}
        </Modal>
      </StateCard>
    </Section>
  )
}

export function ToastSection() {
  const [toasts, setToasts] = React.useState<ReadonlyArray<ToastItem>>([])
  const counter = React.useRef(0)
  const push = (variant: "info" | "success" | "alarm", message: string) => {
    counter.current += 1
    setToasts((current) => [...current, { id: `t${counter.current}`, variant, message }])
  }
  return (
    <Section
      title="toast"
      note="Past-tense app plumbing only; 4s dwell, hover pauses, max 3 stacked."
    >
      <StateCard label="static examples">
        <div className="flex flex-col gap-2">
          <Toast variant="info">Reconnected to the room</Toast>
          <Toast variant="success">Link copied</Toast>
          <Toast variant="alarm">Connection lost</Toast>
        </div>
      </StateCard>
      <StateCard label="live stack (fire a few fast for overflow)">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => push("success", "Link copied")}>
            Fire success
          </Button>
          <Button variant="secondary" onClick={() => push("info", "Setting saved")}>
            Fire info
          </Button>
          <Button variant="secondary" onClick={() => push("alarm", "Connection lost")}>
            Fire alarm
          </Button>
        </div>
        <ToastStack
          toasts={toasts}
          onExpire={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
        />
      </StateCard>
    </Section>
  )
}

export function LoadingSection() {
  return (
    <Section
      title="loading"
      note="The spinner is the game's own object. Under 300ms nothing shows; reduced motion swaps rotation for a fade pulse."
    >
      <StateCard label="spinner">
        <Loading delayMs={0} />
      </StateCard>
      <StateCard label="spinner + caption (flavor register)">
        <Loading delayMs={0} caption="shuffling…" />
      </StateCard>
      <StateCard label="skeleton (matches the real layout)">
        <div className="w-3xs">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </div>
      </StateCard>
    </Section>
  )
}

export function EmptyStateSection() {
  return (
    <Section title="empty-state" note="First-use and no-results are distinct by contract.">
      <StateCard label="first-use">
        <EmptyState state="first-use" action={<Button>Start a table</Button>}>
          no tables open. start one?
        </EmptyState>
      </StateCard>
      <StateCard label="no-results">
        <EmptyState state="no-results" action={<Button variant="ghost">Clear search</Button>}>
          No rooms match that code.
        </EmptyState>
      </StateCard>
    </Section>
  )
}

export function AlertSection() {
  const [dismissed, setDismissed] = React.useState(false)
  return (
    <Section title="alert" note="Alerts persist while true; toasts announce moments.">
      <StateCard label="info (dismissible)" wide>
        {dismissed ? (
          <Button variant="ghost" onClick={() => setDismissed(false)}>
            Bring it back
          </Button>
        ) : (
          <Alert variant="info" onDismiss={() => setDismissed(true)}>
            Spectators can see every face-up card.
          </Alert>
        )}
      </StateCard>
      <StateCard label="alarm (stays until resolved)" wide>
        <Alert
          variant="alarm"
          action={
            <Button variant="ghost" className="text-ink-inverse">
              Retry
            </Button>
          }
        >
          Couldn't reach the room. Check your connection and retry.
        </Alert>
      </StateCard>
      <StateCard label="success" wide>
        <Alert variant="success">Room created.</Alert>
      </StateCard>
      <StateCard label="reconnecting (play stays live behind it)" wide>
        <Alert variant="reconnecting">Reconnecting…</Alert>
      </StateCard>
    </Section>
  )
}

export function ListSection() {
  const rows = (
    <>
      <ListRow interactive meta="3 of 5 seats · slam window 8s">
        Nadia's table
      </ListRow>
      <ListRow interactive meta="2 of 5 seats · slam window 5s">
        Late night khoka
      </ListRow>
      <ListRow meta="full · in game">Regulars only</ListRow>
    </>
  )
  return (
    <Section title="list" note="Async/data floor: populated, loading, empty, error, partial.">
      <StateCard label="populated (interactive rows)">
        <List className="w-2xs border-frame">{rows}</List>
      </StateCard>
      <StateCard label="loading (3 skeleton rows)">
        <List state="loading" className="w-2xs border-frame" />
      </StateCard>
      <StateCard label="empty">
        <List
          state="empty"
          className="w-2xs"
          empty={
            <div className="w-2xs rounded-md border-frame bg-surface-raised">
              <EmptyState state="first-use" action={<Button>Start a table</Button>}>
                no tables open. start one?
              </EmptyState>
            </div>
          }
        />
      </StateCard>
      <StateCard label="error">
        <List
          state="error"
          className="w-2xs"
          error={
            <div className="w-2xs">
              <Alert
                variant="alarm"
                action={
                  <Button variant="ghost" className="text-ink-inverse">
                    Retry
                  </Button>
                }
              >
                Couldn't load rooms. Retry.
              </Alert>
            </div>
          }
        />
      </StateCard>
      <StateCard label="partial (trailing skeleton)">
        <List state="partial" className="w-2xs border-frame">
          {rows}
        </List>
      </StateCard>
    </Section>
  )
}

export function TableSection() {
  const header = (
    <thead>
      <tr>
        <TableHeaderCell>Player</TableHeaderCell>
        <TableHeaderCell numeric>Round</TableHeaderCell>
        <TableHeaderCell numeric>Total</TableHeaderCell>
      </tr>
    </thead>
  )
  return (
    <Section title="table" note="Numbers right-align in numeral type with a true minus (−).">
      <StateCard label="populated">
        <div className="w-xs">
          <Table className="border-frame">
            {header}
            <tbody>
              <TableRow>
                <TableCell>Nadia</TableCell>
                <TableCell numeric>−2</TableCell>
                <TableCell numeric>14</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Sam</TableCell>
                <TableCell numeric>7</TableCell>
                <TableCell numeric>21</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Raafay</TableCell>
                <TableCell numeric>0</TableCell>
                <TableCell numeric>9</TableCell>
              </TableRow>
            </tbody>
          </Table>
        </div>
      </StateCard>
      <StateCard label="loading">
        <div className="w-xs">
          <Table className="border-frame">
            {header}
            <tbody>
              <TableSkeletonRow columns={3} />
              <TableSkeletonRow columns={3} />
              <TableSkeletonRow columns={3} />
            </tbody>
          </Table>
        </div>
      </StateCard>
      <StateCard label="empty">
        <div className="w-xs">
          <Table className="border-frame">
            {header}
            <tbody>
              <TableStatusRow columns={3}>
                <EmptyState state="no-results">No finished rounds yet.</EmptyState>
              </TableStatusRow>
            </tbody>
          </Table>
        </div>
      </StateCard>
      <StateCard label="error">
        <div className="w-xs">
          <Table className="border-frame">
            {header}
            <tbody>
              <TableStatusRow columns={3}>
                <Alert
                  variant="alarm"
                  action={
                    <Button variant="ghost" className="text-ink-inverse">
                      Retry
                    </Button>
                  }
                >
                  Couldn't load scores. Retry.
                </Alert>
              </TableStatusRow>
            </tbody>
          </Table>
        </div>
      </StateCard>
      <StateCard label="partial">
        <div className="w-xs">
          <Table className="border-frame">
            {header}
            <tbody>
              <TableRow>
                <TableCell>Nadia</TableCell>
                <TableCell numeric>−2</TableCell>
                <TableCell numeric>14</TableCell>
              </TableRow>
              <TableSkeletonRow columns={3} />
            </tbody>
          </Table>
        </div>
      </StateCard>
    </Section>
  )
}

export function AppShellSection() {
  return (
    <Section
      title="app-shell"
      note="The shell owns scene grounds; screens declare a depth. The courtyard illustration is an open gap (CAM-16). This gallery page itself runs inside the default shell."
    >
      <StateCard label="default (plain cream)" wide>
        <div className="aspect-video w-full overflow-hidden rounded-md border-frame">
          <AppShell className="min-h-0 h-full">
            <div className="p-4">Screen content</div>
          </AppShell>
        </div>
      </StateCard>
      <StateCard label="game (collapsed header, paving scene)" wide>
        <div className="relative aspect-video w-full overflow-hidden rounded-md border-frame">
          <AppShell state="game" scene="paving" className="min-h-0 h-full">
            <div className="p-4" />
          </AppShell>
        </div>
      </StateCard>
      <StateCard label="reconnecting" wide>
        <div className="aspect-video w-full overflow-hidden rounded-md border-frame">
          <AppShell state="reconnecting" connection="reconnecting" className="min-h-0 h-full">
            <div className="p-4">Play stays visibly live.</div>
          </AppShell>
        </div>
      </StateCard>
    </Section>
  )
}

export function GenericSections() {
  return (
    <>
      <ButtonSection />
      <LinkSection />
      <BadgeSection />
      <DividerSection />
      <PanelSection />
      <FieldScaffoldSection />
      <TextFieldSection />
      <SelectSection />
      <ToggleSection />
      <ModalSection />
      <ToastSection />
      <LoadingSection />
      <EmptyStateSection />
      <AlertSection />
      <ListSection />
      <TableSection />
      <AppShellSection />
    </>
  )
}
