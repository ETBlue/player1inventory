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
echo "$WORKTREE_DIR"
