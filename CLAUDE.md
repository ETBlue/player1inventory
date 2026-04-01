# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Player 1 Inventory — a grocery and pantry management app. Designed by ETBlue.

## Commands

```bash
pnpm dev          # Start development server (Vite)
pnpm build        # Build for production
pnpm test         # Run tests (Vitest)
pnpm test:watch   # Run tests in watch mode
pnpm test:ui      # Run tests with UI browser interface
pnpm test:e2e      # Run E2E tests with Playwright (headless)
pnpm test:e2e:ui   # Run E2E tests with Playwright UI (interactive)
pnpm test:e2e:debug # Debug E2E tests step-by-step
pnpm lint         # Lint with Biome
pnpm format       # Format with Biome
pnpm check        # Run all Biome checks
pnpm storybook    # Start Storybook
```

## Tech Stack

- **Build**: Vite
- **Framework**: React 19 + TypeScript (strict)
- **Routing**: TanStack Router (file-based)
- **Data/State**: TanStack Query + Dexie.js (IndexedDB)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Code Quality**: Biome
- **Testing**: Vitest + React Testing Library

## Architecture

```
Components → TanStack Query hooks → Dexie.js → IndexedDB
```

Components never access the database directly — they use Query hooks from `src/hooks/`.

## Project Structure

```
src/
  components/       # React components
    ui/             # shadcn/ui components
  hooks/            # TanStack Query hooks
  db/               # Dexie.js database and operations
  routes/           # TanStack Router file-based routes
  lib/              # Utilities (cn helper)
  types/            # TypeScript types
  test/             # Test setup
```

## Key Patterns

- **Data types** defined in `src/types/index.ts`
- **Database operations** in `src/db/operations.ts` with tests in `src/db/operations.test.ts`
- **Query hooks** wrap database operations and handle cache invalidation
- **Routes** auto-generate `src/routeTree.gen.ts` on dev server start

## Shared Components

> See `apps/web/src/components/CLAUDE.md`

## Custom Hooks

> See `apps/web/src/hooks/CLAUDE.md`

## Features

> Feature documentation lives in sub-directory CLAUDE.md files co-located with the routes:
> - `apps/web/src/routes/CLAUDE.md` — filter pipeline, shopping, cooking
> - `apps/web/src/routes/items/CLAUDE.md` — item form, manual quantity input
> - `apps/web/src/routes/settings/CLAUDE.md` — cascade deletion
> - `apps/web/src/routes/settings/tags/CLAUDE.md` — tag management
> - `apps/web/src/routes/settings/vendors/CLAUDE.md` — vendor management
> - `apps/web/src/routes/settings/recipes/CLAUDE.md` — recipe management

## Design Tokens & Theme System

> See `apps/web/src/design-tokens/CLAUDE.md`

## Name Display Convention

Entity names are displayed in title case using Tailwind's `capitalize` class (`text-transform: capitalize`). This is purely visual — stored values are unchanged, so search and comparison logic is unaffected.

**Applies to:** item names, tag names, recipe names — in list cards, detail page headers, name input fields, and tag type dropdowns.

**Vendor names are excluded** — vendors may use intentional casing (e.g. "iHerb", "7-Eleven"). Vendor displays render names as stored. Vendor badges (in `ItemCard` and the item vendors tab) explicitly add `normal-case` to override the Badge component's built-in `capitalize`.

**Already covered by Badge base class:** tag badges and recipe badges. Vendor badges override with `normal-case`.

## Internationalization (i18n)

> See `apps/web/src/i18n/CLAUDE.md`

## AI Agent SOP

### Coding Tasks

For any **non-trivial** coding task (feature, bug fix, refactoring, test, etc.), always use a subagent — never implement directly in the main conversation. Trivial edits (rename a variable, fix a typo, add one line) may be done in the main session. See global `~/.claude/CLAUDE.md` for the full subagent policy.

### Documentation Updates

Before creating a PR, update all relevant documentation:

1. **CLAUDE.md** - Update if architecture, commands, or patterns change
2. **Design docs** (`docs/global/<area>/` or `docs/features/<area>/`) - Update if implementation diverges from plan
3. **Inline comments** - Ensure code comments reflect the changes
4. **Brainstorming logs** (same folder as the design doc for that topic) - Create when brainstorming leads to decisions
5. **`docs/INDEX.md`** - Update the status column when creating new plans (🔲 Pending) or completing implementations (✅)

