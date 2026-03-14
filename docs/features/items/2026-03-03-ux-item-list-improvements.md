# Item List UX Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Float assigned items to top in tag/vendor items tabs; fix one-version-behind sort staleness on all item list pages.

**Architecture:**
- Feature A: After the existing two-branch filter+sort pipeline, split items by assignment status
  and concatenate `[assigned, unassigned]`. Two files affected — recipe items tab already does this.
- Feature B: Extract a shared `useItemSortData(items)` hook. Converts `quantities` to `useMemo`
  (eliminates the race for stock sort). Uses items-derived queryKeys for `expiryDates` and
  `purchaseDates` queries so TanStack Query treats them as new cache entries when items update,
  guaranteeing the queryFn closure captures fresh items. Replace the identical inline sort queries
  duplicated across five pages with this hook.

**Tech Stack:** React 19, TanStack Query (`useQuery`, `useMemo`), Vitest + React Testing Library,
TypeScript, Dexie.js (`getLastPurchaseDate` from `src/db/operations.ts`)

---

## Feature A: Checked Items On Top

### Task 1: Float assigned items to top in tag items tab

**Files:**
- Modify: `src/routes/settings/tags/$id/items.tsx:192-199`
- Test: `src/routes/settings/tags/$id/items.test.tsx`

**Step 1: Write the failing test**

Add to `src/routes/settings/tags/$id/items.test.tsx` inside the `describe` block, after the
existing sort test:

```typescript
it('user can see assigned items listed before unassigned items regardless of sort', async () => {
  // Given: a tag with two items — Milk is assigned (sorts after Apple alphabetically)
  const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
  const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
  await makeItem('Milk', [tag.id]) // assigned — M comes after A
  await makeItem('Apple')          // unassigned — A comes before M

  // When: user views the items tab (default sort: name asc)
  renderItemsTab(tag.id)

  // Then: Milk (assigned) appears before Apple (unassigned)
  await waitFor(() => {
    const links = screen.getAllByRole('link', { name: /milk|apple/i })
    const names = links.map((el) => el.textContent?.trim() ?? '')
    expect(names[0]).toMatch(/milk/i)
    expect(names[1]).toMatch(/apple/i)
  })
})
```

**Step 2: Run the test to verify it fails**

```bash
pnpm test src/routes/settings/tags
```

Expected: FAIL — Apple appears before Milk (alphabetical, no float yet)

**Step 3: Implement — split by assignment after sortItems**

In `src/routes/settings/tags/$id/items.tsx`, replace lines 192–199:

```typescript
// Before
const filteredItems = sortItems(
  search.trim() ? searchedItems : recipeFiltered,
  allQuantities ?? new Map(),
  allExpiryDates ?? new Map(),
  allPurchaseDates ?? new Map(),
  sortBy,
  sortDirection,
)
```

```typescript
// After
const sortedItems = sortItems(
  search.trim() ? searchedItems : recipeFiltered,
  allQuantities ?? new Map(),
  allExpiryDates ?? new Map(),
  allPurchaseDates ?? new Map(),
  sortBy,
  sortDirection,
)
const filteredItems = [
  ...sortedItems.filter((item) => isAssigned(item.tagIds)),
  ...sortedItems.filter((item) => !isAssigned(item.tagIds)),
]
```

