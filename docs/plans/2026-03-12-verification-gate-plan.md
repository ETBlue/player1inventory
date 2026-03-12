# Verification Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce a full quality gate (lint + build + build-storybook + check + deprecated-import scan) after each implementation phase, require all changes to be committed before wrap-up, and prevent design docs from landing on `main`.

**Architecture:** Three CLAUDE.md edits add new project-level rules. One skill file edit (verification-before-completion) adds the gate to the pre-commit checklist. No code changes — this is pure SOP.

**Tech Stack:** CLAUDE.md (project instructions), superpowers skill files (YAML/Markdown)

**Note:** The worktree `.worktrees/chore-verification-gate` on branch `chore/verification-gate` already exists. All work happens there.

---

### Task 1: Add Verification Gate section to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (under `## AI Agent SOP`, after `### Bug Fixes` section)

**Step 1: Locate the insertion point**

Find the `### Bug Fixes` section heading in `CLAUDE.md`. The new `### Verification Gate` section goes immediately after it (before `### Human Code Changes`).

Run:
```bash
grep -n "### Bug Fixes\|### Human Code Changes" CLAUDE.md
```

Expected: two line numbers, e.g. line 650 and line 663.

**Step 2: Insert the Verification Gate section**

Insert the following block between `### Bug Fixes` and `### Human Code Changes`:

```markdown
### Verification Gate

After each implementation phase (each numbered step in an implementation plan), run the full quality gate from the `apps/web` directory:

```bash
cd apps/web && pnpm lint && pnpm build && pnpm build-storybook && pnpm check
```

**Rules:**
- If any command fails → stop and fix all errors before proceeding to the next step
- After `pnpm build`, scan the **full output** for `@deprecated` warnings (TypeScript diagnostic `TS6385`) — treat deprecated import usage as a failure even if the exit code is 0
- All four commands must pass clean (zero errors, zero deprecation warnings) before moving on

**Applies to:** all implementation workflows — executing-plans, subagent-driven-development, and manual coding sessions.

```

**Step 3: Verify the edit looks correct**

Read the surrounding lines to confirm the section is in the right place and formatting is clean (correct heading level, blank lines between sections).

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(sop): add verification gate rule to CLAUDE.md"
```

---

### Task 2: Add "Always Commit Before Done" rule to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (under `## AI Agent SOP`, after the new `### Verification Gate` section)

**Step 1: Locate the insertion point**

The new `### Always Commit Before Done` section goes immediately after `### Verification Gate` (before `### Human Code Changes`).

**Step 2: Insert the section**

```markdown
### Always Commit Before Done

Before telling the user "done" (or any equivalent wrap-up signal), **all changes must be committed** — no exceptions:

- Code files
- Storybook stories
- Tests
- CLAUDE.md updates
- Inline comments

Run `git status` to confirm the working tree is clean before wrapping up. If any uncommitted changes remain, commit them first.

```

**Step 3: Verify the edit**

Read the surrounding lines to confirm correct placement and formatting.

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(sop): add always-commit-before-done rule to CLAUDE.md"
```

---

### Task 3: Update Branch Management to prohibit docs on main

**Files:**
- Modify: `CLAUDE.md` (within `### Workflow` → `**Exceptions:**` block)

**Step 1: Locate the Exceptions block**

Find the paragraph that begins `Quick documentation fixes (like fixing a typo in CLAUDE.md) can go directly to main without asking.`

Run:
```bash
grep -n "Quick documentation fixes" CLAUDE.md
```

**Step 2: Replace the Exceptions block**

Find this text:
```
**Exceptions:**

For minor changes that don't require brainstorming, ask the user whether to create a branch or commit directly to main. This applies to:
- Small bug fixes
- Typo corrections
- Simple configuration changes
- Other trivial updates

Quick documentation fixes (like fixing a typo in CLAUDE.md) can go directly to main without asking.
```

Replace with:
```
**Exceptions:**

For minor changes that don't require brainstorming, ask the user whether to create a branch or commit directly to main. This applies to:
- Small bug fixes
- Typo corrections
- Simple configuration changes
- Other trivial updates

Quick documentation fixes (like fixing a typo in CLAUDE.md) can go directly to main without asking.

**Design docs and brainstorming logs must never be committed directly to `main`:**
- `docs/plans/` — always requires a branch or worktree
- `docs/brainstorming-logs/` — always requires a branch or worktree

This applies even for minor additions. The CLAUDE.md typo exception does not extend to these directories.
```

**Step 3: Verify the edit**

Read the surrounding lines to confirm the addition is correctly placed within the Exceptions block.

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(sop): prohibit design docs and brainstorming logs on main branch"
```

---

### Task 4: Update verification-before-completion skill

**Files:**
- Modify: `~/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.1/skills/verification-before-completion/SKILL.md`

> **Note:** This file lives in the superpowers plugin cache. Edits persist until the plugin is updated. If the plugin updates and overwrites this file, the rules in CLAUDE.md (Tasks 1–3) remain authoritative.

**Step 1: Read the current skill file**

Read the full file to understand the existing structure before editing.

**Step 2: Locate the Common Failures table**

Find the table under `## Common Failures`. It currently has rows for Tests, Linter, Build, Bug fixed, etc.

**Step 3: Add project-specific verification block**

After the `## When To Apply` section (near the end of the file), add a new section:

```markdown
## Project-Specific Gate (Player 1 Inventory)

For this project, "verification" means running all four commands clean from `apps/web`:

```bash
cd apps/web && pnpm lint && pnpm build && pnpm build-storybook && pnpm check
```

Additionally, scan the full `pnpm build` output for `@deprecated` warnings (TypeScript `TS6385`). Deprecated imports are a failure even when exit code is 0.

All four commands must pass AND no deprecation warnings before any completion claim.
```

**Step 4: Verify the edit**

Read the modified section to confirm formatting is clean and the section is appended at the right place.

**Step 5: Commit**

```bash
# Committed from the worktree - only CLAUDE.md changes are in scope for this commit
# The skill file lives outside the repo, so it cannot be committed here.
# No commit needed for this task.
```

> **Note:** The skill file is outside the git repo (`~/.claude/...`), so it cannot be tracked in version control. The edit is manual and persists in the local environment only. The CLAUDE.md rules (Tasks 1–3) are the durable enforcement mechanism.

---

### Task 5: Final verification and wrap-up

**Step 1: Review all CLAUDE.md changes**

Run:
```bash
git diff main CLAUDE.md
```

Confirm all three new sections are present and correctly formatted:
- `### Verification Gate`
- `### Always Commit Before Done`
- The updated `**Exceptions:**` block

**Step 2: Confirm clean working tree**

```bash
git status
```

Expected: nothing to commit.

**Step 3: Invoke finishing-a-development-branch skill**

Use `superpowers:finishing-a-development-branch` to complete the branch.
