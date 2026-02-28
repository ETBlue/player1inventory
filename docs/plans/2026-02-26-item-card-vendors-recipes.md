# Item Card: Vendors and Recipes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show vendor and recipe associations on item cards — counts when collapsed, clickable badges when expanded — plus vendor/recipe filter dropdowns in the toolbar.

**Architecture:** Extend `filterUtils` with vendor/recipe filter functions, extend `useUrlSearchAndFilters` with vendor/recipe URL state, extend `ItemCard` with new props and rendering, extend `ItemFilters` and `ItemListToolbar` to wire vendor/recipe filters through, then update 4 page components to pass data.

**Tech Stack:** React 19, TanStack Router, TanStack Query, Dexie.js (IndexedDB), Tailwind CSS v4, shadcn/ui, Vitest + React Testing Library

---

## Task 1: filterUtils — add vendor/recipe filter functions

**Files:**
- Modify: `src/lib/filterUtils.ts`
- Modify: `src/lib/filterUtils.test.ts`

**Step 1: Write the failing tests**

Add to the end of `src/lib/filterUtils.test.ts`:

```ts
describe('filterItemsByVendors', () => {
  const items: Item[] = [
    {
      id: '1', name: 'Milk', tagIds: [], vendorIds: ['v-costco', 'v-safeway'],
      targetQuantity: 2, refillThreshold: 1, createdAt: new Date(), updatedAt: new Date(),
    },
    {
      id: '2', name: 'Eggs', tagIds: [], vendorIds: ['v-costco'],
      targetQuantity: 12, refillThreshold: 6, createdAt: new Date(), updatedAt: new Date(),
    },
    {
      id: '3', name: 'Bread', tagIds: [], vendorIds: [],
      targetQuantity: 1, refillThreshold: 0, createdAt: new Date(), updatedAt: new Date(),
    },
    {
      id: '4', name: 'Butter', tagIds: [],
      targetQuantity: 1, refillThreshold: 0, createdAt: new Date(), updatedAt: new Date(),
    },
  ]

  it('returns all items when vendorIds is empty', () => {
    expect(filterItemsByVendors(items, [])).toHaveLength(4)
  })

  it('filters by single vendor', () => {
    const result = filterItemsByVendors(items, ['v-safeway'])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Milk')
  })

  it('filters by multiple vendors with OR logic', () => {
    const result = filterItemsByVendors(items, ['v-costco', 'v-safeway'])
    expect(result.map((i) => i.name).sort()).toEqual(['Eggs', 'Milk'])
  })

  it('excludes items with no vendorIds when vendor filter is active', () => {
    const result = filterItemsByVendors(items, ['v-costco'])
    expect(result.every((i) => i.name !== 'Bread' && i.name !== 'Butter')).toBe(true)
  })
})

describe('filterItemsByRecipes', () => {
  const items: Item[] = [
    { id: '1', name: 'Eggs', tagIds: [], targetQuantity: 12, refillThreshold: 6, createdAt: new Date(), updatedAt: new Date() },
    { id: '2', name: 'Flour', tagIds: [], targetQuantity: 2, refillThreshold: 1, createdAt: new Date(), updatedAt: new Date() },
    { id: '3', name: 'Sugar', tagIds: [], targetQuantity: 1, refillThreshold: 0, createdAt: new Date(), updatedAt: new Date() },
  ]

  const recipes: Recipe[] = [
    { id: 'r1', name: 'Pancakes', items: [{ itemId: '1', defaultAmount: 3 }, { itemId: '2', defaultAmount: 1 }], createdAt: new Date(), updatedAt: new Date() },
    { id: 'r2', name: 'Cake', items: [{ itemId: '2', defaultAmount: 2 }, { itemId: '3', defaultAmount: 0.5 }], createdAt: new Date(), updatedAt: new Date() },
  ]

  it('returns all items when recipeIds is empty', () => {
    expect(filterItemsByRecipes(items, [], recipes)).toHaveLength(3)
  })

  it('filters by single recipe', () => {
    const result = filterItemsByRecipes(items, ['r1'], recipes)
    expect(result.map((i) => i.name).sort()).toEqual(['Eggs', 'Flour'])
  })

  it('filters by multiple recipes with OR logic', () => {
    const result = filterItemsByRecipes(items, ['r1', 'r2'], recipes)
    expect(result.map((i) => i.name).sort()).toEqual(['Eggs', 'Flour', 'Sugar'])
  })

  it('excludes items not in any selected recipe', () => {
    const result = filterItemsByRecipes(items, ['r2'], recipes)
    expect(result.every((i) => i.name !== 'Eggs')).toBe(true)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test src/lib/filterUtils.test.ts
```

Expected: FAIL — `filterItemsByVendors is not a function`, `filterItemsByRecipes is not a function`

**Step 3: Add imports and functions to filterUtils.ts**

At the top of `src/lib/filterUtils.ts`, add `Recipe` to the import:

```ts
import type { Item, Recipe } from '@/types'
```

Append to end of file:

