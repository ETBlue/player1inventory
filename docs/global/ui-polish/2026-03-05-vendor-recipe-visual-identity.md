# Vendor & Recipe Visual Identity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `Store` and `CookingPot` icons to vendor/recipe UI surfaces so users can visually distinguish system-defined objects (vendors, recipes) from user-defined objects (tag types, tags).

**Architecture:** Pure visual changes — no logic, no new components, no data model changes. Add lucide-react icon imports and JSX icon elements to three existing components.

**Tech Stack:** React 19, lucide-react (already installed), Tailwind CSS

---

### Task 1: ItemFilters — icons in vendor/recipe triggers + move/rename Edit button

**Files:**
- Modify: `src/components/ItemFilters.tsx`

**Context:**

Current import line 4:
```tsx
import { ChevronDown, Pencil, X } from 'lucide-react'
```

Current vendor trigger (lines 116–127):
```tsx
<Button
  variant={selectedVendorIds.length > 0 ? 'neutral' : 'neutral-ghost'}
  size="xs"
  className="gap-1"
>
  Vendors
  <ChevronDown />
</Button>
```

Current recipe trigger (lines 165–174):
```tsx
<Button
  variant={selectedRecipeIds.length > 0 ? 'neutral' : 'neutral-ghost'}
  size="xs"
  className="gap-1"
>
  Recipes
  <ChevronDown />
</Button>
```

Current Edit button (lines 210–215, at the END of the component, after vendor and recipe dropdowns):
```tsx
<Link to="/settings/tags">
  <Button size="xs" variant="neutral-ghost">
    <Pencil />
    Edit
  </Button>
</Link>
```

**Step 1: Update the import**

Replace line 4:
```tsx
import { ChevronDown, CookingPot, Pencil, Store, X } from 'lucide-react'
```

**Step 2: Add icon to vendor trigger**

Replace the vendor `<Button>` content:
```tsx
<Button
  variant={selectedVendorIds.length > 0 ? 'neutral' : 'neutral-ghost'}
  size="xs"
  className="gap-1"
>
  <Store />
  Vendors
  <ChevronDown />
</Button>
```

**Step 3: Add icon to recipe trigger**

Replace the recipe `<Button>` content:
```tsx
<Button
  variant={selectedRecipeIds.length > 0 ? 'neutral' : 'neutral-ghost'}
  size="xs"
  className="gap-1"
>
  <CookingPot />
  Recipes
  <ChevronDown />
</Button>
```

**Step 4: Move and rename the Edit button**

Remove the `<Link>` block from its current position (after the recipe `</DropdownMenu>`).

Insert it immediately after the `tagTypesWithTags.map(...)` closing `}` and before the `{showVendors && ...}` block:

```tsx
      {/* end of tagTypesWithTags.map */}

      <Link to="/settings/tags">
        <Button size="xs" variant="neutral-ghost">
          <Pencil />
          Edit Tags
        </Button>
      </Link>

      {showVendors && (
```

**Step 5: Verify in browser**

Run `pnpm dev` and navigate to pantry or shopping page. Open the Filters panel. Confirm:
- Tag dropdowns appear first
- "Edit Tags" button appears after tags, before vendors
- Vendor button shows Store icon before "Vendors"
- Recipe button shows CookingPot icon before "Recipes"

**Step 6: Commit**

```bash
git add src/components/ItemFilters.tsx
git commit -m "feat(filters): add vendor/recipe icons and move Edit Tags button"
```

---

### Task 2: VendorCard — Store icon prefix

**Files:**
- Modify: `src/components/VendorCard.tsx`

**Context:**

Current import line 2:
```tsx
import { Trash2 } from 'lucide-react'
```

Current name area (lines 17–26):
```tsx
<div className="flex items-center gap-2">
  <Link
    to="/settings/vendors/$id"
    params={{ id: vendor.id }}
    className="font-medium hover:underline"
  >
    {vendor.name}
  </Link>
  {itemCount !== undefined && (
    <span className="text-sm text-foreground-muted">
      · {itemCount} items
    </span>
  )}
</div>
```

**Step 1: Update the import**

```tsx
import { Store, Trash2 } from 'lucide-react'
```

**Step 2: Add icon before the Link**

```tsx
<div className="flex items-center gap-2">
  <Store className="h-4 w-4 text-foreground-muted" />
  <Link
    to="/settings/vendors/$id"
    params={{ id: vendor.id }}
    className="font-medium hover:underline"
  >
    {vendor.name}
  </Link>
  {itemCount !== undefined && (
    <span className="text-sm text-foreground-muted">
      · {itemCount} items
    </span>
  )}
</div>
```

**Step 3: Verify in browser**

Navigate to `/settings/vendors`. Confirm each vendor row shows a Store icon to the left of the name.

**Step 4: Commit**

```bash
git add src/components/VendorCard.tsx
git commit -m "feat(vendors): add Store icon prefix to VendorCard"
```

---

### Task 3: RecipeCard — CookingPot icon prefix

**Files:**
- Modify: `src/components/RecipeCard.tsx`

**Context:**

Current import line 2:
```tsx
import { Trash2 } from 'lucide-react'
```

Current name area (lines 16–29):
```tsx
<div className="flex items-center gap-2">
  <Link
    to="/settings/recipes/$id"
    params={{ id: recipe.id }}
    className="font-medium hover:underline capitalize"
  >
    {recipe.name}
  </Link>
  {itemCount !== undefined && (
    <span className="text-sm text-foreground-muted">
      · {itemCount} items
    </span>
  )}
</div>
```

**Step 1: Update the import**

```tsx
import { CookingPot, Trash2 } from 'lucide-react'
```

**Step 2: Add icon before the Link**

```tsx
<div className="flex items-center gap-2">
  <CookingPot className="h-4 w-4 text-foreground-muted" />
  <Link
    to="/settings/recipes/$id"
    params={{ id: recipe.id }}
    className="font-medium hover:underline capitalize"
  >
    {recipe.name}
  </Link>
  {itemCount !== undefined && (
    <span className="text-sm text-foreground-muted">
      · {itemCount} items
    </span>
  )}
</div>
```

**Step 3: Verify in browser**

Navigate to `/settings/recipes`. Confirm each recipe row shows a CookingPot icon to the left of the name.

**Step 4: Commit**

```bash
git add src/components/RecipeCard.tsx
git commit -m "feat(recipes): add CookingPot icon prefix to RecipeCard"
```
