# CAM-14 — Frontend AI harness (frontend)

- **Root plan:** [root/CAM-14.md](../root/CAM-14.md) — the functional
  contract lives there; this document is implementation detail for one side.

> Living document — the implementing agent updates Progress and flags
> Surprises here as it works. Keep it self-contained: exact paths, exact
> commands.

## Context & orientation

**Branch discipline (ADR-0028): every milestone below executes on `main`,
committed directly — no task branch, no PR.** M9 propagates by merge-down
`main` → `development` → `release-v0`. Before editing any pre-existing file
on `main`, diff it against `release-v0` (guard rail in ADR-0028); a file
that diverged on the release side is edited there instead, or the plan
stops and asks.

**Critical planning-time discovery — the sources live only on
`release-v0`.** `git ls-tree main docs/design design-system` returns
nothing: neither `docs/design/resources/` (the ai-tells skill and the
design-gate zip) nor `design-system/` exists on `main`. All source
material for M4–M6 is extracted read-only via `git show release-v0:<path>`
into the session scratchpad — never by checking those paths out onto
`main`. The design-system folder arrives on the other branches only via a
later release merge, which is exactly why the routing skill (M3) and the
adapted ai-tells (M4) must carry the absent-on-main caveat.

### What exists today

- **Harness:** `AGENTS.md` is the entry point; `.agents/` holds
  `commands/`, `skills/` (7 skills), `hooks/` (2 bash hooks),
  `templates/`, `settings.json`. `.claude/` contains exactly three
  symlinks: `commands`, `skills`, `settings.json` → `../.agents/*`. Hooks
  are wired from `.agents/settings.json` by `$CLAUDE_PROJECT_DIR` path:
  PreToolUse on `Bash` (`block-piped-gate.sh`), PostToolUse on
  `Edit|Write` (`format-markdown.sh`). There is **no** `.claude/agents`
  and no plugins directory yet.
- **House skill format** (every first-party skill must match): frontmatter
  with only `name` + a single-line `description` (~350–470 chars, ending
  in a trigger clause); body 80–120 lines; one H1 then thematic `##`
  sections; rules-as-law voice; cross-references by bare skill name. See
  `.agents/skills/architecture/SKILL.md` as the exemplar.
- **Frontend scaffold facts** (probe-verified this session):
  `apps/web/vite.config.ts:20` sets `port: Number(env.WEB_PORT ?? 3000)`;
  `.env.example` sets `WEB_PORT=3000`; the local `.env` overrides to 3100,
  which is where the stale "web :3100" claim in AGENTS.md's
  `## Development` came from. The fresh-clone truth is **3000**.
  `packages/config/eslint.base.js:24-37` (`MAY_IMPORT`) gives `web` →
  `contracts`+`ui`, `ui` → nothing app-specific; `eslint.base.js:58`
  (`EFFECT_ONLY_EXTERNAL_LAYERS`) covers domain/contracts/application
  only — **web and ui have no external-dependency restriction**; the only
  lint-enforced frontend rule is the workspace-import row.
- **design-gate zip** (unzipped and inspected): `skills/` design-context,
  rubric-principles, hard-checks, intent-prep, gate, annotated-exemplars
  (+`corpus.json`), ai-slop (+`catalog.md`, `markers.json`); `agents/`
  decompose, map, judge, baseline (all `model: opus`; decompose/baseline
  get Bash,Read,Glob,Grep; map/judge Read only); `scripts/` render.js,
  wcag.js, hardcheck.js(+test), eval.js, setup.mjs, auto-gate.mjs;
  `hooks/hooks.json` in an **undocumented** `"command": "node"` +
  `"args": [...]` format that must be rewritten as a single command
  string; plus package.json/package-lock.json. Known defects to fix are
  itemized in the root plan's Context and ADR-0029.
- **Governing skills for this work:** `architecture` (especially its
  enforcement-claims-must-be-probe-verified rule under "Verifying a
  boundary" — it binds every "X is enforced" sentence written into the
  new skills), `hidden-information` (its prime invariant, viewFor section,
  and memory-fidelity UI rule are the content restated client-side in
  `frontend-architecture`), `adr` (0007/0008 amendments in M-scope).

### Formatting trap

Every `.md` written here is auto-formatted by the PostToolUse hook. The
one non-convergent case: an inline code span broken across lines inside a
list item. Keep every code span on one line; rephrase rather than wrap.

## Plan of work

