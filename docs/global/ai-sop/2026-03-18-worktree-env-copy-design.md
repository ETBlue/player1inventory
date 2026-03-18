# Design: Copy .env Files on Worktree Creation

**Date:** 2026-03-18
**Status:** Approved
**Branch:** chore/worktree-env-copy

## Problem

The `WorktreeCreate` hook (`worktree-create.sh`) used `ln -sf` to symlink `.env` files from the root repo into new worktrees. In practice the symlinks did not work — Vite and the backend server did not pick up the files. Worktrees created after the hook was added (`608bd01`) still could not run `pnpm dev` without manual intervention.

## Solution

### 1. Fix the hook — `cp` instead of `ln -sf`

Change the loop in `.claude/hooks/worktree-create.sh` to use `cp` instead of `ln -sf`. The guard (`[ -f "$SRC" ]`) and warning on missing files remain unchanged. Log message updated from "Linked" to "Copied".

Affected files:
- `.claude/hooks/worktree-create.sh`

### 2. Document manual fallback in CLAUDE.md

Add explicit `cp` commands to the "Advanced: Git Worktrees" `Setup:` block so agents that create worktrees via raw `git worktree add` (bypassing the hook) know to copy `.env` files themselves.

```bash
# Run from repo root (before cd into the worktree):
cp apps/web/.env.local .worktrees/<feature-xxx>/apps/web/.env.local 2>/dev/null || true
cp apps/server/.env .worktrees/<feature-xxx>/apps/server/.env 2>/dev/null || true
```

The commands use paths relative to the repo root and must be run **before** `cd .worktrees/<feature-xxx>`. The `2>/dev/null || true` silently skips a missing file — matching the hook's `[ -f "$SRC" ]` guard in a copy-pasteable one-liner.

Affected files:
- `CLAUDE.md` — "Advanced: Git Worktrees" > `Setup:` block

## Files Changed

| File | Change |
|------|--------|
| `.claude/hooks/worktree-create.sh` | `ln -sf` → `cp`, log message update |
| `CLAUDE.md` | Add `.env` copy commands to manual worktree setup block |

## Out of Scope

- Existing worktrees (created before this fix) are not backfilled — copy manually if needed.
- No change to `worktree-remove.sh`.