### Component Development

**Always create Storybook stories for new components:**
- Every new component should have a corresponding `.stories.tsx` file
- Include multiple stories showing different states and variants
- Use realistic data that demonstrates the component's purpose

**Smoke tests:** every `.stories.tsx` has a matching `.stories.test.tsx` using `composeStories` + React Testing Library. Assert a key UI element (role, text, heading) — not `container.firstChild` or `'Loading...'`.

**Apollo context in route stories:** stories that render routes calling Apollo hooks with `skip:true` (e.g. local-mode guards) need `<ApolloProvider client={noopApolloClient}>` around the `RouterProvider`. Tests pass without it because `setup.ts` stubs all Apollo hooks via `vi.mock`. Import the shared stub:
```ts
import { noopApolloClient } from '@/test/apolloStub'
import { ApolloProvider } from '@apollo/client/react'
```

**Before committing feature code:**
1. **Check Storybook** - Update existing stories if component API changed
2. **Check Tests** - Update or add tests for new functionality
3. **Verify both pass** - Run `pnpm storybook` and `pnpm test` to ensure no breakage

**Commit together:**
- Commit feature code, Storybook stories, and tests in the same commit when possible
- This keeps the codebase in a consistent state where stories and tests match the code
- Exception: Large refactors may need separate commits, but stories/tests should follow immediately

### Bug Fixes

When the user reports a bug (post-implementation or otherwise), treat it as **substantive** unless it is clearly a typo or cosmetic-only change. Required sequence — no shortcuts:

1. **Create a branch** (`fix/<slug>`) — unless already inside a feature branch/worktree, in which case the bug fix belongs to that branch
2. **Dispatch an `Explore` subagent** to investigate — it returns a concise summary: symptom, root cause, affected files
3. **Write a bug doc stub** before starting the fix:
   - Single feature area → `docs/features/<area>/YYYY-MM-DD-bug-<slug>.md`
   - Multiple feature areas → `docs/global/bugs/YYYY-MM-DD-bug-<slug>.md`
   - Fields: bug description, root cause, fix applied (*TBD*), test added (*TBD*), PR/commit (*TBD*)
4. **Dispatch an implementation subagent** — given the root cause summary and bug doc stub as context; it writes a failing test and implements the fix (TDD)
5. **Fill in the bug doc** — update fix applied, test added, and PR/commit reference
6. **Commit in order:**
   - Commit 1: fix code + tests
   - Commit 2: completed bug doc
7. **Create a PR** — only if this is a standalone fix branch; skip if already inside a feature worktree/branch

This applies even when the fix seems obvious. The test serves as a regression guard and the doc enables future tracing.

### Verification Gate

After each implementation phase (each numbered step in an implementation plan), run the full quality gate. **Each command must be run with an explicit path** — do not rely on `cd` persisting between Bash tool calls:

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

**Final phase only** — after all steps are complete, also run related E2E tests:

```bash
pnpm test:e2e --grep "<feature-areas>|a11y"
```

Identify `<feature-areas>` from the routes/components touched (e.g. `shopping`, `cooking`, `items`, `tags`, `vendors`, `settings`). Combine multiple areas with a pipe: `--grep "shopping|tags"`. Always append `|a11y` to include the axe-playwright accessibility scan on every branch finish. Playwright's `webServer` config handles server startup automatically.

**Rules:**
- If any command fails → stop and fix all errors before proceeding to the next step
- After `pnpm build`, run `grep 'TS6385' /tmp/p1i-build.log` to check for `@deprecated` warnings — any match is a failure even if the build exit code is 0
- All four commands must pass and `grep` must return no matches before moving on
- E2E failures on the final phase are a hard stop — fix before finishing the branch; the branch must not be pushed until all E2E tests pass

**Applies to:** all implementation workflows and any session where code changes are made, regardless of whether a formal plan exists.

### Always Commit Before Done

Before responding to a completed task, step, or session wrap-up, **all changes must be committed** — no exceptions:

- Code files (including any updated inline comments)
- Storybook stories
- Tests
- CLAUDE.md updates
- Design docs and brainstorming logs (`docs/global/<area>/` or `docs/features/<area>/`)
- `docs/INDEX.md` status update

