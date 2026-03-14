# Sort & Filter for Items Pages — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add pantry-style sort controls and tag filter UI to tag items, vendor items, recipe items tabs, and sort controls to the shopping page.

**Architecture:** A new `useSortFilter(storageKey)` hook manages sort state + filter state + persistence (sort → localStorage, filter/ui → sessionStorage, keyed by page type). A new `SortFilterToolbar` component reuses `PantryToolbar`'s sort/filter controls without the "Add item" button. Existing `sortItems()` from `sortUtils.ts` and `filterItems()` from `filterUtils.ts` handle the logic. Vendor items tab switches from custom checkbox layout to `ItemCard` for UI consistency.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest, React Testing Library

---

### Task 1: Create `useSortFilter` hook

**Files:**
- Create: `src/hooks/useSortFilter.ts`
- Create: `src/hooks/useSortFilter.test.ts`

**Step 1: Write the failing tests**

Create `src/hooks/useSortFilter.test.ts`:

```typescript
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useSortFilter } from './useSortFilter'

describe('useSortFilter', () => {
  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('returns default sort and filter state', () => {
    const { result } = renderHook(() => useSortFilter('test'))
    expect(result.current.sortBy).toBe('name')
    expect(result.current.sortDirection).toBe('asc')
    expect(result.current.filterState).toEqual({})
    expect(result.current.filtersVisible).toBe(false)
    expect(result.current.tagsVisible).toBe(false)
  })

  it('persists sort prefs to localStorage', () => {
    const { result } = renderHook(() => useSortFilter('test'))

    act(() => {
      result.current.setSortBy('stock')
    })
    act(() => {
      result.current.setSortDirection('desc')
    })

    const stored = JSON.parse(localStorage.getItem('test-sort-prefs') ?? '{}')
    expect(stored.sortBy).toBe('stock')
    expect(stored.sortDirection).toBe('desc')
  })

  it('persists filter state to sessionStorage', () => {
    const { result } = renderHook(() => useSortFilter('test'))

    act(() => {
      result.current.setFilterState({ 'type-1': ['tag-a'] })
    })

    const stored = JSON.parse(sessionStorage.getItem('test-filters') ?? '{}')
    expect(stored).toEqual({ 'type-1': ['tag-a'] })
  })

  it('persists ui prefs to sessionStorage', () => {
    const { result } = renderHook(() => useSortFilter('test'))

    act(() => {
      result.current.setFiltersVisible(true)
    })
    act(() => {
      result.current.setTagsVisible(true)
    })

    const stored = JSON.parse(sessionStorage.getItem('test-ui-prefs') ?? '{}')
    expect(stored.filtersVisible).toBe(true)
    expect(stored.tagsVisible).toBe(true)
  })

  it('loads persisted sort prefs from localStorage on mount', () => {
    localStorage.setItem(
      'test-sort-prefs',
      JSON.stringify({ sortBy: 'expiring', sortDirection: 'desc' }),
    )
    const { result } = renderHook(() => useSortFilter('test'))
    expect(result.current.sortBy).toBe('expiring')
    expect(result.current.sortDirection).toBe('desc')
  })

  it('loads persisted filter state from sessionStorage on mount', () => {
    sessionStorage.setItem(
      'test-filters',
      JSON.stringify({ 'type-1': ['tag-a'] }),
    )
    const { result } = renderHook(() => useSortFilter('test'))
    expect(result.current.filterState).toEqual({ 'type-1': ['tag-a'] })
  })

  it('uses independent state for different storage keys', () => {
    localStorage.setItem(
      'page-a-sort-prefs',
      JSON.stringify({ sortBy: 'stock', sortDirection: 'desc' }),
    )
    const { result: resultA } = renderHook(() => useSortFilter('page-a'))
    const { result: resultB } = renderHook(() => useSortFilter('page-b'))
    expect(resultA.current.sortBy).toBe('stock')
    expect(resultB.current.sortBy).toBe('name') // default, no data for page-b
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test src/hooks/useSortFilter.test.ts
```

Expected: FAIL with "Cannot find module './useSortFilter'"

**Step 3: Create `src/hooks/useSortFilter.ts`**

