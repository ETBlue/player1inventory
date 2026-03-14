# Design: Move Worktree Creation to Immediately After Brainstorming

## Problem

The current SOP creates the git worktree *after* the implementation plan is written. This means design docs and implementation plans are committed to the feature branch from the main workspace — and the worktree, once created, is behind those commits. The code then lands in the worktree while the docs live in the main workspace. This splits the feature's commit history across two workspaces and requires a sync step.

## Decision

Move worktree creation to immediately after brainstorming — right when the branch is named and created — before writing any docs. All feature work (design doc, implementation plan, code) happens inside the worktree.

## New Feature Lifecycle

1. **Brainstorm** — in main workspace
2. **Create branch + worktree → enter worktree**
3. **Write design doc → commit** (inside worktree)
4. **Write implementation plan → commit** (inside worktree)
5. **Write code → commit** (inside worktree)

## SOP Changes

### 1. "Worktree before implementation (mandatory)" rule

**Old trigger:** After the implementation plan is written, before writing any code.

**New trigger:** After brainstorming is complete and the branch name is derived, before writing the design doc.

### 2. Brainstorming skill's "Write design doc → commit" step

Add: commit happens inside the worktree. The worktree must already exist at this point.

### 3. "Design docs and brainstorming logs must always go through a branch" rule

No change to the rule itself. The implicit location is now the worktree (which checks out that branch).

## What Doesn't Change

- Branch naming conventions (`docs/`, `feature/`, `fix/`, etc.)
- `.worktrees/` directory convention and dash-not-slash naming
- The design doc → implementation plan → code sequence
- All cleanup steps (worktree removal, branch deletion)
