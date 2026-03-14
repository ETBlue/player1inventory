# Create-on-Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the `+ Create "xxx"` item-list row with a `+ Create` button inside the search input on all item list pages, and add create-on-search to the pantry and shopping pages.

**Architecture:** Add `onCreateFromSearch` prop to `ItemListToolbar`. The toolbar computes a `queriedCount` (items matching search text) internally and swaps the ✕ button for a `+` button when the prop is provided and `queriedCount === 0`. Each page wires the prop with its own create logic. Default values for all quick-creates change from 1 to 0.

**Tech Stack:** React 19, TanStack Query (`useCreateItem`), TanStack Router (`useNavigate`), Tailwind CSS v4, Vitest + React Testing Library

---

### Worktree setup (do this first)

```bash
git worktree add .worktrees/feature-create-on-search -b feature/create-on-search
cd .worktrees/feature-create-on-search
```

---

### Task 1: Update `ItemListToolbar` — add prop, queriedCount, and button swap

**Files:**
- Modify: `src/components/ItemListToolbar.tsx`

**Step 1: Add `onCreateFromSearch` to the props interface**

In `ItemListToolbarProps` (after the `onSearchSubmit` line, ~line 48), add:

```ts
onCreateFromSearch?: (query: string) => void
```

Destructure it in the function signature alongside `onSearchSubmit`.

**Step 2: Add `queriedCount` derived value**

After line 80 (`const filteredCount = filterItems(items, filterState).length`), add:

```ts
const queriedCount = search.trim()
  ? items.filter((item) =>
      item.name.toLowerCase().includes(search.toLowerCase())
    ).length
  : items.length
```

**Step 3: Fix the `onSearchSubmit` Enter handler**

At line 93, change `filteredCount === 0` → `queriedCount === 0`:

```ts
if (onSearchSubmit && queriedCount === 0 && search.trim()) {
  onSearchSubmit(search.trim())
}
```

**Step 4: Add `Plus` to the lucide-react import**

Line 3 currently reads:
```ts
import { ArrowDown, ArrowUp, Filter, Search, Tags, X } from 'lucide-react'
```
Change to:
```ts
import { ArrowDown, ArrowUp, Filter, Plus, Search, Tags, X } from 'lucide-react'
```

**Step 5: Replace the ✕ button block with conditional ✕ / + Create**

Lines 236–246 currently read:
```tsx
{search && (
  <Button
    size="icon"
    variant="neutral-ghost"
    className="h-6 w-6 shrink-0"
    onClick={() => setSearch('')}
    aria-label="Clear search"
  >
    <X className="h-3 w-3" />
  </Button>
)}
```

Replace with:
```tsx
{search && (
  onCreateFromSearch && queriedCount === 0 ? (
    <Button
      size="icon"
      variant="neutral-ghost"
      className="h-6 w-6 shrink-0"
      onClick={() => onCreateFromSearch(search.trim())}
      aria-label="Create item"
    >
      <Plus className="h-3 w-3" />
    </Button>
  ) : (
    <Button
      size="icon"
      variant="neutral-ghost"
      className="h-6 w-6 shrink-0"
      onClick={() => setSearch('')}
      aria-label="Clear search"
    >
      <X className="h-3 w-3" />
    </Button>
  )
)}
```

**Step 6: Smoke-test in browser**

```bash
pnpm dev
```

- Open pantry (`/`), click the Search icon, type a name that matches no items
- Expected: `+` (Plus) icon appears on the right of the search input instead of ✕
- Type a name that matches items → ✕ icon appears
- Click ✕ → clears search

**Step 7: Commit**

```bash
git add src/components/ItemListToolbar.tsx
git commit -m "feat(toolbar): add onCreateFromSearch prop, replace ✕ with + on zero results"
```

---

### Task 2: Update tag items tab

**Files:**
- Modify: `src/routes/settings/tags/$id/items.tsx`

**Step 1: Update `handleCreateFromSearch` — new defaults, no search clear**

Replace the entire `handleCreateFromSearch` function (lines 128–147) with:

```ts
const handleCreateFromSearch = async () => {
  const trimmed = search.trim()
  if (!trimmed) return
  try {
    await createItem.mutateAsync({
      name: trimmed,
      tagIds: [tagId],
      vendorIds: [],
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    })
  } catch {
    // input stays populated for retry
  }
}
```

**Step 2: Remove unused `setSearch` from destructuring**

Line 30 currently reads:
```ts
const { search, filterState, isTagsVisible, setSearch } =
  useUrlSearchAndFilters()
```
Change to:
```ts
const { search, filterState, isTagsVisible } =
  useUrlSearchAndFilters()
```

**Step 3: Wire `onCreateFromSearch` on `ItemListToolbar`**