```typescript
import { useEffect, useState } from 'react'
import type { FilterState } from '@/lib/filterUtils'
import type { SortDirection, SortField } from '@/lib/sortUtils'

function loadSortPrefs(storageKey: string): {
  sortBy: SortField
  sortDirection: SortDirection
} {
  try {
    const stored = localStorage.getItem(`${storageKey}-sort-prefs`)
    if (!stored) return { sortBy: 'name', sortDirection: 'asc' }
    const parsed = JSON.parse(stored)
    const validFields: SortField[] = ['name', 'stock', 'purchased', 'expiring']
    const validDirections: SortDirection[] = ['asc', 'desc']
    const sortBy: SortField = validFields.includes(parsed.sortBy)
      ? parsed.sortBy
      : 'name'
    const sortDirection: SortDirection = validDirections.includes(
      parsed.sortDirection,
    )
      ? parsed.sortDirection
      : 'asc'
    return { sortBy, sortDirection }
  } catch {
    return { sortBy: 'name', sortDirection: 'asc' }
  }
}

function loadFilterState(storageKey: string): FilterState {
  try {
    const stored = sessionStorage.getItem(`${storageKey}-filters`)
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
  } catch {
    return {}
  }
}

function loadUiPrefs(storageKey: string): {
  filtersVisible: boolean
  tagsVisible: boolean
} {
  try {
    const stored = sessionStorage.getItem(`${storageKey}-ui-prefs`)
    if (!stored) return { filtersVisible: false, tagsVisible: false }
    const parsed = JSON.parse(stored)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { filtersVisible: false, tagsVisible: false }
    }
    return parsed as { filtersVisible: boolean; tagsVisible: boolean }
  } catch {
    return { filtersVisible: false, tagsVisible: false }
  }
}

export function useSortFilter(storageKey: string) {
  const [sortBy, setSortBy] = useState<SortField>(
    () => loadSortPrefs(storageKey).sortBy,
  )
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    () => loadSortPrefs(storageKey).sortDirection,
  )
  const [filterState, setFilterState] = useState<FilterState>(() =>
    loadFilterState(storageKey),
  )
  const [filtersVisible, setFiltersVisible] = useState(
    () => loadUiPrefs(storageKey).filtersVisible,
  )
  const [tagsVisible, setTagsVisible] = useState(
    () => loadUiPrefs(storageKey).tagsVisible,
  )

  useEffect(() => {
    try {
      localStorage.setItem(
        `${storageKey}-sort-prefs`,
        JSON.stringify({ sortBy, sortDirection }),
      )
    } catch (error) {
      console.error('Failed to save sort prefs:', error)
    }
  }, [storageKey, sortBy, sortDirection])

  useEffect(() => {
    try {
      sessionStorage.setItem(
        `${storageKey}-filters`,
        JSON.stringify(filterState),
      )
    } catch (error) {
      console.error('Failed to save filter state:', error)
    }
  }, [storageKey, filterState])

  useEffect(() => {
    try {
      sessionStorage.setItem(
        `${storageKey}-ui-prefs`,
        JSON.stringify({ filtersVisible, tagsVisible }),
      )
    } catch (error) {
      console.error('Failed to save UI prefs:', error)
    }
  }, [storageKey, filtersVisible, tagsVisible])

  return {
    sortBy,
    sortDirection,
    setSortBy,
    setSortDirection,
    filterState,
    setFilterState,
    filtersVisible,
    setFiltersVisible,
    tagsVisible,
    setTagsVisible,
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test src/hooks/useSortFilter.test.ts
```

Expected: PASS (7 tests)

**Step 5: Commit**

```bash
git add src/hooks/useSortFilter.ts src/hooks/useSortFilter.test.ts
git commit -m "feat(hooks): add useSortFilter hook with persistence"
```

---

### Task 2: Create `SortFilterToolbar` component

This is `PantryToolbar` without the "Add item" button. Used by the three assignment pages.

**Files:**
- Create: `src/components/SortFilterToolbar.tsx`
- Create: `src/components/SortFilterToolbar.stories.tsx`

**Step 1: Check `PantryToolbar.tsx` for the pattern to replicate**

Read `src/components/PantryToolbar.tsx`. The SortFilterToolbar has identical props and markup, just without the trailing `<Link to="/items/new">` button.

**Step 2: Create `src/components/SortFilterToolbar.tsx`**

```typescript
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Filter,
  Tags,
} from 'lucide-react'
import { Toolbar } from '@/components/Toolbar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SortDirection, SortField } from '@/lib/sortUtils'

interface SortFilterToolbarProps {
  filtersVisible: boolean
  tagsVisible: boolean
  sortBy: SortField
  sortDirection: SortDirection
  onToggleFilters: () => void
  onToggleTags: () => void
  onSortChange: (field: SortField, direction: SortDirection) => void
}

const sortLabels: Record<SortField, string> = {
  expiring: 'Expiring',
  name: 'Name',
  stock: 'Stock',
  purchased: 'Purchased',
}

export function SortFilterToolbar({
  filtersVisible,
  tagsVisible,
  sortBy,
  sortDirection,
  onToggleFilters,
  onToggleTags,
  onSortChange,
}: SortFilterToolbarProps) {
  const handleCriteriaChange = (field: SortField) => {
    onSortChange(field, sortDirection)
  }

  const handleDirectionToggle = () => {
    onSortChange(sortBy, sortDirection === 'asc' ? 'desc' : 'asc')
  }

  return (
    <Toolbar>
      <Button
        size="icon"
        variant={filtersVisible ? 'neutral' : 'neutral-ghost'}
        onClick={onToggleFilters}
        aria-label="Toggle filters"
      >
        <Filter />
      </Button>

      <Button
        size="icon"
        variant={tagsVisible ? 'neutral' : 'neutral-ghost'}
        onClick={onToggleTags}
        aria-label="Toggle tags"
      >
        <Tags />
      </Button>

      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="default"
              variant="neutral-ghost"
              aria-label="Sort by criteria"
              className="px-2"
            >
              <ArrowUpDown />
              {sortLabels[sortBy]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              className={sortBy === 'expiring' ? 'bg-background-base' : ''}
              onClick={() => handleCriteriaChange('expiring')}
            >
              Expiring soon
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sortBy === 'name' ? 'bg-background-base' : ''}
              onClick={() => handleCriteriaChange('name')}
            >
              Name
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sortBy === 'stock' ? 'bg-background-base' : ''}
              onClick={() => handleCriteriaChange('stock')}
            >
              Stock
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sortBy === 'purchased' ? 'bg-background-base' : ''}
              onClick={() => handleCriteriaChange('purchased')}
            >
              Last purchased
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="icon"
          variant="neutral-ghost"
          onClick={handleDirectionToggle}
          aria-label="Toggle sort direction"
        >
          {sortDirection === 'asc' ? <ArrowUp /> : <ArrowDown />}
        </Button>
      </div>
    </Toolbar>
  )
}
```

