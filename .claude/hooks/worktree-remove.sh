#!/bin/bash
# WorktreeRemove hook — cleans up git worktrees created by worktree-create.sh
# Input (stdin): JSON with "worktree_path" and "cwd" (project root)
set -e

INPUT=$(cat)
WORKTREE_PATH=$(echo "$INPUT" | jq -r .worktree_path)
CWD=$(echo "$INPUT" | jq -r .cwd)

git -C "$CWD" worktree remove --force "$WORKTREE_PATH" >&2 || rm -rf "$WORKTREE_PATH"