```ts
export function filterItemsByVendors(items: Item[], vendorIds: string[]): Item[] {
  if (vendorIds.length === 0) return items
  return items.filter((item) =>
    vendorIds.some((vid) => item.vendorIds?.includes(vid)),
  )
}

export function filterItemsByRecipes(
  items: Item[],
  recipeIds: string[],
  recipes: Recipe[],
): Item[] {
  if (recipeIds.length === 0) return items
  return items.filter((item) =>
    recipeIds.some((rid) => {
      const recipe = recipes.find((r) => r.id === rid)
      return recipe?.items.some((ri) => ri.itemId === item.id) ?? false
    }),
  )
}
```

Also update the import in the test file: at the top, update the import to include the new functions:

```ts
import { calculateTagCount, filterItems, filterItemsByRecipes, filterItemsByVendors } from './filterUtils'
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/lib/filterUtils.test.ts
```

Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add src/lib/filterUtils.ts src/lib/filterUtils.test.ts
git commit -m "feat(filter-utils): add filterItemsByVendors and filterItemsByRecipes"
```

---

## Task 2: useUrlSearchAndFilters — add vendor/recipe filter state

**Files:**
- Modify: `src/hooks/useUrlSearchAndFilters.ts`
- Modify: `src/hooks/useUrlSearchAndFilters.test.ts`

**Step 1: Write the failing tests**

Append to `src/hooks/useUrlSearchAndFilters.test.ts` (before the closing `describe('loadSearchPrefs', ...)` block):

```ts
  it('selectedVendorIds reads from ?f_vendor= param', () => {
    mockRouterState.location.search = '?f_vendor=v1%2Cv2'
    const { result } = renderHook(() => useUrlSearchAndFilters())
    expect(result.current.selectedVendorIds).toEqual(['v1', 'v2'])
  })

  it('selectedVendorIds is empty when no f_vendor param', () => {
    const { result } = renderHook(() => useUrlSearchAndFilters())
    expect(result.current.selectedVendorIds).toEqual([])
  })

  it('filterState does NOT include vendor key', () => {
    mockRouterState.location.search = '?f_vendor=v1&f_type-1=tag-a'
    const { result } = renderHook(() => useUrlSearchAndFilters())
    expect(result.current.filterState).toEqual({ 'type-1': ['tag-a'] })
    expect(result.current.filterState['vendor']).toBeUndefined()
  })

  it('selectedRecipeIds reads from ?f_recipe= param', () => {
    mockRouterState.location.search = '?f_recipe=r1'
    const { result } = renderHook(() => useUrlSearchAndFilters())
    expect(result.current.selectedRecipeIds).toEqual(['r1'])
  })

  it('filterState does NOT include recipe key', () => {
    mockRouterState.location.search = '?f_recipe=r1&f_type-1=tag-a'
    const { result } = renderHook(() => useUrlSearchAndFilters())
    expect(result.current.filterState).toEqual({ 'type-1': ['tag-a'] })
    expect(result.current.filterState['recipe']).toBeUndefined()
  })

  it('toggleVendorId adds vendor to f_vendor param', () => {
    const { result } = renderHook(() => useUrlSearchAndFilters())
    act(() => { result.current.toggleVendorId('v1') })
    expect(mockHistoryReplace).toHaveBeenCalledWith(expect.stringContaining('f_vendor=v1'))
  })

  it('toggleVendorId removes vendor when already selected', () => {
    mockRouterState.location.search = '?f_vendor=v1%2Cv2'
    const { result } = renderHook(() => useUrlSearchAndFilters())
    act(() => { result.current.toggleVendorId('v1') })
    const callArg: string = mockHistoryReplace.mock.calls[0][0]
    expect(callArg).not.toContain('v1')
    expect(callArg).toContain('v2')
  })

  it('toggleVendorId removes f_vendor param when last vendor deselected', () => {
    mockRouterState.location.search = '?f_vendor=v1'
    const { result } = renderHook(() => useUrlSearchAndFilters())
    act(() => { result.current.toggleVendorId('v1') })
    expect(mockHistoryReplace).toHaveBeenCalledWith('/')
  })

  it('clearVendorIds removes f_vendor param', () => {
    mockRouterState.location.search = '?f_vendor=v1%2Cv2'
    const { result } = renderHook(() => useUrlSearchAndFilters())
    act(() => { result.current.clearVendorIds() })
    expect(mockHistoryReplace).toHaveBeenCalledWith('/')
  })

  it('toggleRecipeId adds recipe to f_recipe param', () => {
    const { result } = renderHook(() => useUrlSearchAndFilters())
    act(() => { result.current.toggleRecipeId('r1') })
    expect(mockHistoryReplace).toHaveBeenCalledWith(expect.stringContaining('f_recipe=r1'))
  })

  it('clearRecipeIds removes f_recipe param', () => {
    mockRouterState.location.search = '?f_recipe=r1'
    const { result } = renderHook(() => useUrlSearchAndFilters())
    act(() => { result.current.clearRecipeIds() })
    expect(mockHistoryReplace).toHaveBeenCalledWith('/')
  })
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test src/hooks/useUrlSearchAndFilters.test.ts
```

Expected: FAIL — `selectedVendorIds is not a function` / property undefined

**Step 3: Update useUrlSearchAndFilters.ts**

Replace the `filterState` useMemo and add new state/functions. The full updated file:

```ts
// src/hooks/useUrlSearchAndFilters.ts

import { useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useRef } from 'react'
import type { FilterState } from '@/lib/filterUtils'

const STORAGE_KEY = 'item-list-search-prefs'
const RESERVED_FILTER_KEYS = new Set(['vendor', 'recipe'])

function buildSearchString(params: URLSearchParams): string {
  const str = params.toString()
  return str ? `?${str}` : ''
}

export function loadSearchPrefs(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveSearchPrefs(str: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, str)
  } catch {}
}

export function useUrlSearchAndFilters() {
  const router = useRouter()
  const locationSearch = useRouterState({ select: (s) => s.location.search })

  const params = useMemo(
    () => new URLSearchParams(locationSearch),
    [locationSearch],
  )

  // Derived state from URL params
  const search = params.get('q') ?? ''
  const isFiltersVisible = params.get('filters') === '1'
  const isTagsVisible = params.get('tags') === '1'

  const filterState = useMemo<FilterState>(() => {
    const state: FilterState = {}
    for (const [key, value] of params.entries()) {
      if (key.startsWith('f_') && value) {
        const k = key.slice(2)
        if (!RESERVED_FILTER_KEYS.has(k)) {
          state[k] = value.split(',').filter(Boolean)
        }
      }
    }
    return state
  }, [params])

  const selectedVendorIds = useMemo(
    () => (params.get('f_vendor') ?? '').split(',').filter(Boolean),
    [params],
  )

  const selectedRecipeIds = useMemo(
    () => (params.get('f_recipe') ?? '').split(',').filter(Boolean),
    [params],
  )

  // On mount: seed URL from sessionStorage if no search params present
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current) return
    seededRef.current = true

    if (!router.state.location.search) {
      const stored = loadSearchPrefs()
      if (stored) {
        router.history.replace(`${router.state.location.pathname}?${stored}`)
      }
    }
    // biome-ignore lint: run once on mount only to seed from sessionStorage
  }, [
    router.history,
    router.state.location.pathname,
    router.state.location.search,
  ])

  // Write helpers — update URL params and sync to sessionStorage
  function updateParams(updater: (p: URLSearchParams) => void): void {
    const next = new URLSearchParams(locationSearch)
    updater(next)
    const str = next.toString()
    saveSearchPrefs(str)
    router.history.replace(
      router.state.location.pathname + buildSearchString(next),
    )
  }

  function setSearch(q: string): void {
    updateParams((p) => {
      if (q) p.set('q', q)
      else p.delete('q')
    })
  }

  function setFilterState(state: FilterState): void {
    updateParams((p) => {
      // Remove existing tag filter params (but preserve vendor/recipe params)
      for (const key of [...p.keys()]) {
        if (key.startsWith('f_') && !RESERVED_FILTER_KEYS.has(key.slice(2))) {
          p.delete(key)
        }
      }
      // Add new filter params
      for (const [tagTypeId, tagIds] of Object.entries(state)) {
        if (tagIds.length > 0) {
          p.set(`f_${tagTypeId}`, tagIds.join(','))
        }
      }
    })
  }

  function setIsFiltersVisible(v: boolean): void {
    updateParams((p) => {
      if (v) p.set('filters', '1')
      else p.delete('filters')
    })
  }

  function setIsTagsVisible(v: boolean): void {
    updateParams((p) => {
      if (v) p.set('tags', '1')
      else p.delete('tags')
    })
  }

  function toggleVendorId(vendorId: string): void {
    updateParams((p) => {
      const current = (p.get('f_vendor') ?? '').split(',').filter(Boolean)
      const next = current.includes(vendorId)
        ? current.filter((id) => id !== vendorId)
        : [...current, vendorId]
      if (next.length > 0) p.set('f_vendor', next.join(','))
      else p.delete('f_vendor')
    })
  }

  function toggleRecipeId(recipeId: string): void {
    updateParams((p) => {
      const current = (p.get('f_recipe') ?? '').split(',').filter(Boolean)
      const next = current.includes(recipeId)
        ? current.filter((id) => id !== recipeId)
        : [...current, recipeId]
      if (next.length > 0) p.set('f_recipe', next.join(','))
      else p.delete('f_recipe')
    })
  }

  function clearVendorIds(): void {
    updateParams((p) => p.delete('f_vendor'))
  }

  function clearRecipeIds(): void {
    updateParams((p) => p.delete('f_recipe'))
  }

  return {
    search,
    filterState,
    selectedVendorIds,
    selectedRecipeIds,
    isFiltersVisible,
    isTagsVisible,
    setSearch,
    setFilterState,
    setIsFiltersVisible,
    setIsTagsVisible,
    toggleVendorId,
    toggleRecipeId,
    clearVendorIds,
    clearRecipeIds,
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/hooks/useUrlSearchAndFilters.test.ts
```

Expected: PASS (all tests including the existing ones)

**Step 5: Commit**

```bash
git add src/hooks/useUrlSearchAndFilters.ts src/hooks/useUrlSearchAndFilters.test.ts
git commit -m "feat(url-filters): add vendor and recipe filter state to useUrlSearchAndFilters"
```

---

## Task 3: ItemCard — add vendor/recipe props and rendering

**Files:**
- Modify: `src/components/ItemCard.tsx`
- Modify: `src/components/ItemCard.test.tsx`

**Step 1: Write the failing tests**

Add a new `describe` block at the end of `src/components/ItemCard.test.tsx`:

```ts
describe('ItemCard - vendor and recipe display', () => {
  const mockItem: Item = {
    id: 'item-1',
    name: 'Milk',
    tagIds: ['t1'],
    vendorIds: ['v1'],
    targetUnit: 'package',
    packageUnit: 'gallon',
    targetQuantity: 4,
    refillThreshold: 1,
    packedQuantity: 2,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockTags: Tag[] = [{ id: 't1', name: 'Dairy', typeId: 'type1' }]
  const mockTagTypes: TagType[] = [{ id: 'type1', name: 'Category', color: TagColor.blue }]
  const mockVendors: Vendor[] = [{ id: 'v1', name: 'Costco', createdAt: new Date() }]
  const mockRecipes: Recipe[] = [
    { id: 'r1', name: 'Pancakes', items: [{ itemId: 'item-1', defaultAmount: 1 }], createdAt: new Date(), updatedAt: new Date() },
  ]

  it('shows vendor and recipe counts alongside tag count when collapsed', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={mockTags}
        tagTypes={mockTagTypes}
        showTags={false}
        vendors={mockVendors}
        recipes={mockRecipes}
      />,
    )
    expect(screen.getByText(/1 tag/i)).toBeInTheDocument()
    expect(screen.getByText(/1 vendor/i)).toBeInTheDocument()
    expect(screen.getByText(/1 recipe/i)).toBeInTheDocument()
  })

  it('omits zero-count entries in collapsed state', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={mockTags}
        tagTypes={mockTagTypes}
        showTags={false}
        vendors={[]}
        recipes={mockRecipes}
      />,
    )
    expect(screen.queryByText(/vendor/i)).not.toBeInTheDocument()
  })

  it('shows vendor badges when expanded', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={mockTags}
        tagTypes={mockTagTypes}
        showTags={true}
        vendors={mockVendors}
        recipes={[]}
      />,
    )
    expect(screen.getByTestId('vendor-badge-Costco')).toBeInTheDocument()
  })

  it('shows recipe badges when expanded', async () => {
    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={mockTags}
        tagTypes={mockTagTypes}
        showTags={true}
        vendors={[]}
        recipes={mockRecipes}
      />,
    )
    expect(screen.getByTestId('recipe-badge-Pancakes')).toBeInTheDocument()
  })

  it('calls onVendorClick with vendorId when vendor badge is clicked', async () => {
    const user = userEvent.setup()
    const onVendorClick = vi.fn()

    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={mockTags}
        tagTypes={mockTagTypes}
        showTags={true}
        vendors={mockVendors}
        onVendorClick={onVendorClick}
      />,
    )

    await user.click(screen.getByTestId('vendor-badge-Costco'))
    expect(onVendorClick).toHaveBeenCalledWith('v1')
  })

  it('calls onRecipeClick with recipeId when recipe badge is clicked', async () => {
    const user = userEvent.setup()
    const onRecipeClick = vi.fn()

    await renderWithRouter(
      <ItemCard
        item={mockItem}
        tags={mockTags}
        tagTypes={mockTagTypes}
        showTags={true}
        recipes={mockRecipes}
        onRecipeClick={onRecipeClick}
      />,
    )

    await user.click(screen.getByTestId('recipe-badge-Pancakes'))
    expect(onRecipeClick).toHaveBeenCalledWith('r1')
  })
})
```

Also add to the imports at the top of the test file:
```ts
import type { Item, Recipe, Tag, TagType, Vendor } from '@/types'
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test src/components/ItemCard.test.tsx
```

Expected: FAIL — TypeScript errors for unknown props `vendors`, `recipes`, etc.

**Step 3: Update ItemCard.tsx**

Replace the import line (line 16) to add `Vendor` and `Recipe` types:

```ts
import type { Item, Recipe, Tag, TagType, Vendor } from '@/types'
```

Replace the `interface ItemCardProps` block (lines 18-32) with:

```ts
interface ItemCardProps {
  item: Item
  tags: Tag[]
  tagTypes: TagType[]
  onTagClick?: (tagId: string) => void
  vendors?: Vendor[]
  recipes?: Recipe[]
  onVendorClick?: (vendorId: string) => void
  onRecipeClick?: (recipeId: string) => void
  showTags?: boolean
  mode?: 'pantry' | 'shopping' | 'tag-assignment' | 'recipe-assignment'
  // Unified behavior props (mode-agnostic)
  isChecked?: boolean
  onCheckboxToggle?: () => void
  controlAmount?: number // shown in right-side controls (cart qty, recipe amount)
  minControlAmount?: number // minimum before minus disables (default: 1)
  onAmountChange?: (delta: number) => void
  disabled?: boolean // disables checkbox and amount buttons (e.g. while saving)
}
```

Add `vendors`, `recipes`, `onVendorClick`, `onRecipeClick` to the destructuring (after `onTagClick`):

```ts
export function ItemCard({
  item,
  tags,
  tagTypes,
  onTagClick,
  vendors = [],
  recipes = [],
  onVendorClick,
  onRecipeClick,
  showTags = true,
  ...
```

Replace the collapsed count section (lines 225-229):

```ts
          {(tags.length > 0 || vendors.length > 0 || recipes.length > 0) && !showTags && (
            <span className="text-xs text-foreground-muted">
              {[
                tags.length > 0 ? `${tags.length} ${tags.length === 1 ? 'tag' : 'tags'}` : null,
                vendors.length > 0 ? `${vendors.length} ${vendors.length === 1 ? 'vendor' : 'vendors'}` : null,
                recipes.length > 0 ? `${recipes.length} ${recipes.length === 1 ? 'recipe' : 'recipes'}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
```

After the tag badges section (after line 254, before the closing `</CardContent>`), add vendor and recipe badge rows:

```tsx
        {vendors.length > 0 && mode !== 'shopping' && showTags && (
          <div className="flex flex-wrap gap-1 mt-1">
            {vendors.map((vendor) => (
              <Badge
                key={vendor.id}
                data-testid={`vendor-badge-${vendor.name}`}
                variant="outline"
                className={`text-xs ${onVendorClick ? 'cursor-pointer' : ''}`}
                onClick={(e) => {
                  if (onVendorClick) {
                    e.preventDefault()
                    e.stopPropagation()
                    onVendorClick(vendor.id)
                  }
                }}
              >
                {vendor.name}
              </Badge>
            ))}
          </div>
        )}
        {recipes.length > 0 && mode !== 'shopping' && showTags && (
          <div className="flex flex-wrap gap-1 mt-1">
            {recipes.map((recipe) => (
              <Badge
                key={recipe.id}
                data-testid={`recipe-badge-${recipe.name}`}
                variant="outline"
                className={`text-xs ${onRecipeClick ? 'cursor-pointer' : ''}`}
                onClick={(e) => {
                  if (onRecipeClick) {
                    e.preventDefault()
                    e.stopPropagation()
                    onRecipeClick(recipe.id)
                  }
                }}
              >
                {recipe.name}
              </Badge>
            ))}
          </div>
        )}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/components/ItemCard.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ItemCard.tsx src/components/ItemCard.test.tsx
git commit -m "feat(item-card): add vendor and recipe badge display"
```

---

## Task 4: ItemFilters — add vendor/recipe dropdowns

**Files:**
- Modify: `src/components/ItemFilters.tsx`

**Step 1: Update ItemFilters.tsx**

Replace the full file content with:

```tsx
// src/components/ItemFilters.tsx

import { ChevronDown, X } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Pencil } from 'lucide-react'
import { TagTypeDropdown } from '@/components/TagTypeDropdown'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTags, useTagTypes } from '@/hooks/useTags'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import { calculateTagCount } from '@/lib/filterUtils'
import { sortTagsByName } from '@/lib/tagSortUtils'
import { cn } from '@/lib/utils'
import type { Item, Recipe, Vendor } from '@/types'

interface ItemFiltersProps {
  items: Item[] // search-scoped items for available tag option computation
  disabled?: boolean
  vendors?: Vendor[]
  recipes?: Recipe[]
  hideVendorFilter?: boolean
  hideRecipeFilter?: boolean
}

export function ItemFilters({
  items,
  disabled,
  vendors = [],
  recipes = [],
  hideVendorFilter,
  hideRecipeFilter,
}: ItemFiltersProps) {
  const { data: tagTypes = [] } = useTagTypes()
  const { data: tags = [] } = useTags()
  const {
    filterState,
    setFilterState,
    selectedVendorIds,
    selectedRecipeIds,
    toggleVendorId,
    toggleRecipeId,
    clearVendorIds,
    clearRecipeIds,
  } = useUrlSearchAndFilters()

  // Filter to only tag types that have tags, then sort alphabetically
  const tagTypesWithTags = tagTypes
    .filter((tagType) => tags.some((tag) => tag.typeId === tagType.id))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    )

  const showVendors = !hideVendorFilter && vendors.length > 0
  const showRecipes = !hideRecipeFilter && recipes.length > 0

  // Don't render if nothing to show
  if (tagTypesWithTags.length === 0 && !showVendors && !showRecipes) return null

  const handleToggleTag = (tagTypeId: string, tagId: string) => {
    const currentTags = filterState[tagTypeId] || []
    const newTags = currentTags.includes(tagId)
      ? currentTags.filter((id) => id !== tagId)
      : [...currentTags, tagId]

    setFilterState({
      ...filterState,
      [tagTypeId]: newTags,
    })
  }

  const handleClearTagType = (tagTypeId: string) => {
    const newState = { ...filterState }
    delete newState[tagTypeId]
    setFilterState(newState)
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1 mx-1 py-1',
        disabled ? 'opacity-50 pointer-events-none' : '',
      )}
    >
      {tagTypesWithTags.map((tagType) => {
        const tagTypeId = tagType.id
        const typeTags = tags.filter((tag) => tag.typeId === tagTypeId)
        const sortedTypeTags = sortTagsByName(typeTags)
        const selectedTagIds = filterState[tagTypeId] || []

        // Calculate dynamic counts for each tag
        const tagCounts = sortedTypeTags.map((tag) =>
          calculateTagCount(tag.id, tagTypeId, items, filterState),
        )

        return (
          <TagTypeDropdown
            key={tagTypeId}
            tagType={tagType}
            tags={sortedTypeTags}
            selectedTagIds={selectedTagIds}
            tagCounts={tagCounts}
            onToggleTag={(tagId) => handleToggleTag(tagTypeId, tagId)}
            onClear={() => handleClearTagType(tagTypeId)}
          />
        )
      })}

      {showVendors && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant={selectedVendorIds.length > 0 ? 'neutral' : 'neutral-ghost'}
              size="xs"
              className="gap-1"
            >
              Vendors
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {vendors.map((vendor) => {
              const count = items.filter((item) =>
                item.vendorIds?.includes(vendor.id),
              ).length
              return (
                <DropdownMenuCheckboxItem
                  key={vendor.id}
                  checked={selectedVendorIds.includes(vendor.id)}
                  onCheckedChange={() => toggleVendorId(vendor.id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <div className="flex items-center justify-between w-full">
                    <span>{vendor.name}</span>
                    <span className="text-foreground-muted text-xs ml-2">
                      ({count})
                    </span>
                  </div>
                </DropdownMenuCheckboxItem>
              )
            })}
            {selectedVendorIds.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={clearVendorIds}>
                  <X className="h-4 w-4" />
                  <span className="text-xs">Clear</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {showRecipes && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant={selectedRecipeIds.length > 0 ? 'neutral' : 'neutral-ghost'}
              size="xs"
              className="gap-1"
            >
              Recipes
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {recipes.map((recipe) => {
              const count = items.filter((item) =>
                recipe.items.some((ri) => ri.itemId === item.id),
              ).length
              return (
                <DropdownMenuCheckboxItem
                  key={recipe.id}
                  checked={selectedRecipeIds.includes(recipe.id)}
                  onCheckedChange={() => toggleRecipeId(recipe.id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <div className="flex items-center justify-between w-full">
                    <span>{recipe.name}</span>
                    <span className="text-foreground-muted text-xs ml-2">
                      ({count})
                    </span>
                  </div>
                </DropdownMenuCheckboxItem>
              )
            })}
            {selectedRecipeIds.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={clearRecipeIds}>
                  <X className="h-4 w-4" />
                  <span className="text-xs">Clear</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Link to="/settings/tags">
        <Button size="xs" variant="neutral-ghost">
          <Pencil />
          Edit
        </Button>
      </Link>
    </div>
  )
}
```

**Step 2: Run all tests to confirm nothing breaks**

```bash
pnpm test
```

Expected: PASS (no regressions)

**Step 3: Commit**

```bash
git add src/components/ItemFilters.tsx
git commit -m "feat(item-filters): add vendor and recipe filter dropdowns"
```

---

## Task 5: ItemListToolbar — wire vendor/recipe through

**Files:**
- Modify: `src/components/ItemListToolbar.tsx`

**Step 1: Update ItemListToolbar.tsx**

Add these imports at the top (after existing imports):

```ts
import { filterItemsByRecipes, filterItemsByVendors } from '@/lib/filterUtils'
import type { Recipe, Vendor } from '@/types'
```

Extend `ItemListToolbarProps` interface — add after the existing `onCreateFromSearch` prop:

```ts
  vendors?: Vendor[]
  recipes?: Recipe[]
  hideVendorFilter?: boolean
  hideRecipeFilter?: boolean
```

Add to the destructured params of `ItemListToolbar`:

```ts
  vendors,
  recipes,
  hideVendorFilter,
  hideRecipeFilter,
```

Get vendor/recipe state from the hook — add after the existing hook destructure:

```ts
  const {
    selectedVendorIds,
    selectedRecipeIds,
    clearVendorIds,
    clearRecipeIds,
    // ... existing fields
  } = useUrlSearchAndFilters()
```

Update `hasActiveFilters`:

```ts
  const hasActiveFilters =
    Object.values(filterState).some((tagIds) => tagIds.length > 0) ||
    selectedVendorIds.length > 0 ||
    selectedRecipeIds.length > 0
```

Update `filteredCount`:

```ts
  const tagFiltered = filterItems(items, filterState)
  const vendorFiltered = filterItemsByVendors(tagFiltered, selectedVendorIds)
  const filteredCount = filterItemsByRecipes(
    vendorFiltered,
    selectedRecipeIds,
    recipes ?? [],
  ).length
```

Update the `onClearAll` handler:

```ts
  onClearAll={() => {
    setFilterState({})
    clearVendorIds()
    clearRecipeIds()
  }}
```

Pass new props to `<ItemFilters>`:

```tsx
  <ItemFilters
    items={items}
    disabled={!!search}
    vendors={vendors}
    recipes={recipes}
    hideVendorFilter={hideVendorFilter}
    hideRecipeFilter={hideRecipeFilter}
  />
```

**Step 2: Run all tests to confirm nothing breaks**

```bash
pnpm test
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/components/ItemListToolbar.tsx
git commit -m "feat(item-list-toolbar): wire vendor and recipe filters through toolbar"
```

---

## Task 6: Pantry page — add vendor/recipe data and filter chain

**Files:**
- Modify: `src/routes/index.tsx`

**Step 1: Add imports**

Add to existing imports:
```ts
import { useMemo } from 'react'
import { useVendors } from '@/hooks/useVendors'
import { useRecipes } from '@/hooks/useRecipes'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import { filterItemsByRecipes, filterItemsByVendors } from '@/lib/filterUtils'
import type { Recipe, Vendor } from '@/types'
```

Note: `useUrlSearchAndFilters` is already imported; just add the missing ones.

**Step 2: Add data fetching and maps inside PantryView**

After the existing `useTagTypes` / `useTags` calls, add:

```ts
  const { data: vendors = [] } = useVendors()
  const { data: recipes = [] } = useRecipes()

  const vendorMap = useMemo(() => {
    const map = new Map<string, Vendor[]>()
    for (const item of items) {
      map.set(
        item.id,
        vendors.filter((v) => item.vendorIds?.includes(v.id) ?? false),
      )
    }
    return map
  }, [items, vendors])

  const recipeMap = useMemo(() => {
    const map = new Map<string, Recipe[]>()
    for (const recipe of recipes) {
      for (const ri of recipe.items) {
        const existing = map.get(ri.itemId) ?? []
        map.set(ri.itemId, [...existing, recipe])
      }
    }
    return map
  }, [recipes])
```

**Step 3: Add vendor/recipe handlers**

After `handleTagClick`, add:

```ts
  const { toggleVendorId, toggleRecipeId, selectedVendorIds, selectedRecipeIds } =
    useUrlSearchAndFilters()

  const handleVendorClick = (vendorId: string) => {
    toggleVendorId(vendorId)
  }

  const handleRecipeClick = (recipeId: string) => {
    toggleRecipeId(recipeId)
  }
```

Note: `useUrlSearchAndFilters` is already called above for `search`, `filterState`, etc. — destructure the new fields from the same call instead of calling it twice.

**Step 4: Update filter chain**

After the existing `filteredItems` computation, extend it:

```ts
  const tagFiltered = search ? searchFiltered : filterItems(searchFiltered, filterState)
  const vendorFiltered = filterItemsByVendors(tagFiltered, selectedVendorIds)
  const filteredItems = filterItemsByRecipes(vendorFiltered, selectedRecipeIds, recipes)
```

(Replace the existing `filteredItems` computation.)

**Step 5: Pass vendors/recipes to ItemListToolbar**

```tsx
  <ItemListToolbar
    ...
    vendors={vendors}
    recipes={recipes}
  >
```

**Step 6: Pass vendors/recipes to each ItemCard** (both active and inactive loops)

```tsx
  <ItemCard
    ...
    vendors={vendorMap.get(item.id) ?? []}
    recipes={recipeMap.get(item.id) ?? []}
    onVendorClick={handleVendorClick}
    onRecipeClick={handleRecipeClick}
    onTagClick={handleTagClick}
  />
```

**Step 7: Run all tests**

```bash
pnpm test src/routes/index.test.tsx
```

Expected: PASS

**Step 8: Commit**

```bash
git add src/routes/index.tsx
git commit -m "feat(pantry): show vendor and recipe badges on item cards with filter support"
```

---

## Task 7: Tag items tab — add vendor/recipe data and filter chain

**Files:**
- Modify: `src/routes/settings/tags/$id/items.tsx`

**Step 1: Add imports**

```ts
import { useVendors } from '@/hooks/useVendors'
import { useRecipes } from '@/hooks/useRecipes'
import { filterItemsByRecipes, filterItemsByVendors } from '@/lib/filterUtils'
import type { Recipe, Vendor } from '@/types'
```

**Step 2: Add data fetching and maps inside TagItemsTab**

After existing hook calls:

```ts
  const { data: vendors = [] } = useVendors()
  const { data: recipes = [] } = useRecipes()

  const vendorMap = useMemo(() => {
    const map = new Map<string, Vendor[]>()
    for (const item of items) {
      map.set(
        item.id,
        vendors.filter((v) => item.vendorIds?.includes(v.id) ?? false),
      )
    }
    return map
  }, [items, vendors])

  const recipeMap = useMemo(() => {
    const map = new Map<string, Recipe[]>()
    for (const recipe of recipes) {
      for (const ri of recipe.items) {
        const existing = map.get(ri.itemId) ?? []
        map.set(ri.itemId, [...existing, recipe])
      }
    }
    return map
  }, [recipes])
```

**Step 3: Add vendor/recipe handlers**

Destructure `toggleVendorId`, `toggleRecipeId`, `selectedVendorIds`, `selectedRecipeIds` from the existing `useUrlSearchAndFilters()` call (add to destructuring).

Add handlers:

```ts
  const handleVendorClick = (vendorId: string) => toggleVendorId(vendorId)
  const handleRecipeClick = (recipeId: string) => toggleRecipeId(recipeId)
```

**Step 4: Extend filter chain**

```ts
  const tagFiltered = search ? searchFiltered : filterItems(searchFiltered, filterState)
  const vendorFiltered = filterItemsByVendors(tagFiltered, selectedVendorIds)
  const filteredBeforeSort = filterItemsByRecipes(vendorFiltered, selectedRecipeIds, recipes)
```

Then apply sort to `filteredBeforeSort` instead of `tagFiltered`.

**Step 5: Pass to ItemListToolbar and ItemCard**

`ItemListToolbar`: add `vendors={vendors}` and `recipes={recipes}`

`ItemCard`: add `vendors={vendorMap.get(item.id) ?? []}`, `recipes={recipeMap.get(item.id) ?? []}`, `onVendorClick={handleVendorClick}`, `onRecipeClick={handleRecipeClick}`

**Step 6: Run tests**

```bash
pnpm test src/routes/settings/tags/$id/items.test.tsx
```

Expected: PASS

**Step 7: Commit**

```bash
git add src/routes/settings/tags/$id/items.tsx
git commit -m "feat(tag-items): show vendor and recipe badges with filter support"
```

---

## Task 8: Vendor items tab — add vendor/recipe data, hide vendor filter

**Files:**
- Modify: `src/routes/settings/vendors/$id/items.tsx`

Same pattern as Task 7, with one addition:

Pass `hideVendorFilter` to `ItemListToolbar`:

```tsx
<ItemListToolbar
  ...
  vendors={vendors}
  recipes={recipes}
  hideVendorFilter
/>
```

This hides the vendor filter dropdown since the page is already scoped to one vendor.

Note: Still pass `vendors` to ItemListToolbar and ItemCard so vendor badges render on the cards (items may also be assigned to other vendors).

**After changes run:**

```bash
pnpm test src/routes/settings/vendors/$id/items.test.tsx
```

**Commit:**

```bash
git add src/routes/settings/vendors/$id/items.tsx
git commit -m "feat(vendor-items): show vendor and recipe badges with filter support"
```

---

## Task 9: Recipe items tab — add vendor/recipe data, hide recipe filter

**Files:**
- Modify: `src/routes/settings/recipes/$id/items.tsx`

Same pattern as Task 7, with one addition:

Pass `hideRecipeFilter` to `ItemListToolbar`:

```tsx
<ItemListToolbar
  ...
  vendors={vendors}
  recipes={recipes}
  hideRecipeFilter
/>
```

This hides the recipe filter dropdown since the page is already scoped to one recipe.

**After changes run:**

```bash
pnpm test src/routes/settings/recipes/$id/items.test.tsx
```

**Commit:**

```bash
git add src/routes/settings/recipes/$id/items.tsx
git commit -m "feat(recipe-items): show vendor and recipe badges with filter support"
```

---

## Task 10: Update Storybook stories

**Files:**
- Modify: `src/components/ItemCard.stories.tsx`
- Modify: `src/components/ItemFilters.stories.tsx`

**Step 1: Update ItemCard.stories.tsx**

Add new stories showing vendor/recipe display. Find the existing default story and add:

```tsx
const mockVendors: Vendor[] = [
  { id: 'v1', name: 'Costco', createdAt: new Date() },
  { id: 'v2', name: 'Safeway', createdAt: new Date() },
]

const mockRecipes: Recipe[] = [
  {
    id: 'r1',
    name: 'Pancakes',
    items: [{ itemId: 'item-1', defaultAmount: 2 }],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

export const WithVendorsCollapsed: Story = {
  args: {
    ...Default.args,
    showTags: false,
    vendors: mockVendors,
    recipes: mockRecipes,
  },
}

export const WithVendorsExpanded: Story = {
  args: {
    ...Default.args,
    showTags: true,
    vendors: mockVendors,
    recipes: mockRecipes,
    onVendorClick: fn(),
    onRecipeClick: fn(),
  },
}
```

**Step 2: Update ItemFilters.stories.tsx**

Add stories showing vendor/recipe dropdowns. Pass `vendors` and `recipes` props to existing stories or add new ones.

**Step 3: Run Storybook to verify**

```bash
pnpm storybook
```

Visually verify:
- Collapsed cards show "X tags · Y vendors · Z recipes"
- Expanded cards show vendor and recipe badges
- ItemFilters shows Vendors and Recipes dropdowns

**Step 4: Commit**

```bash
git add src/components/ItemCard.stories.tsx src/components/ItemFilters.stories.tsx
git commit -m "docs(stories): update ItemCard and ItemFilters stories for vendor/recipe display"
```

---

## Final verification

```bash
pnpm test
pnpm build
```

Both must pass before closing the branch.
