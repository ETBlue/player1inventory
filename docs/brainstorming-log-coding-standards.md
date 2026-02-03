# Brainstorming Log: Coding Standards Automation

**Date:** 2026-02-04

## Initial Request

> setup coding standard
> * code or docs should be auto formatted before push
> * quality checks should auto run before push
> * follow Conventional Commits for git commit messages
> any other suggestion?

## Q&A Session

### Q1: Git Hook Tool

Which tool would you prefer for managing git hooks?

1. Husky - Most popular, widely used in JavaScript ecosystem (Recommended)
2. simple-git-hooks - Lightweight alternative, zero dependencies, simpler setup
3. lefthook - Fast, language-agnostic, parallel execution support
4. Native git hooks - Manual setup, no dependencies, less portable

**Answer:** use husky for managing git hooks

---

### Q2: Pre-commit vs Pre-push Timing

Should formatting happen at commit time or push time?

1. Format on commit, lint on push - Format code immediately when committing, run full quality checks before pushing (Recommended)
2. Everything on commit - Format and lint on every commit
3. Everything on push - All checks only before push

**Answer:** 1 (Format on commit, lint on push)

---

### Q3: Conventional Commits Enforcement

How strictly should we enforce Conventional Commits?

1. Strict with commitlint - Block commits that don't follow format (Recommended)
2. Flexible with suggestions - Warn but allow non-conforming commits
3. Template only - Provide a commit message template, no enforcement

**Answer:** 1 (Strict with commitlint)

---

### Q4: Additional Recommendations

Would you like to include these extras?
- lint-staged - Only run formatters on staged files
- TypeScript strict check on push
- Test on push

1. All three - lint-staged + typecheck + tests on push (Recommended)
2. lint-staged + typecheck only - Skip tests on push
3. lint-staged only - Minimal setup
4. Custom selection

**Answer:** 1 (All three)

---

## Design Section Approvals

**Section 1 - Tools & Dependencies:**
- husky, lint-staged, @commitlint/cli, @commitlint/config-conventional
- Leverage existing: biome, vitest, tsc

**Answer:** yes

---

**Section 2 - Git Hooks Configuration:**
- pre-commit: Format staged files with Biome
- commit-msg: Validate Conventional Commits
- pre-push: Run typecheck, lint, tests

**Answer:** yes

---

**Section 3 - File Structure:**
- .husky/ with pre-commit, commit-msg, pre-push hooks
- commitlint.config.js
- lint-staged config in package.json

**Answer:** yes

---

**Section 4 - Implementation & Testing:**
- Install → Initialize Husky → Create configs → Create hooks
- Test each hook manually

**Answer:** yes

---

## Final Design

Saved to: `docs/plans/2026-02-04-coding-standards-design.md`

### Summary

**Git hook tool:** Husky

**Hook timing:**
- Pre-commit: Format staged files
- Commit-msg: Validate Conventional Commits
- Pre-push: Typecheck, lint, tests

**Enforcement:** Strict (commits blocked if invalid)

**Extras:** lint-staged for fast formatting, full quality gates on push
