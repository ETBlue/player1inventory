# AI Agent Workflow: TDD for Bug Fixes + Human Code Change Audit

Date: 2026-03-09

## Problem

Two gaps in the current AI Agent SOP:

1. When the user reports a bug after an implementation, the AI agent sometimes fixes it without writing a test first.
2. When the user makes manual code edits and asks the AI agent to commit, the agent may commit without auditing or updating tests, Storybook stories, or docs.

## Design

### Bug Fix TDD Enforcement

**Two-layer approach for maximum reliability:**

**Layer 1 — CLAUDE.md rule (project-level mandate):**

Add a "Bug Fixes" subsection to the AI Agent SOP section of CLAUDE.md:

- When the user reports a bug, treat it as substantive unless it's clearly a typo or cosmetic issue
- Required sequence:
  1. Invoke `superpowers:systematic-debugging` to diagnose before proposing any fix
  2. Invoke `superpowers:test-driven-development` to write a failing test that reproduces the bug before writing the fix
  3. Implement the fix until the test passes

**Layer 2 — Skill trigger descriptions (execution-level reminder):**

- `systematic-debugging`: add "Use when user reports a bug after implementation — even if the fix seems obvious"
- `test-driven-development`: add "Use for all bug fixes where the agent writes code, before touching any implementation"

### Human Code Change Workflow

Add a "Human Code Changes" subsection to the AI Agent SOP section of CLAUDE.md:

When the user asks the AI agent to commit code they wrote manually:

1. Run `git diff` to review what changed
2. For each modified component or behavior: check if tests exist and are up to date — add or update as needed
3. For each modified component: check if Storybook stories exist and are up to date — add or update as needed
4. Update CLAUDE.md and inline docs if architecture or patterns changed
5. Only then commit — include test/story/doc updates in the same commit as the code

**Key principle:** Human code changes are treated the same as agent-authored changes — no "just commit it" shortcut.

## Scope

- Update `CLAUDE.md` — add two subsections to AI Agent SOP
- Update skill trigger descriptions for `systematic-debugging` and `test-driven-development`

## Out of Scope

- Trivial bug fixes (typos, cosmetic-only changes) — these skip the TDD sequence
- Human changes to non-code files (docs, config) — no Storybook/test audit needed
