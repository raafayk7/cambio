#!/usr/bin/env bash
# PreToolUse hook (Bash matcher): never pipe the gate (AGENTS.md).
#
# `pnpm turbo … | tail` (or any pipe) replaces the gate's exit code with the
# filter's — a broken build has been committed that way twice (once pre-CAM-1,
# once during CAM-5's M4). This hook mechanizes the rule: a Bash command that
# pipes a gate invocation is denied unless it opts in with `set -o pipefail`.
#
# Scope: pnpm turbo …, bare turbo …, and pnpm[ --filter <pkg>][ run]
# build/typecheck/lint/test. Deliberately NOT matched: `pnpm vitest run …`,
# `pnpm --filter … migrate`, and other dev-iteration commands — the rule
# guards the gate, not every pipe.
#
# What counts as "piping the gate" — and what deliberately does NOT:
#   The gate invocation must be the LEFT-hand side of a real shell pipe, in
#   the same simple-command (no `;`, `&&`, `||`, or newline between them). We
#   check gate-then-pipe ADJACENCY in one pattern rather than "a gate string
#   somewhere AND a pipe somewhere" — the latter false-fired on unrelated
#   commands whose text merely mentioned the gate (a `--body-file` whose
#   content named it, a `git diff X...HEAD` alongside a `| tail`, etc.).
#   Specifically NOT blocked:
#     - `gate && other | tail`   — the pipe feeds `other`; gate's exit stands.
#     - `cmd | tail` where a heredoc/arg elsewhere merely contains the gate
#       text (grep stays line-based, so the gate line and the pipe line are
#       judged separately).
#     - `grep "a\|b\|pnpm turbo" f` — an ESCAPED `\|` is grep alternation, not
#       a shell pipe (we require the pipe to be unescaped).
#     - `pnpm turbo … 2>&1 | tail` IS still blocked — redirections are scrubbed
#       first so `2>&1` doesn't read as a separator.
#   Known residual (accepted): `echo "pnpm turbo build" | cat` — a gate string
#   quoted then piped on ONE line — still trips. Rare; use `set -o pipefail`
#   or restructure. Regex cannot tell a quoted string from a command.
set -u

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)" || exit 0
[ -z "$cmd" ] && exit 0

# Explicit opt-in: pipefail restores the gate's exit code through a pipe.
case "$cmd" in
  *"set -o pipefail"*) exit 0 ;;
esac

# Scrub redirections that contain `&` (`2>&1`, `>&2`, `&>file`) so their `&`
# is not mistaken for a `&&`/background separator between gate and pipe.
scrubbed="$(printf '%s' "$cmd" | sed -E 's/[0-9]*[<>]&[0-9-]*//g; s/&>>?/ /g')"

# A gate invocation immediately followed (args/redirs only, no separator) by a
# real, unescaped single pipe. The run `[^|;&()\\]*` excludes separators AND
# backslash, so an escaped `\|` cannot masquerade as a pipe; `([^|]|$)` rules
# out `||`. grep stays line-based on purpose (see header).
printf '%s' "$scrubbed" |
  grep -qE '(pnpm +(turbo\b|(-r +)?(--filter +[^ ]+ +)?(run +)?(build|typecheck|lint|test)\b)|(^|[;&|( ])turbo +(run +)?[a-z])[^|;&()\\]*[|]([^|]|$)' ||
  exit 0

cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Blocked by .agents/hooks/block-piped-gate.sh: this pipes a gate command, so the pipe's exit code would replace the gate's (AGENTS.md: never pipe the gate — broken builds have been committed this way). Run the gate bare and check its exit status directly; if output must be filtered, prefix the command with `set -o pipefail`."}}
JSON
