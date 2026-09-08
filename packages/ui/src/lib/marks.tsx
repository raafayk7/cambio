import type * as React from "react"

/**
 * Control marks — tiny inline SVGs drawn to the material language (2px
 * ink strokes, token-scale sizes) instead of Unicode glyphs, which render
 * at font metrics and are the one element not merged with the drawn
 * artwork (design-gate D8 finding, CAM-15 M4). The ♠♥♦♣ suit glyphs are
 * NOT marks — they are the game's declared card motif and stay glyphs.
 */
type MarkProps = React.SVGProps<SVGSVGElement>

const base: MarkProps = {
  viewBox: "0 0 16 16",
  width: 16,
  height: 16,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  "aria-hidden": true,
}

/** ✕ — close/dismiss. */
export function MarkX(props: MarkProps) {
  return (
    <svg {...base} strokeLinecap="square" {...props}>
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </svg>
  )
}

/** ✓ — success/confirm. */
export function MarkCheck(props: MarkProps) {
  return (
    <svg {...base} strokeLinecap="square" {...props}>
      <path d="M2.5 8.5l3.5 3.5L13.5 4" />
    </svg>
  )
}

/** Settings — slider rails with offset knobs. */
export function MarkSettings(props: MarkProps) {
  return (
    <svg {...base} {...props}>
      <path d="M1.5 4.5h13M1.5 11.5h13" />
      <circle cx="6" cy="4.5" r="2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="11.5" r="2" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Help — a drawn "?": hook curve plus a filled dot, matching MarkSettings'
 * filled-dot accent so the glyph reads at 16px (no Unicode "?", which
 * renders at font metrics and doesn't merge with the drawn artwork —
 * design-gate D8 finding, CAM-15 M4). */
export function MarkHelp(props: MarkProps) {
  return (
    <svg {...base} strokeLinecap="round" {...props}>
      <path d="M5 5.5a3 3 0 1 1 4.5 2.6C8.4 8.7 8 9.3 8 10.2v.3" />
      <circle cx="8" cy="13" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}