Ordered by root-plan milestone. Each step ends with the bare gate
(`pnpm turbo build typecheck lint test`) and a commit on `main`; nothing
here adds TS code, so the gate is primarily the prettier check plus proof
that no config change broke the build.

Code sketches below (roster lines, hook JSON, section lists) are
**advisory** — the Contract coverage table and the vendor-map table are
what gets reconciled against as-built state at close-out.

### M2 — AGENTS.md + workflow plumbing

Pre-step guard (once, covers M2–M7): for every pre-existing file this task
edits, run `git diff main release-v0 -- <file>` and confirm it is empty.
Expected edit set: `AGENTS.md`, `.agents/commands/implement.md`,
`.agents/commands/review.md`, `.agents/templates/child-plan.md`,
`.agents/skills/architecture/SKILL.md`, `.agents/settings.json`,
`docs/adr/README.md` + ADR-0007/0008 (amendment lines, if not already
landed with M1). Any non-empty diff → stop, log in Surprises, resolve per
ADR-0028 before touching the file.

**`AGENTS.md`** (four edits):

1. `## Sources of truth` — add a `design-system/` bullet: router at
   `design-system/design-system.md`, authoritative for all UI identity;
   caveat that the folder exists only on release branches — absent means
   you are on `main`/`development`, do not invent.
2. `## Skills` roster — extend with the new entries, one line each in the
   existing style: `frontend-architecture`, `design-system` (router),
   `ai-tells` (repo-facing audit), the design-gate family grouped on one
   or two lines (`gate` + its pipeline skills, noting `ai-slop` is
   internal to the gate, never the repo-facing audit), `impeccable`
   (installed skill + `PRODUCT.md`), Emil's four animation skills grouped
   with MIT attribution note. Include the precedence sentence (clause 9):
   the design system outranks impeccable and Emil's skills; generic flags
   against deliberate identity are surfaced as conflicts, never
   auto-"fixed".
3. `## Development` — hooks narrative: add the design-gate PostToolUse
   nudge (advisory, never blocks, fires on `.tsx`/`.jsx`/`.html` writes)
   and impeccable's hook; add the manual Playwright setup paragraph
   (optional, once per machine, for the rendered gate only). Fix the dev
   command comment from `web :3100` to `web :3000` and mention
   `WEB_PORT` (probe first — re-read `apps/web/vite.config.ts:20` and
   `.env.example`; the number written is the fresh-clone default, not the
   local `.env` override). Note: this milestone writes hook narrative for
   hooks wired in M5/M6 — a transient doc-ahead-of-wiring state on
   `main` within the task, chosen over touching AGENTS.md twice.
4. Replace `## Frontend note` (the final section) with a `## Frontend`
   section discharging the deferral: the client is a projection renderer
   (points at `frontend-architecture` and `hidden-information`), the
   design system is law (points at the `design-system` skill and the
   branch caveat), the design-tooling stack in one paragraph (gate =
   advisory verdicts; ai-tells = audit; impeccable = craft linting; Emil
   = animation guidance), and the precedence rule again in one line.

**`.agents/commands/implement.md`** — in the "Lanes" bullet under
`## 2. Execute`, extend the parenthetical skill list with the frontend
governors: `frontend-architecture`, `design-system`, `ai-tells` (and keep
`hidden-information`, which already applies to both sides).

**`.agents/commands/review.md`** — in the "Architecture reviewer" bullet,
extend the governing-skills parenthetical the same way for frontend
diffs.

**`.agents/templates/child-plan.md`** — the "name the skills" example in
`## Context & orientation` gains `frontend-architecture` so future
frontend child plans cite it naturally.

### M3 — First-party skills

**`.agents/skills/frontend-architecture/SKILL.md`** (new, house format).
Content spec — each bullet names its source so the writer copies facts,
not vibes:

- The client is a **projection renderer**, not a second clean
  architecture: it renders what `viewFor` sent and nothing else. Restate
  the client side of the `hidden-information` skill: the prime invariant
  ("never send it at all" — so never work around a missing field), the
  viewFor/contracts route for new client-visible data, and the
  memory-fidelity UI rule (peeked cards shown briefly, never persisted —
  no "cards you know" affordances). Cross-ref `hidden-information` by
  name.
- The import boundary: `apps/web` may import `contracts` + `ui`, never
  `domain`/`application` (the architecture skill's import-table rows and
  its "why web can never see domain" rationale). `packages/ui` imports
  nothing app-specific. The ui-vs-web split rule (app logic → web; pure
  presentation → ui) — same line as the architecture skill's decision
  procedure step 6.
