#!/bin/bash
# WorktreeCreate hook — creates git worktrees in ./worktrees/ instead of .claude/worktrees/
# Input (stdin): JSON with "name" (slug) and "cwd" (project root)
# Output (stdout): absolute path to created worktree
set -e

INPUT=$(cat)
NAME=$(echo "$INPUT" | jq -r .name)
CWD=$(echo "$INPUT" | jq -r .cwd)
WORKTREE_DIR="$CWD/.worktrees/$NAME"

mkdir -p "$CWD/.worktrees"
git -C "$CWD" worktree add "$WORKTREE_DIR" -b "worktree-$NAME" >&2

# Copy .env files from the root repo into the worktree so `pnpm dev` works without manual copying
for SRC_RELATIVE in "apps/web/.env.local" "apps/server/.env"; do
  SRC="$CWD/$SRC_RELATIVE"
  DEST="$WORKTREE_DIR/$SRC_RELATIVE"
  if [ -f "$SRC" ]; then
    cp "$SRC" "$DEST" >&2
    echo "Copied $SRC_RELATIVE into worktree" >&2
  else
    echo "Warning: $SRC_RELATIVE not found in root — skipping copy" >&2
  fi
done

echo "Running pnpm install in worktree..." >&2
pnpm --dir "$WORKTREE_DIR" install >&2
echo "pnpm install complete" >&2

echo "Running pnpm codegen in worktree..." >&2
pnpm --dir "$WORKTREE_DIR" codegen >&2 || echo "Warning: codegen failed — run manually before building" >&2

echo "$WORKTREE_DIR"