Run `git status` to confirm the working tree is clean. If any uncommitted changes remain, commit them first.

See also: **Before Finishing a Branch** (in the Workflow section below) for branch-level wrap-up steps.

### Commit Splitting

Every time the agent commits — whether triggered by "commit my changes", at the end of a task, or any other moment — split the diff into logical groups and make **one commit per group**.

**Grouping algorithm:**

1. Run `git diff HEAD` to survey all pending changes (staged and unstaged combined)
2. Identify distinct logical concerns — each purpose becomes one commit:
   - Bug fix → one commit
   - New feature (code + its tests + its stories) → one commit
   - Config or docs update → one commit
   - Refactor → one commit
3. Tests and stories for a feature travel in the **same commit** as the feature code — do not split by file type or layer
4. **Best-effort when inseparable:** if changes genuinely span concerns (e.g. a refactor that also fixes an incidental bug in a touched file), combine them into one commit whose message explains the mix — e.g. `refactor(items): extract helper — also fixes off-by-one in quantity calc`

**When uncertain:** lean toward more commits rather than fewer. A commit that does one thing is always better than one that does several.

**Large refactors:** size alone is not a reason to split. A refactor touching 30 files for one purpose is still one commit.

**Mid-task atomicity:** Do not apply this rule within a TDD red/green cycle — those commits are intentionally atomic and should not be split.

### Human Code Changes

When the user asks the AI agent to commit code they wrote manually (e.g. "commit my changes", "commit this"):

1. Run `git diff HEAD` to review exactly what changed (staged and unstaged combined)
2. For each modified component or behavior: check if tests exist and are up to date — add or update tests as needed
3. For each modified component: check if Storybook stories exist and are up to date — add or update stories as needed
4. Update `CLAUDE.md` and inline comments if architecture or patterns changed
5. Apply the **Commit Splitting** rule — survey all staged changes and split into one commit per logical concern. Tests and stories for a feature go in the same commit as the feature code.

Human code changes receive the same completeness audit as agent-authored changes. There is no "just commit it" shortcut.

**Exceptions:** Changes to non-code files only (docs, config, assets) do not require a test/Storybook audit.

### CSS Variable Renames

When you detect or perform a CSS variable rename:

1. **Search the entire project** for all occurrences of the obsolete CSS variable
2. **Replace all instances** with the new variable name
3. **Check all file types**:
   - CSS files (`.css`)
   - TypeScript/TSX files (`.ts`, `.tsx`)
   - Test files (`.test.ts`, `.test.tsx`)
   - Storybook files (`.stories.tsx`)
   - Current documentation (`.md`) - CLAUDE.md, README.md, etc.
   - **Do NOT update** historical docs in `docs/global/` or `docs/features/`

Use Grep to find all references:
```bash
# Example: search for old variable name
grep --pattern="--old-var-name" --glob="**/*.{css,ts,tsx,md}"
```

This ensures the design token system remains consistent across the entire codebase.

### Brainstorming Logs

Create a brainstorming log when brainstorming leads to implementation/design decisions. Location: same folder as the design doc (`docs/global/<area>/` or `docs/features/<area>/`). Naming: `YYYY-MM-DD-brainstorming-<topic>.md`. Content: questions asked, user answers, final decision, rationale.

### Workflow

**Branch Management:**

After completing a brainstorming session and before writing the design document, create a new branch and worktree, then enter the worktree. All feature work happens inside the worktree from this point on:
- The design document
- The brainstorming log
- Implementation plans
- The actual code implementation

The timing is important: create the branch and worktree after brainstorming is complete but before writing the design document. This keeps all related work in one place and ensures the entire feature history (docs + code) lives in the worktree.

**Default Workflow: Git Worktrees**

Use git worktrees by default for feature work. Create isolated workspaces in `.worktrees/` directory. See "Advanced: Git Worktrees" section below for setup details.

**Worktree before implementation (mandatory):** After brainstorming is complete and the branch name is derived, before writing the design doc, always create a git worktree using `superpowers:using-git-worktrees` (or follow the manual steps in "Advanced: Git Worktrees" below if the skill is unavailable). All subsequent work — design doc, implementation plan, and code — happens inside the worktree. Branch name is derived from the brainstorming topic: choose `feature/`, `fix/`, `refactor/`, or `docs/` prefix based on context, then add a short kebab-case topic (e.g. brainstorming about cooking expand/collapse → `feature/cooking-expand`).

