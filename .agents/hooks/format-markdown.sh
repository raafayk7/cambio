#!/usr/bin/env bash
# PostToolUse hook (Edit|Write matcher): auto-format edited Markdown.
#
# The gate's `lint` runs `prettier --check` repo-wide, so every plan-doc or
# ADR edit fails the gate until formatted — during CAM-7 that cost four red
# gate cycles to forgotten formatting. This hook removes the failure class:
# whenever Claude edits or writes a `.md` file inside the repo, format it
# in place with the repo's own prettier.
#
# Deliberately quiet: a missing prettier binary or a file outside the repo
# is a silent no-op (exit 0) — this hook is a convenience, not a gate. A
# prettier ERROR (rare for Markdown; e.g. the non-convergent broken-code-span
# case documented in AGENTS.md) surfaces on stderr with exit 2 so Claude
# sees it immediately instead of at the next gate run.
set -u

input="$(cat)"
file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)" || exit 0
[ -z "$file" ] && exit 0

case "$file" in
  *.md) ;;
  *) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-}"
[ -z "$root" ] && exit 0
case "$file" in
  "$root"/*) ;;
  *) exit 0 ;; # outside the repo (scratchpad etc.) — not ours to format
esac
[ -f "$file" ] || exit 0

prettier="$root/node_modules/.bin/prettier"
[ -x "$prettier" ] || exit 0

if ! out="$("$prettier" --write "$file" 2>&1)"; then
  echo "format-markdown hook: prettier failed on $file — fix before the gate:" >&2
  echo "$out" >&2
  exit 2
fi
exit 0
