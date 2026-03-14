# Audit Completeness Before Finishing a Branch — Design

**Date:** 2026-03-08

## Goal

Enforce that Claude Code always audits docs, Storybook stories, tests, design docs, and inline comments before completing a branch — via a hard gate in the `finishing-a-development-branch` skill and a reinforcing rule in `CLAUDE.md`.

## Context

The `finishing-a-development-branch` skill currently runs: verify tests → present 4 options → execute. There is no check ensuring that documentation, stories, and tests are current before the branch is merged or a PR is created.

CLAUDE.md already has a "Component Development" section and a "Documentation Updates" section describing what should be updated before a PR, but these are advisory — not enforced at the skill level.

## Design

### New Step 1.5: Audit Completeness

Insert a new step between Step 1 (verify tests) and Step 2 (determine base branch) in `finishing-a-development-branch` SKILL.md. This step applies to **all** completion paths (merge, PR, keep, discard).

**The 5 checks** (all run against `git diff` of the current branch vs. base branch):

1. **CLAUDE.md** — Did any architecture, commands, patterns, or shared components change? If so, is the relevant CLAUDE.md section updated?
2. **Storybook stories** — For every new or modified component file (`.tsx` in `src/components/` or routes), does a corresponding `.stories.tsx` exist and look current?
3. **Tests** — For every new or modified behavior (hooks, db operations, routes), does a corresponding `.test.ts` / `.test.tsx` exist and cover it?
4. **Design docs** (`docs/plans/`) — If this branch has a linked plan file, does the implementation match it, or did it diverge in ways worth noting?
5. **Inline comments** — Are there any code comments that reference removed/renamed things, or contradict the current logic?

**Output:** A single consolidated gap report listing all gaps found across all 5 checks.

**Hard gate:**

```
Found N gaps. Should I fix these before we proceed? Or type **skip** to continue as-is.
```

- If user says yes/fix: Claude fixes all gaps, then re-runs the 5 checks to confirm clean
- If user types "skip": bypass the gate and proceed to Step 2
- Any other response: treat as "yes, fix"

### Two-layer enforcement

1. **`finishing-a-development-branch` SKILL.md** (global) — The hard gate lives here, structurally enforced for all projects using the skill.

2. **`CLAUDE.md`** (project-scoped) — Add a note under "AI Agent SOP → Before Finishing a Branch" listing the same 5 checks and referencing the skill.

### No changes to other skills

The audit is self-contained within the finishing skill. No delegation to other skills needed.

## Files to Modify

1. `/Users/etblue/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.1/skills/finishing-a-development-branch/SKILL.md`
2. `/Users/etblue/Code/GitHub/player1inventory/CLAUDE.md`
