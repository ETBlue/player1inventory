# Tag Filtering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add tag-based filtering to the home page with multi-select dropdowns organized by tag type

**Architecture:** Filter state lives in home page component with sessionStorage persistence. New ItemFilters and TagTypeDropdown components. Filter logic uses OR within tag type, AND across types.

**Tech Stack:** React 19, TanStack Router, Vitest, React Testing Library, shadcn/ui (needs dropdown-menu and checkbox components)

---

## Task 1: Add shadcn/ui Components

**Files:**
- Create: `src/components/ui/dropdown-menu.tsx`
- Create: `src/components/ui/checkbox.tsx`

**Step 1: Add dropdown-menu component**

Run: `cd /Users/etblue/Code/GitHub/player1inventory && npx shadcn@latest add dropdown-menu`

Expected: Component added to `src/components/ui/dropdown-menu.tsx`

**Step 2: Add checkbox component**

Run: `npx shadcn@latest add checkbox`

Expected: Component added to `src/components/ui/checkbox.tsx`

**Step 3: Verify components**

Run: `ls src/components/ui/dropdown-menu.tsx src/components/ui/checkbox.tsx`

Expected: Both files exist

**Step 4: Commit**

```bash
git add src/components/ui/dropdown-menu.tsx src/components/ui/checkbox.tsx
git commit -m "feat(ui): add dropdown-menu and checkbox components from shadcn"
```

---

## Task 2: Filter Logic Utilities

**Files:**
- Create: `src/lib/filterUtils.ts`
- Create: `src/lib/filterUtils.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/filterUtils.test.ts
import { describe, expect, it } from 'vitest'
import type { Item, Tag } from '@/types'
import { filterItems } from './filterUtils'

describe('filterItems', () => {
  const items: Item[] = [
    {
      id: '1',
      name: 'Tomatoes',
      tagIds: ['tag-veg', 'tag-fridge'],
      targetQuantity: 5,
      refillThreshold: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '2',
      name: 'Apples',
      tagIds: ['tag-fruit', 'tag-fridge'],
      targetQuantity: 10,
      refillThreshold: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '3',
      name: 'Pasta',
      tagIds: ['tag-grain', 'tag-pantry'],
      targetQuantity: 3,
      refillThreshold: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '4',
      name: 'Bread',
      tagIds: [],
      targetQuantity: 2,
      refillThreshold: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  it('returns all items when no filters active', () => {
    const result = filterItems(items, {})
    expect(result).toHaveLength(4)
  })

  it('filters by single tag from one type', () => {
    const result = filterItems(items, {
      'type-category': ['tag-veg'],
    })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Tomatoes')
  })

  it('filters with OR logic within same tag type', () => {
    const result = filterItems(items, {
      'type-category': ['tag-veg', 'tag-fruit'],
    })
    expect(result).toHaveLength(2)
    expect(result.map((i) => i.name).sort()).toEqual(['Apples', 'Tomatoes'])
  })

  it('filters with AND logic across different tag types', () => {
    const result = filterItems(items, {
      'type-category': ['tag-veg', 'tag-fruit'],
      'type-location': ['tag-fridge'],
    })
    expect(result).toHaveLength(2)
    expect(result.map((i) => i.name).sort()).toEqual(['Apples', 'Tomatoes'])
  })

  it('filters out items with no tags when filters active', () => {
    const result = filterItems(items, {
      'type-location': ['tag-fridge'],
    })
    expect(result).toHaveLength(2)
    expect(result.every((i) => i.name !== 'Bread')).toBe(true)
  })

  it('returns empty array when no items match', () => {
    const result = filterItems(items, {
      'type-category': ['tag-nonexistent'],
    })
    expect(result).toHaveLength(0)
  })

  it('handles empty tag arrays in filter state', () => {
    const result = filterItems(items, {
      'type-category': [],
      'type-location': ['tag-fridge'],
    })
    expect(result).toHaveLength(2)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/filterUtils.test.ts`

Expected: FAIL with "Cannot find module './filterUtils'"

**Step 3: Write minimal implementation**

```typescript
// src/lib/filterUtils.ts
import type { Item } from '@/types'

export interface FilterState {
  [tagTypeId: string]: string[] // tagTypeId -> array of selected tag IDs
}

export function filterItems(items: Item[], filterState: FilterState): Item[] {
  // If no filters active, return all items
  const activeFilters = Object.entries(filterState).filter(
    ([, tagIds]) => tagIds.length > 0,
  )

  if (activeFilters.length === 0) return items

  return items.filter((item) => {
    // For each tag type that has selected tags...
    return activeFilters.every(([tagTypeId, selectedTagIds]) => {
      // Item must have at least ONE of the selected tags from this type (OR logic)
      return selectedTagIds.some((selectedTagId) =>
        item.tagIds.includes(selectedTagId),
      )
    })
    // All tag types must match (AND logic across types)
  })
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/filterUtils.test.ts`