- **Enforcement honesty:** the only lint-enforced frontend boundary is
  the workspace-import row (`packages/config/eslint.base.js:24-37`);
  web/ui external npm deps are **not** restricted
  (`eslint.base.js:58` scopes effect-only to backend layers). Per the
  architecture skill's "Enforcement claims must be probe-verified" rule,
  every enforcement sentence written into this skill is probed before it
  is written (illegal import → gate fails → revert), and anything not
  actually enforced is stated as convention, not law.
- Layering: Pages → Containers → Components → Primitives → Services;
  logic in custom hooks; data-fetching separated from presentation;
  useEffect discipline and composition-over-prop-drilling. Source:
  Carbonteq portal —
  <https://dev-portal-fuma.vercel.app/docs/best-practices/frontend/architecture/overview>
  and the sibling best-practices pages; the four-tier token model from
  the design-system-philosophy page (note: that URL has **no**
  `/architecture/` segment). Cite the URLs in the skill; do not import
  the portal's stack prescriptions (Next.js/ANTD/Panda are excluded per
  ADR-0027).
- Styling stack: Tailwind v4 CSS-first, tokens as `@theme` CSS variables
  in `packages/ui/src/styles.css` per ADR-0027; no hardcoded values —
  new tokens go through the design-system creation gate first.

**`.agents/skills/architecture/SKILL.md`** — add two lines to the
`## Layer-specific rules` list: `frontend-architecture` (for anything in
`apps/web` or `packages/ui`) and `design-system` (for anything visual).

**`.agents/skills/design-system/SKILL.md`** (new, house format, short —
it is a router, not a rulebook):

- Points at `design-system/design-system.md` and defers to its decision
  map — **wraps, never duplicates**: no component lists, no token values,
  no MVS table copied here.
- States the branch reality: the folder lives on release branches; if it
  is absent you are on `main`/`development` — stop, say so, do not invent
  components or tokens from memory.
- Names the creation gate (STOP on anything canonical; only explicit user
  instruction unblocks) and the hidden-information design-law link (no
  component may hint at unentitled card values; memory fidelity).
- Carries the precedence rule: this system outranks impeccable and
  Emil's skills; conflicts are surfaced, never auto-resolved.

### M4 — ai-tells adaptation

Extract sources to the scratchpad
(`git show release-v0:docs/design/resources/ai-tells/SKILL.md`, same for
`catalog.md`). Write the adapted copies to
`.agents/skills/ai-tells/SKILL.md` + `catalog.md`. The originals live
only on `release-v0` and are not touched (nothing to touch on `main`).

Adaptations, itemized:

1. **Frontmatter to house style:** collapse the multi-line
   `description: |` into a single-line description ending in a trigger
   clause; drop `allowed-tools` (no other house skill carries it).
2. **De-Next.js the audit procedure:** the Step 1 scope list's
   `app/layout.tsx`, `app/page.tsx`, `app/globals.css`,
   `tailwind.config.*` entries become the real repo surfaces —
   `apps/web/src/routes/`, `apps/web/src/styles.css`,
   `packages/ui/src/styles.css` (the `@theme` token home), and
   `packages/ui/src/`; `next/font/google` references become the repo's
   actual font-loading mechanism; the "Next.js + Tailwind +
   framer-motion + lucide" framing throughout becomes TanStack Start +
   the repo stack.
3. **Remove the three dangling sibling-skill references**
   (`design-breakdown`, `design-audit`, `vanity-engineering-review`) from
   the description, "When to trigger", and "What you are not doing"
   sections — replace with self-contained phrasing (screenshot/URL
   audits and architectural critique are simply out of scope).
4. **Catalog re-scope for false positives:** category 9's `cn()` row —
   the repo's `packages/ui/src/lib/utils.ts` helper is legitimate shadcn
   plumbing, not a tell; category 9's `@theme` row — the block in
   `packages/ui/src/styles.css` is the ADR-0027-sanctioned token home,
   not a tell. Category 8's five-section landing-page frame does not
   apply to a game UI — replace with a game-screen rhythm note (audit
   repetition across lobby/table/score screens instead).
5. **Calibration note:** Cambio's cream palette is defensibly
   intentional — derived from physical references, and it arrives with
   terracotta/brick/green, not stone-neutral editorial minimalism. Cream
   alone must not score as the category-1 trifecta.
6. **Grading anchor:** score against `design-system/references/tokens.md`
   and `references/voice.md` — with the explicit caveat that those paths
   resolve only on release branches; on `main` the audit runs
   pattern-only and says so.

