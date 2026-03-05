# Tag Dropdown Badge Selection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make tag badges in the `TagTypeDropdown` menu reflect selection state — solid for selected, tint for unselected.

**Architecture:** One-line conditional change to the Badge `variant` prop in `TagTypeDropdown.tsx`. `isChecked` is already in scope so no new logic is needed.

**Tech Stack:** React, TypeScript, shadcn/ui Badge component with existing color variant system.

---

### Task 1: Update badge variant in TagTypeDropdown

**Files:**
- Modify: `src/components/TagTypeDropdown.tsx:56`

**Step 1: Make the change**

In `src/components/TagTypeDropdown.tsx`, find line 56:

```tsx
<Badge variant={tagType.color}>{tag.name}</Badge>
```

Replace with:

```tsx
<Badge variant={isChecked ? tagType.color : `${tagType.color}-tint`}>
  {tag.name}
</Badge>
```

`isChecked` is already defined on line 47: `const isChecked = selectedTagIds.includes(tag.id)`

**Step 2: Verify in Storybook or dev server**

Run: `pnpm dev`

Navigate to any page with `ItemFilters` (e.g. pantry page, click the Filters toggle). Open a tag type dropdown. Verify:
- Unselected tags show tint (light) background
- Selected tags show solid (dark) background
- Toggling a tag switches its badge between tint and solid

**Step 3: Run tests**

Run: `pnpm test`

Expected: All tests pass (no test changes needed — this is a visual-only change with no behavioral logic).

**Step 4: Commit**

```bash
git add src/components/TagTypeDropdown.tsx
git commit -m "style(filters): render unselected tag badges with tint, selected with solid"
```
