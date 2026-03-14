# Always Create Worktree Before Implementation — Design

**Date:** 2026-03-08

## Goal

Enforce that Claude Code always creates a git worktree after writing an implementation plan and before writing any code. This keeps implementation work isolated from main and makes it easy to review, discard, or merge changes.

## Context

The project already has:
- `.worktrees/` convention with custom `WorktreeCreate`/`WorktreeRemove` hooks in `.claude/settings.json`
- A `superpowers:using-git-worktrees` skill that handles directory selection, `.gitignore` verification, and project setup
- A `superpowers:writing-plans` skill that creates implementation plans and then offers execution options

The gap: `writing-plans` doesn't currently mandate worktree creation before handing off to execution. This leads to Claude sometimes starting implementation directly on main.

## Design

### Two-layer enforcement

1. **`writing-plans` SKILL.md** (global, shared across projects)
   - After saving the plan to `docs/plans/` and committing it, add a mandatory hard-gate step
   - Invoke `superpowers:using-git-worktrees` to create an isolated worktree
   - This step runs **before** presenting execution options (subagent-driven vs. parallel session)
   - Cannot be skipped

2. **`CLAUDE.md`** (project-scoped)
   - In the "AI Agent SOP → Workflow → Default Workflow: Git Worktrees" section
   - Add explicit rule: after `writing-plans` completes, always create a worktree before any implementation begins
   - Reinforces the skill-level enforcement with project-specific context

### Branch name derivation

Given a plan filename: `2026-03-08-cooking-expand-collapse-design.md`
- Strip date prefix: `cooking-expand-collapse-design`
- Strip `-design` or `-plan` suffix: `cooking-expand-collapse`
- Prefix with `feature/` by default (use `fix/`, `refactor/`, etc. if plan context suggests it)
- Result: `feature/cooking-expand-collapse`

### No changes to `using-git-worktrees` skill

The skill already handles directory selection (prefers `.worktrees/`), `.gitignore` safety check, and project setup correctly. No modifications needed.

## Files to Modify

1. `/Users/etblue/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.1/skills/writing-plans/SKILL.md`
2. `/Users/etblue/Code/GitHub/player1inventory/CLAUDE.md`