**Step 3: Create `src/components/SortFilterToolbar.stories.tsx`**

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import type { SortDirection, SortField } from '@/lib/sortUtils'
import { SortFilterToolbar } from './SortFilterToolbar'

const meta: Meta<typeof SortFilterToolbar> = {
  title: 'Components/SortFilterToolbar',
  component: SortFilterToolbar,
}

export default meta
type Story = StoryObj<typeof SortFilterToolbar>

function Controlled() {
  const [sortBy, setSortBy] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [filtersVisible, setFiltersVisible] = useState(false)
  const [tagsVisible, setTagsVisible] = useState(false)

  return (
    <SortFilterToolbar
      filtersVisible={filtersVisible}
      tagsVisible={tagsVisible}
      sortBy={sortBy}
      sortDirection={sortDirection}
      onToggleFilters={() => setFiltersVisible((v) => !v)}
      onToggleTags={() => setTagsVisible((v) => !v)}
      onSortChange={(field, dir) => {
        setSortBy(field)
        setSortDirection(dir)
      }}
    />
  )
}

export const Default: Story = {
  render: () => <Controlled />,
}
```

**Step 4: Run Storybook to verify it renders (optional manual check)**

```bash
pnpm storybook
```

Navigate to Components/SortFilterToolbar. Verify the toolbar renders with Filter, Tags, sort dropdown, and direction toggle buttons.

**Step 5: Commit**

```bash
git add src/components/SortFilterToolbar.tsx src/components/SortFilterToolbar.stories.tsx
git commit -m "feat(components): add SortFilterToolbar for assignment pages"
```

---

### Task 3: Add sort/filter to tag items tab

**Files:**
- Modify: `src/routes/settings/tags/$id/items.tsx`
- Create: `src/routes/settings/tags/$id/items.test.tsx`

**Step 1: Look at existing test patterns**

Before writing tests, check how other route tests in this project set up the query client and router context. Read `src/test/` directory and any nearby `.test.tsx` files (e.g., `src/routes/items/$id.test.tsx`) to find the `renderWithProviders` helper or equivalent wrapper.

**Step 2: Write the failing tests**

Create `src/routes/settings/tags/$id/items.test.tsx`. Follow the test wrapper pattern found in Step 1.

```typescript
// NOTE: Adapt the import path for renderWithProviders to match your project's test setup.
// The pattern below matches "user can ..." naming from CLAUDE.md.

import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// import { renderWithProviders } from '@/test/utils' // or however tests are set up

describe('TagItemsTab sort and filter', () => {
  it('user can see sort toolbar controls', async () => {
    // Given: the tag items tab is rendered with some items
    // When: the page loads
    // Then: sort controls are visible (Filter btn, Tags btn, sort dropdown, direction toggle)
    expect(screen.getByRole('button', { name: /toggle filters/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /toggle tags/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sort by criteria/i })).toBeInTheDocument()
  })

  it('user can sort items by name', async () => {
    // Given: items "Zebra", "Apple", "Mango" exist in the DB and are tagged with tagId
    // When: user opens sort dropdown and selects "Name"
    // Then: items appear in order Apple, Mango, Zebra
    const user = userEvent.setup()
    // render, click sort, select Name, verify order
  })

  it('user can toggle tags visibility', async () => {
    // Given: an item with tags is shown
    // When: user clicks the Tags toggle button
    // Then: tag badges appear on the item card
  })
})
```

Run the tests to see them fail:

```bash
pnpm test "src/routes/settings/tags"
```

Expected: FAIL (tests fail or test file errors)

**Step 3: Update `src/routes/settings/tags/$id/items.tsx`**

Replace the entire file content:

```typescript
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { FilterStatus } from '@/components/FilterStatus'
import { ItemCard } from '@/components/ItemCard'
import { ItemFilters } from '@/components/ItemFilters'
import { SortFilterToolbar } from '@/components/SortFilterToolbar'
import { Input } from '@/components/ui/input'
import { getLastPurchaseDate } from '@/db/operations'
import { useCreateItem, useItems, useTagTypes, useUpdateItem } from '@/hooks'
import { useSortFilter } from '@/hooks/useSortFilter'
import { useTags } from '@/hooks/useTags'
import { filterItems } from '@/lib/filterUtils'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import { sortItems } from '@/lib/sortUtils'

export const Route = createFileRoute('/settings/tags/$id/items')({
  component: TagItemsTab,
})