Expected: PASS (all 7 tests)

**Step 5: Commit**

```bash
git add src/lib/filterUtils.ts src/lib/filterUtils.test.ts
git commit -m "feat(filters): add filter logic with OR/AND behavior"
```

---

## Task 3: Dynamic Count Calculation

**Files:**
- Modify: `src/lib/filterUtils.ts`
- Modify: `src/lib/filterUtils.test.ts`

**Step 1: Write the failing test**

Add to `src/lib/filterUtils.test.ts`:

```typescript
import { calculateTagCount } from './filterUtils'

describe('calculateTagCount', () => {
  const items: Item[] = [
    {
      id: '1',
      name: 'Tomatoes',
      tagIds: ['tag-veg', 'tag-fridge'],
      targetQuantity: 5,
      refillThreshold: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '2',
      name: 'Apples',
      tagIds: ['tag-fruit', 'tag-fridge'],
      targetQuantity: 10,
      refillThreshold: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '3',
      name: 'Pasta',
      tagIds: ['tag-grain', 'tag-pantry'],
      targetQuantity: 3,
      refillThreshold: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  it('calculates count with no other filters', () => {
    const count = calculateTagCount(
      'tag-fridge',
      'type-location',
      items,
      {},
    )
    expect(count).toBe(2)
  })

  it('calculates count considering other active filters', () => {
    const count = calculateTagCount(
      'tag-veg',
      'type-category',
      items,
      {
        'type-location': ['tag-fridge'],
      },
    )
    expect(count).toBe(1) // Only tomatoes (veg + fridge)
  })

  it('returns 0 when no items would match', () => {
    const count = calculateTagCount(
      'tag-grain',
      'type-category',
      items,
      {
        'type-location': ['tag-fridge'],
      },
    )
    expect(count).toBe(0) // No grain in fridge
  })

  it('handles tag already selected in same type', () => {
    const count = calculateTagCount(
      'tag-veg',
      'type-category',
      items,
      {
        'type-category': ['tag-fruit'],
        'type-location': ['tag-fridge'],
      },
    )
    expect(count).toBe(2) // Both veg and fruit in fridge (OR within type)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/filterUtils.test.ts`

Expected: FAIL with "calculateTagCount is not defined"

**Step 3: Write implementation**

Add to `src/lib/filterUtils.ts`:

```typescript
export function calculateTagCount(
  tagId: string,
  tagTypeId: string,
  items: Item[],
  currentFilters: FilterState,
): number {
  // Simulate selecting this tag with other active filters
  const simulatedFilters = {
    ...currentFilters,
    [tagTypeId]: [
      ...(currentFilters[tagTypeId] || []),
      tagId,
    ],
  }
  return filterItems(items, simulatedFilters).length
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/filterUtils.test.ts`

Expected: PASS (all 11 tests)

**Step 5: Commit**

```bash
git add src/lib/filterUtils.ts src/lib/filterUtils.test.ts
git commit -m "feat(filters): add dynamic count calculation"
```

---

## Task 4: SessionStorage Utilities

**Files:**
- Create: `src/lib/sessionStorage.ts`
- Create: `src/lib/sessionStorage.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/sessionStorage.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FilterState } from './filterUtils'
import { loadFilters, saveFilters } from './sessionStorage'

describe('sessionStorage utilities', () => {
  const STORAGE_KEY = 'pantry-filters'

  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('saves filter state to sessionStorage', () => {
    const filters: FilterState = {
      'type-1': ['tag-a', 'tag-b'],
      'type-2': ['tag-c'],
    }
    saveFilters(filters)

    const stored = sessionStorage.getItem(STORAGE_KEY)
    expect(stored).toBeDefined()
    expect(JSON.parse(stored!)).toEqual(filters)
  })

  it('loads filter state from sessionStorage', () => {
    const filters: FilterState = {
      'type-1': ['tag-a'],
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters))

    const loaded = loadFilters()
    expect(loaded).toEqual(filters)
  })

  it('returns empty object when sessionStorage is empty', () => {
    const loaded = loadFilters()
    expect(loaded).toEqual({})
  })

  it('returns empty object when sessionStorage contains invalid JSON', () => {
    sessionStorage.setItem(STORAGE_KEY, 'invalid json')

    const loaded = loadFilters()
    expect(loaded).toEqual({})
  })

  it('returns empty object when sessionStorage contains wrong type', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify('string'))

    const loaded = loadFilters()
    expect(loaded).toEqual({})
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/sessionStorage.test.ts`

