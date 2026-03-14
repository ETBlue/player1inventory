# Shopping Page Tag Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add tag filtering to the shopping page behind a "Filters" toggle button, mirroring the pantry page pattern, working alongside the existing vendor filter.

**Architecture:** All changes are in `src/routes/shopping.tsx` (new state, filter chain, Filters button, ItemFilters row). Two new sessionStorage helpers are added to `src/lib/sessionStorage.ts` with shopping-specific keys. No changes to shared utilities (`filterUtils.ts`, `ItemFilters`, `TagTypeDropdown`). Sequential filtering: vendor filter first, tag filter applied on top.

**Tech Stack:** TanStack Router (file-based), TanStack Query, React + TypeScript, shadcn/ui Button, Vitest + React Testing Library (RouterProvider integration test pattern)

---

## Task 1: Add shopping sessionStorage helpers

**Files:**
- Modify: `src/lib/sessionStorage.ts` (append new exports at bottom)

No test needed — these are exercised by the shopping page integration tests in Task 2.

**Step 1: Add the helpers**

Append to the end of `src/lib/sessionStorage.ts`:

```ts
// Shopping page (sessionStorage)
const SHOPPING_FILTERS_KEY = 'shopping-filters'
const SHOPPING_UI_PREFS_KEY = 'shopping-ui-prefs'

export interface ShoppingUiPreferences {
  filtersVisible: boolean
}

export function saveShoppingFilters(filters: FilterState): void {
  try {
    sessionStorage.setItem(SHOPPING_FILTERS_KEY, JSON.stringify(filters))
  } catch (error) {
    console.error('Failed to save shopping filters to sessionStorage:', error)
  }
}

export function loadShoppingFilters(): FilterState {
  try {
    const stored = sessionStorage.getItem(SHOPPING_FILTERS_KEY)
    if (!stored) return {}
    const parsed = JSON.parse(stored)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {}
    }
    return parsed as FilterState
  } catch (error) {
    console.error(
      'Failed to load shopping filters from sessionStorage:',
      error,
    )
    return {}
  }
}

export function saveShoppingUiPrefs(prefs: ShoppingUiPreferences): void {
  try {
    sessionStorage.setItem(SHOPPING_UI_PREFS_KEY, JSON.stringify(prefs))
  } catch (error) {
    console.error('Failed to save shopping UI preferences:', error)
  }
}

export function loadShoppingUiPrefs(): ShoppingUiPreferences {
  try {
    const stored = sessionStorage.getItem(SHOPPING_UI_PREFS_KEY)
    if (!stored) return { filtersVisible: false }
    const parsed = JSON.parse(stored)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { filtersVisible: false }
    }
    return parsed as ShoppingUiPreferences
  } catch (error) {
    console.error('Failed to load shopping UI preferences:', error)
    return { filtersVisible: false }
  }
}
```

**Step 2: Run lint**

```bash
pnpm check
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/sessionStorage.ts
git commit -m "feat(shopping): add shopping sessionStorage helpers for tag filter state"
```

---

## Task 2: Add tag filtering to the shopping page

**Files:**
- Modify: `src/routes/shopping.tsx`
- Create: `src/routes/shopping.test.tsx`

### Step 1: Write the failing tests