function TagItemsTab() {
  const { id: tagId } = Route.useParams()
  const { data: items = [] } = useItems()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
  const updateItem = useUpdateItem()
  const createItem = useCreateItem()

  const {
    sortBy,
    sortDirection,
    setSortBy,
    setSortDirection,
    filterState,
    setFilterState,
    filtersVisible,
    setFiltersVisible,
    tagsVisible,
    setTagsVisible,
  } = useSortFilter('tag-items')

  const [search, setSearch] = useState('')
  const [savingItemIds, setSavingItemIds] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const tagMap = useMemo(
    () => Object.fromEntries(tags.map((t) => [t.id, t])),
    [tags],
  )

  // Quantities map (for stock sort) — same query key as pantry, cache is shared
  const { data: allQuantities } = useQuery({
    queryKey: ['items', 'quantities'],
    queryFn: async () => {
      const map = new Map<string, number>()
      for (const item of items) {
        map.set(item.id, getCurrentQuantity(item))
      }
      return map
    },
    enabled: items.length > 0,
  })

  // Expiry dates map (for expiring sort)
  const { data: allExpiryDates } = useQuery({
    queryKey: ['items', 'expiryDates'],
    queryFn: async () => {
      const map = new Map<string, Date | undefined>()
      for (const item of items) {
        const lastPurchase = await getLastPurchaseDate(item.id)
        const estimatedDate =
          item.estimatedDueDays && lastPurchase
            ? new Date(
                lastPurchase.getTime() +
                  item.estimatedDueDays * 24 * 60 * 60 * 1000,
              )
            : item.dueDate
        map.set(item.id, estimatedDate)
      }
      return map
    },
    enabled: items.length > 0,
  })

  // Purchase dates map (for purchased sort)
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

  const isAssigned = (tagIds: string[] = []) => tagIds.includes(tagId)

  const handleToggle = async (itemId: string, currentTagIds: string[] = []) => {
    if (savingItemIds.has(itemId)) return
    const dbAssigned = currentTagIds.includes(tagId)
    const newTagIds = dbAssigned
      ? currentTagIds.filter((id) => id !== tagId)
      : [...currentTagIds, tagId]

    setSavingItemIds((prev) => new Set(prev).add(itemId))
    try {
      await updateItem.mutateAsync({ id: itemId, updates: { tagIds: newTagIds } })
    } finally {
      setSavingItemIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const handleCreateFromSearch = async () => {
    const trimmed = search.trim()
    if (!trimmed) return
    try {
      await createItem.mutateAsync({
        name: trimmed,
        tagIds: [tagId],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 1,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })
      setSearch('')
      inputRef.current?.focus()
    } catch {
      // input stays populated for retry
    }
  }

  const handleSearchKeyDown = async (e: React.KeyboardEvent) => {
    if (
      e.key === 'Enter' &&
      filteredItems.length === 0 &&
      search.trim() &&
      !createItem.isPending
    ) {
      await handleCreateFromSearch()
    }
    if (e.key === 'Escape') {
      setSearch('')
    }
  }

  const hasActiveFilters = Object.values(filterState).some(
    (ids) => ids.length > 0,
  )

  // 1. Name search filter
  const searchFiltered = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )

  // 2. Tag filter
  const tagFiltered = filterItems(searchFiltered, filterState)

  // 3. Sort
  const filteredItems = sortItems(
    tagFiltered,
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    allPurchaseDates ?? new Map(),
    sortBy,
    sortDirection,
  )

  return (
    <div className="space-y-0 max-w-2xl">
      <div className="flex gap-2 mb-2">
        <Input
          ref={inputRef}
          placeholder="Search or create item..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
      </div>

      <SortFilterToolbar
        filtersVisible={filtersVisible}
        tagsVisible={tagsVisible}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onToggleFilters={() => setFiltersVisible((v) => !v)}
        onToggleTags={() => setTagsVisible((v) => !v)}
        onSortChange={(field, direction) => {
          setSortBy(field)
          setSortDirection(direction)
        }}
      />

      {filtersVisible && (
        <ItemFilters
          tagTypes={tagTypes}
          tags={tags}
          items={items}
          filterState={filterState}
          onFilterChange={setFilterState}
        />
      )}

      {(filtersVisible || hasActiveFilters) && (
        <FilterStatus
          filteredCount={filteredItems.length}
          totalCount={items.length}
          hasActiveFilters={hasActiveFilters}
          onClearAll={() => setFilterState({})}
        />
      )}

      {items.length === 0 && !search.trim() && (
        <p className="text-sm text-foreground-muted py-4">No items yet.</p>
      )}

      {items.length > 0 && filteredItems.length === 0 && !search.trim() && !hasActiveFilters && (
        <p className="text-sm text-foreground-muted py-4">No items found.</p>
      )}

      <div className="space-y-px">
        {filteredItems.map((item) => {
          const itemTags = (item.tagIds ?? [])
            .filter((tid) => tid !== tagId)
            .map((tid) => tagMap[tid])
            .filter((t): t is NonNullable<typeof t> => t != null)

          return (
            <ItemCard
              key={item.id}
              mode="tag-assignment"
              item={item}
              quantity={getCurrentQuantity(item)}
              tags={itemTags}
              tagTypes={tagTypes}
              showTags={tagsVisible}
              isChecked={isAssigned(item.tagIds)}
              onCheckboxToggle={() => handleToggle(item.id, item.tagIds)}
              disabled={savingItemIds.has(item.id)}
            />
          )
        })}
        {filteredItems.length === 0 && search.trim() && (
          <button
            type="button"
            className="flex items-center gap-2 py-2 px-1 w-full text-left rounded hover:bg-background-surface transition-colors text-foreground-muted"
            onClick={handleCreateFromSearch}
            disabled={createItem.isPending}
          >
            <Plus className="h-4 w-4" />
            Create "{search.trim()}"
          </button>
        )}
      </div>
    </div>
  )
}
```

**Step 4: Run tests**

```bash
pnpm test "src/routes/settings/tags"
```

Expected: PASS (update test assertions based on actual rendered output)

**Step 5: Commit**

```bash
git add src/routes/settings/tags/ src/components/SortFilterToolbar.tsx src/components/SortFilterToolbar.stories.tsx
git commit -m "feat(tag-items): add sort and filter controls"
```

---

### Task 4: Add sort/filter to vendor items tab

**Note on scope change:** The vendor items tab currently uses a custom checkbox+label layout. This task switches it to `ItemCard` in `tag-assignment` mode so the Tags toggle works meaningfully. The "other vendor badges" (showing which other vendors an item belongs to) are removed — the user is already on a vendor detail page, so context is clear.

**Files:**
- Modify: `src/routes/settings/vendors/$id/items.tsx`
- Create: `src/routes/settings/vendors/$id/items.test.tsx`

**Step 1: Write the failing tests**

Create `src/routes/settings/vendors/$id/items.test.tsx`. Follow the same test wrapper pattern as Task 3.

```typescript
describe('VendorItemsTab sort and filter', () => {
  it('user can see sort toolbar controls', async () => {
    // Given: the vendor items tab is rendered
    // When: the page loads
    // Then: Filter, Tags, sort dropdown, and direction toggle buttons are visible
  })

  it('user can filter items by tag', async () => {
    // Given: items with different tags exist
    // When: user opens tag filter and selects a tag
    // Then: only items with that tag are shown
  })

  it('user can sort items by name', async () => {
    // Given: items "Zebra", "Apple" exist assigned to this vendor
    // When: user selects Name sort
    // Then: Apple appears before Zebra
  })
})
```

Run to verify failure:

```bash
pnpm test "src/routes/settings/vendors"
```

**Step 2: Replace `src/routes/settings/vendors/$id/items.tsx`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { FilterStatus } from '@/components/FilterStatus'
import { ItemCard } from '@/components/ItemCard'
import { ItemFilters } from '@/components/ItemFilters'
import { SortFilterToolbar } from '@/components/SortFilterToolbar'
import { Input } from '@/components/ui/input'
import { getLastPurchaseDate } from '@/db/operations'
import { useCreateItem, useItems, useTagTypes, useUpdateItem } from '@/hooks'
import { useSortFilter } from '@/hooks/useSortFilter'
import { useTags } from '@/hooks/useTags'
import { filterItems } from '@/lib/filterUtils'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import { sortItems } from '@/lib/sortUtils'

export const Route = createFileRoute('/settings/vendors/$id/items')({
  component: VendorItemsTab,
})

function VendorItemsTab() {
  const { id: vendorId } = Route.useParams()
  const { data: items = [] } = useItems()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
  const updateItem = useUpdateItem()
  const createItem = useCreateItem()

  const {
    sortBy,
    sortDirection,
    setSortBy,
    setSortDirection,
    filterState,
    setFilterState,
    filtersVisible,
    setFiltersVisible,
    tagsVisible,
    setTagsVisible,
  } = useSortFilter('vendor-items')

  const [search, setSearch] = useState('')
  const [savingItemIds, setSavingItemIds] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const tagMap = useMemo(
    () => Object.fromEntries(tags.map((t) => [t.id, t])),
    [tags],
  )

  const { data: allQuantities } = useQuery({
    queryKey: ['items', 'quantities'],
    queryFn: async () => {
      const map = new Map<string, number>()
      for (const item of items) {
        map.set(item.id, getCurrentQuantity(item))
      }
      return map
    },
    enabled: items.length > 0,
  })

  const { data: allExpiryDates } = useQuery({
    queryKey: ['items', 'expiryDates'],
    queryFn: async () => {
      const map = new Map<string, Date | undefined>()
      for (const item of items) {
        const lastPurchase = await getLastPurchaseDate(item.id)
        const estimatedDate =
          item.estimatedDueDays && lastPurchase
            ? new Date(
                lastPurchase.getTime() +
                  item.estimatedDueDays * 24 * 60 * 60 * 1000,
              )
            : item.dueDate
        map.set(item.id, estimatedDate)
      }
      return map
    },
    enabled: items.length > 0,
  })

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

  const isAssigned = (vendorIds: string[] = []) => vendorIds.includes(vendorId)

  const handleToggle = async (
    itemId: string,
    currentVendorIds: string[] = [],
  ) => {
    if (savingItemIds.has(itemId)) return
    const dbAssigned = currentVendorIds.includes(vendorId)
    const newVendorIds = dbAssigned
      ? currentVendorIds.filter((id) => id !== vendorId)
      : [...currentVendorIds, vendorId]

    setSavingItemIds((prev) => new Set(prev).add(itemId))
    try {
      await updateItem.mutateAsync({
        id: itemId,
        updates: { vendorIds: newVendorIds },
      })
    } finally {
      setSavingItemIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const handleCreateFromSearch = async () => {
    const trimmed = search.trim()
    if (!trimmed) return
    try {
      await createItem.mutateAsync({
        name: trimmed,
        vendorIds: [vendorId],
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 1,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })
      setSearch('')
      inputRef.current?.focus()
    } catch {
      // input stays populated for retry
    }
  }

  const handleSearchKeyDown = async (e: React.KeyboardEvent) => {
    if (
      e.key === 'Enter' &&
      filteredItems.length === 0 &&
      search.trim() &&
      !createItem.isPending
    ) {
      await handleCreateFromSearch()
    }
    if (e.key === 'Escape') {
      setSearch('')
    }
  }

  const hasActiveFilters = Object.values(filterState).some(
    (ids) => ids.length > 0,
  )

  const searchFiltered = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )

  const tagFiltered = filterItems(searchFiltered, filterState)

  const filteredItems = sortItems(
    tagFiltered,
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    allPurchaseDates ?? new Map(),
    sortBy,
    sortDirection,
  )

  return (
    <div className="space-y-0 max-w-2xl">
      <div className="flex gap-2 mb-2">
        <Input
          ref={inputRef}
          placeholder="Search or create item..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
      </div>

      <SortFilterToolbar
        filtersVisible={filtersVisible}
        tagsVisible={tagsVisible}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onToggleFilters={() => setFiltersVisible((v) => !v)}
        onToggleTags={() => setTagsVisible((v) => !v)}
        onSortChange={(field, direction) => {
          setSortBy(field)
          setSortDirection(direction)
        }}
      />

      {filtersVisible && (
        <ItemFilters
          tagTypes={tagTypes}
          tags={tags}
          items={items}
          filterState={filterState}
          onFilterChange={setFilterState}
        />
      )}

      {(filtersVisible || hasActiveFilters) && (
        <FilterStatus
          filteredCount={filteredItems.length}
          totalCount={items.length}
          hasActiveFilters={hasActiveFilters}
          onClearAll={() => setFilterState({})}
        />
      )}

      {items.length === 0 && !search.trim() && (
        <p className="text-sm text-foreground-muted py-4">No items yet.</p>
      )}

      {items.length > 0 && filteredItems.length === 0 && !search.trim() && !hasActiveFilters && (
        <p className="text-sm text-foreground-muted py-4">No items found.</p>
      )}

      <div className="space-y-px">
        {filteredItems.map((item) => {
          const itemTags = (item.tagIds ?? [])
            .map((tid) => tagMap[tid])
            .filter((t): t is NonNullable<typeof t> => t != null)

          return (
            <ItemCard
              key={item.id}
              mode="tag-assignment"
              item={item}
              quantity={getCurrentQuantity(item)}
              tags={itemTags}
              tagTypes={tagTypes}
              showTags={tagsVisible}
              isChecked={isAssigned(item.vendorIds)}
              onCheckboxToggle={() => handleToggle(item.id, item.vendorIds)}
              disabled={savingItemIds.has(item.id)}
            />
          )
        })}
        {filteredItems.length === 0 && search.trim() && (
          <button
            type="button"
            className="flex items-center gap-2 py-2 px-1 w-full text-left rounded hover:bg-background-surface transition-colors text-foreground-muted"
            onClick={handleCreateFromSearch}
            disabled={createItem.isPending}
          >
            <Plus className="h-4 w-4" />
            Create "{search.trim()}"
          </button>
        )}
      </div>
    </div>
  )
}
```

**Step 3: Run tests**

```bash
pnpm test "src/routes/settings/vendors"
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/routes/settings/vendors/
git commit -m "feat(vendor-items): add sort and filter controls, switch to ItemCard"
```

---

### Task 5: Add sort/filter to recipe items tab

**Files:**
- Modify: `src/routes/settings/recipes/$id/items.tsx`
- Create: `src/routes/settings/recipes/$id/items.test.tsx`

**Step 1: Write the failing tests**

Create `src/routes/settings/recipes/$id/items.test.tsx`:

```typescript
describe('RecipeItemsTab sort and filter', () => {
  it('user can see sort toolbar controls', async () => {
    // Given: the recipe items tab is rendered
    // When: the page loads
    // Then: Filter, Tags, sort dropdown, and direction toggle buttons are visible
  })

  it('user can filter items by tag', async () => {
    // Given: items with different tags exist
    // When: user opens tag filter and selects a tag
    // Then: only items with that tag are shown
  })

  it('user can sort items by name', async () => {
    // Given: items "Zebra" and "Apple" exist
    // When: user selects Name sort ascending
    // Then: Apple appears before Zebra
  })
})
```

Run to verify failure:

```bash
pnpm test "src/routes/settings/recipes"
```

**Step 2: Update `src/routes/settings/recipes/$id/items.tsx`**

Add the following imports at the top (after existing imports):

```typescript
import { useQuery } from '@tanstack/react-query'
import { FilterStatus } from '@/components/FilterStatus'
import { ItemFilters } from '@/components/ItemFilters'
import { SortFilterToolbar } from '@/components/SortFilterToolbar'
import { getLastPurchaseDate } from '@/db/operations'
import { useTagTypes } from '@/hooks'
import { useSortFilter } from '@/hooks/useSortFilter'
import { filterItems } from '@/lib/filterUtils'
import { sortItems } from '@/lib/sortUtils'
```

Inside the `RecipeItemsTab` function, add after existing hooks:

```typescript
const { data: tagTypes = [] } = useTagTypes()

const {
  sortBy,
  sortDirection,
  setSortBy,
  setSortDirection,
  filterState,
  setFilterState,
  filtersVisible,
  setFiltersVisible,
  tagsVisible,
  setTagsVisible,
} = useSortFilter('recipe-items')

const { data: allQuantities } = useQuery({
  queryKey: ['items', 'quantities'],
  queryFn: async () => {
    const map = new Map<string, number>()
    for (const item of items) {
      map.set(item.id, getCurrentQuantity(item))
    }
    return map
  },
  enabled: items.length > 0,
})

const { data: allExpiryDates } = useQuery({
  queryKey: ['items', 'expiryDates'],
  queryFn: async () => {
    const map = new Map<string, Date | undefined>()
    for (const item of items) {
      const lastPurchase = await getLastPurchaseDate(item.id)
      const estimatedDate =
        item.estimatedDueDays && lastPurchase
          ? new Date(
              lastPurchase.getTime() +
                item.estimatedDueDays * 24 * 60 * 60 * 1000,
            )
          : item.dueDate
      map.set(item.id, estimatedDate)
    }
    return map
  },
  enabled: items.length > 0,
})

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

const hasActiveFilters = Object.values(filterState).some(
  (ids) => ids.length > 0,
)
```

Replace the existing `sortedItems` and `filteredItems` computation:

```typescript
// Was: simple alphabetical sort then name search
// Now: name search → tag filter → sort

const searchFiltered = items.filter((item) =>
  item.name.toLowerCase().includes(search.toLowerCase()),
)

const tagFiltered = filterItems(searchFiltered, filterState)

// Keep "assigned first" as a secondary sort by sorting assigned items first,
// then applying user sort within each group
const assignedItems = tagFiltered.filter((item) => isAssigned(item.id))
const unassignedItems = tagFiltered.filter((item) => !isAssigned(item.id))

const sortedAssigned = sortItems(
  assignedItems,
  allQuantities ?? new Map(),
  allExpiryDates ?? new Map(),
  allPurchaseDates ?? new Map(),
  sortBy,
  sortDirection,
)
const sortedUnassigned = sortItems(
  unassignedItems,
  allQuantities ?? new Map(),
  allExpiryDates ?? new Map(),
  allPurchaseDates ?? new Map(),
  sortBy,
  sortDirection,
)

const filteredItems = [...sortedAssigned, ...sortedUnassigned]
```

In the JSX, replace the `<div className="space-y-4 max-w-2xl">` content — add the toolbar and filter components above the item list. Keep the existing ItemCard rendering unchanged. The full updated JSX:

```tsx
return (
  <div className="space-y-0 max-w-2xl">
    <div className="flex gap-2 mb-2">
      <Input
        ref={inputRef}
        placeholder="Search or create item..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={handleSearchKeyDown}
      />
    </div>

    <SortFilterToolbar
      filtersVisible={filtersVisible}
      tagsVisible={tagsVisible}
      sortBy={sortBy}
      sortDirection={sortDirection}
      onToggleFilters={() => setFiltersVisible((v) => !v)}
      onToggleTags={() => setTagsVisible((v) => !v)}
      onSortChange={(field, direction) => {
        setSortBy(field)
        setSortDirection(direction)
      }}
    />

    {filtersVisible && (
      <ItemFilters
        tagTypes={tagTypes}
        tags={tags}
        items={items}
        filterState={filterState}
        onFilterChange={setFilterState}
      />
    )}

    {(filtersVisible || hasActiveFilters) && (
      <FilterStatus
        filteredCount={filteredItems.length}
        totalCount={items.length}
        hasActiveFilters={hasActiveFilters}
        onClearAll={() => setFilterState({})}
      />
    )}

    {items.length === 0 && !search.trim() && (
      <p className="text-sm text-foreground-muted py-4">No items yet.</p>
    )}

    {items.length > 0 && filteredItems.length === 0 && !search.trim() && !hasActiveFilters && (
      <p className="text-sm text-foreground-muted py-4">No items found.</p>
    )}

    <div className="space-y-px">
      {filteredItems.map((item) => {
        const assigned = isAssigned(item.id)
        const itemTags = (item.tagIds ?? [])
          .map((tid) => tagMap[tid])
          .filter((t): t is NonNullable<typeof t> => t != null)

        return (
          <ItemCard
            key={item.id}
            mode="recipe-assignment"
            item={item}
            quantity={getCurrentQuantity(item)}
            tags={itemTags}
            tagTypes={tagTypes}
            showTags={tagsVisible}
            isChecked={assigned}
            onCheckboxToggle={() =>
              handleToggle(item.id, item.consumeAmount ?? 1)
            }
            {...(assigned
              ? { controlAmount: getDefaultAmount(item.id) }
              : {})}
            minControlAmount={0}
            onAmountChange={(delta) =>
              handleAdjustDefaultAmount(item.id, delta)
            }
            disabled={savingItemIds.has(item.id)}
          />
        )
      })}
      {filteredItems.length === 0 && search.trim() && (
        <button
          type="button"
          className="flex items-center gap-2 py-2 px-1 w-full text-left rounded hover:bg-background-surface transition-colors text-foreground-muted"
          onClick={handleCreateFromSearch}
          disabled={createItem.isPending}
        >
          <Plus className="h-4 w-4" />
          Create "{search.trim()}"
        </button>
      )}
    </div>
  </div>
)
```

**Step 3: Run tests**

```bash
pnpm test "src/routes/settings/recipes"
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/routes/settings/recipes/
git commit -m "feat(recipe-items): add sort and filter controls"
```

---

### Task 6: Add sort controls to shopping page

The shopping page already has vendor filter + tag filter. Add sort controls alongside the existing filter button.

**Files:**
- Modify: `src/routes/shopping.tsx`
- Modify: `src/routes/shopping.test.tsx` (add sort tests)

**Step 1: Write the failing test**

In `src/routes/shopping.test.tsx`, add:

```typescript
it('user can sort shopping items by name', async () => {
  // Given: items "Zebra" and "Apple" exist in the pending section
  // When: user opens sort dropdown and selects "Name"
  // Then: Apple appears before Zebra in the pending section
})
```

Run to verify failure:

```bash
pnpm test src/routes/shopping.test.tsx
```

**Step 2: Update `src/routes/shopping.tsx`**

Add these imports:

```typescript
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SortDirection, SortField } from '@/lib/sortUtils'
import { sortItems } from '@/lib/sortUtils'
```

Add sort state after existing state declarations:

```typescript
const [sortBy, setSortBy] = useState<SortField>(() => {
  try {
    const stored = localStorage.getItem('shopping-sort-prefs')
    if (!stored) return 'name'
    const parsed = JSON.parse(stored)
    const valid: SortField[] = ['name', 'stock', 'purchased', 'expiring']
    return valid.includes(parsed.sortBy) ? parsed.sortBy : 'name'
  } catch {
    return 'name'
  }
})
const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
  try {
    const stored = localStorage.getItem('shopping-sort-prefs')
    if (!stored) return 'asc'
    const parsed = JSON.parse(stored)
    return parsed.sortDirection === 'desc' ? 'desc' : 'asc'
  } catch {
    return 'asc'
  }
})
```

Add a persistence effect after existing effects:

```typescript
useEffect(() => {
  try {
    localStorage.setItem(
      'shopping-sort-prefs',
      JSON.stringify({ sortBy, sortDirection }),
    )
  } catch (error) {
    console.error('Failed to save shopping sort prefs:', error)
  }
}, [sortBy, sortDirection])
```

Add a quantities map query (for stock sort):

```typescript
const { data: allQuantities } = useQuery({
  queryKey: ['items', 'quantities'],
  queryFn: async () => {
    const map = new Map<string, number>()
    for (const item of items) {
      map.set(item.id, getCurrentQuantity(item))
    }
    return map
  },
  enabled: items.length > 0,
})
```

Also add the expiry and purchase date queries (same pattern as Tasks 3-5 — copy from them). These share the same query keys with the pantry page, so data is cached.

Replace the existing `cartSectionItems` and `pendingItems` sort logic. Old code:

```typescript
.sort((a, b) => getStockPercent(a) - getStockPercent(b))
```

New code — replace both sort calls with `sortItems()`:

```typescript
// Cart section: apply user sort
const cartSectionItems = sortItems(
  filteredItems.filter((item) => cartItemMap.has(item.id)),
  allQuantities ?? new Map(),
  allExpiryDates ?? new Map(),
  allPurchaseDates ?? new Map(),
  sortBy,
  sortDirection,
)

// Pending section: apply user sort
const pendingItems = sortItems(
  filteredItems.filter((item) => !cartItemMap.has(item.id)),
  allQuantities ?? new Map(),
  allExpiryDates ?? new Map(),
  allPurchaseDates ?? new Map(),
  sortBy,
  sortDirection,
)
```

Add sort controls to the filter row (the `<div className="flex items-center gap-2">` that contains the vendor select and filter button). Add after the vendor select and before the filter button:

```tsx
<div className="flex items-center gap-1">
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        size="default"
        variant="neutral-ghost"
        aria-label="Sort by criteria"
        className="px-2"
      >
        <ArrowUpDown />
        {sortLabels[sortBy]}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem
        className={sortBy === 'expiring' ? 'bg-background-base' : ''}
        onClick={() => setSortBy('expiring')}
      >
        Expiring soon
      </DropdownMenuItem>
      <DropdownMenuItem
        className={sortBy === 'name' ? 'bg-background-base' : ''}
        onClick={() => setSortBy('name')}
      >
        Name
      </DropdownMenuItem>
      <DropdownMenuItem
        className={sortBy === 'stock' ? 'bg-background-base' : ''}
        onClick={() => setSortBy('stock')}
      >
        Stock
      </DropdownMenuItem>
      <DropdownMenuItem
        className={sortBy === 'purchased' ? 'bg-background-base' : ''}
        onClick={() => setSortBy('purchased')}
      >
        Last purchased
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

  <Button
    size="icon"
    variant="neutral-ghost"
    onClick={() =>
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    }
    aria-label="Toggle sort direction"
  >
    {sortDirection === 'asc' ? <ArrowUp /> : <ArrowDown />}
  </Button>
</div>
```

Also add the `sortLabels` constant near the top of the file (outside the component):

```typescript
const sortLabels: Record<SortField, string> = {
  expiring: 'Expiring',
  name: 'Name',
  stock: 'Stock',
  purchased: 'Purchased',
}
```

**Step 3: Run tests**

```bash
pnpm test src/routes/shopping.test.tsx
```

Expected: PASS

**Step 4: Run all tests**

```bash
pnpm test
```

Expected: all tests pass with no regressions

**Step 5: Commit**

```bash
git add src/routes/shopping.tsx src/routes/shopping.test.tsx
git commit -m "feat(shopping): add sort controls to shopping toolbar"
```

---

### Task 7: Final verification

**Step 1: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass

**Step 2: Run lint**

```bash
pnpm check
```

Expected: no lint errors

**Step 3: Build check**

```bash
pnpm build
```

Expected: build succeeds with no TypeScript errors

**Step 4: Manual smoke test** (optional but recommended)

Start dev server: `pnpm dev`

Verify:
- [ ] Tag items tab: Filter button shows tag dropdowns, Tags button shows tag badges on cards, sort dropdown changes item order
- [ ] Vendor items tab: same controls work, ItemCard renders (replaces old checkbox layout)
- [ ] Recipe items tab: same controls work, assigned items still appear first within each sort group
- [ ] Shopping page: sort dropdown and direction toggle appear next to vendor/filter controls, items sort within Cart and Pending sections
- [ ] Navigate away and back: sort prefs survive (localStorage), filter prefs clear (sessionStorage)

**Step 5: Final commit (if any cleanup needed)**

```bash
git add -p  # stage any remaining changes
git commit -m "chore(sort-filter): final cleanup"
```