Expected: FAIL with "Cannot find module './sessionStorage'"

**Step 3: Write implementation**

```typescript
// src/lib/sessionStorage.ts
import type { FilterState } from './filterUtils'

const STORAGE_KEY = 'pantry-filters'

export function saveFilters(filters: FilterState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  } catch (error) {
    console.error('Failed to save filters to sessionStorage:', error)
  }
}

export function loadFilters(): FilterState {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (!stored) return {}

    const parsed = JSON.parse(stored)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {}
    }

    return parsed as FilterState
  } catch (error) {
    console.error('Failed to load filters from sessionStorage:', error)
    return {}
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/sessionStorage.test.ts`

Expected: PASS (all 5 tests)

**Step 5: Commit**

```bash
git add src/lib/sessionStorage.ts src/lib/sessionStorage.test.ts
git commit -m "feat(filters): add sessionStorage utilities"
```

---

## Task 5: TagTypeDropdown Component

**Files:**
- Create: `src/components/TagTypeDropdown.tsx`
- Create: `src/components/TagTypeDropdown.test.tsx`

**Step 1: Write the failing test**

```typescript
// src/components/TagTypeDropdown.test.tsx
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Tag, TagType } from '@/types'
import { TagTypeDropdown } from './TagTypeDropdown'

describe('TagTypeDropdown', () => {
  const tagType: TagType = {
    id: 'type-1',
    name: 'Category',
    color: 'blue',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const tags: Tag[] = [
    {
      id: 'tag-1',
      typeId: 'type-1',
      name: 'Vegetables',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'tag-2',
      typeId: 'type-1',
      name: 'Fruits',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  it('renders tag type name as trigger', () => {
    render(
      <TagTypeDropdown
        tagType={tagType}
        tags={tags}
        selectedTagIds={[]}
        tagCounts={[5, 3]}
        onToggleTag={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /category/i })).toBeInTheDocument()
  })

  it('shows visual indicator when filters active', () => {
    render(
      <TagTypeDropdown
        tagType={tagType}
        tags={tags}
        selectedTagIds={['tag-1']}
        tagCounts={[5, 3]}
        onToggleTag={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', { name: /category/i })
    expect(button.textContent).toContain('•')
  })

  it('displays tags with counts in dropdown', async () => {
    const user = userEvent.setup()
    render(
      <TagTypeDropdown
        tagType={tagType}
        tags={tags}
        selectedTagIds={[]}
        tagCounts={[5, 3]}
        onToggleTag={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /category/i }))

    expect(screen.getByText(/vegetables/i)).toBeInTheDocument()
    expect(screen.getByText(/\(5\)/)).toBeInTheDocument()
    expect(screen.getByText(/fruits/i)).toBeInTheDocument()
    expect(screen.getByText(/\(3\)/)).toBeInTheDocument()
  })

  it('shows clear option when selections exist', async () => {
    const user = userEvent.setup()
    render(
      <TagTypeDropdown
        tagType={tagType}
        tags={tags}
        selectedTagIds={['tag-1']}
        tagCounts={[5, 3]}
        onToggleTag={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /category/i }))

    expect(screen.getByText(/clear/i)).toBeInTheDocument()
  })

  it('calls onToggleTag when checkbox clicked', async () => {
    const onToggleTag = vi.fn()
    const user = userEvent.setup()
    render(
      <TagTypeDropdown
        tagType={tagType}
        tags={tags}
        selectedTagIds={[]}
        tagCounts={[5, 3]}
        onToggleTag={onToggleTag}
        onClear={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /category/i }))
    const checkbox = screen.getByRole('checkbox', { name: /vegetables/i })
    await user.click(checkbox)

    expect(onToggleTag).toHaveBeenCalledWith('tag-1')
  })

  it('calls onClear when clear clicked', async () => {
    const onClear = vi.fn()
    const user = userEvent.setup()
    render(
      <TagTypeDropdown
        tagType={tagType}
        tags={tags}
        selectedTagIds={['tag-1']}
        tagCounts={[5, 3]}
        onToggleTag={vi.fn()}
        onClear={onClear}
      />,
    )

    await user.click(screen.getByRole('button', { name: /category/i }))
    await user.click(screen.getByText(/clear/i))

    expect(onClear).toHaveBeenCalled()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/components/TagTypeDropdown.test.tsx`

Expected: FAIL with "Cannot find module './TagTypeDropdown'"

**Step 3: Write implementation**

