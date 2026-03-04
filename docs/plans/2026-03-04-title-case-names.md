# Title Case Name Rendering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add CSS `capitalize` to all name display elements and name input fields so entity names render in title case throughout the UI.

**Architecture:** Purely visual — add Tailwind's `capitalize` class to specific elements. No data changes, no new utilities. The `Badge` component already has `capitalize`, so tag/vendor/recipe badges need no changes.

**Tech Stack:** React, Tailwind CSS v4, shadcn/ui

---

### Task 1: Shared display components — ItemCard, VendorCard, RecipeCard

**Files:**
- Modify: `src/components/ItemCard.tsx:162`
- Modify: `src/components/VendorCard.tsx:21`
- Modify: `src/components/RecipeCard.tsx:21`

**Step 1: Update ItemCard item name**

In `src/components/ItemCard.tsx` line 162, change:
```tsx
<h3 className="truncate">{item.name}</h3>
```
to:
```tsx
<h3 className="truncate capitalize">{item.name}</h3>
```

**Step 2: Update VendorCard vendor name**

In `src/components/VendorCard.tsx` line 21, change:
```tsx
className="font-medium hover:underline"
```
to:
```tsx
className="font-medium hover:underline capitalize"
```

**Step 3: Update RecipeCard recipe name**

In `src/components/RecipeCard.tsx` line 21, change:
```tsx
className="font-medium hover:underline"
```
to:
```tsx
className="font-medium hover:underline capitalize"
```

**Step 4: Verify**

Run: `pnpm test`
Expected: all tests pass (no logic changed)

**Step 5: Commit**

```bash
git add src/components/ItemCard.tsx src/components/VendorCard.tsx src/components/RecipeCard.tsx
git commit -m "style(ux): capitalize item, vendor, and recipe names in list cards"
```

---

### Task 2: Name input fields — all NameForm components and ItemForm

**Files:**
- Modify: `src/components/ItemForm.tsx:359`
- Modify: `src/components/VendorNameForm.tsx:30`
- Modify: `src/components/TagNameForm.tsx:30`
- Modify: `src/components/RecipeNameForm.tsx:30`

**Step 1: Update ItemForm name input**

In `src/components/ItemForm.tsx` around line 359, find the `<Input id="name" ...>` element and add `className="capitalize"`:
```tsx
<Input
  id="name"
  value={name}
  onChange={(e) => setName(e.target.value)}
  required
  className="capitalize"
```

**Step 2: Update VendorNameForm input**

In `src/components/VendorNameForm.tsx` around line 30, find the `<Input id="vendor-name" ...>` and add `className="capitalize"`:
```tsx
<Input
  id="vendor-name"
  value={name}
  onChange={(e) => onNameChange(e.target.value)}
  className="capitalize"
```

**Step 3: Update TagNameForm input**

In `src/components/TagNameForm.tsx` around line 30, find the `<Input id="tag-name" ...>` and add `className="capitalize"`:
```tsx
<Input
  id="tag-name"
  value={name}
  onChange={(e) => onNameChange(e.target.value)}
  className="capitalize"
```

**Step 4: Update RecipeNameForm input**

In `src/components/RecipeNameForm.tsx` around line 30, find the `<Input id="recipe-name" ...>` and add `className="capitalize"`:
```tsx
<Input
  id="recipe-name"
  value={name}
  onChange={(e) => onNameChange(e.target.value)}
  className="capitalize"
```

**Step 5: Verify**

Run: `pnpm test`
Expected: all tests pass

**Step 6: Commit**

```bash
git add src/components/ItemForm.tsx src/components/VendorNameForm.tsx src/components/TagNameForm.tsx src/components/RecipeNameForm.tsx
git commit -m "style(ux): capitalize name inputs in all entity forms"
```

---

### Task 3: Detail page headers

**Files:**
- Modify: `src/routes/items/$id.tsx:108`
- Modify: `src/routes/settings/vendors/$id.tsx:102`
- Modify: `src/routes/settings/tags/$id.tsx:102`
- Modify: `src/routes/settings/recipes/$id.tsx:102`

All four files have the same pattern — an `<h1>` showing the entity name in the fixed nav bar. Add `capitalize` to each.

**Step 1: Update item detail header**

In `src/routes/items/$id.tsx` line 108, change:
```tsx
<h1 className="text-md font-regular truncate flex-1">{item.name}</h1>
```
to:
```tsx
<h1 className="text-md font-regular truncate flex-1 capitalize">{item.name}</h1>
```

**Step 2: Update vendor detail header**

In `src/routes/settings/vendors/$id.tsx` line 102, apply the same change to the `<h1>` wrapping `{vendor.name}`:
```tsx
<h1 className="text-md font-regular truncate flex-1 capitalize">
  {vendor.name}
</h1>
```

**Step 3: Update tag detail header**

In `src/routes/settings/tags/$id.tsx` line 102, change the `<h1>` wrapping `{tag.name}`:
```tsx
<h1 className="text-md font-regular truncate flex-1 capitalize">{tag.name}</h1>
```

**Step 4: Update recipe detail header**

In `src/routes/settings/recipes/$id.tsx` line 102, apply the same change to the `<h1>` wrapping `{recipe.name}`.

**Step 5: Verify**

Run: `pnpm test`
Expected: all tests pass

**Step 6: Commit**

```bash
git add src/routes/items/'$id.tsx' src/routes/settings/vendors/'$id.tsx' src/routes/settings/tags/'$id.tsx' src/routes/settings/recipes/'$id.tsx'
git commit -m "style(ux): capitalize entity names in detail page headers"
```

---

### Task 4: Additional name displays — ItemFilters and cooking page

**Files:**
- Modify: `src/components/ItemFilters.tsx:141`
- Modify: `src/components/ItemFilters.tsx:189`
- Modify: `src/routes/cooking.tsx:259`

**Step 1: Update vendor name in ItemFilters**

In `src/components/ItemFilters.tsx` line 141, change:
```tsx
<span>{vendor.name}</span>
```
to:
```tsx
<span className="capitalize">{vendor.name}</span>
```

**Step 2: Update recipe name in ItemFilters**

In `src/components/ItemFilters.tsx` line 189, change:
```tsx
<span>{recipe.name}</span>
```
to:
```tsx
<span className="capitalize">{recipe.name}</span>
```

**Step 3: Update recipe name button in cooking page**

In `src/routes/cooking.tsx` line 259, change:
```tsx
className="flex-1 text-left font-medium hover:underline"
```
to:
```tsx
className="flex-1 text-left font-medium hover:underline capitalize"
```

**Step 4: Verify**

Run: `pnpm test`
Expected: all tests pass

**Step 5: Commit**

```bash
git add src/components/ItemFilters.tsx src/routes/cooking.tsx
git commit -m "style(ux): capitalize vendor and recipe names in filters and cooking page"
```
