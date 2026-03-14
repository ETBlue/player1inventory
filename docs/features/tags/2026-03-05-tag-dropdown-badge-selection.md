# Tag Dropdown Badge Selection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** (1) Make tag badges in the `TagTypeDropdown` menu reflect selection state — solid for selected, tint for unselected. (2) Reorder `ItemFilters` so vendor/recipe dropdowns appear before tag type dropdowns.

**Architecture:** One-line conditional change in `TagTypeDropdown.tsx`; JSX block reorder in `ItemFilters.tsx` with no logic changes.

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

---

### Task 2: Reorder dropdowns in ItemFilters

**Files:**
- Modify: `src/components/ItemFilters.tsx:83-216`

**Step 1: Reorder the JSX blocks**

In the `return` of `ItemFilters`, move the vendor and recipe `<DropdownMenu>` blocks before the tag type `{tagTypesWithTags.map(...)}` block. The "Edit" link stays last.

New order inside `<div className="flex flex-wrap ...">`:

```tsx
{/* 1. Vendors */}
{showVendors && (
  <DropdownMenu modal={false}>
    {/* ... vendor dropdown unchanged ... */}
  </DropdownMenu>
)}

{/* 2. Recipes */}
{showRecipes && (
  <DropdownMenu modal={false}>
    {/* ... recipe dropdown unchanged ... */}
  </DropdownMenu>
)}

{/* 3. Tag type dropdowns */}
{tagTypesWithTags.map((tagType) => {
  {/* ... unchanged ... */}
})}

{/* 4. Edit link */}
<Link to="/settings/tags">
  <Button size="xs" variant="neutral-ghost">
    <Pencil />
    Edit
  </Button>
</Link>
```

No logic changes — only JSX block order changes.

**Step 2: Verify in dev server**

Run: `pnpm dev`

Navigate to pantry page and open the Filters panel. Verify vendors/recipes dropdowns appear to the left of tag type dropdowns.

**Step 3: Run tests**

Run: `pnpm test`

Expected: All tests pass (render order doesn't affect test assertions).

**Step 4: Commit**

```bash
git add src/components/ItemFilters.tsx
git commit -m "style(filters): render vendor and recipe dropdowns before tag type dropdowns"
```