### M5 — design-gate dissolution

Extract the pristine zip
(`git show release-v0:docs/design/resources/design-gate-plugin.zip`) to
the scratchpad and dissolve per ADR-0029. Vendor map (this table is
reconciled at close-out):

| Zip path                                                                                                          | Destination                           | Changes                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/{design-context,rubric-principles,hard-checks}`                                                           | `.agents/skills/<same>/`              | path rewrites only                                                                                                                                                        |
| `skills/gate`                                                                                                     | `.agents/skills/gate/`                | path rewrites; verdicts-advisory note; Playwright note                                                                                                                    |
| `skills/intent-prep`                                                                                              | `.agents/skills/intent-prep/`         | fix delegation + trim absent skills (below)                                                                                                                               |
| `skills/annotated-exemplars` (+`corpus.json`)                                                                     | `.agents/skills/annotated-exemplars/` | path rewrites only                                                                                                                                                        |
| `skills/ai-slop` (+`catalog.md`, `markers.json`)                                                                  | `.agents/skills/ai-slop/`             | add gate-internal note (never the repo-facing audit)                                                                                                                      |
| `agents/{decompose,map,judge}.md`                                                                                 | `.agents/agents/`                     | path rewrites; keep model/tools frontmatter                                                                                                                               |
| `agents/baseline.md`, `scripts/eval.js`                                                                           | **dropped**                           | eval-harness control; its `tests/validation` corpus is absent from the zip, so the harness cannot run; recoverable from the pristine zip; record in the root Decision Log |
| `scripts/{render,wcag,hardcheck,hardcheck.test}.js`, `scripts/auto-gate.mjs`, `package.json`, `package-lock.json` | `.agents/scripts/design-gate/`        | path rewrites; `node_modules` stays gitignored                                                                                                                            |
| `scripts/setup.mjs`, `hooks/hooks.json`                                                                           | **not lifted**                        | ADR-0029: no SessionStart Chromium download; hook rewritten below                                                                                                         |

Vendored gate skills keep their upstream prose and frontmatter shape
(only first-party skills and ai-tells get house format) — the edits are
the functional fixes, not a rewrite. Record that scoping choice in the
root Decision Log.

**Path rewrites:** every `${CLAUDE_PLUGIN_ROOT}` in vendored skills,
agents, and scripts becomes `"$CLAUDE_PROJECT_DIR"/.agents/scripts/design-gate`
(or the matching `.agents/` path). Probe: a repo-wide grep for
`CLAUDE_PLUGIN_ROOT` under `.agents/` returns zero hits.

**New symlink:** `.claude/agents -> ../.agents/agents` (the convention
gains an `agents/` member per ADR-0029; M6's installer also needs it in
place first).

**Hook lift into `.agents/settings.json`:** append a second hook object
to the existing PostToolUse `Edit|Write` entry, in the documented
single-string format —
`node "$CLAUDE_PROJECT_DIR"/.agents/scripts/design-gate/auto-gate.mjs`,
timeout 15, a statusMessage. `auto-gate.mjs` itself is vendored
unmodified: it already filters to `.html/.htm/.jsx/.tsx`, excludes
`test|spec|stories|config|d` suffixed files, never blocks, and emits an
`additionalContext` nudge only.

**intent-prep corrections:** its Step 1 delegates to `/impeccable craft`,
which does not exist — the real surface is
`/impeccable init|shape|audit|polish|critique|animate|…`. Rewrite the
delegation to the real commands (verify against the installed
impeccable's own docs during M6-adjacent testing; default routing: shape
for new-surface direction, audit + polish on produced output). Trim the
references to `awesome-design` and `taste-skill` (not installed here,
per ADR-0029's rejections) and add one line: the Cambio design system
outranks all generation guidance (clause 9).

**Playwright as a documented manual step** (already written into
AGENTS.md in M2): from `.agents/scripts/design-gate/`, one-time
`npm install --omit=dev` then `npx playwright install chromium` —
needed only for the rendered gate, never at session start.

**Empirical verification** (clause 6) — see Concrete steps for the exact
probe commands: unit-level pipes into `auto-gate.mjs`, then live Write
probes for nudge-on-`.tsx`, silence-on-`.test.tsx`/`.md`/backend-`.ts`,
and coexistence with the markdown-format hook. This is also where the
issue's "hooks/skills live-detect mid-session, commands need restart"
claim gets tested empirically and the result recorded in Surprises —
treat it as a hypothesis, not a fact; restart the session if the hook
does not fire live.

### M6 — impeccable install + relocation

Exact sequence (installers may clobber symlinks — every step is
verified):

1. **Baseline snapshot:** copy `.agents/settings.json` to the
   scratchpad; capture `ls -la .claude/` and a clean `git status`.
2. **Install:** `npx impeccable install --scope=project` at the repo
   root. Expected writes: hook config into `.claude/settings.json`
   and/or `.claude/settings.local.json`; four `impeccable-*.md` agents
   into `.claude/agents/`; `.claude/skills/impeccable/` (SKILL.md,
   ~40 reference md, ~40 scripts, `data/font-index.json`).
3. **Diff and classify:** `readlink .claude/settings.json` — if the
   symlink survived, the installer wrote **through** it into
   `.agents/settings.json` (verify the merge kept our two hooks + the
   auto-gate hook); if the symlink was replaced by a real file,
   hand-merge its hook entries into `.agents/settings.json` and restore
   the symlink. Same check for `.claude/skills` and `.claude/agents`
   (writes through those symlinks land in `.agents/` — confirm with
   `realpath`). If a `settings.local.json` appeared, lift its entries
   into `.agents/settings.json` and delete it — nothing machine-local
   may be load-bearing (root acceptance criteria).
4. **Verify the hook path resolves:** impeccable's hook invokes
   `${CLAUDE_PROJECT_DIR}/.claude/skills/impeccable/scripts/hook.mjs`
   (PostToolUse `Edit|Write` + Stop, Node>=22 guard, 5s/30s timeouts).
   Probe that the path resolves through the symlink from a fresh shell;
   keep the `.claude/` path if it resolves, rewrite to the `.agents/`
   path if it does not. Then a live probe: edit a scratch file, observe
   the impeccable hook run alongside format-markdown and auto-gate.
5. **Symlink audit:** `ls -la .claude/` matches baseline plus the
   intended `agents` symlink; `git status` shows no unexpected real
   directories under `.claude/`.
6. **Author `PRODUCT.md`** (repo root, impeccable's expected location):
   schema marker comment + the `##` sections Platform, Users, Product
   Purpose, Positioning, Operating Context, Capabilities and
   Constraints, Brand Commitments, Evidence on Hand, Product Principles,
   Accessibility & Inclusion — written from HANDOFF §1 and the design
   direction (read from `release-v0` via `git show`, since
   `design-system/` is absent on `main`). No init boilerplate survives.