```typescript
// src/components/TagTypeDropdown.tsx
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { colors } from '@/design-tokens'
import type { Tag, TagType } from '@/types'

interface TagTypeDropdownProps {
  tagType: TagType
  tags: Tag[]
  selectedTagIds: string[]
  tagCounts: number[]
  onToggleTag: (tagId: string) => void
  onClear: () => void
}

export function TagTypeDropdown({
  tagType,
  tags,
  selectedTagIds,
  tagCounts,
  onToggleTag,
  onClear,
}: TagTypeDropdownProps) {
  const hasSelection = selectedTagIds.length > 0
  const tagTypeColor = colors[tagType.color as keyof typeof colors]?.default

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          style={{
            borderColor: tagTypeColor,
            color: tagTypeColor,
          }}
        >
          {tagType.name}
          {hasSelection && <span className="ml-1">•</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {hasSelection && (
          <>
            <DropdownMenuItem onClick={onClear}>
              <X className="mr-2 h-4 w-4" />
              Clear
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {tags.map((tag, index) => {
          const isChecked = selectedTagIds.includes(tag.id)
          return (
            <DropdownMenuCheckboxItem
              key={tag.id}
              checked={isChecked}
              onCheckedChange={() => onToggleTag(tag.id)}
              onSelect={(e) => e.preventDefault()} // Keep menu open
            >
              <div className="flex items-center justify-between w-full">
                <span>{tag.name}</span>
                <span className="text-muted-foreground text-xs ml-2">
                  ({tagCounts[index]})
                </span>
              </div>
            </DropdownMenuCheckboxItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/components/TagTypeDropdown.test.tsx`

Expected: PASS (all 7 tests)

**Step 5: Commit**

```bash
git add src/components/TagTypeDropdown.tsx src/components/TagTypeDropdown.test.tsx
git commit -m "feat(filters): add TagTypeDropdown component"
```

---

## Task 6: ItemFilters Component

**Files:**
- Create: `src/components/ItemFilters.tsx`
- Create: `src/components/ItemFilters.test.tsx`

**Step 1: Write the failing test**

```typescript
// src/components/ItemFilters.test.tsx
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Item, Tag, TagType } from '@/types'
import type { FilterState } from '@/lib/filterUtils'
import { ItemFilters } from './ItemFilters'

describe('ItemFilters', () => {
  const tagTypes: TagType[] = [
    {
      id: 'type-1',
      name: 'Category',
      color: 'blue',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'type-2',
      name: 'Location',
      color: 'green',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  const tags: Tag[] = [
    {
      id: 'tag-1',
      typeId: 'type-1',
      name: 'Vegetables',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'tag-2',
      typeId: 'type-1',
      name: 'Fruits',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'tag-3',
      typeId: 'type-2',
      name: 'Fridge',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  const items: Item[] = [
    {
      id: '1',
      name: 'Tomatoes',
      tagIds: ['tag-1', 'tag-3'],
      targetQuantity: 5,
      refillThreshold: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '2',
      name: 'Apples',
      tagIds: ['tag-2', 'tag-3'],
      targetQuantity: 10,
      refillThreshold: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  it('renders dropdowns for tag types with tags', () => {
    render(
      <ItemFilters
        tagTypes={tagTypes}
        tags={tags}
        items={items}
        filterState={{}}
        filteredCount={2}
        totalCount={2}
        onFilterChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /category/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /location/i })).toBeInTheDocument()
  })

  it('does not render dropdown for tag type with no tags', () => {
    const emptyTagType: TagType = {
      id: 'type-empty',
      name: 'Empty',
      color: 'red',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    render(
      <ItemFilters
        tagTypes={[...tagTypes, emptyTagType]}
        tags={tags}
        items={items}
        filterState={{}}
        filteredCount={2}
        totalCount={2}
        onFilterChange={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: /empty/i })).not.toBeInTheDocument()
  })

  it('displays item count', () => {
    render(
      <ItemFilters
        tagTypes={tagTypes}
        tags={tags}
        items={items}
        filterState={{}}
        filteredCount={2}
        totalCount={5}
        onFilterChange={vi.fn()}
      />,
    )

    expect(screen.getByText(/showing 2 of 5 items/i)).toBeInTheDocument()
  })

  it('shows clear all button when filters active', () => {
    const filterState: FilterState = {
      'type-1': ['tag-1'],
    }

    render(
      <ItemFilters
        tagTypes={tagTypes}
        tags={tags}
        items={items}
        filterState={filterState}
        filteredCount={1}
        totalCount={2}
        onFilterChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument()
  })

  it('hides clear all button when no filters active', () => {
    render(
      <ItemFilters
        tagTypes={tagTypes}
        tags={tags}
        items={items}
        filterState={{}}
        filteredCount={2}
        totalCount={2}
        onFilterChange={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument()
  })

  it('calls onFilterChange when clear all clicked', async () => {
    const onFilterChange = vi.fn()
    const user = userEvent.setup()
    const filterState: FilterState = {
      'type-1': ['tag-1'],
    }

    render(
      <ItemFilters
        tagTypes={tagTypes}
        tags={tags}
        items={items}
        filterState={filterState}
        filteredCount={1}
        totalCount={2}
        onFilterChange={onFilterChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: /clear all/i }))

    expect(onFilterChange).toHaveBeenCalledWith({})
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/components/ItemFilters.test.tsx`

