# Vendored third-party skills — provenance and licenses

The attribution ledger for everything under `.agents/` that did not
originate in this repo (ADR-0029: all design tooling is repo-vendored,
nothing user-level). Update this file whenever a vendored payload is
added, refreshed, or removed.

## emilkowalski/skills — animation set (MIT)

- **Upstream:** <https://github.com/emilkowalski/skills>, pinned commit
  `d23d7f88a2e21c9e4b1418c7abe420f5c1052ba7` (vendored 2026-09-04).
- **License:** MIT (Copyright (c) 2026 Emil Kowalski). The upstream
  root `LICENSE` text is copied verbatim into each of the four vendored
  directories (CAM-33, 2026-09-08 — previously only referenced from this
  file, not co-located with the code as MIT redistribution expects).
- **Copied verbatim:** `animate/` (with `RECIPES.md` and `LICENSE`),
  `review-animations/` (with `STANDARDS.md` and `LICENSE`; keeps its
  `disable-model-invocation: true`), `find-animation-opportunities/`
  (with `LICENSE`), `animation-vocabulary/` (with `LICENSE`).
- **Excluded by decision (ADR-0029):** `pick-ui-library`, `write-swift`,
  `ask-sonner`, `apple-design`, `animate-expo`, `emil-design-eng`,
  `prototype`, `improve-animations`.
- **Local state:** prettier-ignored (kept byte-identical to upstream so
  refresh diffs stay clean).
- **Refresh:** re-clone upstream, re-copy the four directories, update
  the pinned commit here.

## impeccable (Apache-2.0)

- **Upstream:** <https://github.com/pbakaus/impeccable>, version
  **4.1.3**, installed 2026-09-04 via
  `npx impeccable install --providers=claude --scope=project` and
  relocated: skill payload at `.agents/skills/impeccable/`, agents at
  `.agents/agents/impeccable-*.md`, hook entries lifted into
  `.agents/settings.json` (the installer's `settings.local.json` was
  merged and deleted; the replaced `.claude/skills` symlink was
  restored).
- **License:** Apache-2.0. `LICENSE` and `NOTICE.md` are copied verbatim
  from the upstream `skill-v4.1.3` tag into
  `.agents/skills/impeccable/` (CAM-33, 2026-09-08 — previously this
  entry said "see upstream NOTICE.md" without the file actually being
  vendored in-repo, which doesn't satisfy Apache-2.0 §4's redistribution
  conditions). The vendored `NOTICE.md` itself documents a further
  transitive attribution: `reference/ios.md` and `reference/android.md`
  are distilled from ehmo's `platform-design-skills`
  (<https://github.com/ehmo/platform-design-skills>, MIT) — both files
  are present in our vendored copy, so that MIT notice travels with them
  via the same `NOTICE.md`.
- **Local state:** payload is prettier-ignored (refreshed wholesale;
  formatting it would churn every update). Product truth for its
  commands lives in `PRODUCT.md` at the repo root. Its config dir
  `.impeccable/` is gitignored.
- **Path convention (deliberate split):** impeccable's hook entries and
  `allowed-tools` address the payload via `.claude/skills/impeccable/…`
  (the path its installer/updater rewrites), unlike first-party hooks
  which use `.agents/…` directly; both resolve to the same files through
  the symlink. Caveat: the hook commands are guarded with
  `[ ! -f … ] ||`, so if the `.claude/skills` symlink ever breaks, the
  hooks silently no-op — after any refresh, re-verify the symlink before
  trusting the hooks.
- **Refresh:** `npx impeccable update`, then re-verify the `.claude/`
  symlinks, re-lift any hook changes into `.agents/settings.json`, and
  update the version here. The installer only manages the `skill/`
  payload, not the upstream repo's root `LICENSE`/`NOTICE.md` — re-fetch
  those two files by hand from the new pinned tag and diff them for
  changes (including the transitive `platform-design-skills` notice)
  whenever the version bumps.

## design-gate + ai-tells (UNLICENSED — Carbonteq internal), dissolved

- **Upstream:** Carbonteq Design's plugin, vendored as
  `docs/design/resources/design-gate-plugin.zip` on release branches —
  that zip is the pristine source; diffs against it are the update path.
  Carbonteq's original `ai-tells` skill (pre-adaptation) is vendored
  alongside it as `docs/design/resources/ai-tells/{SKILL.md,catalog.md}`.
- **Dissolved per ADR-0029** (not installed as a plugin): skills `gate`,
  `intent-prep`, `design-context`, `rubric-principles`, `hard-checks`,
  `annotated-exemplars`, `ai-slop`, and the adapted `ai-tells` (re-scoped
  to grade against `design-system/` tokens and voice) → `.agents/skills/`;
  agents `decompose`/`map`/`judge` → `.agents/agents/`; scripts
  (`render.js`, `wcag.js`, `hardcheck.js`, `hardcheck.test.js`,
  `auto-gate.mjs`, `package.json`, lockfile) →
  `.agents/scripts/design-gate/`.
- **Dropped:** `agents/baseline.md` + `scripts/eval.js` (their
  validation corpus is absent from the zip, so the eval harness cannot
  run), `scripts/setup.mjs` + the SessionStart hook (no automatic
  Chromium download — Playwright setup is manual, see AGENTS.md), the
  plugin manifests.
- **Local fixes (we own this fork):** hook rewritten from the
  undocumented `command`+`args` format to a documented single-string
  PostToolUse entry; `design-gate:gate` skill references renamed to
  `gate`; intent-prep's stale `/impeccable craft` delegation replaced
  with the real command surface plus the Cambio precedence rule;
  advisory-verdict and manual-Playwright notes added; files
  prettier-formatted; `package.json`'s `postinstall` (auto Chromium
  download) stripped per ADR-0029 and its npm script paths fixed for the
  flat vendored layout (review fix cycle, F3).
- **Public redistribution (CAM-33, 2026-09-08):** this material carries
  no OSS license — ADR-0029 states it outright ("design-gate is
  UNLICENSED internal Carbonteq code") — so redistribution rights don't
  come from a license grant here. Raafay Kazmi (repo owner) confirmed
  during CAM-33 planning that he holds Carbonteq's permission to
  redistribute this material publicly. That permission is the basis for
  including it in the public repo; it covers
  `design-gate-plugin.zip`, `docs/design/resources/ai-tells/`, and every
  skill/agent/script dissolved from them, listed above. If that
  permission is ever narrowed or withdrawn, this material has to come out
  of the public tree (and its git history), not just get re-gitignored —
  revisit this note first.