**Absorbing upstream changes: always rebase, never merge**

When a feature branch needs to incorporate changes from `main`, use rebase:
```bash
git rebase origin/main
```
Never use `git merge origin/main` on a feature branch. Rebase keeps history linear and avoids merge commits.

**Alternative: Regular Branches**

For GUI tool users (GitHub Desktop, VS Code) or when worktrees are not suitable, use standard git branches instead.

**Branch Naming:**

Choose the branch prefix based on the primary purpose of the work:
- `docs/` - for documentation-heavy changes
- `feature/` - for new functionality
- `refactor/` - for code restructuring
- `chore/` - for maintenance tasks
- `fix/` - for bug fixes
- Other prefixes as appropriate to the mission

Use descriptive names: `docs/design-tokens`, `feature/dark-mode`, `refactor/component-extraction`

**Branch Cleanup:**

Always delete branches after their PR is merged. This keeps the repository clean and prevents confusion about which branches are active.

Recommended approach using GitHub CLI:
```bash
gh pr merge <number> --merge --delete-branch
```

This automatically deletes the remote branch after merging. Alternative approaches are fine as long as the branch gets deleted.

Local cleanup after the remote branch is deleted:
```bash
git branch -d <branch-name>
```

If using git worktrees, also remove the worktree:
```bash
git worktree remove <worktree-path>
```

**Exceptions:**

For minor changes that don't require brainstorming, ask the user whether to create a branch or commit directly to main. This applies to:
- Small bug fixes
- Typo corrections
- Simple configuration changes
- Other trivial updates

Quick documentation fixes (like fixing a typo in CLAUDE.md) can go directly to main without asking.

**Design docs and brainstorming logs must always go through a branch — never committed directly to `main`:**
- `docs/global/` — always requires a branch or worktree
- `docs/features/` — always requires a branch or worktree

This applies even for minor additions. The CLAUDE.md typo exception does not extend to these directories.

**General Rule:** If the work involves brainstorming, design decisions, or implementation planning, it should go through the full branch workflow. If it's a quick fix or minor adjustment, check with the user about their preference.

**Before Finishing a Branch:**

Always check for uncommitted changes before completing work:

```bash
git status
```

**If there are uncommitted changes:**
1. Review what's uncommitted - common culprits:
   - Design documents in `docs/global/<area>/` or `docs/features/<area>/`
   - Brainstorming logs (same folders as design docs)
   - Implementation plans
   - Test files or Storybook stories
2. Commit all relevant changes with appropriate commit messages
3. Verify `git status` shows a clean working tree
4. Only then proceed with merge/PR/cleanup

**Why this matters:**
- Uncommitted work can be lost during branch cleanup
- Design docs and plans are part of the feature and should be in the PR
- A clean working tree ensures nothing is left behind

**Completeness audit (mandatory):** When the `finishing-a-development-branch` skill is invoked, it automatically audits 6 areas using the branch diff: (1) CLAUDE.md — architecture/pattern updates; (2) Storybook stories — `.stories.tsx` for new/modified components and page-level routes (`.tsx` files in `src/routes/` that render visible UI, excluding layout wrappers and generated files); (3) Tests — `.test.ts`/`.test.tsx` for new/modified behaviors; (4) Design docs — whether implementation matches the plan (N/A if no plan file); (5) Inline comments — no stale references; (6) E2E tests — audit `e2e/tests/*.spec.ts` for changed routes/pages (add or update specs as needed), then run `pnpm test:e2e --grep "<areas>|a11y"` (always include `|a11y` to run the axe-playwright accessibility scan) — any failure is a hard stop and the branch must not be pushed until fixed. Gaps must be fixed or explicitly skipped (type "skip") before merge/PR/cleanup options are presented.

**Advanced: Git Worktrees**

For CLI users who want to work on multiple branches simultaneously without switching, git worktrees provide isolated workspaces.

**Setup:**
```bash
# Create worktree in .worktrees/ directory
# Use dashes instead of slashes in the directory name (e.g. feature-xxx, not feature/xxx)
git worktree add .worktrees/<feature-xxx> -b <branch-name>
```
(The EnterWorktree tool runs `pnpm install` and `pnpm codegen` automatically via the WorktreeCreate hook, in addition to copying `.env` files)