Expected: FAIL with "Cannot find module './ItemFilters'"

**Step 3: Write implementation**

```typescript
// src/components/ItemFilters.tsx
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TagTypeDropdown } from '@/components/TagTypeDropdown'
import { calculateTagCount, type FilterState } from '@/lib/filterUtils'
import type { Item, Tag, TagType } from '@/types'

interface ItemFiltersProps {
  tagTypes: TagType[]
  tags: Tag[]
  items: Item[]
  filterState: FilterState
  filteredCount: number
  totalCount: number
  onFilterChange: (newState: FilterState) => void
}

export function ItemFilters({
  tagTypes,
  tags,
  items,
  filterState,
  filteredCount,
  totalCount,
  onFilterChange,
}: ItemFiltersProps) {
  // Filter to only tag types that have tags
  const tagTypesWithTags = tagTypes.filter((tagType) =>
    tags.some((tag) => tag.typeId === tagType.id),
  )

  // Don't render if no tag types with tags
  if (tagTypesWithTags.length === 0) return null

  const hasActiveFilters = Object.values(filterState).some(
    (tagIds) => tagIds.length > 0,
  )

  const handleToggleTag = (tagTypeId: string, tagId: string) => {
    const currentTags = filterState[tagTypeId] || []
    const newTags = currentTags.includes(tagId)
      ? currentTags.filter((id) => id !== tagId)
      : [...currentTags, tagId]

    onFilterChange({
      ...filterState,
      [tagTypeId]: newTags,
    })
  }

  const handleClearTagType = (tagTypeId: string) => {
    const newState = { ...filterState }
    delete newState[tagTypeId]
    onFilterChange(newState)
  }

  const handleClearAll = () => {
    onFilterChange({})
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {tagTypesWithTags.map((tagType) => {
          const tagTypeId = tagType.id
          const typeTags = tags.filter((tag) => tag.typeId === tagTypeId)
          const selectedTagIds = filterState[tagTypeId] || []

          // Calculate dynamic counts for each tag
          const tagCounts = typeTags.map((tag) =>
            calculateTagCount(tag.id, tagTypeId, items, filterState),
          )

          return (
            <TagTypeDropdown
              key={tagTypeId}
              tagType={tagType}
              tags={typeTags}
              selectedTagIds={selectedTagIds}
              tagCounts={tagCounts}
              onToggleTag={(tagId) => handleToggleTag(tagTypeId, tagId)}
              onClear={() => handleClearTagType(tagTypeId)}
            />
          )
        })}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
          >
            <X className="h-4 w-4 mr-1" />
            Clear all
          </Button>
        )}
      </div>
      <div className="text-sm text-muted-foreground">
        Showing {filteredCount} of {totalCount} items
      </div>
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/components/ItemFilters.test.tsx`

Expected: PASS (all 6 tests)

**Step 5: Commit**

```bash
git add src/components/ItemFilters.tsx src/components/ItemFilters.test.tsx
git commit -m "feat(filters): add ItemFilters component"
```

---

## Task 7: Integrate Filters into Home Page

**Files:**
- Modify: `src/routes/index.tsx`

**Step 1: Add filter state and sessionStorage**

Update `src/routes/index.tsx`:

