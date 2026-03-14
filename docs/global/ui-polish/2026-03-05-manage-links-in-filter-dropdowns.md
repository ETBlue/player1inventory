# Manage Links in Filter Dropdowns Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add "Manage" navigation links (with Pencil icon) to the vendor and recipe filter dropdowns in `ItemFilters`, and add a Pencil icon to the existing "Manage vendors..." option in the shopping page vendor select.

**Architecture:** Pure JSX additions — no new components, no logic changes. `ItemFilters` gets a `DropdownMenuSeparator` + `DropdownMenuItem asChild` wrapping a `<Link>` at the bottom of each vendor/recipe dropdown. Shopping page gets a `<Pencil>` icon added inside the existing `<SelectItem>`.

**Tech Stack:** React, TypeScript, TanStack Router (`<Link>`), shadcn/ui (`DropdownMenuItem`, `SelectItem`), lucide-react (`Pencil`).

---

### Task 1: Add Manage links to vendor and recipe dropdowns in ItemFilters

**Files:**
- Modify: `src/components/ItemFilters.tsx`

**Background:**

`ItemFilters` renders filter dropdowns. The vendor dropdown is at roughly lines 114–160, the recipe dropdown at lines 162–208 (after the reorder already committed in this branch). Each uses `<DropdownMenuContent>` with `<DropdownMenuCheckboxItem>` rows and an optional "Clear" footer.

All required imports are already present in the file:
- `Link` from `@tanstack/react-router` (line 3)
- `Pencil` from `lucide-react` (line 4)
- `DropdownMenuSeparator` (line 8)
- `DropdownMenuItem` (line 11)

**Step 1: Read the file**

Read `src/components/ItemFilters.tsx` to confirm current line numbers for vendor and recipe `</DropdownMenuContent>` closing tags.

**Step 2: Add Manage link to vendor dropdown**

Inside the vendor `<DropdownMenuContent>`, add after the existing `{selectedVendorIds.length > 0 && (...)}` block and before `</DropdownMenuContent>`:

```tsx
<DropdownMenuSeparator />
<DropdownMenuItem asChild>
  <Link to="/settings/vendors" className="flex items-center gap-1.5">
    <Pencil className="h-4 w-4" />
    <span className="text-xs">Manage</span>
  </Link>
</DropdownMenuItem>
```

**Step 3: Add Manage link to recipe dropdown**

Same pattern inside the recipe `<DropdownMenuContent>`, after the `{selectedRecipeIds.length > 0 && (...)}` block:

```tsx
<DropdownMenuSeparator />
<DropdownMenuItem asChild>
  <Link to="/settings/recipes" className="flex items-center gap-1.5">
    <Pencil className="h-4 w-4" />
    <span className="text-xs">Manage</span>
  </Link>
</DropdownMenuItem>
```

**Step 4: Run tests**

Run: `pnpm test --run`
Expected: All 45 test files / 566 tests pass.

**Step 5: Commit**

```bash
git add src/components/ItemFilters.tsx
git commit -m "feat(filters): add manage links to vendor and recipe dropdowns"
```

---

### Task 2: Add Pencil icon to "Manage vendors..." in shopping page

**Files:**
- Modify: `src/routes/shopping.tsx`

**Background:**

`shopping.tsx` has an existing `<SelectItem value="__manage__">Manage vendors...</SelectItem>` (around line 253). It currently has no icon. We add a `<Pencil>` icon for visual consistency with the manage links added in Task 1.

**Step 1: Add Pencil to imports**

In `src/routes/shopping.tsx`, find the lucide-react import line:

```tsx
import { Check, X } from 'lucide-react'
```

Add `Pencil`:

```tsx
import { Check, Pencil, X } from 'lucide-react'
```

**Step 2: Update the SelectItem**

Find (around line 253):

```tsx
<SelectItem value="__manage__">Manage vendors...</SelectItem>
```

Replace with:

```tsx
<SelectItem value="__manage__" className="flex items-center gap-1.5">
  <Pencil className="h-4 w-4" />
  <span>Manage vendors...</span>
</SelectItem>
```

**Step 3: Run tests**

Run: `pnpm test --run`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add src/routes/shopping.tsx
git commit -m "style(shopping): add pencil icon to manage vendors option"
```
