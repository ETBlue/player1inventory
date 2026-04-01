# E2E Dark Mode Contrast Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 9 failing E2E tests caused by two March 31 commits — raise the dark mode destructive color token for WCAG AA compliance, and update three E2E files with renamed onboarding selectors.

**Architecture:** Two independent changes in one PR. Task 1 fixes the CSS design token `--importance-destructive` in dark mode; Task 2 applies the stash that updates onboarding E2E string selectors. No new test files needed — the existing a11y and onboarding E2E specs are the regression guard.

**Tech Stack:** Tailwind CSS v4 design tokens (HSL variables in `theme.css`), Playwright + axe-playwright for E2E a11y testing.

---

## File Map

| File | Change |
|------|--------|
| `apps/web/src/design-tokens/theme.css` | Raise `--importance-destructive` in `.dark` from `hsl(330 90% 75%)` to `hsl(330 90% 90%)` |
| `e2e/pages/OnboardingPage.ts` | Button selector rename |
| `e2e/tests/a11y.spec.ts` | Wait-for selector rename |
| `e2e/tests/onboarding.spec.ts` | Heading assertion rename |

---

## Task 1: Fix dark mode destructive color token

**Files:**
- Modify: `apps/web/src/design-tokens/theme.css` (`.dark` block, `--importance-destructive` line)

**Context:** `--importance-destructive: hsl(330 90% 75%)` in dark mode achieves only 3.23–3.63:1 contrast against the page base background `hsl(40 5% 30%)` (required: 4.5:1). Raising to `hsl(330 90% 90%)` brings it to 4.67–5.35:1. There are no unit tests for design tokens — the E2E axe scan is the test.

- [ ] **Step 1: Create branch and worktree**

```bash
git worktree add .worktrees/fix-e2e-dark-mode-contrast -b fix/e2e-dark-mode-contrast
```

Then enter the worktree (use the `EnterWorktree` tool or `cd .worktrees/fix-e2e-dark-mode-contrast`).

- [ ] **Step 2: Run the currently-failing dark mode a11y tests to confirm baseline**

```bash
pnpm test:e2e --grep "dark mode a11y"
```

Expected: 7 failures, all `color-contrast` violations on item/settings detail pages.

- [ ] **Step 3: Apply the token fix**

In `apps/web/src/design-tokens/theme.css`, find the `.dark` block (around line 69) and change:

```css
/* before */
--importance-destructive: hsl(330 90% 75%);

/* after */
--importance-destructive: hsl(330 90% 90%);
```

- [ ] **Step 4: Run the dark mode a11y tests to verify they pass**

```bash
pnpm test:e2e --grep "dark mode a11y"
```

Expected: all 18 dark mode a11y tests pass. If any `color-contrast` violation still appears, check the reported `foreground color` hex — re-calculate contrast against `#504e49` and raise lightness further.

- [ ] **Step 5: Run the build to confirm no regressions**

```bash
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

Expected: build succeeds, no TS6385 warnings.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/design-tokens/theme.css
git commit -m "fix(design-tokens): raise dark mode destructive lightness to 90% for WCAG AA contrast

--importance-destructive in dark mode was sized for the old background-base
(hsl(45 5% 10%)). After e094b49 made background-base much lighter
(hsl(40 5% 30%)), contrast fell to 3.23:1 on ghost buttons and 3.63:1 on
validation error text (required: 4.5:1). Raising to hsl(330 90% 90%)
restores compliance at 4.67:1 (buttons) and 5.35:1 (plain text).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Update onboarding E2E selectors

**Files:**
- Modify: `e2e/pages/OnboardingPage.ts:33-36` — `clickChooseTemplate` method
- Modify: `e2e/tests/a11y.spec.ts` — onboarding wait-for line
- Modify: `e2e/tests/onboarding.spec.ts` — heading assertion

**Context:** PR #163 renamed the "Choose from template" button to "Choose from a template..." and the TemplateOverview heading to "Build your pantry". The stash `e2e-onboarding-update` (stash@{0}) already has the correct changes — pop it.

- [ ] **Step 1: Confirm the stash is present**

```bash
git stash list
```

Expected output includes: `stash@{0}: On fix/cloud-date-deserialization: e2e-onboarding-update`

- [ ] **Step 2: Run the failing onboarding tests to confirm baseline**

```bash
pnpm test:e2e --grep "onboarding|user can view onboarding"
```

Expected: 2 failures — `user can select template items and complete onboarding` (timeout on old button name) and `user can view onboarding page without accessibility violations` (wait-for old button name).

- [ ] **Step 3: Pop the stash**

```bash
git stash pop
```

This applies changes to:
- `e2e/pages/OnboardingPage.ts` — button name `'Choose from template'` → `'Choose from a template...'`
- `e2e/tests/a11y.spec.ts` — waitFor button name same rename
- `e2e/tests/onboarding.spec.ts` — heading assertion `'Choose from template'` → `'Build your pantry'`

- [ ] **Step 4: Run the onboarding and a11y tests to verify all pass**

```bash
pnpm test:e2e --grep "onboarding|a11y"
```

Expected: all 43 tests pass (18 dark mode, 7 light mode a11y, 4 mobile a11y, 3 onboarding, plus any overlap). Zero failures.

- [ ] **Step 5: Commit**

```bash
git add e2e/pages/OnboardingPage.ts e2e/tests/a11y.spec.ts e2e/tests/onboarding.spec.ts
git commit -m "fix(e2e): update onboarding selectors after button and heading renames

PR #163 changed 'Choose from template' → 'Choose from a template...'
(button) and 'Choose from template' → 'Build your pantry' (heading).
Update the page object and both spec files to match.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Final verification and PR

- [ ] **Step 1: Run full onboarding + a11y E2E suite**

```bash
pnpm test:e2e --grep "onboarding|a11y"
```

Expected: all 43 tests pass, 0 failures.

- [ ] **Step 2: Run lint and build**

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

Expected: lint passes, build passes, no TS6385 warnings.

- [ ] **Step 3: Clean up the debug test file**

```bash
rm e2e/tests/debug-a11y.spec.ts
git status  # confirm only the 4 intended files changed
```

- [ ] **Step 4: Create the PR**

```bash
gh pr create \
  --title "fix: raise dark mode destructive token and update onboarding E2E selectors" \
  --body "$(cat <<'EOF'
## Summary
- Raises \`--importance-destructive\` in dark mode from \`hsl(330 90% 75%)\` to \`hsl(330 90% 90%)\` — restores WCAG AA contrast (4.5:1) after the March 31 background token reorder made the base background lighter
- Updates three E2E files with renamed onboarding strings from PR #163: button \`'Choose from a template...'\`, heading \`'Build your pantry'\`

## Test Plan
- [ ] All 43 onboarding + a11y E2E tests pass
- [ ] \`pnpm lint\` passes
- [ ] \`pnpm build\` passes with no TS6385 warnings

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Attach to milestone**

```bash
gh api repos/ETBlue/player1inventory/milestones --jq '.[] | [.number, .title] | @tsv'
```

Then attach to the appropriate milestone:

```bash
gh api repos/ETBlue/player1inventory/issues/<PR_NUMBER> \
  -X PATCH \
  -f milestone=<MILESTONE_NUMBER>
```