```typescript
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Plus, Tags } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AddQuantityDialog } from '@/components/AddQuantityDialog'
import { ItemFilters } from '@/components/ItemFilters'
import { PantryItem } from '@/components/PantryItem'
import { Button } from '@/components/ui/button'
import { useAddInventoryLog, useItems } from '@/hooks'
import { useTags, useTagTypes } from '@/hooks/useTags'
import { filterItems, type FilterState } from '@/lib/filterUtils'
import { loadFilters, saveFilters } from '@/lib/sessionStorage'
import type { Item } from '@/types'

export const Route = createFileRoute('/')({
  component: PantryView,
})

function PantryView() {
  const navigate = useNavigate()
  const { data: items = [], isLoading } = useItems()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
  const addLog = useAddInventoryLog()

  const [addDialogItem, setAddDialogItem] = useState<Item | null>(null)
  const [filterState, setFilterState] = useState<FilterState>(() => loadFilters())

  // Save to sessionStorage whenever filters change
  useEffect(() => {
    saveFilters(filterState)
  }, [filterState])

  // Apply filters
  const filteredItems = filterItems(items, filterState)

  if (isLoading) {
    return <div className="p-4">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pantry</h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="neutral-outline"
            onClick={() => navigate({ to: '/settings/tags' })}
          >
            <Tags className="h-4 w-4 mr-1" />
            Tags
          </Button>
          <Link to="/items/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
          </Link>
        </div>
      </div>

      <ItemFilters
        tagTypes={tagTypes}
        tags={tags}
        items={items}
        filterState={filterState}
        filteredCount={filteredItems.length}
        totalCount={items.length}
        onFilterChange={setFilterState}
      />

      {filteredItems.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {items.length === 0 ? (
            <>
              <p>No items yet.</p>
              <p className="text-sm mt-1">
                Add your first pantry item to get started.
              </p>
            </>
          ) : (
            <>
              <p>No items match these filters.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setFilterState({})}
              >
                Clear all filters
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <PantryItem
              key={item.id}
              item={item}
              tags={tags.filter((t) => item.tagIds.includes(t.id))}
              tagTypes={tagTypes}
              onConsume={() => {
                addLog.mutate({
                  itemId: item.id,
                  delta: -1,
                  occurredAt: new Date(),
                })
              }}
              onAdd={() => setAddDialogItem(item)}
            />
          ))}
        </div>
      )}

      <AddQuantityDialog
        open={!!addDialogItem}
        onOpenChange={(open) => !open && setAddDialogItem(null)}
        itemName={addDialogItem?.name ?? ''}
        onConfirm={(quantity, occurredAt) => {
          if (addDialogItem) {
            addLog.mutate({
              itemId: addDialogItem.id,
              delta: quantity,
              occurredAt,
            })
          }
        }}
      />
    </div>
  )
}
```

**Step 2: Run dev server to test**

Run: `pnpm dev`

Expected: Dev server starts, home page loads with filter dropdowns

**Step 3: Manual verification**

1. Open http://localhost:5173 in browser
2. Verify filter dropdowns appear if tags exist
3. Try selecting tags from different types
4. Verify item list filters correctly
5. Verify "Showing X of Y items" updates
6. Verify "Clear all" button appears and works
7. Verify empty state when no matches

**Step 4: Commit**

```bash
git add src/routes/index.tsx
git commit -m "feat(home): integrate filter controls into home page"
```

---

## Task 8: Make Tag Badges Clickable

**Files:**
- Modify: `src/components/ItemCard.tsx`
- Modify: `src/routes/index.tsx`

**Step 1: Update ItemCard to accept onTagClick**

Modify `src/components/ItemCard.tsx`:

