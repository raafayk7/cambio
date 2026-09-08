# 0029 — Design tooling vendored in-repo as first-party harness config

- **Status:** accepted
- **Date:** 2026-09-04
- **Task:** CAM-14

## Context

CAM-14 adds third-party design tooling to the harness: Carbonteq's
design-gate plugin (vendored zip in `docs/design/resources/`), Carbonteq's
ai-tells audit skill (same location), impeccable
(github.com/pbakaus/impeccable, Apache-2.0), and four animation skills from
github.com/emilkowalski/skills (MIT). Three forces shape how they install:

1. **Fresh-clone reproducibility.** ADR-0007 committed to one source of
   truth for agent instructions (`.agents/`, symlinked into `.claude/`)
   that any runtime can read. Claude Code cannot silently auto-install a
   plugin from project settings — externally-sourced plugins need a manual
   install step per machine, and whether an in-repo local marketplace
   escapes that restriction is undocumented.
2. **The design-gate zip needs edits regardless.** It is UNLICENSED
   internal Carbonteq code with known defects: its `hooks.json` uses an
   undocumented `command`+`args` format that may execute bare `node` and
   hang; its intent-prep delegates to `/impeccable craft`, which is not a
   real impeccable command; its SessionStart hook downloads Chromium
   (~150 MB, 600 s timeout) on every fresh machine; its README references
   dead machine-local paths; its `tests/` corpus is absent and `tokens/`
   empty.
3. **Overlap management.** design-gate ships its own `ai-slop` anti-slop
   catalog while CAM-14 also adapts `ai-tells`; the plugin's own manifest
   warns against stacking overlapping anti-slop layers.

## Decision

**Everything is repo-vendored under `.agents/` (symlinked into `.claude/`);
nothing lives at user level.** Per tool:

- **design-gate is dissolved into first-party config**, not installed as a
  plugin: its skills move into `.agents/skills/`, its agents into
  `.agents/agents/`, its scripts are vendored alongside, and its
  PostToolUse auto-nudge is lifted into `.agents/settings.json` in the
  documented single-string hook format (fixing the `args`-array defect).
  The SessionStart Chromium auto-download is **not** lifted — Playwright
  setup is a documented manual step, run once per machine when the rendered
  gate is actually wanted. The zip stays in `docs/design/resources/` as the
  pristine source. Verdicts remain advisory until Carbonteq's validation
  labeling lands.
- **impeccable** installs via `npx impeccable install --scope=project`,
  with the output relocated into `.agents/` and the symlinks re-verified
  (installers may replace symlinks with real directories). Its `PRODUCT.md`
  is authored from HANDOFF §1 plus the design direction — never left as
  init boilerplate. Refresh path: `npx impeccable update`, re-relocate,
  re-verify. Apache-2.0 notice retained.
- **emilkowalski/skills**: exactly four skills are copied into
  `.agents/skills/` — `animate`, `review-animations`,
  `find-animation-opportunities`, `animation-vocabulary` — with MIT
  attribution. Excluded: `pick-ui-library` (contradicts
  build-from-the-design-system), `write-swift`, `ask-sonner`,
  `apple-design`, `animate-expo` (React Native), `emil-design-eng`
  (overlaps the gate/impeccable), `prototype`, `improve-animations`
  (add later if a codebase-wide motion audit is ever wanted).
- **Precedence, written into the harness:** the design system outranks
  impeccable and Emil's skills, always. They are craft linting and
  execution-quality guidance, never an authority on components, tokens, or
  identity; when a generic flag hits deliberate Cambio identity (cream
  paper, poster display face), the tool flags the conflict and never
  auto-"fixes". Same shape as "production doc beats prototype".
- **Anti-slop roles split:** the plugin's `ai-slop` catalog stays internal
  to the gate pipeline (its decompose agent reads `markers.json`); the
  adapted `ai-tells` is the repo-facing audit skill, re-scoped to grade
  against `design-system/` tokens and voice. They do not both run on the
  same artifact by default.

**Alternatives rejected:**

- **Plugin-shaped installs** (local marketplace or user-level
  `/plugin install`) — per-machine manual steps, unverified auto-load
  behavior, and the design-gate defects would ship unfixed.
- **Git submodule for impeccable** — the README's official vendoring path,
  but adds submodule init/update friction to every clone for no gain over
  a pinned copy.
- **ui-ux-pro-max** — a design-direction generator; the moodboard already
  solved that problem, and its style/palette libraries are a pool of
  off-system values one prompt away from leaking past the creation gate.
- **taste-skill** — a fourth overlapping anti-slop layer that mandates
  GSAP, colliding with ADR-0027 and Emil's guidance.

## Consequences

A fresh clone has the complete design harness with zero `/plugin` steps;
the only per-machine setup is Node 22 and an optional
`npx playwright install chromium` for the rendered gate. We own the
dissolved design-gate fork — upstream updates are a manual diff against the
vendored zip, and we maintain the fixes we made. The `.agents/` tree gains
an `agents/` directory and vendored scripts, which the symlink convention
must now also cover. Revisit if Carbonteq ships a licensed, corrected
design-gate release or if Claude Code gains true project-scoped plugin
auto-install.
