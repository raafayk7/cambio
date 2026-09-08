import { Modal, Table, TableCell, TableHeaderCell, TableRow } from "@cambio/ui"

import {
  ENDGAME_SECTION,
  type GuideSection,
  POWERS_SECTION,
  POWERS_TABLE,
  RARE_SITUATIONS_SECTION,
  SCORING_SECTION,
  SCORING_TABLE,
  SETUP_SECTION,
  SLAM_SECTION,
  SLAM_TABLE,
  TURN_SECTION,
} from "./how-to-play-copy.js"

/**
 * HowToPlayGuide — design-system/components/extensions/how-to-play-guide.md
 * (r1, root plan F2.1/F5.4). Class: Overlay, hosted entirely in the canon
 * `Modal` at its default width (root plan Decision Log D6).
 *
 * Presentational only: every word comes from `how-to-play-copy.ts`, which
 * carries the copy-fidelity discipline. No footer — the modal's own
 * ✕/Esc/scrim escapes are enough.
 */
export interface HowToPlayGuideProps {
  open: boolean
  onClose: () => void
}

function GuideParagraphs({ section }: { section: GuideSection }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-ui text-base font-semibold text-ink-primary">{section.heading}</h3>
      {section.paragraphs.map((paragraph, index) => (
        <p key={index} className="font-ui text-sm text-ink-primary">
          {paragraph}
        </p>
      ))}
    </section>
  )
}

export function HowToPlayGuide({ open, onClose }: HowToPlayGuideProps) {
  return (
    <Modal open={open} onClose={onClose} title="How to play">
      <div className="flex flex-col gap-5">
        <GuideParagraphs section={SETUP_SECTION} />

        <GuideParagraphs section={SCORING_SECTION} />
        <Table>
          <thead>
            <TableRow>
              <TableHeaderCell>Card</TableHeaderCell>
              <TableHeaderCell numeric>Score</TableHeaderCell>
            </TableRow>
          </thead>
          <tbody>
            {SCORING_TABLE.map((row) => (
              <TableRow key={row.card}>
                <TableCell>{row.card}</TableCell>
                <TableCell numeric>{row.score}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>

        <GuideParagraphs section={TURN_SECTION} />

        <GuideParagraphs section={POWERS_SECTION} />
        <Table>
          <thead>
            <TableRow>
              <TableHeaderCell>Card</TableHeaderCell>
              <TableHeaderCell>Power</TableHeaderCell>
            </TableRow>
          </thead>
          <tbody>
            {POWERS_TABLE.map((row) => (
              <TableRow key={row.card}>
                <TableCell>{row.card}</TableCell>
                <TableCell>{row.power}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>

        <GuideParagraphs section={SLAM_SECTION} />
        <Table>
          <thead>
            <TableRow>
              <TableHeaderCell>Slam</TableHeaderCell>
              <TableHeaderCell>Result</TableHeaderCell>
            </TableRow>
          </thead>
          <tbody>
            {SLAM_TABLE.map((row) => (
              <TableRow key={row.slam}>
                <TableCell>{row.slam}</TableCell>
                <TableCell>{row.result}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>

        <GuideParagraphs section={RARE_SITUATIONS_SECTION} />
        <GuideParagraphs section={ENDGAME_SECTION} />
      </div>
    </Modal>
  )
}
