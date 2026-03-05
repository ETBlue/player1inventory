# Remove `leading-tight` from CardTitle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the now-redundant `leading-tight` class from `CardTitle` in `src/components/ui/card.tsx`.

**Architecture:** One-line change. `CardTitle` inherits `line-height: 1.25em` from `body` (set in PR #79), making `leading-tight` (also 1.25) redundant. No visual change, no layout shift.

**Tech Stack:** React, Tailwind CSS v4

---

### Task 1: Remove `leading-tight` from CardTitle

**Files:**
- Modify: `src/components/ui/card.tsx:68`

**Step 1: Open the file and locate CardTitle**

In `src/components/ui/card.tsx`, find the `CardTitle` component (~line 68):

```tsx
className={cn('text-sm font-medium leading-tight', className)}
```

**Step 2: Remove `leading-tight`**

```tsx
className={cn('text-sm font-medium', className)}
```

**Step 3: Run tests to verify no regressions**

```bash
pnpm test --run
```

Expected: All tests pass (566 tests, 45 files). This is a CSS-only removal with no behavioral change, so no new tests are needed.

**Step 4: Commit**

```bash
git add src/components/ui/card.tsx
git commit -m "refactor(ux): remove redundant leading-tight from CardTitle"
```