In the `<ItemListToolbar>` JSX (~line 151), add the prop:
```tsx
onCreateFromSearch={handleCreateFromSearch}
```

**Step 4: Remove the `+ Create "xxx"` row**

Remove lines 197–206 (the block starting with `{filteredItems.length === 0 && search.trim() && (`).

**Step 5: Run tests**

```bash
pnpm test
```
Expected: all tests pass.

**Step 6: Commit**

```bash
git add "src/routes/settings/tags/\$id/items.tsx"
git commit -m "feat(tag-items): wire onCreateFromSearch, remove create row, default amounts to 0"
```

---

### Task 3: Update vendor items tab

**Files:**
- Modify: `src/routes/settings/vendors/$id/items.tsx`

**Step 1: Update `handleCreateFromSearch` — new defaults, no search clear**

Replace lines 111–130 with:

```ts
const handleCreateFromSearch = async () => {
  const trimmed = search.trim()
  if (!trimmed) return
  try {
    await createItem.mutateAsync({
      name: trimmed,
      vendorIds: [vendorId],
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    })
  } catch {
    // input stays populated for retry
  }
}
```

**Step 2: Remove unused `setSearch` from destructuring**

Line 30: remove `setSearch` from the destructured object (same pattern as Task 2).

**Step 3: Wire `onCreateFromSearch` on `ItemListToolbar`**

In the `<ItemListToolbar>` JSX (~line 154), add:
```tsx
onCreateFromSearch={handleCreateFromSearch}
```

**Step 4: Remove the `+ Create "xxx"` row**

Remove lines 199–208 (same pattern as Task 2).

**Step 5: Run tests**

```bash
pnpm test
```
Expected: all tests pass.

**Step 6: Commit**

```bash
git add "src/routes/settings/vendors/\$id/items.tsx"
git commit -m "feat(vendor-items): wire onCreateFromSearch, remove create row, default amounts to 0"
```

---

### Task 4: Update recipe items tab

**Files:**
- Modify: `src/routes/settings/recipes/$id/items.tsx`

**Step 1: Update `handleCreateFromSearch` — new defaults, no search clear**

Replace lines 131–160 with:

```ts
const handleCreateFromSearch = async () => {
  const trimmed = search.trim()
  if (!trimmed) return
  try {
    const newItem = await createItem.mutateAsync({
      name: trimmed,
      vendorIds: [],
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    })
    // Immediately add the new item to the recipe
    const newRecipeItems = [
      ...recipeItems,
      { itemId: newItem.id, defaultAmount: newItem.consumeAmount },
    ]
    await updateRecipe.mutateAsync({
      id: recipeId,
      updates: { items: newRecipeItems },
    })
  } catch {
    // input stays populated for retry
  }
}
```

**Step 2: Remove unused `setSearch` from destructuring**

Line 48: remove `setSearch` from the destructured object.

**Step 3: Wire `onCreateFromSearch` on `ItemListToolbar`**

In the `<ItemListToolbar>` JSX (~line 219), add:
```tsx
onCreateFromSearch={handleCreateFromSearch}
```

**Step 4: Remove the `+ Create "xxx"` row**

Remove lines 274–283 (same pattern as previous tasks).

**Step 5: Run tests**

```bash
pnpm test
```
Expected: all tests pass.

**Step 6: Commit**

```bash
git add "src/routes/settings/recipes/\$id/items.tsx"
git commit -m "feat(recipe-items): wire onCreateFromSearch, remove create row, default amounts to 0"
```

---

### Task 5: Add create-on-search to pantry page

**Files:**
- Modify: `src/routes/index.tsx`

**Step 1: Add `useCreateItem` to the hooks import**

Line 10 currently reads:
```ts
import { useAddInventoryLog, useItems, useUpdateItem } from '@/hooks'
```
Change to:
```ts
import { useAddInventoryLog, useCreateItem, useItems, useUpdateItem } from '@/hooks'
```

**Step 2: Add `useNavigate` to the router import**

Line 1 currently reads:
```ts
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
```
`useNavigate` is already imported — no change needed. (If missing, add it.)

**Step 3: Add hook calls and handler inside `PantryView`**

After line 38 (`const updateItem = useUpdateItem()`), add:

```ts
const createItem = useCreateItem()
const navigate = useNavigate()

const handleCreateFromSearch = async (query: string) => {
  try {
    const newItem = await createItem.mutateAsync({
      name: query,
      tagIds: [],
      vendorIds: [],
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    })
    navigate({ to: '/items/$id', params: { id: newItem.id } })
  } catch {
    // input stays populated for retry
  }
}
```

Note: `useNavigate` is already imported via `createFileRoute, Link, useNavigate` at line 1.

**Step 4: Wire `onCreateFromSearch` on `ItemListToolbar`**

