# Design: Automate pnpm install + codegen in WorktreeCreate Hook

**Date:** 2026-04-01
**Branch:** chore/worktree-hook-setup

## Problem

When creating a git worktree, the `WorktreeCreate` hook currently copies `.env` files automatically, but leaves two manual steps:

1. `pnpm install` — the new worktree has no `node_modules`, so nothing runs until deps are installed
2. `pnpm codegen` — generated GraphQL types (`apps/web/src/generated/graphql.ts`, `apps/server/src/generated/graphql.ts`) are gitignored and must be regenerated before TypeScript compiles cleanly

Without these steps, the developer (or AI agent) must remember to run them manually after every worktree creation.

## Design

### Hook changes (`worktree-create.sh`)

After the `.env` copy loop, add two new steps:

**Step 1 — `pnpm install` (strict)**

```bash
echo "Running pnpm install in worktree..." >&2
pnpm --dir "$WORKTREE_DIR" install >&2
echo "pnpm install complete" >&2
```

Runs under `set -e`. If dependency installation fails, worktree creation aborts with a clear error. A broken `node_modules` is worse than no worktree at all.

**Step 2 — `pnpm codegen` (lenient)**

```bash
echo "Running pnpm codegen in worktree..." >&2
pnpm --dir "$WORKTREE_DIR" codegen >&2 || echo "Warning: codegen failed — run manually before building" >&2
```

Uses `||` to suppress exit-code failure. A fresh branch may not have schema files yet, so codegen failure is expected and should not block worktree creation.

### CLAUDE.md update

The existing note in "Advanced: Git Worktrees":

> "(The EnterWorktree tool handles .env copying automatically via the WorktreeCreate hook)"

Becomes:

> "(The EnterWorktree tool runs `pnpm install` and `pnpm codegen` automatically via the WorktreeCreate hook, in addition to copying `.env` files)"

## Out of Scope

- Running tests as part of worktree creation (slow, fails on broken main)
- Making codegen strict (legitimate to skip on schema-less branches)
- Any changes to the `WorktreeRemove` hook
