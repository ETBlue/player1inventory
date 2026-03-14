# AI Agent Workflow: TDD for Bug Fixes + Human Code Change Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce TDD for agent-authored bug fixes and require a test/storybook/docs audit before committing human-authored code changes.

**Architecture:** Two CLAUDE.md subsections added to "AI Agent SOP" for the new workflows. Two cached skill SKILL.md files updated to strengthen trigger descriptions. No code changes — documentation and workflow only.

**Tech Stack:** Markdown, CLAUDE.md conventions

---

### Task 1: Add "Bug Fixes" subsection to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (after line 557, before the `### CSS Variable Renames` section)

**Step 1: Insert the new subsection**

In `CLAUDE.md`, find the line `### CSS Variable Renames` (currently around line 558).
Insert the following block immediately before it:

```markdown
### Bug Fixes

When the user reports a bug (post-implementation or otherwise), treat it as **substantive** unless it is clearly a typo or cosmetic-only change. Required sequence — no shortcuts:

1. Invoke `superpowers:systematic-debugging` to diagnose the root cause before proposing any fix
2. Invoke `superpowers:test-driven-development` to write a **failing test** that reproduces the bug before writing the fix
3. Implement the fix until the test passes

This applies even when the fix seems obvious. The test serves as a regression guard.
```

**Step 2: Verify the file looks correct**

Read lines 555–575 of `CLAUDE.md` and confirm the new section appears between `### Component Development` and `### CSS Variable Renames`.

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(sop): require TDD sequence for substantive bug fixes"
```

---

### Task 2: Add "Human Code Changes" subsection to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (after the new "Bug Fixes" section, still before `### CSS Variable Renames`)

**Step 1: Insert the new subsection**

Immediately after the "Bug Fixes" subsection added in Task 1, insert:

```markdown
### Human Code Changes

When the user asks the AI agent to commit code they wrote manually (e.g. "commit my changes", "commit this"):

1. Run `git diff` to review exactly what changed
2. For each modified component or behavior: check if tests exist and are up to date — add or update tests as needed
3. For each modified component: check if Storybook stories exist and are up to date — add or update stories as needed
4. Update `CLAUDE.md` and inline comments if architecture or patterns changed
5. Only then commit — include test/story/doc updates **in the same commit** as the human's code

Human code changes receive the same completeness audit as agent-authored changes. There is no "just commit it" shortcut.

**Exceptions:** Changes to non-code files only (docs, config, assets) do not require a test/Storybook audit.
```

**Step 2: Verify the file looks correct**

Read the surrounding lines to confirm both new sections appear cleanly between `### Component Development` and `### CSS Variable Renames`.

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(sop): require test/story/docs audit before committing human code changes"
```

---

### Task 3: Strengthen `systematic-debugging` skill trigger description

**Files:**
- Modify: `/Users/etblue/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.1/skills/systematic-debugging/SKILL.md` (lines 1–5)

**Step 1: Read the current frontmatter**

Current content (lines 1–4):
```
---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
---
```

**Step 2: Update the description**

Replace the `description` line with:
```
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes — including when the user reports a bug after implementation, even if the fix seems obvious
```

**Step 3: Verify**

Read lines 1–5 of the file and confirm the updated description.

**Step 4: Commit**

```bash
git add /Users/etblue/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.1/skills/systematic-debugging/SKILL.md
git commit -m "docs(sop): strengthen systematic-debugging trigger for post-implementation bug reports"
```

---

### Task 4: Strengthen `test-driven-development` skill trigger description

**Files:**
- Modify: `/Users/etblue/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.1/skills/test-driven-development/SKILL.md` (lines 1–5)

**Step 1: Read the current frontmatter**

Current content (lines 1–4):
```
---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code
---
```

**Step 2: Update the description**

Replace the `description` line with:
```
description: Use when implementing any feature or bugfix, before writing implementation code — mandatory for all agent-authored bug fixes regardless of apparent simplicity
```

**Step 3: Verify**

Read lines 1–5 of the file and confirm the updated description.

**Step 4: Commit**

```bash
git add /Users/etblue/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.1/skills/test-driven-development/SKILL.md
git commit -m "docs(sop): strengthen test-driven-development trigger for bug fix scenarios"
```