In the `<ItemListToolbar>` JSX (~line 157), add:
```tsx
onCreateFromSearch={handleCreateFromSearch}
```

**Step 5: Run tests**

```bash
pnpm test
```
Expected: all tests pass.

**Step 6: Commit**

```bash
git add src/routes/index.tsx
git commit -m "feat(pantry): add create-on-search, navigate to item detail after create"
```

---

### Task 6: Add create-on-search to shopping page

**Files:**
- Modify: `src/routes/shopping.tsx`

**Step 1: Add `useCreateItem` to the hooks import**

Lines 28–41 import from `@/hooks`. Add `useCreateItem` to the list:

```ts
import {
  useAbandonCart,
  useActiveCart,
  useAddToCart,
  useCartItems,
  useCheckout,
  useCreateItem,
  useItems,
  useRemoveFromCart,
  useTags,
  useTagTypes,
  useUpdateCartItem,
  useVendorItemCounts,
  useVendors,
} from '@/hooks'
```

**Step 2: Add hook call and handler inside `Shopping`**

After line 66 (`const vendorCounts = useVendorItemCounts()`), add:

```ts
const createItem = useCreateItem()

const handleCreateFromSearch = async (query: string) => {
  try {
    await createItem.mutateAsync({
      name: query,
      tagIds: [],
      vendorIds: [],
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 0,
    })
  } catch {
    // input stays populated for retry
  }
}
```

After create, the search query remains, so the new item appears in the results list.

**Step 3: Wire `onCreateFromSearch` on `ItemListToolbar`**

In the `<ItemListToolbar>` JSX (~line 220), add:
```tsx
onCreateFromSearch={handleCreateFromSearch}
```

**Step 4: Run tests**

```bash
pnpm test
```
Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/routes/shopping.tsx
git commit -m "feat(shopping): add create-on-search, stay on page after create"
```

---

### Task 7: Update `/items/new` form defaults to 0

**Files:**
- Modify: `src/components/ItemForm.tsx`

**Step 1: Change default values**

Around lines 42–44, the `defaultValues` object currently sets:
```ts
targetQuantity: 1,
refillThreshold: 1,
consumeAmount: 1,
```

Change all three to `0`:
```ts
targetQuantity: 0,
refillThreshold: 0,
consumeAmount: 0,
```

**Step 2: Run tests**

```bash
pnpm test
```
Expected: all tests pass. If any test hardcodes default values of `1`, update the expectations to `0`.

**Step 3: Commit**

```bash
git add src/components/ItemForm.tsx
git commit -m "feat(item-form): set default targetQuantity, refillThreshold, consumeAmount to 0"
```

---

### Task 8: Final verification

**Step 1: Run full test suite**

```bash
pnpm test
```
Expected: all tests pass.

**Step 2: Lint check**

```bash
pnpm check
```
Expected: no errors.

**Step 3: Manual smoke test**

Test each page:

- **Pantry `/`**: Type a non-matching name → `+` button appears → click → navigates to new item detail
- **Shopping `/shopping`**: Type a non-matching name → `+` button appears → click → item appears in list
- **Tag items tab**: Type a non-matching name → `+` button appears → click → item created and assigned to tag, stays in view
- **Vendor items tab**: Same as tag items tab
- **Recipe items tab**: Same pattern, item also added to recipe with `defaultAmount: 0`
- **New item form `/items/new`**: All quantity fields start at `0`
- **Type a matching name** on any page → ✕ button appears normally

**Step 4: Create PR**

```bash
git push -u origin feature/create-on-search
gh pr create --title "feat: create-on-search button inside search input" --body "$(cat <<'EOF'
## Summary
- Adds `onCreateFromSearch` prop to `ItemListToolbar`: replaces ✕ with a `+` button when search has text and zero item matches
- Fixes `onSearchSubmit` Enter handler to use search-matched count instead of tag-filtered count
- Removes `+ Create "xxx"` rows from tag/vendor/recipe items tabs; wires them to the new prop
- Adds create-on-search to pantry (navigates to item detail) and shopping (stays on page)
- Changes all quick-create and new item form defaults: `targetQuantity`, `refillThreshold`, `consumeAmount` → `0`

## Test Plan
- [ ] Pantry: type non-matching name → `+` appears → click → navigates to item detail
- [ ] Shopping: type non-matching name → `+` appears → click → item appears in list
- [ ] Tag/vendor/recipe items tabs: type non-matching name → `+` appears → click → item created, stays in view
- [ ] Any page: type matching name → ✕ appears normally, clears on click
- [ ] New item form: all quantity fields start at `0`
- [ ] All tests pass (`pnpm test`)
- [ ] Lint passes (`pnpm check`)
EOF
)"
```
