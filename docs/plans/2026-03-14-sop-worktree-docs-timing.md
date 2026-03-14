# SOP: Worktree Docs Timing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update CLAUDE.md so the worktree is created immediately after brainstorming (before writing the design doc), making the worktree the single workspace for all feature work.

**Architecture:** Two targeted edits to `CLAUDE.md` — the "Branch Management" paragraph and the "Worktree before implementation (mandatory)" rule. No code changes, no tests, no Storybook stories.

**Tech Stack:** Markdown, git

---

### Task 1: Update "Branch Management" paragraph

**Files:**
- Modify: `CLAUDE.md:462-470`

**Step 1: Open the file and locate the paragraph**

Find this exact text in `CLAUDE.md` (around line 462):

```
After completing a brainstorming session and before documenting the results, create a new branch. This branch will contain all related work:
- The brainstorming log itself
- Any design documents produced
- Implementation plans
- The actual code implementation

The timing is important: create the branch after brainstorming is complete but before writing the design document. This keeps all related work isolated and makes it easy to review the complete feature or change in one PR.
```

**Step 2: Replace with updated paragraph**

```
After completing a brainstorming session and before documenting the results, create a new branch and worktree, then enter the worktree. All feature work happens inside the worktree from this point on:
- The design document
- The brainstorming log
- Implementation plans
- The actual code implementation

The timing is important: create the branch and worktree after brainstorming is complete but before writing the design document. This keeps all related work in one place and ensures the entire feature history (docs + code) lives in the worktree.
```

**Step 3: Verify the edit looks correct**

Read the modified section and confirm the paragraph accurately describes the new flow.

**Step 4: Do not commit yet** — continue to Task 2.

---

### Task 2: Update "Worktree before implementation (mandatory)" rule

**Files:**
- Modify: `CLAUDE.md:476`

**Step 1: Locate the rule**

Find this exact text in `CLAUDE.md` (around line 476):

```
**Worktree before implementation (mandatory):** After the implementation plan is written (via `writing-plans` skill) and before writing any code, always create a git worktree using `superpowers:using-git-worktrees` (or follow the manual steps in "Advanced: Git Worktrees" below if the skill is unavailable). Branch name is auto-derived from the plan topic: strip the `YYYY-MM-DD-` date prefix and `-design`/`-plan` suffix, then prefix with `feature/`, `fix/`, or `refactor/` based on context (e.g. `2026-03-08-cooking-expand-design.md` → `feature/cooking-expand`).
```

**Step 2: Replace with updated rule**

```
**Worktree before implementation (mandatory):** After brainstorming is complete and the branch name is derived, before writing the design doc, always create a git worktree using `superpowers:using-git-worktrees` (or follow the manual steps in "Advanced: Git Worktrees" below if the skill is unavailable). All subsequent work — design doc, implementation plan, and code — happens inside the worktree. Branch name is derived from the brainstorming topic: choose `feature/`, `fix/`, `refactor/`, or `docs/` prefix based on context, then add a short kebab-case topic (e.g. brainstorming about cooking expand/collapse → `feature/cooking-expand`).
```

**Step 3: Verify the edit looks correct**

Read the modified section and confirm the rule accurately describes the new trigger and flow.

**Step 4: Commit both changes together**

```bash
git add CLAUDE.md
git commit -m "docs(sop): move worktree creation to immediately after brainstorming

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

Expected: commit succeeds, `git status` shows clean working tree.
