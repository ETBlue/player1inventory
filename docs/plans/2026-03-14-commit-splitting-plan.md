# Commit Splitting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Commit Splitting rule to CLAUDE.md so the agent always splits diffs into logical commits rather than bundling everything into one.

**Architecture:** Three CLAUDE.md edits — one new section defining the algorithm, one update to `### Human Code Changes`, one update to `### Commits`. No code changes.

**Tech Stack:** CLAUDE.md (project AI agent instructions)

**Note:** Worktree `.worktrees/chore-commit-splitting` on branch `chore/commit-splitting` already exists. All work happens there.

---

### Task 1: Add `### Commit Splitting` section to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` — insert new section after `### Always Commit Before Done` (line 678), before `### Human Code Changes` (line 692)

**Step 1: Confirm insertion point**

Run:
```bash
grep -n "### Always Commit Before Done\|### Human Code Changes" CLAUDE.md
```

Expected: two line numbers — e.g. 678 and 692. The new section goes between them.

**Step 2: Insert the section**

Insert the following block between `### Always Commit Before Done` and `### Human Code Changes`:

```markdown
### Commit Splitting

Every time the agent commits — whether triggered by "commit my changes", at the end of a task, or any other moment — split the diff into logical groups and make **one commit per group**.

**Grouping algorithm:**

1. Run `git diff HEAD` (or `git diff` for unstaged) to survey all changes
2. Identify distinct logical concerns — each purpose becomes one commit:
   - Bug fix → one commit
   - New feature (code + its tests + its stories) → one commit
   - Config or docs update → one commit
   - Refactor → one commit
3. Tests and stories for a feature travel in the **same commit** as the feature code — do not split by file type or layer
4. **Best-effort when inseparable:** if changes genuinely span concerns (e.g. a refactor that also fixes an incidental bug in a touched file), combine them into one commit whose message explains the mix — e.g. `refactor(items): extract helper — also fixes off-by-one in quantity calc`

**When uncertain:** lean toward more commits rather than fewer. A commit that does one thing is always better than one that does several.

**Large refactors:** size alone is not a reason to split. A refactor touching 30 files for one purpose is still one commit.

```

**Step 3: Verify**

Read surrounding lines to confirm:
- Heading level is `###`
- Section is between `### Always Commit Before Done` and `### Human Code Changes`
- Blank lines between sections
- Bash code block properly fenced
- Numbered list formatted correctly

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(sop): add commit splitting rule to CLAUDE.md"
```

---

### Task 2: Update `### Human Code Changes` to reference Commit Splitting

**Files:**
- Modify: `CLAUDE.md` — update step 5 of `### Human Code Changes`

**Step 1: Find the section**

Run:
```bash
grep -n "Only then commit" CLAUDE.md
```

Expected: a line like `5. Only then commit — include test/story/doc updates **in the same commit** as the human's code`

**Step 2: Replace step 5**

Find:
```
5. Only then commit — include test/story/doc updates **in the same commit** as the human's code
```

Replace with:
```
5. Apply the **Commit Splitting** rule — survey all staged changes and split into one commit per logical concern. Tests and stories for a feature go in the same commit as the feature code.
```

**Step 3: Verify**

Read the updated section to confirm the list is still properly numbered and formatted.

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(sop): update human-code-changes to reference commit splitting rule"
```

---

### Task 3: Update `### Commits` to reference Commit Splitting

**Files:**
- Modify: `CLAUDE.md` — add one line to `### Commits` section (currently at line ~915)

**Step 1: Find the section**

Run:
```bash
grep -n "### Commits" CLAUDE.md
```

**Step 2: Add reference after the existing scope examples**

Find:
```
Always include scope in commit messages:

- `feat(cart): add checkout confirmation`
- `fix(tags): prevent duplicate tag names`
- `docs(readme): update setup instructions`
```

Replace with:
```
Always include scope in commit messages:

- `feat(cart): add checkout confirmation`
- `fix(tags): prevent duplicate tag names`
- `docs(readme): update setup instructions`

Apply the **Commit Splitting** rule — one commit per logical concern. See `### Commit Splitting` above.
```

**Step 3: Verify**

Read the updated section to confirm the line is appended cleanly with a blank line before it.

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(sop): update commits section to reference commit splitting rule"
```

---

### Task 4: Final verification and wrap-up

**Step 1: Review all changes**

```bash
git diff main CLAUDE.md
```

Confirm all three edits are present:
- `### Commit Splitting` section exists between `### Always Commit Before Done` and `### Human Code Changes`
- Step 5 of `### Human Code Changes` references Commit Splitting
- `### Commits` section references Commit Splitting

**Step 2: Confirm clean working tree**

```bash
git status
```

Expected: nothing to commit.

**Step 3: Invoke finishing-a-development-branch skill**

Use `superpowers:finishing-a-development-branch` to complete the branch.