7. **Static detector:** run `npx impeccable detect` against the repo;
   record its output. Refresh path (`npx impeccable update`, re-relocate,
   re-verify symlinks) is documented in AGENTS.md's Frontend section
   (M2) — verify the written text matches observed installer behavior
   and amend if it does not.
8. **Attribution:** Apache-2.0 notice retained (see M7's ledger).
9. **Open item — flag, do not resolve:** `.gitignore` already lists
   `.impeccable/`; whether the detector config `.impeccable/config.json`
   should instead be committed is recorded as an open question for the
   user in Surprises.

### M7 — Emil's animation skills

Clone `https://github.com/emilkowalski/skills` (depth 1) to the
scratchpad; record the commit hash. Copy **exactly four** skill folders
verbatim into `.agents/skills/`: `animate` (with `RECIPES.md`),
`review-animations` (with `STANDARDS.md`, keeping its
`disable-model-invocation: true` frontmatter),
`find-animation-opportunities`, `animation-vocabulary`. Confirm by
listing that none of the excluded eight (ADR-0029) came along.

Create **`.agents/skills/VENDORED.md`** — one attribution ledger:
emilkowalski/skills (MIT, upstream repo + pinned commit, the four copied
skills), impeccable (Apache-2.0, installed version, relocation note),
design-gate (UNLICENSED Carbonteq internal, dissolved per ADR-0029, the
pristine zip on `release-v0` as upstream, what was dropped and why).

### M8 — Verification on main

No file creation — this milestone is the probe battery in Concrete steps
below, run to completion on `main`: full gate, symlink audit, prettier
convergence, the hook probe matrix, the fresh-session smoke test on
`main`, the live-detection empirical check, ADR-0007's roster amendment
(deferred to now so it describes skills that actually exist — per the
root Decision Log), and the close-out grep of plan docs for `:<digits>`
references to files the diff touched.

### M9 — Merge-down + release smoke test

Sequence in Concrete steps. Expected conflict: `docs/adr/README.md`
(index table grows on both sides) — hand-resolve keeping all rows in
numeric order. Note: `release-v0` already carries the plan-commit
versions of ADRs 0027–0029 and the plan docs; if `main`'s copies were
updated during implementation (living-doc updates), the merge favors
`main`'s content for those files. After the merge reaches `release-v0`:
gate, then the fresh-session smoke test (clause 12), then Linear
close-out.

## Concrete steps & validation

All gates bare — never piped (the PreToolUse hook denies pipes without
`pipefail` anyway). `SCRATCH` below means this session's scratchpad
directory.

**Diff guard (before M2, on `main`):**

```bash
git diff main release-v0 -- AGENTS.md .agents/ docs/adr/README.md
```

Per-file: empty diff → safe to edit on `main`. Non-empty → stop, log,
resolve per ADR-0028.

**Source extraction (M4/M5/M6):**

```bash
git show release-v0:docs/design/resources/ai-tells/SKILL.md > "$SCRATCH/ai-tells-SKILL.md"
git show release-v0:docs/design/resources/ai-tells/catalog.md > "$SCRATCH/ai-tells-catalog.md"
git show release-v0:docs/design/resources/design-gate-plugin.zip > "$SCRATCH/design-gate.zip"
unzip -o "$SCRATCH/design-gate.zip" -d "$SCRATCH/design-gate"
git show release-v0:design-system/design-system.md   # + references/, for PRODUCT.md + calibration
```

**Port-claim probe (M2):** read `apps/web/vite.config.ts:20` and grep
`WEB_PORT` in `.env.example`; the AGENTS.md correction states the
fresh-clone default (3000) and names `WEB_PORT`.

**Auto-gate unit probes (M5, before wiring):**

```bash
echo '{"tool_input":{"file_path":"/x/Scene.tsx"}}' | node .agents/scripts/design-gate/auto-gate.mjs
echo '{"tool_input":{"file_path":"/x/Scene.test.tsx"}}' | node .agents/scripts/design-gate/auto-gate.mjs
echo '{"tool_input":{"file_path":"/x/notes.md"}}' | node .agents/scripts/design-gate/auto-gate.mjs
echo '{"tool_input":{"file_path":"/x/server.ts"}}' | node .agents/scripts/design-gate/auto-gate.mjs
```

Expected: first emits JSON whose `additionalContext` contains
`[design-gate]`; the other three emit nothing; all exit 0.

**Wired-hook live probes (M5/M6/M8):** in-session Write of a scratch
`.tsx` (nudge appears as hook context), a scratch `.test.tsx` (silent), a
scratch `.md` (silent from auto-gate, file still auto-formatted —
coexistence), a scratch backend `.ts` (silent). If the freshly-edited
settings hook does not fire mid-session, restart and re-probe; record
which behaviors are live-detected vs restart-required in Surprises (this
is the empirical test of the issue's live-detection claim).

**Leftover-reference and settings-validity probes (M5+):**

```bash
grep -rn "CLAUDE_PLUGIN_ROOT" .agents/ && echo LEFTOVERS || echo clean
node -e "JSON.parse(require('fs').readFileSync('.agents/settings.json','utf8')); console.log('valid')"
```

**Symlink audit (after M5, M6, M7, and in M8):**

```bash
ls -la .claude/
find .claude -maxdepth 1 ! -type l ! -name .
git status --short
```

Expected: exactly four symlinks (`commands`, `skills`, `settings.json`,
`agents`); the find returns nothing; no unexpected untracked real
directories under `.claude/`.

**Playwright manual setup (documented, run once to verify the docs):**

```bash
cd .agents/scripts/design-gate && npm install --omit=dev && npx playwright install chromium
node render.js --file <sample.html> --out /tmp/gate-probe   # smoke the rendered path
```

**impeccable (M6):**

```bash
cp .agents/settings.json "$SCRATCH/settings.json.pre-impeccable"
npx impeccable install --scope=project
readlink .claude/settings.json .claude/skills .claude/agents
npx impeccable detect
```

**Prettier convergence (each milestone, and M8):**

```bash
pnpm format
pnpm turbo lint
```

Run the pair twice; the second `pnpm turbo lint` passing with no
reformat in between is the convergence proof.

**The gate (every milestone commit, and M8):**

```bash
pnpm turbo build typecheck lint test
```

Check the exit status directly.

**Fresh-session smoke test (M8 on `main`, M9 on `release-v0`):** open a
new agent session at the repo root from cold; confirm the new skills are
listed/loadable and the workflow commands load; ask "where do I find the
button spec" — on `main` the design-system router must answer with the
absent-on-main caveat, on `release-v0` it must route into
`design-system/design-system.md`'s decision map; Write a scratch `.tsx`
and observe the auto-gate nudge.

**Close-out grep (M8):**

```bash
grep -rn ':[0-9]\+' docs/plans/root/CAM-14.md docs/plans/frontend/CAM-14.md
```

Any `:<digits>` reference pointing at a file the diff touched is fixed
(the line refs in this plan target untouched probe anchors:
`vite.config.ts`, `eslint.base.js`).

**Merge-down (M9):**

```bash
git checkout development && git merge main
git checkout release-v0 && git merge development
# expected conflict: docs/adr/README.md index table — hand-resolve, keep
# all rows, numeric order; favor main's content for living plan docs/ADRs
pnpm turbo build typecheck lint test
```

Then the fresh-session smoke test on `release-v0`, and Linear close-out.

## Contract coverage

_(maintained by `/implement`, verified by `/review`: one row per root-plan
contract clause this side owns — the test that pins it, or why none can.
Each row must also say **what is asserted**, in one phrase. **At plan
time, only the Clause column and a planned-approach note are filled**;
probe/test identity and assertion phrase are written by `/implement` as
each verification actually lands. Most clauses here are pinned by
behavior probes, not vitest suites — the planned approach names the
probe.)_

| Clause                       | Test (file + name)                                                                                                                                                                                                        | What is asserted         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1 — AGENTS.md frontend       | _planned: read-back of the four edit sites + port-claim probe against vite.config/.env.example_                                                                                                                           | _(filled by /implement)_ |
| 2 — frontend-architecture    | _planned: house-format check (frontmatter shape, body line count); enforcement-claim probe (illegal import → gate fails → revert); architecture skill routes to it_                                                       | _(filled by /implement)_ |
| 3 — design-system router     | _planned: read-back — wraps not duplicates (no copied tables); absent-on-main caveat present; smoke-test question routes correctly on both branches_                                                                      | _(filled by /implement)_ |
| 4 — ADRs + amendments        | _planned: index rows in docs/adr/README.md; amendment lines present in 0007/0008; 0007 roster amended in M8 against skills that exist_                                                                                    | _(filled by /implement)_ |
| 5 — ai-tells adapted         | _planned: grep the adapted copy for Next.js-isms and the three dangling skill names (zero hits); catalog rows for cn()/@theme re-scoped; original absent from main confirmed untouched on release-v0_                     | _(filled by /implement)_ |
| 6 — design-gate dissolved    | _planned: vendor-map reconciliation; CLAUDE_PLUGIN_ROOT grep clean; auto-gate unit probe matrix (nudge/.tsx, silent/.test.tsx+.md+.ts); wired live probes incl. formatter coexistence; no SessionStart entry in settings_ | _(filled by /implement)_ |
| 7 — impeccable               | _planned: post-install symlink audit; hook-path resolution probe; PRODUCT.md section read-back (no boilerplate); npx impeccable detect run recorded_                                                                      | _(filled by /implement)_ |
| 8 — Emil's four skills       | _planned: ls of .agents/skills/ — four present with companion files, excluded eight absent; VENDORED.md ledger read-back_                                                                                                 | _(filled by /implement)_ |
| 9 — precedence written       | _planned: grep for the precedence rule in AGENTS.md + design-system + intent-prep; ai-slop gate-internal note present_                                                                                                    | _(filled by /implement)_ |
| 10 — workflow plumbing       | _planned: read-back of implement.md/review.md rosters + child-plan template example list_                                                                                                                                 | _(filled by /implement)_ |
| 11 — gate green + convergent | _planned: bare gate exit 0 on main and release-v0; format→lint convergence pair run twice_                                                                                                                                | _(filled by /implement)_ |
| 12 — merge-down + smoke      | _planned: merge sequence with README hand-resolve; fresh-session smoke on release-v0 (skills, commands, router question, nudge)_                                                                                          | _(filled by /implement)_ |

## Progress

_(append new entries at the BOTTOM — newest last, timestamped)_

- [x] 2026-09-04 17:15 — M2 — AGENTS.md (sources-of-truth entry, skills
      roster + precedence, design-hooks narrative, port fix to 3000 with
      `WEB_PORT` note, `## Frontend` section, ADR-0028 pointer in
      Branching) + rosters in implement.md/review.md/child-plan template.
      Gate green.
- [x] 2026-09-04 17:35 — M3 — frontend-architecture (105 lines) +
      design-system router (56 lines, short per plan); architecture skill
      routes to both. Enforcement probe run live on main (illegal
      `import "@cambio/domain"` in apps/web fails eslint with the
      boundaries rationale). Both skills live-detected mid-session. Gate
      green.
- [x] 2026-09-04 17:55 — M4 — ai-tells adapted into
      `.agents/skills/ai-tells/` (house frontmatter; repo surfaces replace
      the app/ paths; three dangling skill refs removed; cn()/@theme
      re-scoped as sanctioned; category 8 re-anchored to game-screen
      rhythm; cream-defensibly-intentional calibration; grading anchored
      to tokens.md/voice.md with the pattern-only-on-main fallback). Grep
      for Next.js-isms clean except the deliberate foreign-stack row.
      Live-detected. Gate green.
- [x] 2026-09-04 18:20 — M5 — design-gate dissolved: 7 skills +
      decompose/map/judge agents + 5 scripts/pkg files vendored;
      baseline.md/eval.js/setup.mjs/hooks.json dropped per plan;
      CLAUDE_PLUGIN_ROOT grep clean; `design-gate:gate` renamed `gate` in
      auto-gate; intent-prep Step 0 precedence + real impeccable commands;
      gate advisory/Playwright notes; ai-slop gate-internal note;
      `.claude/agents` symlink added; hook lifted into settings.json in
      single-string format. Unit probe matrix passed (nudge/.tsx, silence
      others); **live probe passed mid-session** (hook fired on scratch
      .tsx immediately after the settings edit); hardcheck.test.js passes
      under `node --test`. Vendored files prettier-formatted (we own the
      fork; upstream diffs go against the pristine zip). Gate green,
      convergent.
- [x] 2026-09-04 18:45 — M6 — impeccable installed
      (`--providers=claude --scope=project`), clobber repaired exactly as
      planned: `.claude/skills` symlink had been replaced by a real dir
      (impeccable relocated to `.agents/skills/impeccable/`, symlink
      restored); agents wrote through the surviving `agents` symlink;
      hooks arrived in `settings.local.json` → lifted into
      `.agents/settings.json` (PostToolUse + Stop, guarded), local file
      deleted. Hook path resolves through the symlink
      (`realpath` → `.agents/`). PRODUCT.md authored from HANDOFF §1 +
      design direction. `npx impeccable detect` exits 0 (clean).
      Impeccable payload prettier-ignored (upstream-refreshed wholesale;
      unlike the owned design-gate fork). Gate green, convergent.
- [ ] M7 — Emil's skills + attribution ledger
- [ ] M8 — verification on main (incl. ADR-0007 roster amendment)
- [ ] M9 — merge-down + release smoke + close-out

## Surprises & notes for the root plan

_(anything the root plan's Decision Log or the reviewer must know)_

- Plan-time: **`docs/design/` and `design-system/` do not exist on
  `main`** (`git ls-tree main` verified) — all vendored sources are
  extracted via `git show release-v0:<path>`; the M4 "original untouched"
  clause is satisfied vacuously on `main` and by non-edit on
  `release-v0`.
- Plan-time: the stale "web :3100" claim traces to the local `.env`
  (`WEB_PORT=3100`) overriding the `.env.example`/vite default of 3000 —
  the correction must state the fresh-clone default, not this machine's.
- Plan-time: the zip's `hooks.json` also carries a SessionStart matcher
  (`startup|resume`) around `setup.mjs` — dropped entirely per ADR-0029,
  not just rewritten.
- Plan-time default to confirm in the root Decision Log: `baseline.md` +
  `eval.js` are **dropped** (their `tests/validation` ground-truth corpus
  is absent from the zip, so the eval harness cannot run); recoverable
  from the pristine zip on `release-v0`.
- Plan-time scoping: vendored gate skills keep upstream prose/frontmatter
  (functional fixes only); house format applies to first-party skills and
  the ai-tells adaptation.
- M3: **`packages/config/test/eslint.base.test.ts` exists only on
  `release-v0`**, not on `main` — the boundary claims in
  `frontend-architecture` were pinned by a live probe here instead of a
  test citation, and the skill cites `MAY_IMPORT` by symbol (not line)
  because `eslint.base.js` itself diverged on the release side.
- M3: skills are **confirmed live-detected mid-session** (the harness
  listed both new skills immediately after their SKILL.md was written) —
  first half of the issue's live-detection claim verified empirically.
