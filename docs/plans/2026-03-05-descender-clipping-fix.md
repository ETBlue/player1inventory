# Descender Clipping Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix visual clipping of descender letters (g, p, q, y) in ItemCard titles by changing `leading-none` to `leading-tight` in `CardTitle`.

**Architecture:** Single-line change in the shared `CardTitle` component. `leading-tight` (line-height: 1.25) gives enough vertical room for descenders to render without being clipped by `overflow: hidden` from the `truncate` class.

**Tech Stack:** Tailwind CSS v4, React, shadcn/ui

---

### Task 1: Fix `CardTitle` line-height

**Files:**
- Modify: `src/components/ui/card.tsx:68`

**Step 1: Open the file and locate the line**

In `src/components/ui/card.tsx`, find line 68 inside `CardTitle`:

```tsx
className={cn('text-sm font-medium leading-none', className)}
```

**Step 2: Change `leading-none` to `leading-tight`**

```tsx
className={cn('text-sm font-medium leading-tight', className)}
```

**Step 3: Run tests**

```bash
pnpm test
```

Expected: all tests pass (no behavioral change, purely visual).

**Step 4: Verify visually in Storybook**

```bash
pnpm storybook
```

Open the ItemCard story and check that item names with g/p/q/y (e.g. "Yogurt", "Grape juice") display without clipping.

**Step 5: Commit**

```bash
git add src/components/ui/card.tsx
git commit -m "fix(ux): fix descender clipping in card titles by using leading-tight"
```