**Directory Convention:**
Use `.worktrees/` directory for git worktrees (project-local, hidden). Ensure it's in `.gitignore`. Use dashes instead of slashes in directory names (e.g. `feature-xxx`, not `feature/xxx`) to avoid creating subfolders.

**Cleanup:**
```bash
# After branch is merged and deleted
git worktree remove .worktrees/<feature-xxx>
```

**Note:** Git worktrees are not supported in GitHub Desktop. If you use GUI tools, stick with regular branches.

### Test Format

**Feature/integration tests** - Use "user can ..." naming with Given-When-Then comments:

```ts
it('user can create an item', async () => {
  // Given valid item data
  const itemData = { name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1 }

  // When user creates the item
  const item = await createItem(itemData)

  // Then item is persisted with id and timestamps
  expect(item.id).toBeDefined()
  expect(item.createdAt).toBeInstanceOf(Date)
})
```

**Unit tests** - Keep simple naming (existing style is fine)

### A11y Testing

**Biome lint (`pnpm lint`):** 37 a11y rules enabled in `apps/web/biome.json` — catches static violations (missing alt text, invalid ARIA, bad roles) at write time.

**axe-playwright (`e2e/tests/a11y.spec.ts`):** Runtime a11y checks via `axe-core`. Covers all 7 main pages in both light and dark mode (14 tests), plus 4 mobile-viewport tests at 390×844 in a `test.describe('mobile viewport a11y')` block (18 tests total). Run with `pnpm test:e2e --grep "a11y"`. Dark mode is triggered by `page.addInitScript(() => localStorage.setItem('theme-preference', 'dark'))` in a `test.describe('dark mode a11y')` block.

When adding a new page/route, add a corresponding test to `e2e/tests/a11y.spec.ts` for both light and dark mode.

### E2E Test Format

E2E tests use Playwright. The `e2e/` directory lives at the **monorepo root** (not inside `apps/web/`) because e2e tests cover the full stack. Test files live in `e2e/tests/`, page objects in `e2e/pages/`, config at `e2e/playwright.config.ts`.

**Page objects** — one class per page, encapsulating selectors and actions. Include a comment on each method citing the aria-label string and source file location:

```ts
// e2e/pages/CookingPage.ts
export class CookingPage {
  constructor(readonly page: Page) {}

  async navigateTo() { await this.page.goto('/cooking') }

  async checkRecipe(name: string) {
    // Recipe checkbox: aria-label={recipe.name}, role="checkbox" (src/routes/cooking.tsx:438)
    // Use getByRole to avoid strict-mode conflict with the "Expand {name}" button
    await this.page.getByRole('checkbox', { name }).click()
  }
}
```

**Test setup** — two strategies:

1. **UI-driven** (default): Navigate through the app to create test data. Use for simple setup (1–5 steps).
2. **`page.evaluate()` seeding**: Seed IndexedDB directly for complex multi-entity setup. Navigate to `/` first so Dexie initialises the schema, then open `indexedDB.open('Player1Inventory')` and use `readwrite` transactions. Use when UI setup would require 10+ steps (e.g. creating items + linking them to a recipe).

**`afterEach` teardown** — always clear IndexedDB, localStorage, and sessionStorage. See the root `e2e/tests/shopping.spec.ts` or `e2e/tests/cooking.spec.ts` for the canonical teardown block.

**Test naming** — same "user can ..." convention with Given-When-Then comments as unit tests.

### Commits

Always include scope in commit messages:

- `feat(cart): add checkout confirmation`
- `fix(tags): prevent duplicate tag names`
- `docs(readme): update setup instructions`

Apply the **Commit Splitting** rule — one commit per logical concern. See `### Commit Splitting` (in AI Agent SOP, above).

### Pull Requests

Include these sections in PR description:

```
## Summary
- <bullet points of what changed>

## Test Plan
- [ ] <verification steps>
```

After creating the PR, attach it to the relevant milestone:

```bash
gh pr edit <number> --milestone "<milestone title>"
```

Match the milestone to the feature area being worked on (e.g. `v0.2.0 — Cloud Foundation` for cloud work). If no milestone fits, skip this step.
