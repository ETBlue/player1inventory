# Tag Badge X Button Color Match — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the X (delete) button border and icon color on tag badges in Settings > Tags match the tag's color, instead of always being neutral gray.

**Architecture:** Single prop change in `DraggableTagBadge` — append dynamic `border-${tagType.color} text-${tagType.color}` classes to `buttonClassName` on the `DeleteButton`. tailwind-merge handles the override.

**Tech Stack:** React, Tailwind CSS v4, shadcn/ui Button with CVA variants

---

### Task 1: Apply the color fix

**Files:**
- Modify: `src/routes/settings/tags/index.tsx:106`

**Step 1: Make the change**

In `DraggableTagBadge`, find the `DeleteButton` (around line 102) and update `buttonClassName`:

```tsx
// Before
buttonClassName="h-5 rounded-full rounded-tl-none rounded-bl-none -ml-px"

// After
buttonClassName={`h-5 rounded-full rounded-tl-none rounded-bl-none -ml-px border-${tagType.color} text-${tagType.color}`}
```

**Step 2: Verify in Storybook**

Run: `pnpm storybook`

Open the Tags settings stories and visually confirm that each tag badge's X button border and icon color match the badge's color.

**Step 3: Verify tests still pass**

Run: `pnpm test`
Expected: all tests pass with no changes needed (this is a pure visual change with no logic)

**Step 4: Commit**

```bash
git add src/routes/settings/tags/index.tsx
git commit -m "style(tags): match X button border color to tag badge color"
```
