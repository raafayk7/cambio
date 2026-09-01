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
set -u

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)" || exit 0
[ -z "$cmd" ] && exit 0

# Explicit opt-in: pipefail restores the gate's exit code through a pipe.
case "$cmd" in
  *"set -o pipefail"*) exit 0 ;;
esac

# A lone | (a real pipe — not the || operator).
printf '%s' "$cmd" | grep -qE '(^|[^|])\|($|[^|])' || exit 0

# A gate invocation present in the same command.
printf '%s' "$cmd" |
  grep -qE 'pnpm +(turbo\b|(-r +)?(--filter +[^ ]+ +)?(run +)?(build|typecheck|lint|test)\b)|(^|[;&( ])turbo +(run +)?[a-z]' ||
  exit 0

cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Blocked by .agents/hooks/block-piped-gate.sh: this pipes a gate command, so the pipe's exit code would replace the gate's (AGENTS.md: never pipe the gate — broken builds have been committed this way). Run the gate bare and check its exit status directly; if output must be filtered, prefix the command with `set -o pipefail`."}}
JSON
