# Always Create Worktree Before Implementation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce that Claude Code always creates a git worktree after writing an implementation plan and before writing any code, via two-layer enforcement: a mandatory step added to the `writing-plans` skill and a reinforcing rule in `CLAUDE.md`.

**Architecture:** Two text edits — one to the shared `writing-plans` SKILL.md (inserts a mandatory hard-gate worktree creation step before the execution handoff), and one to the project `CLAUDE.md` (adds an explicit rule in the AI Agent SOP Workflow section). No code, no tests — these are configuration and skill file changes.

**Tech Stack:** Markdown, Claude Code skills system

---

### Task 1: Update `writing-plans` SKILL.md — add mandatory worktree creation step

**Files:**
- Modify: `/Users/etblue/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.1/skills/writing-plans/SKILL.md:97-116`

**Step 1: Read the current Execution Handoff section**

Open the file and confirm lines 97–116 contain the "Execution Handoff" section starting with `## Execution Handoff`.

**Step 2: Insert the worktree hard-gate block before the execution choice**

Replace the `## Execution Handoff` section with the updated version below. The new block adds a `## Worktree Creation (Mandatory)` section immediately before the execution handoff.

Find this exact text:
```markdown
## Execution Handoff

After saving the plan, offer execution choice:
```

Replace with:
```markdown
## Worktree Creation (Mandatory)

<HARD-GATE>
After saving the plan and before offering execution options, you MUST create a git worktree.
Do NOT present execution options until the worktree exists.
</HARD-GATE>

**Invoke:** `superpowers:using-git-worktrees`

**Branch name derivation** (auto-derive, no need to ask user):
1. Take the plan filename (e.g. `2026-03-08-cooking-expand-collapse-design.md`)
2. Strip the date prefix: `cooking-expand-collapse-design`
3. Strip `-design` or `-plan` suffix if present: `cooking-expand-collapse`
4. Add appropriate prefix based on plan context:
   - New feature → `feature/cooking-expand-collapse`
   - Bug fix → `fix/cooking-expand-collapse`
   - Refactor → `refactor/cooking-expand-collapse`
   - Default to `feature/` when unclear
5. Announce the derived branch name before creating the worktree

## Execution Handoff

After creating the worktree, offer execution choice:
```

**Step 3: Verify the edit looks correct**

Read the file and confirm:
- `## Worktree Creation (Mandatory)` section appears before `## Execution Handoff`
- The `<HARD-GATE>` block is present
- Branch name derivation steps are present
- "After saving the plan, offer execution choice" is now "After creating the worktree, offer execution choice"

**Step 4: Commit**

```bash
git -C /Users/etblue/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.1 add skills/writing-plans/SKILL.md
git -C /Users/etblue/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.1 commit -m "feat(writing-plans): require worktree creation before execution handoff"
```

Note: if the plugins directory is not a git repo, skip the commit step — the file edit alone is sufficient.

---

### Task 2: Update `CLAUDE.md` — add worktree rule to AI Agent SOP Workflow section

**Files:**
- Modify: `/Users/etblue/Code/GitHub/player1inventory/CLAUDE.md` (around line 582)

**Step 1: Find the target location**

Locate the "Default Workflow: Git Worktrees" subsection. It reads:

```markdown
**Default Workflow: Git Worktrees**

Use git worktrees by default for feature work. Create isolated workspaces in `.worktrees/` directory. See "Advanced: Git Worktrees" section below for setup details.
```

**Step 2: Insert the implementation rule**

Replace that block with:

```markdown
**Default Workflow: Git Worktrees**

Use git worktrees by default for feature work. Create isolated workspaces in `.worktrees/` directory. See "Advanced: Git Worktrees" section below for setup details.

**Worktree before implementation (mandatory):** After the implementation plan is written (via `writing-plans` skill) and before writing any code, always create a git worktree using `superpowers:using-git-worktrees`. Branch name is auto-derived from the plan topic (strip date and `-design`/`-plan` suffix, prefix with `feature/`, `fix/`, or `refactor/` based on context).
```

**Step 3: Verify the edit**

Read the section and confirm the new paragraph is present directly after the "Default Workflow" intro paragraph.

**Step 4: Commit**

```bash
cd /Users/etblue/Code/GitHub/player1inventory
git add CLAUDE.md
git commit -m "docs(sop): require worktree creation after writing-plans before implementation"
```
