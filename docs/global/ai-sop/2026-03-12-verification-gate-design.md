# Verification Gate Design

**Date:** 2026-03-12

## Problem

The AI agent sometimes finishes coding and claims "done" without running quality checks. Tests passing is necessary but not sufficient — build errors, type errors, lint violations, and deprecated API usage can all slip through. Additionally, uncommitted changes are sometimes left behind at wrap-up, and design docs occasionally get committed directly to `main`.

## Goals

1. Force the agent to run a full quality gate after each implementation phase
2. Catch deprecated imports (TypeScript `@deprecated` warnings) as part of the gate
3. Ensure all changes are committed before the agent says "done"
4. Prevent design docs and brainstorming logs from being committed directly to `main`

## Non-Goals

- Modifying superpowers skills the project doesn't own (executing-plans, writing-plans)
- Adding per-command configuration — the gate is fixed for this project

## Design

### Part 1: Verification Gate (CLAUDE.md)

Add a new **Verification Gate** subsection under AI Agent SOP.

**Commands (run from `apps/web`):**
```bash
pnpm lint
pnpm build
pnpm build-storybook
pnpm check
```

Note: `pnpm build` runs `tsc -b` which includes type checking, so a separate `typecheck` step is redundant.

**Rules:**
- Run after each implementation phase (each step in an implementation plan)
- If any command fails → stop and fix all errors before proceeding to the next step
- After `pnpm build`, scan the full output for `@deprecated` warnings (TypeScript diagnostic `TS6385`) — treat deprecated usage as a failure even if exit code is 0
- All four commands must pass clean before moving on

### Part 2: Always Commit Before Done (CLAUDE.md)

Add a rule under AI Agent SOP: before telling the user "done", all changes must be committed — code, stories, tests, CLAUDE.md updates, and inline comments. No uncommitted work may remain when wrapping up.

### Part 3: Docs Require a Branch (CLAUDE.md)

Amend the Branch Management section:
- `docs/plans/` and `docs/brainstorming-logs/` must **never** be committed directly to `main`
- They must always go on a feature/fix/docs/chore branch or worktree
- Existing exception preserved: CLAUDE.md typo fixes may still go directly to `main`

### Part 4: verification-before-completion skill

Update the skill to explicitly list the 4 commands and the deprecated-warning scan in its pre-commit/pre-PR checklist. This adds a second enforcement layer at wrap-up time, complementing the per-phase gate.

## Trade-offs

- `build-storybook` is slow (~30–60s). Running it after every phase adds overhead. Accepted — correctness over speed.
- `pnpm build` and `pnpm check` (Biome) overlap partially with `pnpm lint`. Redundancy is intentional — belt-and-suspenders for a gate that must not be skipped.

## Success Criteria

- Agent never claims "done" without having run all 4 commands clean
- Deprecated imports are caught and resolved before commit
- No uncommitted changes remain at wrap-up
- No design docs appear in commits directly on `main`
