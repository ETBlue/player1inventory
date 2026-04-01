# Worktree Hook Setup Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate `pnpm install` and `pnpm codegen` in the `WorktreeCreate` hook so every new worktree is fully ready to use without manual steps.

**Architecture:** Append two steps to `.claude/hooks/worktree-create.sh` after the existing `.env` copy loop. `pnpm install` runs strict (exits on failure); `pnpm codegen` runs lenient (warns on failure, continues). Update the CLAUDE.md note to reflect all three automated steps.

**Tech Stack:** Bash, pnpm

---

### Task 1: Add `pnpm install` and `pnpm codegen` to the WorktreeCreate hook

**Files:**
- Modify: `.claude/hooks/worktree-create.sh:25` (insert after the `.env` copy loop, before the final `echo`)

- [ ] **Step 1: Open the hook and locate the insertion point**

The file currently ends with:

```bash
done

echo "$WORKTREE_DIR"
```

Insert the two new steps between `done` and `echo "$WORKTREE_DIR"`.

- [ ] **Step 2: Add `pnpm install` (strict)**

```bash
echo "Running pnpm install in worktree..." >&2
pnpm --dir "$WORKTREE_DIR" install >&2
echo "pnpm install complete" >&2
```

`set -e` is already active at the top of the script, so any non-zero exit from `pnpm install` aborts the hook.

- [ ] **Step 3: Add `pnpm codegen` (lenient)**

```bash
echo "Running pnpm codegen in worktree..." >&2
pnpm --dir "$WORKTREE_DIR" codegen >&2 || echo "Warning: codegen failed — run manually before building" >&2
```

The `||` swallows the non-zero exit so the hook continues even if codegen fails.

- [ ] **Step 4: Verify the final file looks like this**

```bash
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
```

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/worktree-create.sh
git commit -m "chore(hooks): run pnpm install and codegen on worktree creation"
```

---

### Task 2: Update CLAUDE.md to reflect all three automated steps

**Files:**
- Modify: `CLAUDE.md:381`

- [ ] **Step 1: Replace the EnterWorktree note**

Find (line 381):
```
(The EnterWorktree tool handles .env copying automatically via the WorktreeCreate hook)
```

Replace with:
```
(The EnterWorktree tool runs `pnpm install` and `pnpm codegen` automatically via the WorktreeCreate hook, in addition to copying `.env` files)
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): update WorktreeCreate hook description to include pnpm install and codegen"
```
