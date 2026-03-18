# Worktree .env Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace symlinks with file copies when the `WorktreeCreate` hook provisions `.env` files into a new worktree, and document the manual fallback in CLAUDE.md.

**Architecture:** Two-file change. The hook script (`worktree-create.sh`) is updated to use `cp` instead of `ln -sf`. CLAUDE.md is updated to show the equivalent manual `cp` commands for agents that bypass the hook.

**Tech Stack:** Bash, Markdown

---

### Task 1: Fix the hook — `ln -sf` → `cp`

**Files:**
- Modify: `.claude/hooks/worktree-create.sh`

Context: The hook runs when `EnterWorktree` is used. It currently tries to symlink `.env` files but the symlinks are not picked up by Vite or the backend server. Switching to `cp` produces a real file that all tools can read.

- [ ] **Step 1: Open the hook and locate the symlink line**

Read `.claude/hooks/worktree-create.sh`. Find this block:

```bash
ln -sf "$SRC" "$DEST" >&2
echo "Linked $SRC_RELATIVE into worktree" >&2
```

- [ ] **Step 2: Replace `ln -sf` with `cp`**

Replace the two lines above with:

```bash
cp "$SRC" "$DEST" >&2
echo "Copied $SRC_RELATIVE into worktree" >&2
```

The full loop after the change should look like:

```bash
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
```

- [ ] **Step 3: Verify by creating a test worktree via the hook**

The hook only fires when Claude Code's `EnterWorktree` tool is used — a raw `git worktree add` bypasses it. Test by invoking the hook script directly with a mock JSON payload, or by using `EnterWorktree` in a Claude Code session.

**Option A — invoke hook script directly (fastest):**

```bash
echo '{"name":"test-env-copy","cwd":"'"$(pwd)"'"}' | bash .claude/hooks/worktree-create.sh
```

Expected stdout: absolute path to `.worktrees/test-env-copy`
Expected stderr: lines saying "Copied apps/web/.env.local into worktree" and "Copied apps/server/.env into worktree" (or warning if files don't exist)

Then check the files are regular files (not symlinks):

```bash
ls -la .worktrees/test-env-copy/apps/web/.env.local
ls -la .worktrees/test-env-copy/apps/server/.env
```

Expected: Both files listed as `-rw-r--r--` (regular file, leading `-`), not `l` (symlink).

Clean up:

```bash
git worktree remove --force .worktrees/test-env-copy
git branch -d worktree-test-env-copy
```

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/worktree-create.sh
git commit -m "fix(hooks): copy .env files instead of symlinking on worktree creation"
```

---

### Task 2: Document the manual fallback in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` — "Advanced: Git Worktrees" > `Setup:` block (around line 586)

Context: When an agent creates a worktree via raw `git worktree add` (no `EnterWorktree`), the hook does not run. The SOP should show the manual `cp` commands so agents don't forget this step.

- [ ] **Step 1: Find the Setup block**

Open `CLAUDE.md`. Find:

```markdown
**Setup:**
```bash
# Create worktree in .worktrees/ directory
# Use dashes instead of slashes in the directory name (e.g. feature-xxx, not feature/xxx)
git worktree add .worktrees/<feature-xxx> -b <branch-name>
cd .worktrees/<feature-xxx>
```
```

- [ ] **Step 2: Add the `.env` copy commands before `cd`**

Replace the setup block with:

```markdown
**Setup:**
```bash
# Create worktree in .worktrees/ directory
# Use dashes instead of slashes in the directory name (e.g. feature-xxx, not feature/xxx)
git worktree add .worktrees/<feature-xxx> -b <branch-name>

# Copy .env files from repo root into the worktree (run before cd — paths are relative to root)
# Skip silently if a file doesn't exist
cp apps/web/.env.local .worktrees/<feature-xxx>/apps/web/.env.local 2>/dev/null || true
cp apps/server/.env .worktrees/<feature-xxx>/apps/server/.env 2>/dev/null || true

cd .worktrees/<feature-xxx>
```
```

Note: The `EnterWorktree` tool triggers the `WorktreeCreate` hook which copies `.env` files automatically. The manual `cp` step above is only needed when using raw `git worktree add`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(ai-sop): add manual .env copy step to worktree setup instructions"
```

---

### Final: Verification gate

- [ ] **Run lint and build from `apps/web`**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

All three must pass before finishing the branch.
