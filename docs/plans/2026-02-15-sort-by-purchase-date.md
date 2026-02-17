# Sort by Last Purchase Date — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the "Updated" sort option (sorts by save timestamp) with "Purchased" (sorts by last inventory log entry with positive delta).

**Architecture:** Rename `SortField` value `'updatedAt'` → `'purchased'` everywhere, add a `purchaseDates` map parameter to `sortItems()`, add a dedicated TanStack Query fetch for last purchase dates in the pantry page, and add a migration in `loadSortPrefs()` for users who had `'updatedAt'` stored.

**Tech Stack:** TypeScript, Vitest, Dexie.js (IndexedDB), TanStack Query, React

---

### Task 1: Update sortUtils — rename field and add purchase date sorting

**Files:**
- Modify: `src/lib/sortUtils.ts`
- Modify: `src/lib/sortUtils.test.ts`

**Context:** `sortUtils.ts` defines `SortField` and `sortItems()`. Currently has a `'updatedAt'` case that sorts by `item.updatedAt`. We're replacing it with `'purchased'` that sorts by last purchase date from inventory logs. Items with no purchase date (`null`) always sort last regardless of direction.

The `sortItems` function currently takes 5 parameters:
```ts
sortItems(items, quantities, expiryDates, sortBy, direction)
```
We're adding `purchaseDates` as a new 4th parameter (before `sortBy`):
```ts
sortItems(items, quantities, expiryDates, purchaseDates, sortBy, direction)
```

**Step 1: Write failing tests**

In `src/lib/sortUtils.test.ts`, add a `purchaseDates` map to the existing test fixtures and replace the two `'updatedAt'` test cases with `'purchased'` cases. Also add a test for `null` purchase dates sorting last.

Replace the existing fixture block (lines 36–46) and the two `updatedAt` tests (lines 58–72) with:

```ts
  const quantities = new Map([
    ['1', 1],
    ['2', 10],
    ['3', 1],
  ])

  const expiryDates = new Map([
    ['1', new Date('2026-02-15')],
    ['2', new Date('2026-02-20')],
    ['3', undefined],
  ])

  const purchaseDates = new Map<string, Date | null>([
    ['1', new Date('2026-01-10')], // oldest purchase
    ['2', new Date('2026-01-30')], // most recent purchase
    ['3', null],                   // never purchased
  ])
```

Then replace the two `updatedAt` tests with:

```ts
  it('sorts by purchased ascending (oldest first)', () => {
    const sorted = sortItems(items, quantities, expiryDates, purchaseDates, 'purchased', 'asc')
    expect(sorted.map((i) => i.id)).toEqual(['1', '2', '3'])
  })

  it('sorts by purchased descending (most recent first)', () => {
    const sorted = sortItems(items, quantities, expiryDates, purchaseDates, 'purchased', 'desc')
    expect(sorted.map((i) => i.id)).toEqual(['2', '1', '3'])
  })

  it('sorts null purchase dates last regardless of direction', () => {
    const sorted = sortItems(items, quantities, expiryDates, purchaseDates, 'purchased', 'asc')
    expect(sorted[sorted.length - 1].id).toBe('3')
  })
```

Also update all existing `sortItems(...)` calls throughout the test file to pass an empty `purchaseDates` map as the new 4th argument. These are the calls at lines 49, 54, 75, 81, 86–91, 96–99, 131, 151, 169. For example:

```ts
// Before:
const sorted = sortItems(items, quantities, expiryDates, 'name', 'asc')
// After:
const sorted = sortItems(items, quantities, expiryDates, new Map(), 'name', 'asc')
```

**Step 2: Run tests to confirm they fail**

```bash
pnpm test src/lib/sortUtils.test.ts
```

Expected: TypeScript errors on `'updatedAt'` field and wrong argument count.

**Step 3: Update sortUtils.ts**

Replace the entire file content:

