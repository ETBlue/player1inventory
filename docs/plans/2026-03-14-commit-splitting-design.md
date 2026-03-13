# Commit Splitting Design

**Date:** 2026-03-14

## Problem

When the agent commits changes — whether human-authored ("commit my changes") or agent-authored (end of a task) — it tends to bundle all diffs into a single commit. This makes history harder to read, review, and bisect.

## Goals

1. Agent always splits commits by logical purpose/concern
2. Tests and stories travel with their feature code (not in a separate layer-based commit)
3. When changes can't be cleanly split, agent combines them with a note explaining why
4. Rule applies to both human-triggered commits and agent-authored commits

## Non-Goals

- Splitting agent commits mid-task (TDD red-green cycles remain atomic per task)
- Automating the split via git tooling — agent uses judgment

## Design

### Part 1: New `### Commit Splitting` section (CLAUDE.md)

Add a dedicated section under AI Agent SOP defining the grouping algorithm:

**Grouping algorithm:**
1. Run `git diff` (staged + unstaged) to survey all changes
2. Group changes by logical concern — each distinct purpose becomes one commit:
   - Bug fix A → commit 1
   - New feature B (+ its tests + its stories) → commit 2
   - Config/docs update → commit 3
3. Tests and stories for a feature travel in the same commit as the feature code (not split by file type)
4. Best-effort when inseparable: if a change genuinely spans concerns (e.g. a refactor that also fixes an incidental bug), combine them into one commit whose message explains the mix (e.g. `refactor(items): extract helper — also fixes off-by-one in quantity calc`)

**Trigger:** This rule applies every time the agent commits, regardless of what triggered the commit.

### Part 2: Update `### Human Code Changes`

Before the final "commit" step, add: "Split the diff into logical groups per the Commit Splitting rule. Make one commit per group."

### Part 3: Update `### Commits`

Add a reference line: "When committing, apply the Commit Splitting rule above — one commit per logical concern."

## Trade-offs

- Agent must use judgment about what constitutes a "logical concern" — this is intentionally flexible, not mechanical
- When uncertain, agent should lean toward more commits rather than fewer
- Large-scale refactors that touch many files for one purpose are still one commit — size alone is not a reason to split