```typescript
import { Link } from '@tanstack/router'
import { AlertTriangle, Minus, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Item, Tag, TagType } from '@/types'

interface ItemCardProps {
  item: Item
  quantity: number
  tags: Tag[]
  tagTypes: TagType[]
  estimatedDueDate?: Date
  onConsume: () => void
  onAdd: () => void
  onTagClick?: (tagId: string) => void
}

export function ItemCard({
  item,
  quantity,
  tags,
  tagTypes,
  estimatedDueDate,
  onConsume,
  onAdd,
  onTagClick,
}: ItemCardProps) {
  const needsRefill = quantity < item.refillThreshold
  const isExpiringSoon =
    estimatedDueDate &&
    estimatedDueDate.getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000 // 3 days

  return (
    <Card variant={needsRefill ? 'warning' : 'default'}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <Link
            to="/items/$id"
            params={{ id: item.id }}
            className="flex-1 min-w-0"
          >
            <div className="flex items-center gap-2">
              <h3 className="font-medium truncate">{item.name}</h3>
              {needsRefill && (
                <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {quantity} {item.unit ?? 'units'} / {item.targetQuantity} target
            </p>
            {isExpiringSoon && (
              <p className="text-xs text-red-500 mt-1">
                Expires {estimatedDueDate.toLocaleDateString()}
              </p>
            )}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.slice(0, 3).map((tag) => {
                  const tagType = tagTypes.find((t) => t.id === tag.typeId)
                  const bgColor = tagType?.color
                  return (
                    <Badge
                      key={tag.id}
                      variant={bgColor}
                      className="text-xs cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onTagClick?.(tag.id)
                      }}
                    >
                      {tag.name}
                    </Badge>
                  )
                })}
                {tags.length > 3 && (
                  <Badge variant="neutral-outline" className="text-xs">
                    +{tags.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </Link>
          <div className="flex items-center gap-1">
            <Button
              variant="neutral-outline"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.preventDefault()
                onConsume()
              }}
              disabled={quantity <= 0}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-8 text-center font-medium">{quantity}</span>
            <Button
              variant="neutral-outline"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.preventDefault()
                onAdd()
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 2: Update PantryItem to pass onTagClick**

Modify `src/components/PantryItem.tsx`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { ItemCard } from '@/components/ItemCard'
import { getCurrentQuantity, getLastPurchaseDate } from '@/db/operations'
import type { Item, Tag, TagType } from '@/types'

interface PantryItemProps {
  item: Item
  tags: Tag[]
  tagTypes: TagType[]
  onConsume: () => void
  onAdd: () => void
  onTagClick?: (tagId: string) => void
}

export function PantryItem({
  item,
  tags,
  tagTypes,
  onConsume,
  onAdd,
  onTagClick,
}: PantryItemProps) {
  const { data: quantity = 0 } = useQuery({
    queryKey: ['items', item.id, 'quantity'],
    queryFn: () => getCurrentQuantity(item.id),
  })

  const { data: lastPurchase } = useQuery({
    queryKey: ['items', item.id, 'lastPurchase'],
    queryFn: () => getLastPurchaseDate(item.id),
  })

  const estimatedDueDate =
    item.estimatedDueDays && lastPurchase
      ? new Date(
          lastPurchase.getTime() + item.estimatedDueDays * 24 * 60 * 60 * 1000,
        )
      : item.dueDate

  return (
    <ItemCard
      item={item}
      quantity={quantity}
      tags={tags}
      tagTypes={tagTypes}
      {...(estimatedDueDate ? { estimatedDueDate } : {})}
      onConsume={onConsume}
      onAdd={onAdd}
      onTagClick={onTagClick}
    />
  )
}
```

**Step 3: Wire up onTagClick in home page**

Modify `src/routes/index.tsx` to add the handleTagClick function:

```typescript
// Inside PantryView function, after filterState declaration:

const handleTagClick = (tagId: string) => {
  // Find which tag type this tag belongs to
  const tag = tags.find((t) => t.id === tagId)
  if (!tag) return

  const tagTypeId = tag.typeId
  const currentTags = filterState[tagTypeId] || []

  // Add this tag to the filter (don't toggle off if already selected)
  if (!currentTags.includes(tagId)) {
    setFilterState({
      ...filterState,
      [tagTypeId]: [...currentTags, tagId],
    })
  }
}

// Then pass it to PantryItem:
<PantryItem
  key={item.id}
  item={item}
  tags={tags.filter((t) => item.tagIds.includes(t.id))}
  tagTypes={tagTypes}
  onConsume={() => {
    addLog.mutate({
      itemId: item.id,
      delta: -1,
      occurredAt: new Date(),
    })
  }}
  onAdd={() => setAddDialogItem(item)}
  onTagClick={handleTagClick}
/>
```

**Step 4: Manual verification**

Run: `pnpm dev`

Test:
1. Click a tag badge on an item card
2. Verify the filter activates for that tag
3. Verify the dropdown shows the tag as selected
4. Verify clicking doesn't navigate to item detail
5. Verify other items with that tag are shown

**Step 5: Commit**

```bash
git add src/components/ItemCard.tsx src/components/PantryItem.tsx src/routes/index.tsx
git commit -m "feat(filters): make tag badges clickable to activate filters"
```

---

## Task 9: Integration Test

**Files:**
- Create: `src/routes/index.test.tsx`

**Step 1: Write integration test**

