# Worktree Directory Naming Convention

**Date:** 2026-02-23

## Problem

Git branch names with slashes (e.g. `feature/xxx`) create subfolders when used as worktree directory paths (e.g. `.worktrees/feature/xxx` creates a `feature/` subdirectory inside `.worktrees/`). This adds unnecessary nesting.

## Decision

Use dashes instead of slashes for worktree directory names to keep `.worktrees/` flat:

- Directory: `.worktrees/feature-xxx` ✓
- Directory: `.worktrees/feature/xxx` ✗ (creates subfolder)

The git branch name (passed to `-b`) can still use any format.

## Changes

Update the "Advanced: Git Worktrees" section in `CLAUDE.md`:
- Separate the directory name placeholder from the branch name placeholder in the example
- Add explicit note about using dashes instead of slashes in directory names