`filteredItems` is still the variable used in the JSX — no JSX changes needed.

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/routes/settings/tags
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/settings/tags/\$id/items.tsx src/routes/settings/tags/\$id/items.test.tsx
git commit -m "feat(tags): float assigned items to top of items tab"
```

---

### Task 2: Float assigned items to top in vendor items tab

**Files:**
- Modify: `src/routes/settings/vendors/$id/items.tsx:212-219`
- Test: `src/routes/settings/vendors/$id/items.test.tsx`

**Step 1: Write the failing test**

Look at `src/routes/settings/vendors/$id/items.test.tsx` for the `makeItem` and `renderItemsTab`
helpers already defined there, then add inside the `describe` block:

```typescript
it('user can see assigned items listed before unassigned items regardless of sort', async () => {
  // Given: a vendor with two items — Milk is assigned (sorts after Apple alphabetically)
  const vendor = await createVendor('Supermart')
  await makeItem('Milk', [vendor.id]) // assigned — M comes after A
  await makeItem('Apple')             // unassigned — A comes before M

  // When: user views the items tab (default sort: name asc)
  renderItemsTab(vendor.id)

  // Then: Milk (assigned) appears before Apple (unassigned)
  await waitFor(() => {
    const links = screen.getAllByRole('link', { name: /milk|apple/i })
    const names = links.map((el) => el.textContent?.trim() ?? '')
    expect(names[0]).toMatch(/milk/i)
    expect(names[1]).toMatch(/apple/i)
  })
})
```

Note: check how `makeItem` is defined in the vendor test file — it may take `vendorIds` instead of
`tagIds`. Adjust accordingly.

**Step 2: Run the test to verify it fails**

```bash
pnpm test src/routes/settings/vendors
```

Expected: FAIL

**Step 3: Implement — same pattern as Task 1**

In `src/routes/settings/vendors/$id/items.tsx`, apply the same split. The `isAssigned` function
there checks `item.vendorIds` instead of `item.tagIds`:

```typescript
const sortedItems = sortItems(
  search.trim() ? searchedItems : recipeFiltered,
  allQuantities ?? new Map(),
  allExpiryDates ?? new Map(),
  allPurchaseDates ?? new Map(),
  sortBy,
  sortDirection,
)
const filteredItems = [
  ...sortedItems.filter((item) => isAssigned(item.vendorIds)),
  ...sortedItems.filter((item) => !isAssigned(item.vendorIds)),
]
```

**Step 4: Run tests**

```bash
pnpm test src/routes/settings/vendors
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/settings/vendors/\$id/items.tsx src/routes/settings/vendors/\$id/items.test.tsx
git commit -m "feat(vendors): float assigned items to top of items tab"
```

---

## Feature B: Sort Staleness Fix

### Background

All five item list pages define three identical TanStack Query sort queries inline:

| queryKey               | purpose                        |
|------------------------|--------------------------------|
| `['items', 'quantities']`  | stock sort (synchronous math)  |
| `['items', 'expiryDates']` | expiring sort (async DB reads) |
| `['items', 'purchaseDates']` | purchased sort (async DB reads) |

`useUpdateItem.onSuccess` calls `invalidateQueries({ queryKey: ['items'] })`. Because the prefix
`['items']` matches all three sort keys, they're invalidated at the same time as the main items
query and race to refetch in parallel. Each sort query's `queryFn` closes over the `items` variable
— but at that moment `items` still holds the pre-save value (the main items query hasn't resolved
yet). Result: sort data is always one version behind.

**Fix:** `quantities` becomes a `useMemo` — always synchronously derived from the already-fresh
items array. `expiryDates` and `purchaseDates` keep their async shape but use items-derived
queryKeys, so when items update the key changes → cache miss → queryFn runs with current items.

---

### Task 3: Create `useItemSortData` hook

**Files:**
- Create: `src/hooks/useItemSortData.ts`

**Step 1: Create the hook**

```typescript
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getLastPurchaseDate } from '@/db/operations'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import type { Item } from '@/types'