```typescript
// src/routes/index.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { createItem, createTag, createTagType } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Home page filtering integration', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()
    sessionStorage.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderApp = () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can filter items by selecting tags', async () => {
    // Given items with tags
    const categoryType = await createTagType({ name: 'Category', color: 'blue' })
    const locationtype = await createTagType({ name: 'Location', color: 'green' })

    const vegTag = await createTag({ typeId: categoryType.id, name: 'Vegetables' })
    const fruitTag = await createTag({ typeId: categoryType.id, name: 'Fruits' })
    const fridgeTag = await createTag({ typeId: locationtype.id, name: 'Fridge' })
    const pantryTag = await createTag({ typeId: locationtype.id, name: 'Pantry' })

    await createItem({
      name: 'Tomatoes',
      tagIds: [vegTag.id, fridgeTag.id],
      targetQuantity: 5,
      refillThreshold: 2,
    })
    await createItem({
      name: 'Apples',
      tagIds: [fruitTag.id, fridgeTag.id],
      targetQuantity: 10,
      refillThreshold: 3,
    })
    await createItem({
      name: 'Pasta',
      tagIds: [pantryTag.id],
      targetQuantity: 3,
      refillThreshold: 1,
    })

    const user = userEvent.setup()
    renderApp()

    // When user opens Category dropdown
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /category/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /category/i }))

    // And selects Vegetables
    await user.click(screen.getByRole('menuitemcheckbox', { name: /vegetables/i }))

    // Then only tomatoes shown
    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
      expect(screen.queryByText('Apples')).not.toBeInTheDocument()
      expect(screen.queryByText('Pasta')).not.toBeInTheDocument()
    })

    // When user opens Category dropdown again and selects Fruits
    await user.click(screen.getByRole('button', { name: /category/i }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: /fruits/i }))

    // Then both tomatoes and apples shown (OR logic)
    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
      expect(screen.getByText('Apples')).toBeInTheDocument()
      expect(screen.queryByText('Pasta')).not.toBeInTheDocument()
    })

    // When user opens Location dropdown and selects Pantry
    await user.click(screen.getByRole('button', { name: /location/i }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: /pantry/i }))

    // Then no items shown (AND logic across types)
    await waitFor(() => {
      expect(screen.getByText(/no items match these filters/i)).toBeInTheDocument()
    })

    // When user clicks Clear all
    await user.click(screen.getByRole('button', { name: /clear all/i }))

    // Then all items shown again
    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
      expect(screen.getByText('Apples')).toBeInTheDocument()
      expect(screen.getByText('Pasta')).toBeInTheDocument()
    })
  })

  it('user can click tag badge to activate filter', async () => {
    // Given items with tags
    const categoryType = await createTagType({ name: 'Category', color: 'blue' })
    const vegTag = await createTag({ typeId: categoryType.id, name: 'Vegetables' })

    await createItem({
      name: 'Tomatoes',
      tagIds: [vegTag.id],
      targetQuantity: 5,
      refillThreshold: 2,
    })
    await createItem({
      name: 'Apples',
      tagIds: [],
      targetQuantity: 10,
      refillThreshold: 3,
    })

    const user = userEvent.setup()
    renderApp()

    // When user clicks Vegetables tag badge on Tomatoes card
    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
    })
    const vegBadge = screen.getByText('Vegetables')
    await user.click(vegBadge)

    // Then only Tomatoes shown
    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
      expect(screen.queryByText('Apples')).not.toBeInTheDocument()
    })

    // And Category dropdown shows active state
    const categoryButton = screen.getByRole('button', { name: /category/i })
    expect(categoryButton.textContent).toContain('•')
  })
})
```

**Step 2: Run test to verify it passes**

Run: `pnpm test src/routes/index.test.tsx`

Expected: PASS (both integration tests)

**Step 3: Commit**

```bash
git add src/routes/index.test.tsx
git commit -m "test(filters): add integration tests for home page filtering"
```

---

## Task 10: Final Verification

**Step 1: Run all tests**

Run: `pnpm test`

Expected: All tests pass

**Step 2: Run linter**

Run: `pnpm lint`

Expected: No errors

**Step 3: Run type checker**

Run: `pnpm tsc --noEmit`

Expected: No type errors

**Step 4: Build for production**

Run: `pnpm build`

Expected: Build succeeds

**Step 5: Manual testing checklist**

Run: `pnpm dev`

Test:
- [ ] Filter dropdowns appear when tags exist
- [ ] Dropdowns styled with tag type colors
- [ ] Visual indicator shows when filters active
- [ ] Tag counts update dynamically
- [ ] Multi-select works within tag type (OR logic)
- [ ] Filters across types work (AND logic)
- [ ] "Showing X of Y items" updates correctly
- [ ] "Clear all" button appears and works
- [ ] Individual "Clear" per dropdown works
- [ ] Tag badge click activates filter
- [ ] Empty state shows when no matches
- [ ] Filters persist during session (refresh page)
- [ ] Filters clear when browser reopens (close and reopen browser)

**Step 6: Update CLAUDE.md if needed**

Check if CLAUDE.md needs updates for new utilities or patterns.

**Step 7: Final commit**

```bash
git add -A
git commit -m "chore(filters): final verification and cleanup"
```

---

## Summary

This plan implements tag filtering on the home page with:

- Filter logic utilities with comprehensive tests
- TagTypeDropdown component with dynamic counts
- ItemFilters component orchestrating multiple dropdowns
- Integration with home page and sessionStorage
- Clickable tag badges for quick filtering
- Empty states and "Clear all" functionality
- Full integration test coverage

All components follow TDD with tests written first. The implementation uses OR logic within tag types and AND logic across types, with dynamic counts showing the impact of each selection.
