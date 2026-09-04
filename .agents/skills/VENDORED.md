# Vendored third-party skills — provenance and licenses

The attribution ledger for everything under `.agents/` that did not
originate in this repo (ADR-0029: all design tooling is repo-vendored,
nothing user-level). Update this file whenever a vendored payload is
added, refreshed, or removed.

## emilkowalski/skills — animation set (MIT)

- **Upstream:** <https://github.com/emilkowalski/skills>, pinned commit
  `d23d7f88a2e21c9e4b1418c7abe420f5c1052ba7` (vendored 2026-09-04).
- **License:** MIT (Copyright (c) 2026 Emil Kowalski).
- **Copied verbatim:** `animate/` (with `RECIPES.md`),
  `review-animations/` (with `STANDARDS.md`; keeps its
  `disable-model-invocation: true`), `find-animation-opportunities/`,
  `animation-vocabulary/`.
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
- **License:** Apache-2.0 (see upstream `NOTICE.md`).
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
  update the version here.

## design-gate (UNLICENSED — Carbonteq internal), dissolved

- **Upstream:** Carbonteq Design's plugin, vendored as
  `docs/design/resources/design-gate-plugin.zip` on release branches —
  that zip is the pristine source; diffs against it are the update path.
- **Dissolved per ADR-0029** (not installed as a plugin): skills `gate`,
  `intent-prep`, `design-context`, `rubric-principles`, `hard-checks`,
  `annotated-exemplars`, `ai-slop` → `.agents/skills/`; agents
  `decompose`/`map`/`judge` → `.agents/agents/`; scripts
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