export function useItemSortData(items: Item[] | undefined) {
  const safeItems = items ?? []

  // quantities: pure synchronous derivation — no race condition possible
  const quantities = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of safeItems) {
      map.set(item.id, getCurrentQuantity(item))
    }
    return map
  }, [safeItems])

  // expiryDates: queryKey includes dueDate + estimatedDueDays per item so the key
  // changes when items update, forcing a fresh queryFn run with current items
  const expiryKey = safeItems
    .map((i) => `${i.id}:${String(i.dueDate)}:${String(i.estimatedDueDays)}`)
    .join(',')

  const { data: expiryDates } = useQuery({
    queryKey: ['sort', 'expiryDates', expiryKey],
    queryFn: async () => {
      const map = new Map<string, Date | undefined>()
      for (const item of safeItems) {
        const lastPurchase = await getLastPurchaseDate(item.id)
        const estimatedDate =
          item.estimatedDueDays && lastPurchase
            ? new Date(
                lastPurchase.getTime() +
                  item.estimatedDueDays * 24 * 60 * 60 * 1000,
              )
            : item.dueDate ?? undefined
        map.set(item.id, estimatedDate)
      }
      return map
    },
    enabled: safeItems.length > 0,
  })

  // purchaseDates: queryKey uses item IDs — stable during item edits, changes when
  // items are added/removed. After checkout, the checkout mutation explicitly
  // invalidates ['sort', 'purchaseDates'] to refresh purchase dates.
  const purchaseKey = safeItems.map((i) => i.id).join(',')

  const { data: purchaseDates } = useQuery({
    queryKey: ['sort', 'purchaseDates', purchaseKey],
    queryFn: async () => {
      const map = new Map<string, Date | null>()
      for (const item of safeItems) {
        map.set(item.id, await getLastPurchaseDate(item.id))
      }
      return map
    },
    enabled: safeItems.length > 0,
  })

  return { quantities, expiryDates, purchaseDates }
}
```

**Step 2: Verify the file looks correct** (run TypeScript check)

```bash
pnpm exec tsc --noEmit
```

Expected: no errors in the new file

**Step 3: Commit**

```bash
git add src/hooks/useItemSortData.ts
git commit -m "feat(hooks): add useItemSortData to fix sort staleness race condition"
```

---

### Task 4: Replace sort queries in pantry page

**Files:**
- Modify: `src/routes/index.tsx:1-10` (imports) and `src/routes/index.tsx:127-171` (sort queries)

**Step 1: Add import and replace the three queries**

In `src/routes/index.tsx`:

1. Add to imports at the top:
   ```typescript
   import { useItemSortData } from '@/hooks/useItemSortData'
   ```

2. Remove the three `useQuery` blocks that define `allQuantities` (line 127), `allExpiryDates`
   (line 141), and `allPurchaseDates` (line 162). Also remove the `getLastPurchaseDate` import
   from `@/db/operations` if it's no longer used elsewhere in the file (check before removing).
   Similarly remove `getCurrentQuantity` from `@/lib/quantityUtils` if unused.

3. Replace the three removed blocks with one line:
   ```typescript
   const { quantities: allQuantities, expiryDates: allExpiryDates, purchaseDates: allPurchaseDates } =
     useItemSortData(items)
   ```

   The `sortItems` call and all JSX below remain unchanged.

**Step 2: Run tests**

```bash
pnpm test src/routes/index
```

Expected: PASS (existing pantry tests cover sort behavior)

**Step 3: Commit**

```bash
git add src/routes/index.tsx
git commit -m "fix(pantry): replace inline sort queries with useItemSortData hook"
```

---

### Task 5: Replace sort queries in shopping page

**Files:**
- Modify: `src/routes/shopping.tsx:1-10` (imports) and `src/routes/shopping.tsx:103-145`

**Step 1: Apply same replacement**

In `src/routes/shopping.tsx`:

1. Add import:
   ```typescript
   import { useItemSortData } from '@/hooks/useItemSortData'
   ```

2. Remove the three `useQuery` blocks (lines 103–145, same pattern as pantry).

3. Replace with:
   ```typescript
   const { quantities: allQuantities, expiryDates: allExpiryDates, purchaseDates: allPurchaseDates } =
     useItemSortData(items)
   ```

   Both `sortItems` calls (cart section and pending section) remain unchanged.

**Step 2: Run tests**

```bash
pnpm test src/routes/shopping
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/routes/shopping.tsx
git commit -m "fix(shopping): replace inline sort queries with useItemSortData hook"
```

---

### Task 6: Replace sort queries in tag items tab

**Files:**
- Modify: `src/routes/settings/tags/$id/items.tsx:1-20` (imports) and lines 79–121 (sort queries)

**Step 1: Apply same replacement**

In `src/routes/settings/tags/$id/items.tsx`:

1. Add import:
   ```typescript
   import { useItemSortData } from '@/hooks/useItemSortData'
   ```

2. Remove the three `useQuery` blocks (lines 79–121). Also remove `getLastPurchaseDate` and
   `getCurrentQuantity` imports if they're no longer used directly in this file after the removal.

3. Replace with:
   ```typescript
   const { quantities: allQuantities, expiryDates: allExpiryDates, purchaseDates: allPurchaseDates } =
     useItemSortData(items)
   ```

   The `sortItems` call and the checked-items-on-top split from Task 1 remain unchanged.

**Step 2: Run tests**

```bash
pnpm test src/routes/settings/tags
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/routes/settings/tags/\$id/items.tsx
git commit -m "fix(tags): replace inline sort queries with useItemSortData hook"
```

---

### Task 7: Replace sort queries in vendor items tab

**Files:**
- Modify: `src/routes/settings/vendors/$id/items.tsx:1-20` (imports) and lines 79–121 (sort queries)

**Step 1: Apply same replacement** (identical to Task 6, different file)

**Step 2: Run tests**

```bash
pnpm test src/routes/settings/vendors
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/routes/settings/vendors/\$id/items.tsx
git commit -m "fix(vendors): replace inline sort queries with useItemSortData hook"
```

---

### Task 8: Replace sort queries in recipe items tab

**Files:**
- Modify: `src/routes/settings/recipes/$id/items.tsx:90-134` (sort queries)

**Step 1: Apply same replacement** (identical pattern)

Note: This file already implements the checked-items-on-top split — do not remove that logic.

**Step 2: Run tests**

```bash
pnpm test src/routes/settings/recipes
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/routes/settings/recipes/\$id/items.tsx
git commit -m "fix(recipes): replace inline sort queries with useItemSortData hook"
```

---

### Task 9: Update checkout mutation to invalidate purchase dates sort cache

**Files:**
- Modify: `src/hooks/useShoppingCart.ts:77-87`

**Background:** After checkout, purchase dates in the DB change for bought items. The
`purchaseDates` queryKey is based on item IDs (stable across checkout since no items are
added/removed). Without explicit invalidation, the cached purchase dates would remain stale until
the next navigation that changes the item list. Adding invalidation of `['sort', 'purchaseDates']`
ensures the "purchased" sort reflects the latest purchase dates immediately after checkout.

**Step 1: Add invalidation in `useCheckout.onSuccess`**

In `src/hooks/useShoppingCart.ts`, find `useCheckout` (around line 77). In the `onSuccess`
callback, add one line:

```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['cart'] })
  queryClient.invalidateQueries({ queryKey: ['items'] })
  queryClient.invalidateQueries({ queryKey: ['sort', 'purchaseDates'] }) // ← add this
},
```

**Step 2: Run the full test suite**

```bash
pnpm test
```

Expected: all tests pass

**Step 3: Commit**

```bash
git add src/hooks/useShoppingCart.ts
git commit -m "fix(shopping): invalidate purchase dates sort cache after checkout"
```

---

## Verification

After all tasks are complete:

```bash
pnpm test       # all tests pass
pnpm build      # no TypeScript or build errors
```

Manual verification:
1. On pantry page, edit an item's quantity. Return to pantry. Sort order should reflect the new
   quantity immediately (not one step behind).
2. On pantry page, edit an item's expiration date. Return. Expiring sort order should update.
3. On tag items tab, verify assigned items appear at top regardless of name sort order.
4. On vendor items tab, same verification.
5. On recipe items tab, confirm existing checked-items-on-top behavior still works.
