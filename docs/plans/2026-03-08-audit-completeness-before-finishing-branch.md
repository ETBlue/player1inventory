# Audit Completeness Before Finishing a Branch — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Insert a mandatory completeness audit step into the `finishing-a-development-branch` skill and reinforce it in `CLAUDE.md`, so Claude always checks docs, storybooks, tests, design docs, and inline comments before completing a branch.

**Architecture:** Two text edits — one to the shared `finishing-a-development-branch` SKILL.md (inserts Step 1.5 between Step 1 and Step 2 with a hard gate and 5-check audit), and one to the project `CLAUDE.md` (appends a completeness audit note to the existing "Before Finishing a Branch" section). No code, no tests.

**Tech Stack:** Markdown, Claude Code skills system

---

### Task 1: Update `finishing-a-development-branch` SKILL.md — insert Step 1.5

**Files:**
- Modify: `/Users/etblue/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.1/skills/finishing-a-development-branch/SKILL.md:38-40`

**Step 1: Read the target location**

Read lines 35–45 of the file to confirm line 38 reads "**If tests pass:** Continue to Step 2." and line 40 reads "### Step 2: Determine Base Branch".

**Step 2: Insert Step 1.5 between Step 1 and Step 2**

Find this exact text:
```
**If tests pass:** Continue to Step 2.

### Step 2: Determine Base Branch
```

Replace with:
```
**If tests pass:** Continue to Step 1.5.

### Step 1.5: Audit Completeness

<HARD-GATE>
Before presenting options, audit that docs, stories, tests, design docs, and inline comments are current.
Do NOT proceed to Step 2 until either all gaps are fixed or the user types "skip".
</HARD-GATE>

**Run all 5 checks against the branch diff:**

```bash
git diff $(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master) --name-only
```

Use the list of changed files to assess each check:

1. **CLAUDE.md** — Did any architecture, commands, patterns, or shared components change? If yes, is the relevant CLAUDE.md section updated?
2. **Storybook stories** — For every new or modified `.tsx` file in `src/components/` or `src/routes/`, does a corresponding `.stories.tsx` exist and appear current?
3. **Tests** — For every new or modified behavior in hooks, db operations, or routes, does a corresponding `.test.ts` / `.test.tsx` exist and cover it?
4. **Design docs** (`docs/plans/`) — If a linked plan file exists for this branch, does the implementation match it, or did it diverge in ways worth noting?
5. **Inline comments** — Are there any code comments that reference removed/renamed things, or contradict the current logic?

**Report all gaps in a single consolidated list:**

```
Completeness audit — N gaps found:
- [ ] CLAUDE.md: <what section needs updating>
- [ ] Stories: <which components are missing stories>
- [ ] Tests: <which behaviors lack coverage>
- [ ] Design doc: <what diverged>
- [ ] Comments: <which comments are stale>
```

If no gaps: `Completeness audit — all clear. Continuing to Step 2.`

**If gaps found, present hard gate:**

```
Found N gaps above. Should I fix these before we proceed?
Or type **skip** to continue as-is.
```

- User says yes / anything other than "skip" → fix all gaps, then re-run all 5 checks to confirm clean, then continue to Step 2
- User types "skip" → proceed to Step 2 immediately

### Step 2: Determine Base Branch
```

**Step 3: Verify**

Read the file around the edit and confirm:
- `### Step 1.5: Audit Completeness` appears between Step 1 and Step 2
- The `<HARD-GATE>` block is present
- All 5 checks are listed with their descriptions
- The consolidated gap report format is present
- The hard gate prompt with "skip" bypass is present
- Step 2 heading still reads "### Step 2: Determine Base Branch"
- Step 1's "Continue to Step 2" now reads "Continue to Step 1.5"

**Step 4: Check if plugins directory is a git repo and commit if so**

```bash
git -C /Users/etblue/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.1 status 2>&1
```

If it IS a git repo:
```bash
git -C /Users/etblue/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.1 add skills/finishing-a-development-branch/SKILL.md
git -C /Users/etblue/.claude/plugins/cache/claude-plugins-official/superpowers/4.3.1 commit -m "feat(finishing-a-development-branch): add Step 1.5 completeness audit before options"
```

If not a git repo: skip commit, file edit is sufficient.

---

### Task 2: Update `CLAUDE.md` — append completeness audit note to "Before Finishing a Branch"

**Files:**
- Modify: `/Users/etblue/Code/GitHub/player1inventory/CLAUDE.md` (around line 655–659)

**Step 1: Find the target location**

Locate the "Before Finishing a Branch" section. It ends with:

```
**Why this matters:**
- Uncommitted work can be lost during branch cleanup
- Design docs and plans are part of the feature and should be in the PR
- A clean working tree ensures nothing is left behind
```

(Followed by a blank line and `**Advanced: Git Worktrees**`)

**Step 2: Insert the completeness audit note after the "Why this matters" block**

Find this exact text:
```
**Why this matters:**
- Uncommitted work can be lost during branch cleanup
- Design docs and plans are part of the feature and should be in the PR
- A clean working tree ensures nothing is left behind
```

Replace with:
```
**Why this matters:**
- Uncommitted work can be lost during branch cleanup
- Design docs and plans are part of the feature and should be in the PR
- A clean working tree ensures nothing is left behind

**Completeness audit (mandatory):** Before invoking `finishing-a-development-branch`, the skill will automatically audit 5 areas using the branch diff: (1) CLAUDE.md — architecture/pattern updates; (2) Storybook stories — `.stories.tsx` for new/modified components; (3) Tests — `.test.ts`/`.test.tsx` for new/modified behaviors; (4) Design docs — whether implementation matches the plan; (5) Inline comments — no stale references. Gaps must be fixed or explicitly skipped before options are presented.
```

**Step 3: Verify**

Read the section and confirm the new paragraph appears directly after "A clean working tree ensures nothing is left behind" and before the blank line before "**Advanced: Git Worktrees**".

**Step 4: Commit**

```bash
cd /Users/etblue/Code/GitHub/player1inventory
git add CLAUDE.md
git commit -m "docs(sop): add completeness audit requirement before finishing a branch"
```