Create `src/routes/shopping.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createItem, createTag, createTagType, createVendor } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Shopping page tag filtering', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.vendors.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderShoppingPage = () => {
    const history = createMemoryHistory({ initialEntries: ['/shopping'] })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can see the filters toggle button', async () => {
    // Given the shopping page
    renderShoppingPage()

    // Then the Filters toggle button is present
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /toggle filters/i }),
      ).toBeInTheDocument()
    })
  })

  it('user can show and hide the tag filter row', async () => {
    // Given a tag type with a tag exists
    const tagType = await createTagType({ name: 'Category', color: 'blue' })
    await createTag({ typeId: tagType.id, name: 'Dairy' })

    renderShoppingPage()
    const user = userEvent.setup()

    // When user clicks the Filters toggle
    const toggleBtn = await screen.findByRole('button', {
      name: /toggle filters/i,
    })
    await user.click(toggleBtn)

    // Then the tag filter row appears (Category dropdown visible)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /category/i })).toBeInTheDocument()
    })

    // When user clicks toggle again
    await user.click(toggleBtn)

    // Then the tag filter row is hidden
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /category/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('user can filter items by tag', async () => {
    // Given two items, one with a Dairy tag and one without
    const tagType = await createTagType({ name: 'Category', color: 'blue' })
    const dairyTag = await createTag({ typeId: tagType.id, name: 'Dairy' })

    await createItem({
      name: 'Milk',
      tagIds: [dairyTag.id],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await createItem({
      name: 'Bread',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    renderShoppingPage()
    const user = userEvent.setup()

    // When user opens filters and selects Dairy tag
    await user.click(
      await screen.findByRole('button', { name: /toggle filters/i }),
    )
    await user.click(
      await screen.findByRole('button', { name: /category/i }),
    )
    await user.click(
      await screen.findByRole('menuitemcheckbox', { name: /dairy/i }),
    )

    // Then only Milk is shown, Bread is hidden
    await waitFor(() => {
      expect(screen.getByText('Milk')).toBeInTheDocument()
      expect(screen.queryByText('Bread')).not.toBeInTheDocument()
    })
  })

  it('user can filter by vendor and tag simultaneously', async () => {
    // Given three items with different vendor/tag combinations
    const tagType = await createTagType({ name: 'Category', color: 'blue' })
    const dairyTag = await createTag({ typeId: tagType.id, name: 'Dairy' })
    const vendor = await createVendor('Costco')

    await createItem({
      name: 'Milk',
      tagIds: [dairyTag.id],
      vendorIds: [vendor.id],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await createItem({
      name: 'Cheese',
      tagIds: [dairyTag.id],
      vendorIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    await createItem({
      name: 'Bread',
      tagIds: [],
      vendorIds: [vendor.id],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    renderShoppingPage()
    const user = userEvent.setup()

    // When user selects the Costco vendor filter
    const vendorTrigger = await screen.findByRole('combobox')
    await user.click(vendorTrigger)
    await user.click(await screen.findByRole('option', { name: /costco/i }))

    // And user selects the Dairy tag filter
    await user.click(
      await screen.findByRole('button', { name: /toggle filters/i }),
    )
    await user.click(
      await screen.findByRole('button', { name: /category/i }),
    )
    await user.click(
      await screen.findByRole('menuitemcheckbox', { name: /dairy/i }),
    )

    // Then only Milk is shown (matches both Costco vendor and Dairy tag)
    await waitFor(() => {
      expect(screen.getByText('Milk')).toBeInTheDocument()
      expect(screen.queryByText('Cheese')).not.toBeInTheDocument()
      expect(screen.queryByText('Bread')).not.toBeInTheDocument()
    })
  })

  it('user can see empty list when all items are filtered out', async () => {
    // Given an item with a Dairy tag
    const tagType = await createTagType({ name: 'Category', color: 'blue' })
    const dairyTag = await createTag({ typeId: tagType.id, name: 'Dairy' })
    const frozenTag = await createTag({ typeId: tagType.id, name: 'Frozen' })

    await createItem({
      name: 'Milk',
      tagIds: [dairyTag.id],
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    renderShoppingPage()
    const user = userEvent.setup()

    // When user filters by Frozen tag (Milk doesn't have this tag)
    await user.click(
      await screen.findByRole('button', { name: /toggle filters/i }),
    )
    await user.click(
      await screen.findByRole('button', { name: /category/i }),
    )
    await user.click(
      await screen.findByRole('menuitemcheckbox', { name: /frozen/i }),
    )

    // Then Milk is not shown
    await waitFor(() => {
      expect(screen.queryByText('Milk')).not.toBeInTheDocument()
    })
  })
})
```

### Step 2: Run to confirm tests fail

```bash
pnpm test src/routes/shopping.test.tsx --run
```

Expected: FAIL — `Toggle filters` button not found

### Step 3: Implement tag filtering in the shopping page

Read `src/routes/shopping.tsx` first to confirm the current line numbers, then make these changes:

**3a. Update imports**

Find the existing React import:
```tsx
import { useState } from 'react'
```
Replace with:
```tsx
import { useEffect, useState } from 'react'
```

Find the existing lucide-react import. Add `Filter` to it:
```tsx
import { Filter } from 'lucide-react'
```
(The shopping page may not have a lucide import yet — if so, add the line `import { Filter } from 'lucide-react'` near the top with the other imports.)

Add these new imports (after the existing local imports):
```tsx
import { ItemFilters } from '@/components/ItemFilters'
import { type FilterState, filterItems } from '@/lib/filterUtils'
import {
  loadShoppingFilters,
  loadShoppingUiPrefs,
  saveShoppingFilters,
  saveShoppingUiPrefs,
} from '@/lib/sessionStorage'
```

**3b. Add new state and effects inside the `Shopping` function**

After the existing `const [selectedVendorId, setSelectedVendorId] = useState<string>('')`, add:

```tsx
const [filterState, setFilterState] = useState<FilterState>(() =>
  loadShoppingFilters(),
)
const [filtersVisible, setFiltersVisible] = useState(
  () => loadShoppingUiPrefs().filtersVisible,
)

const hasActiveFilters = Object.values(filterState).some(
  (tagIds) => tagIds.length > 0,
)
```

After the existing `const cartItemMap = ...` line, add the two effects:

```tsx
useEffect(() => {
  saveShoppingFilters(filterState)
}, [filterState])

useEffect(() => {
  saveShoppingUiPrefs({ filtersVisible })
}, [filtersVisible])
```