```ts
import type { Item } from '@/types'

export type SortField = 'name' | 'stock' | 'purchased' | 'expiring'
export type SortDirection = 'asc' | 'desc'

export function sortItems(
  items: Item[],
  quantities: Map<string, number>,
  expiryDates: Map<string, Date | undefined>,
  purchaseDates: Map<string, Date | null>,
  sortBy: SortField,
  sortDirection: SortDirection,
): Item[] {
  const sorted = [...items].sort((a, b) => {
    let comparison = 0

    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name)
        break

      case 'stock': {
        const qtyA = quantities.get(a.id) ?? 0
        const qtyB = quantities.get(b.id) ?? 0
        const progressA = a.targetQuantity > 0 ? qtyA / a.targetQuantity : 1
        const progressB = b.targetQuantity > 0 ? qtyB / b.targetQuantity : 1
        comparison = progressA - progressB
        break
      }

      case 'purchased': {
        const dateA = purchaseDates.get(a.id) ?? null
        const dateB = purchaseDates.get(b.id) ?? null

        // null dates always sort last regardless of direction
        if (!dateA && !dateB) return 0
        if (!dateA) return 1
        if (!dateB) return -1

        comparison = dateA.getTime() - dateB.getTime()
        break
      }

      case 'expiring': {
        const dateA = expiryDates.get(a.id)
        const dateB = expiryDates.get(b.id)

        if (!dateA && !dateB) return 0
        if (!dateA) return 1
        if (!dateB) return -1

        comparison = dateA.getTime() - dateB.getTime()
        break
      }
    }

    return sortDirection === 'asc' ? comparison : -comparison
  })

  return sorted
}
```

**Step 4: Run tests to confirm they pass**

```bash
pnpm test src/lib/sortUtils.test.ts
```

Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/lib/sortUtils.ts src/lib/sortUtils.test.ts
git commit -m "feat(sort): replace updatedAt with purchased sort field"
```

---

### Task 2: Update sessionStorage — rename type and add migration

**Files:**
- Modify: `src/lib/sessionStorage.ts`
- Modify: `src/lib/sessionStorage.test.ts`

**Context:** `sessionStorage.ts` has its own independent `SortField` type (also used by `PantryToolbar`). It also has `loadSortPrefs()` which reads from `localStorage`. If a user had `'updatedAt'` stored from a previous session, we must migrate it to `'purchased'` so they don't get an invalid sort field.

**Step 1: Write the failing test**

Add to `src/lib/sessionStorage.test.ts` inside the `Sort preferences storage` describe block:

```ts
  it('migrates legacy updatedAt sort field to purchased', () => {
    localStorage.setItem(
      'pantry-sort-prefs',
      JSON.stringify({ sortBy: 'updatedAt', sortDirection: 'desc' }),
    )
    const loaded = loadSortPrefs()
    expect(loaded).toEqual({ sortBy: 'purchased', sortDirection: 'desc' })
  })
```

**Step 2: Run test to confirm it fails**

```bash
pnpm test src/lib/sessionStorage.test.ts
```

Expected: FAIL — `loadSortPrefs` returns `'updatedAt'`, not `'purchased'`.

**Step 3: Update sessionStorage.ts**

Change the `SortField` type on line 73:
```ts
// Before:
export type SortField = 'name' | 'stock' | 'updatedAt' | 'expiring'
// After:
export type SortField = 'name' | 'stock' | 'purchased' | 'expiring'
```

Update `loadSortPrefs()` to add validation and migration after `JSON.parse`. Replace the current return statement at line 103:

```ts
    // Before:
    return parsed as SortPreferences

    // After:
    const validFields: SortField[] = ['name', 'stock', 'purchased', 'expiring']
    const validDirections: SortDirection[] = ['asc', 'desc']

    const sortBy: SortField = parsed.sortBy === 'updatedAt'
      ? 'purchased'                                    // migrate legacy value
      : validFields.includes(parsed.sortBy)
        ? parsed.sortBy
        : 'expiring'                                   // unknown value → default

    const sortDirection: SortDirection = validDirections.includes(parsed.sortDirection)
      ? parsed.sortDirection
      : 'asc'

    return { sortBy, sortDirection }
