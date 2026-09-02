#!/usr/bin/env bash
# Regression cases for block-piped-gate.sh. Run manually:
#   bash .agents/hooks/block-piped-gate.test.sh
# Exits non-zero on the first mismatch. Each case feeds a PreToolUse payload
# (a JSON object with .tool_input.command) into the hook and checks whether it
# denies (hook prints JSON, exit 0) or allows (no output, exit 0).
set -u
here="$(cd "$(dirname "$0")" && pwd)"
hook="$here/block-piped-gate.sh"
fails=0

# check <expect: deny|allow> <command>
check() {
  local expect="$1" cmd="$2" out
  out="$(printf '%s' "$cmd" | jq -Rs '{tool_input:{command:.}}' | bash "$hook")"
  local got="allow"
  [ -n "$out" ] && got="deny"
  if [ "$got" != "$expect" ]; then
    printf 'FAIL: expected %s, got %s for:\n  %s\n' "$expect" "$got" "$cmd" >&2
    fails=$((fails + 1))
  fi
}

# --- Must DENY: a gate genuinely piped ---
check deny 'pnpm turbo build typecheck lint test | tail'
check deny 'pnpm turbo build typecheck lint test 2>&1 | tail -30'
check deny 'pnpm turbo test | grep foo'
check deny 'pnpm --filter @cambio/api test | tail'
check deny 'pnpm --filter @cambio/api run build | cat'
check deny 'turbo run build | tail'
check deny 'pnpm typecheck|head'

# --- Must ALLOW: the opt-in ---
check allow 'set -o pipefail; pnpm turbo build typecheck lint test | tail'

# --- Must ALLOW: gate bare (no pipe) ---
check allow 'pnpm turbo build typecheck lint test'
check allow 'pnpm --filter @cambio/api test'

# --- Must ALLOW: gate not the piped command (regression: the false positives) ---
# && chains: the pipe feeds the non-gate right-hand side; gate exit stands.
check allow 'pnpm --filter @cambio/api typecheck && npx vitest run Foo 2>&1 | tail'
# A heredoc/body whose text mentions the gate, with a pipe on another command.
check allow "$(printf 'cat > b.md <<EOF\nrun pnpm turbo build typecheck lint test\nEOF\ngh pr create --body-file b.md | tail')"
# git diff range next to an unrelated pipe.
check allow 'git diff release-v0...HEAD | tail'
# Escaped \| in a grep pattern that also names the gate — not a shell pipe.
check allow 'grep -n "gate\|pnpm turbo\|cache" file.md'
# Gate mentioned in a quoted arg, no pipe at all.
check allow 'echo "run pnpm turbo build typecheck lint test"'
# A pipe with no gate anywhere.
check allow 'ls -la | grep foo'
# gate || fallback (|| is not a pipe).
check allow 'pnpm turbo build typecheck lint test || echo failed'

if [ "$fails" -eq 0 ]; then
  echo "all cases passed"
else
  echo "$fails case(s) failed" >&2
  exit 1
fi