**3c. Chain tag filter after vendor filter**

Find the existing vendor filter:
```tsx
const vendorFiltered = selectedVendorId
  ? items.filter((item) => (item.vendorIds ?? []).includes(selectedVendorId))
  : items
```

After it, add:
```tsx
const filteredItems = filterItems(vendorFiltered, filterState)
```

**3d. Update cartSectionItems and pendingItems to use filteredItems**

Find:
```tsx
const cartSectionItems = vendorFiltered
  .filter((item) => cartItemMap.has(item.id))
  .sort((a, b) => getStockPercent(a) - getStockPercent(b))

const pendingItems = vendorFiltered
  .filter((item) => !cartItemMap.has(item.id))
  .sort((a, b) => getStockPercent(a) - getStockPercent(b))
```

Replace `vendorFiltered` with `filteredItems` in both:
```tsx
const cartSectionItems = filteredItems
  .filter((item) => cartItemMap.has(item.id))
  .sort((a, b) => getStockPercent(a) - getStockPercent(b))

const pendingItems = filteredItems
  .filter((item) => !cartItemMap.has(item.id))
  .sort((a, b) => getStockPercent(a) - getStockPercent(b))
```

**3e. Add Filters button to the toolbar**

In the toolbar div, find the vendor Select block and the right-side button group. Add the Filters button between the vendor Select and the `ml-auto` group:

```tsx
<Button
  size="icon"
  variant={filtersVisible || hasActiveFilters ? 'neutral' : 'neutral-ghost'}
  onClick={() => setFiltersVisible((v) => !v)}
  aria-label="Toggle filters"
>
  <Filter />
</Button>
```

Full toolbar should look like:
```tsx
<div className="flex items-center gap-2 flex-wrap">
  {vendors.length > 0 && (
    <Select ...>...</Select>
  )}
  <Button
    size="icon"
    variant={filtersVisible || hasActiveFilters ? 'neutral' : 'neutral-ghost'}
    onClick={() => setFiltersVisible((v) => !v)}
    aria-label="Toggle filters"
  >
    <Filter />
  </Button>
  <div className="flex items-center gap-2 ml-auto">
    {/* Abandon and Confirm purchase buttons stay here */}
  </div>
</div>
```

**3f. Add ItemFilters row below the toolbar**

After the closing `</div>` of the toolbar div, add:

```tsx
{filtersVisible && (
  <ItemFilters
    tagTypes={tagTypes}
    tags={tags}
    items={vendorFiltered}
    filterState={filterState}
    filteredCount={filteredItems.length}
    totalCount={vendorFiltered.length}
    onFilterChange={setFilterState}
  />
)}
```

Note: `items={vendorFiltered}` (not `items`) so tag counts reflect the vendor-filtered pool.

### Step 4: Run tests

```bash
pnpm test src/routes/shopping.test.tsx --run
```

Expected: All 5 tests PASS

### Step 5: Run all tests

```bash
pnpm test --run
```

Expected: All tests PASS (273+5 = 278)

### Step 6: Run lint

```bash
pnpm check
```

Expected: No errors

### Step 7: Commit

```bash
git add src/routes/shopping.tsx src/routes/shopping.test.tsx
git commit -m "feat(shopping): add tag filtering with Filters toggle button"
```

---

## Task 3: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the Shopping section**

In `CLAUDE.md`, find any existing documentation about the Shopping page (search for `shopping` or the section that describes the shopping route). Add or update to document the new tag filtering:

Find the Features section that describes shopping. If it doesn't have a shopping subsection yet, add one after the Vendor Management section. Add these lines documenting the tag filter:

```markdown
### Shopping Page

**Vendor filter:** Select dropdown in toolbar, single-select, filters items by assigned vendor.

**Tag filter:** `Filters` toggle button in toolbar shows/hides an `ItemFilters` row below the toolbar. Multi-select per tag type (OR within type, AND across types). Applied after the vendor filter (sequential filtering). State persists to sessionStorage (`shopping-filters`, `shopping-ui-prefs`).

**Files:**
- `src/routes/shopping.tsx` — main page with both filter controls
- `src/routes/shopping.test.tsx` — integration tests
```

**Step 2: Run lint**

```bash
pnpm check
```

Expected: No errors

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(shopping): document tag filtering in CLAUDE.md"
```

---

## Done

After all tasks complete, verify:

```bash
pnpm test --run
pnpm check
```

Then test in the browser (`pnpm dev`):
- Open the shopping page → a Filter icon button appears in the toolbar
- Click it → tag filter dropdowns appear below the toolbar
- Select a tag → list filters to matching items only
- Select a vendor AND a tag → both filters apply simultaneously
- Navigate away and back → selected tags are remembered (sessionStorage)