```

**Step 4: Run tests to confirm they pass**

```bash
pnpm test src/lib/sessionStorage.test.ts
```

Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/lib/sessionStorage.ts src/lib/sessionStorage.test.ts
git commit -m "feat(sort): rename SortField updatedAt to purchased, add migration"
```

---

### Task 3: Update pantry page — add purchase dates query and wire to sortItems

**Files:**
- Modify: `src/routes/index.tsx`

**Context:** The pantry page currently calls `sortItems` with 5 args. We need to pass a 6th (`purchaseDates`). We also need to add a query that builds a `Map<string, Date | null>` by calling `getLastPurchaseDate(item.id)` for each item. `getLastPurchaseDate` is already imported (used inside `allExpiryDates` query).

**Step 1: Add the `allPurchaseDates` query**

After the `allExpiryDates` query block (around line 116), add:

```ts
  // Fetch last purchase date per item for sorting
  const { data: allPurchaseDates } = useQuery({
    queryKey: ['items', 'purchaseDates'],
    queryFn: async () => {
      const map = new Map<string, Date | null>()
      for (const item of items) {
        map.set(item.id, await getLastPurchaseDate(item.id))
      }
      return map
    },
    enabled: items.length > 0,
  })
```

**Step 2: Pass `allPurchaseDates` to `sortItems`**

Update the `sortItems` call (around line 119):

```ts
  // Before:
  const sortedItems = sortItems(
    filteredItems,
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    sortBy,
    sortDirection,
  )

  // After:
  const sortedItems = sortItems(
    filteredItems,
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    allPurchaseDates ?? new Map(),
    sortBy,
    sortDirection,
  )
```

**Step 3: Run all tests**

```bash
pnpm test
```

Expected: All tests pass (TypeScript will catch any missed callsites).

**Step 4: Commit**

```bash
git add src/routes/index.tsx
git commit -m "feat(sort): add purchase dates query and pass to sortItems"
```

---

### Task 4: Update PantryToolbar — rename label and field references

**Files:**
- Modify: `src/components/PantryToolbar.tsx`

**Context:** The toolbar has a `sortLabels` map and button onClick/active-state that reference `'updatedAt'`. Update them to `'purchased'`.

**Step 1: Update the label map (line 29–34)**

```ts
// Before:
const sortLabels: Record<SortField, string> = {
  expiring: 'Expiring',
  name: 'Name',
  stock: 'Stock',
  updatedAt: 'Updated',
}

// After:
const sortLabels: Record<SortField, string> = {
  expiring: 'Expiring',
  name: 'Name',
  stock: 'Stock',
  purchased: 'Purchased',
}
```

**Step 2: Update the button (lines 106–107)**

```tsx
// Before:
className={sortBy === 'updatedAt' ? 'bg-background-base' : ''}
onClick={() => handleCriteriaChange('updatedAt')}

// After:
className={sortBy === 'purchased' ? 'bg-background-base' : ''}
onClick={() => handleCriteriaChange('purchased')}
```

**Step 3: Run all tests**

```bash
pnpm test
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add src/components/PantryToolbar.tsx
git commit -m "feat(sort): rename Updated label to Purchased in toolbar"
```

---

### Task 5: Verify and finish

**Step 1: Run the full test suite**

```bash
pnpm test
```

Expected: All tests pass, no TypeScript errors.

**Step 2: Check for any remaining `updatedAt` sort references**

```bash
grep -r "updatedAt" src/ --include="*.ts" --include="*.tsx" | grep -v "item.updatedAt\|createdAt\|updatedAt:"
```

Expected: No results (only `item.updatedAt` property accesses remain, not sort field strings).

**Step 3: Finish the branch**

Use superpowers:finishing-a-development-branch to present merge/PR options.
