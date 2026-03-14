# Pantry Toolbar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add three control buttons to the pantry page top bar for managing filter visibility, tag visibility, and sorting options with proper persistence.

**Architecture:** Create PantryToolbar component as presentational layer, manage state in PantryView, extend storage utilities for UI/sort preferences, add sorting logic utility.

**Tech Stack:** React 19, TypeScript, TanStack Router, shadcn/ui (Button, DropdownMenu), lucide-react icons, Vitest, Testing Library, Storybook

---

## Task 1: Extend Storage Utilities

**Files:**
- Modify: `src/lib/sessionStorage.ts`
- Modify: `src/lib/sessionStorage.test.ts`

**Step 1: Write failing tests for UI preferences storage**

Add to `src/lib/sessionStorage.test.ts`:

```typescript
describe('UI preferences storage', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('saves and loads UI preferences', () => {
    saveUiPrefs({ filtersVisible: true, tagsVisible: false })
    const loaded = loadUiPrefs()
    expect(loaded).toEqual({ filtersVisible: true, tagsVisible: false })
  })

  it('returns defaults when no stored preferences', () => {
    const loaded = loadUiPrefs()
    expect(loaded).toEqual({ filtersVisible: false, tagsVisible: false })
  })

  it('returns defaults when sessionStorage contains invalid data', () => {
    sessionStorage.setItem('pantry-ui-prefs', 'invalid json')
    const loaded = loadUiPrefs()
    expect(loaded).toEqual({ filtersVisible: false, tagsVisible: false })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/sessionStorage.test.ts`
Expected: FAIL with "saveUiPrefs is not defined", "loadUiPrefs is not defined"

**Step 3: Implement UI preferences storage**

Add to `src/lib/sessionStorage.ts`:

```typescript
// UI preferences (sessionStorage)
const UI_PREFS_KEY = 'pantry-ui-prefs'

interface UiPreferences {
  filtersVisible: boolean
  tagsVisible: boolean
}

export function saveUiPrefs(prefs: UiPreferences): void {
  try {
    sessionStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs))
  } catch (error) {
    console.error('Failed to save UI preferences:', error)
  }
}

export function loadUiPrefs(): UiPreferences {
  try {
    const stored = sessionStorage.getItem(UI_PREFS_KEY)
    if (!stored) return { filtersVisible: false, tagsVisible: false }

    const parsed = JSON.parse(stored)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { filtersVisible: false, tagsVisible: false }
    }

    return parsed as UiPreferences
  } catch (error) {
    console.error('Failed to load UI preferences:', error)
    return { filtersVisible: false, tagsVisible: false }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/sessionStorage.test.ts`
Expected: PASS (all UI preferences tests green)

**Step 5: Write failing tests for sort preferences storage**

Add to `src/lib/sessionStorage.test.ts`:

```typescript
describe('Sort preferences storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saves and loads sort preferences', () => {
    saveSortPrefs({ sortBy: 'name', sortDirection: 'desc' })
    const loaded = loadSortPrefs()
    expect(loaded).toEqual({ sortBy: 'name', sortDirection: 'desc' })
  })

  it('returns defaults when no stored preferences', () => {
    const loaded = loadSortPrefs()
    expect(loaded).toEqual({ sortBy: 'expiring', sortDirection: 'asc' })
  })

  it('returns defaults when localStorage contains invalid data', () => {
    localStorage.setItem('pantry-sort-prefs', 'invalid json')
    const loaded = loadSortPrefs()
    expect(loaded).toEqual({ sortBy: 'expiring', sortDirection: 'asc' })
  })
})
```

**Step 6: Run tests to verify they fail**

Run: `pnpm test src/lib/sessionStorage.test.ts`
Expected: FAIL with "saveSortPrefs is not defined", "loadSortPrefs is not defined"

**Step 7: Implement sort preferences storage**

Add to `src/lib/sessionStorage.ts`:

```typescript
// Sort preferences (localStorage)
const SORT_PREFS_KEY = 'pantry-sort-prefs'

export type SortField = 'name' | 'quantity' | 'status' | 'updatedAt' | 'expiring'
export type SortDirection = 'asc' | 'desc'

interface SortPreferences {
  sortBy: SortField
  sortDirection: SortDirection
}

export function saveSortPrefs(prefs: SortPreferences): void {
  try {
    localStorage.setItem(SORT_PREFS_KEY, JSON.stringify(prefs))
  } catch (error) {
    console.error('Failed to save sort preferences:', error)
  }
}

export function loadSortPrefs(): SortPreferences {
  try {
    const stored = localStorage.getItem(SORT_PREFS_KEY)
    if (!stored) return { sortBy: 'expiring', sortDirection: 'asc' }

    const parsed = JSON.parse(stored)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { sortBy: 'expiring', sortDirection: 'asc' }
    }

    return parsed as SortPreferences
  } catch (error) {
    console.error('Failed to load sort preferences:', error)
    return { sortBy: 'expiring', sortDirection: 'asc' }
  }
}
```

**Step 8: Run tests to verify they pass**

Run: `pnpm test src/lib/sessionStorage.test.ts`
Expected: PASS (all storage tests green)

**Step 9: Commit storage utilities**

```bash
git add src/lib/sessionStorage.ts src/lib/sessionStorage.test.ts
git commit -m "feat(storage): add UI and sort preferences persistence"
```

---

## Task 2: Create Sort Utilities

**Files:**
- Create: `src/lib/sortUtils.ts`
- Create: `src/lib/sortUtils.test.ts`

**Step 1: Write failing tests for sorting logic**

Create `src/lib/sortUtils.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import type { Item } from '@/types'
import { sortItems } from './sortUtils'

describe('sortItems', () => {
  const items: Item[] = [
    {
      id: '1',
      name: 'Tomatoes',
      tagIds: [],
      targetQuantity: 5,
      refillThreshold: 2,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-02-10'),
    },
    {
      id: '2',
      name: 'Apples',
      tagIds: [],
      targetQuantity: 10,
      refillThreshold: 3,
      createdAt: new Date('2026-01-02'),
      updatedAt: new Date('2026-02-12'),
    },
    {
      id: '3',
      name: 'Pasta',
      tagIds: [],
      targetQuantity: 3,
      refillThreshold: 1,
      createdAt: new Date('2026-01-03'),
      updatedAt: new Date('2026-02-11'),
    },
  ]

  const quantities = new Map([
    ['1', 1], // Below threshold (error)
    ['2', 10], // At target (ok)
    ['3', 1], // At threshold (warning)
  ])

  const expiryDates = new Map([
    ['1', new Date('2026-02-15')], // 2 days away
    ['2', new Date('2026-02-20')], // 7 days away
    ['3', undefined], // No expiry
  ])

  it('sorts by name ascending', () => {
    const sorted = sortItems(items, quantities, expiryDates, 'name', 'asc')
    expect(sorted.map((i) => i.name)).toEqual(['Apples', 'Pasta', 'Tomatoes'])
  })

  it('sorts by name descending', () => {
    const sorted = sortItems(items, quantities, expiryDates, 'name', 'desc')
    expect(sorted.map((i) => i.name)).toEqual(['Tomatoes', 'Pasta', 'Apples'])
  })

  it('sorts by quantity ascending', () => {
    const sorted = sortItems(items, quantities, expiryDates, 'quantity', 'asc')
    expect(sorted.map((i) => i.id)).toEqual(['1', '3', '2'])
  })

  it('sorts by quantity descending', () => {
    const sorted = sortItems(items, quantities, expiryDates, 'quantity', 'desc')
    expect(sorted.map((i) => i.id)).toEqual(['2', '3', '1'])
  })

  it('sorts by status ascending (error -> warning -> ok)', () => {
    const sorted = sortItems(items, quantities, expiryDates, 'status', 'asc')
    expect(sorted.map((i) => i.id)).toEqual(['1', '3', '2'])
  })

  it('sorts by status descending (ok -> warning -> error)', () => {
    const sorted = sortItems(items, quantities, expiryDates, 'status', 'desc')
    expect(sorted.map((i) => i.id)).toEqual(['2', '3', '1'])
  })

  it('sorts by updatedAt ascending', () => {
    const sorted = sortItems(items, quantities, expiryDates, 'updatedAt', 'asc')
    expect(sorted.map((i) => i.id)).toEqual(['1', '3', '2'])
  })

  it('sorts by updatedAt descending', () => {
    const sorted = sortItems(items, quantities, expiryDates, 'updatedAt', 'desc')
    expect(sorted.map((i) => i.id)).toEqual(['2', '3', '1'])
  })

  it('sorts by expiring ascending (soonest first)', () => {
    const sorted = sortItems(items, quantities, expiryDates, 'expiring', 'asc')
    expect(sorted.map((i) => i.id)).toEqual(['1', '2', '3'])
  })

  it('sorts by expiring descending (latest first, undefined last)', () => {
    const sorted = sortItems(items, quantities, expiryDates, 'expiring', 'desc')
    expect(sorted.map((i) => i.id)).toEqual(['2', '1', '3'])
  })

  it('handles missing quantity data gracefully', () => {
    const emptyQuantities = new Map<string, number>()
    const sorted = sortItems(items, emptyQuantities, expiryDates, 'quantity', 'asc')
    expect(sorted).toHaveLength(3)
  })

  it('handles missing expiry data gracefully', () => {
    const emptyDates = new Map<string, Date | undefined>()
    const sorted = sortItems(items, quantities, emptyDates, 'expiring', 'asc')
    expect(sorted).toHaveLength(3)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/sortUtils.test.ts`
Expected: FAIL with "Cannot find module './sortUtils'"

**Step 3: Implement sorting logic**

Create `src/lib/sortUtils.ts`:

```typescript
import type { Item } from '@/types'

export type SortField = 'name' | 'quantity' | 'status' | 'updatedAt' | 'expiring'
export type SortDirection = 'asc' | 'desc'

type StatusValue = 'error' | 'warning' | 'ok'

function getStatus(
  item: Item,
  quantity: number | undefined,
): StatusValue {
  if (quantity === undefined) return 'ok'
  if (quantity < item.refillThreshold) return 'error'
  if (item.refillThreshold > 0 && quantity === item.refillThreshold) return 'warning'
  return 'ok'
}

export function sortItems(
  items: Item[],
  quantities: Map<string, number>,
  expiryDates: Map<string, Date | undefined>,
  sortBy: SortField,
  sortDirection: SortDirection,
): Item[] {
  const sorted = [...items].sort((a, b) => {
    let comparison = 0

    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name)
        break

      case 'quantity': {
        const qtyA = quantities.get(a.id) ?? 0
        const qtyB = quantities.get(b.id) ?? 0
        comparison = qtyA - qtyB
        break
      }

      case 'status': {
        const statusOrder: Record<StatusValue, number> = {
          error: 0,
          warning: 1,
          ok: 2,
        }
        const statusA = getStatus(a, quantities.get(a.id))
        const statusB = getStatus(b, quantities.get(b.id))
        comparison = statusOrder[statusA] - statusOrder[statusB]
        break
      }

      case 'updatedAt':
        comparison = a.updatedAt.getTime() - b.updatedAt.getTime()
        break

      case 'expiring': {
        const dateA = expiryDates.get(a.id)
        const dateB = expiryDates.get(b.id)

        // Null dates sort last
        if (!dateA && !dateB) comparison = 0
        else if (!dateA) comparison = 1
        else if (!dateB) comparison = -1
        else comparison = dateA.getTime() - dateB.getTime()
        break
      }
    }

    return sortDirection === 'asc' ? comparison : -comparison
  })

  return sorted
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/sortUtils.test.ts`
Expected: PASS (all 12 tests green)

**Step 5: Commit sort utilities**

```bash
git add src/lib/sortUtils.ts src/lib/sortUtils.test.ts
git commit -m "feat(sorting): add item sorting utility with 5 criteria"
```

---

## Task 3: Create PantryToolbar Component

**Files:**
- Create: `src/components/PantryToolbar.tsx`
- Create: `src/components/PantryToolbar.test.tsx`
- Create: `src/components/PantryToolbar.stories.tsx`

**Step 1: Write failing test for toolbar rendering**

Create `src/components/PantryToolbar.test.tsx`:

```typescript
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SortDirection, SortField } from '@/lib/sessionStorage'
import { PantryToolbar } from './PantryToolbar'

describe('PantryToolbar', () => {
  const renderWithRouter = async (ui: React.ReactElement) => {
    const Wrapper = () => ui
    const rootRoute = createRootRoute({ component: Wrapper })
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    const result = render(<RouterProvider router={router} />)
    await router.load()
    return result
  }

  const defaultProps = {
    filtersVisible: false,
    tagsVisible: false,
    sortBy: 'expiring' as SortField,
    sortDirection: 'asc' as SortDirection,
    onToggleFilters: vi.fn(),
    onToggleTags: vi.fn(),
    onSortChange: vi.fn(),
  }

  it('renders three control buttons', async () => {
    await renderWithRouter(<PantryToolbar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /filter/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tags/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /expiring/i })).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/components/PantryToolbar.test.tsx`
Expected: FAIL with "Cannot find module './PantryToolbar'"

**Step 3: Create minimal toolbar component**

Create `src/components/PantryToolbar.tsx`:

```typescript
import { Link } from '@tanstack/react-router'
import {
  ArrowUpDown,
  Filter,
  Plus,
  Tags,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SortDirection, SortField } from '@/lib/sessionStorage'

interface PantryToolbarProps {
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
  quantity: 'Quantity',
  status: 'Status',
  updatedAt: 'Updated',
}

export function PantryToolbar({
  filtersVisible,
  tagsVisible,
  sortBy,
  sortDirection,
  onToggleFilters,
  onToggleTags,
  onSortChange,
}: PantryToolbarProps) {
  const handleSort = (field: SortField) => {
    if (field === sortBy) {
      // Toggle direction
      onSortChange(field, sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // New field, start with ascending
      onSortChange(field, 'asc')
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-accessory-default bg-background-surface">
      <Button
        size="icon-xs"
        variant={filtersVisible ? 'neutral' : 'neutral-ghost'}
        onClick={onToggleFilters}
        aria-label="Toggle filters"
      >
        <Filter />
      </Button>

      <Button
        size="icon-xs"
        variant={tagsVisible ? 'neutral' : 'neutral-ghost'}
        onClick={onToggleTags}
        aria-label="Toggle tags"
      >
        <Tags />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="xs" variant="neutral-ghost">
            <ArrowUpDown />
            {sortLabels[sortBy]} {sortDirection === 'asc' ? '↑' : '↓'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => handleSort('expiring')}>
            {sortBy === 'expiring' && '✓ '}Expiring soon
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleSort('name')}>
            {sortBy === 'name' && '✓ '}Name
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleSort('quantity')}>
            {sortBy === 'quantity' && '✓ '}Quantity
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleSort('status')}>
            {sortBy === 'status' && '✓ '}Status
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleSort('updatedAt')}>
            {sortBy === 'updatedAt' && '✓ '}Last updated
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="flex-1" />

      <Link to="/items/new">
        <Button>
          <Plus />
          Add item
        </Button>
      </Link>
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test src/components/PantryToolbar.test.tsx`
Expected: PASS (toolbar renders with 3 buttons)

**Step 5: Add more unit tests**

Add to `src/components/PantryToolbar.test.tsx`:

```typescript
  it('shows active variant when filters visible', async () => {
    await renderWithRouter(
      <PantryToolbar {...defaultProps} filtersVisible={true} />,
    )
    const filterBtn = screen.getByRole('button', { name: /filter/i })
    expect(filterBtn.className).toContain('neutral')
    expect(filterBtn.className).not.toContain('neutral-ghost')
  })

  it('shows ghost variant when filters hidden', async () => {
    await renderWithRouter(
      <PantryToolbar {...defaultProps} filtersVisible={false} />,
    )
    const filterBtn = screen.getByRole('button', { name: /filter/i })
    expect(filterBtn.className).toContain('neutral-ghost')
  })

  it('calls onToggleFilters when filter button clicked', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    await renderWithRouter(
      <PantryToolbar {...defaultProps} onToggleFilters={onToggle} />,
    )

    await user.click(screen.getByRole('button', { name: /filter/i }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('calls onToggleTags when tags button clicked', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    await renderWithRouter(
      <PantryToolbar {...defaultProps} onToggleTags={onToggle} />,
    )

    await user.click(screen.getByRole('button', { name: /tags/i }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('displays current sort criteria with direction', async () => {
    await renderWithRouter(
      <PantryToolbar
        {...defaultProps}
        sortBy="name"
        sortDirection="desc"
      />,
    )
    expect(screen.getByText(/name.*↓/i)).toBeInTheDocument()
  })

  it('calls onSortChange with new field when different sort selected', async () => {
    const user = userEvent.setup()
    const onSortChange = vi.fn()
    await renderWithRouter(
      <PantryToolbar {...defaultProps} onSortChange={onSortChange} />,
    )

    await user.click(screen.getByRole('button', { name: /expiring/i }))
    await user.click(screen.getByRole('menuitem', { name: /^name$/i }))

    expect(onSortChange).toHaveBeenCalledWith('name', 'asc')
  })

  it('toggles direction when same sort field clicked', async () => {
    const user = userEvent.setup()
    const onSortChange = vi.fn()
    await renderWithRouter(
      <PantryToolbar
        {...defaultProps}
        sortBy="name"
        sortDirection="asc"
        onSortChange={onSortChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: /name/i }))
    await user.click(screen.getByRole('menuitem', { name: /^✓ name$/i }))

    expect(onSortChange).toHaveBeenCalledWith('name', 'desc')
  })
```

**Step 6: Run tests to verify they pass**

Run: `pnpm test src/components/PantryToolbar.test.tsx`
Expected: PASS (all 9 tests green)

**Step 7: Create Storybook stories**

Create `src/components/PantryToolbar.stories.tsx`:

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useState } from 'react'
import { PantryToolbar } from './PantryToolbar'

const queryClient = new QueryClient()

const createStoryRouter = (storyComponent: React.ComponentType) => {
  const rootRoute = createRootRoute({
    component: storyComponent as () => React.ReactNode,
  })

  return createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

function RouterWrapper({ children }: { children: React.ReactNode }) {
  const [router] = useState(() => createStoryRouter(() => <>{children}</>))
  return <RouterProvider router={router} />
}

const meta: Meta<typeof PantryToolbar> = {
  title: 'Components/PantryToolbar',
  component: PantryToolbar,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <RouterWrapper>
          <Story />
        </RouterWrapper>
      </QueryClientProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof PantryToolbar>

export const Default: Story = {
  args: {
    filtersVisible: false,
    tagsVisible: false,
    sortBy: 'expiring',
    sortDirection: 'asc',
    onToggleFilters: () => console.log('Toggle filters'),
    onToggleTags: () => console.log('Toggle tags'),
    onSortChange: (field, direction) =>
      console.log('Sort change:', field, direction),
  },
}

export const FiltersVisible: Story = {
  args: {
    ...Default.args,
    filtersVisible: true,
  },
}

export const TagsVisible: Story = {
  args: {
    ...Default.args,
    tagsVisible: true,
  },
}

export const BothVisible: Story = {
  args: {
    ...Default.args,
    filtersVisible: true,
    tagsVisible: true,
  },
}

export const SortByName: Story = {
  args: {
    ...Default.args,
    sortBy: 'name',
    sortDirection: 'desc',
  },
}

export const SortByQuantity: Story = {
  args: {
    ...Default.args,
    sortBy: 'quantity',
    sortDirection: 'asc',
  },
}
```

**Step 8: Verify Storybook renders**

Run: `pnpm storybook`
Navigate to Components/PantryToolbar
Expected: All 6 stories render correctly

**Step 9: Commit toolbar component**

```bash
git add src/components/PantryToolbar.tsx src/components/PantryToolbar.test.tsx src/components/PantryToolbar.stories.tsx
git commit -m "feat(toolbar): add PantryToolbar component with tests and stories"
```

---

## Task 4: Modify ItemCard for Tag Visibility

**Files:**
- Modify: `src/components/ItemCard.tsx`
- Modify: `src/components/ItemCard.stories.tsx`

**Step 1: Add showTags prop to ItemCard**

Modify `src/components/ItemCard.tsx`:

Add to interface (around line 9):
```typescript
interface ItemCardProps {
  item: Item
  quantity: number
  tags: Tag[]
  tagTypes: TagType[]
  estimatedDueDate?: Date
  onConsume: () => void
  onAdd: () => void
  onTagClick?: (tagId: string) => void
  showTags?: boolean // Add this line
}
```

Update function signature (around line 20):
```typescript
export function ItemCard({
  item,
  quantity,
  tags,
  tagTypes,
  estimatedDueDate,
  onConsume,
  onAdd,
  onTagClick,
  showTags = true, // Add default value
}: ItemCardProps) {
```

Find the tag rendering section (around line 90-110) and replace:
```typescript
        <CardContent className="flex flex-col gap-2">
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => {
                const tagType = tagTypes.find((t) => t.id === tag.typeId)
                if (!tagType) return null

                return (
                  <Badge
                    key={tag.id}
                    color={tagType.color}
                    variant="solid"
                    onClick={
                      onTagClick
                        ? (e) => {
                            e.preventDefault()
                            onTagClick(tag.id)
                          }
                        : undefined
                    }
                  >
                    {tag.name}
                  </Badge>
                )
              })}
            </div>
          )}
        </CardContent>
```

With:
```typescript
        <CardContent className="flex flex-col gap-2">
          {tags.length > 0 && (
            showTags ? (
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => {
                  const tagType = tagTypes.find((t) => t.id === tag.typeId)
                  if (!tagType) return null

                  return (
                    <Badge
                      key={tag.id}
                      color={tagType.color}
                      variant="solid"
                      onClick={
                        onTagClick
                          ? (e) => {
                              e.preventDefault()
                              onTagClick(tag.id)
                            }
                          : undefined
                      }
                    >
                      {tag.name}
                    </Badge>
                  )
                })}
              </div>
            ) : (
              <span className="text-xs text-foreground-muted">
                {tags.length} {tags.length === 1 ? 'tag' : 'tags'}
              </span>
            )
          )}
        </CardContent>
```

**Step 2: Run tests to verify no breakage**

Run: `pnpm test`
Expected: All existing tests still pass (backward compatibility with default showTags=true)

**Step 3: Update Storybook stories**

Add to `src/components/ItemCard.stories.tsx`:

```typescript
export const TagsHidden: Story = {
  args: {
    ...Default.args,
    showTags: false,
  },
}
```

**Step 4: Verify Storybook**

Run: `pnpm storybook`
Navigate to Components/ItemCard
Expected: TagsHidden story shows "2 tags" instead of badges

**Step 5: Commit ItemCard changes**

```bash
git add src/components/ItemCard.tsx src/components/ItemCard.stories.tsx
git commit -m "feat(item-card): add showTags prop for tag visibility toggle"
```

---

## Task 5: Integrate Toolbar into PantryView

**Files:**
- Modify: `src/routes/index.tsx`
- Modify: `src/components/PantryItem.tsx`

**Step 1: Add state management to PantryView**

Modify `src/routes/index.tsx`:

Add imports at top:
```typescript
import { PantryToolbar } from '@/components/PantryToolbar'
import {
  type SortDirection,
  type SortField,
  loadSortPrefs,
  loadUiPrefs,
  saveSortPrefs,
  saveUiPrefs,
} from '@/lib/sessionStorage'
import { sortItems } from '@/lib/sortUtils'
import { getCurrentQuantity, getLastPurchaseDate } from '@/db/operations'
import { useQuery } from '@tanstack/react-query'
```

Add state after existing state (around line 25):
```typescript
  const [filterState, setFilterState] = useState<FilterState>(() =>
    loadFilters(),
  )

  // Add these new states
  const [filtersVisible, setFiltersVisible] = useState(() =>
    loadUiPrefs().filtersVisible,
  )
  const [tagsVisible, setTagsVisible] = useState(() =>
    loadUiPrefs().tagsVisible,
  )
  const [sortBy, setSortBy] = useState<SortField>(() =>
    loadSortPrefs().sortBy,
  )
  const [sortDirection, setSortDirection] = useState<SortDirection>(() =>
    loadSortPrefs().sortDirection,
  )
```

Add persistence effects after existing useEffect (around line 32):
```typescript
  // Save filter state to sessionStorage whenever it changes
  useEffect(() => {
    saveFilters(filterState)
  }, [filterState])

  // Add these new effects
  useEffect(() => {
    saveUiPrefs({ filtersVisible, tagsVisible })
  }, [filtersVisible, tagsVisible])

  useEffect(() => {
    saveSortPrefs({ sortBy, sortDirection })
  }, [sortBy, sortDirection])
```

**Step 2: Add data fetching for sorting**

Add after filter application (around line 35):
```typescript
  // Apply filters to items
  const filteredItems = filterItems(items, filterState)

  // Add: Fetch all quantities for sorting
  const { data: allQuantities } = useQuery({
    queryKey: ['items', 'quantities'],
    queryFn: async () => {
      const map = new Map<string, number>()
      for (const item of items) {
        map.set(item.id, await getCurrentQuantity(item.id))
      }
      return map
    },
    enabled: items.length > 0,
  })

  // Add: Fetch all expiry dates for sorting
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

  // Apply sorting
  const sortedItems = sortItems(
    filteredItems,
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    sortBy,
    sortDirection,
  )
```

**Step 3: Replace top bar with PantryToolbar**

Replace the existing top bar div (around line 76-85):
```typescript
      <div className="flex items-center gap-2 px-3 py-2 border-b border-accessory-default bg-background-surface">
        <h1 className="text-xl font-bold">Pantry</h1>
        <span className="flex-1" />
        <Link to="/items/new">
          <Button>
            <Plus />
            Add item
          </Button>
        </Link>
      </div>
```

With:
```typescript
      <PantryToolbar
        filtersVisible={filtersVisible}
        tagsVisible={tagsVisible}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onToggleFilters={() => setFiltersVisible((prev) => !prev)}
        onToggleTags={() => setTagsVisible((prev) => !prev)}
        onSortChange={(field, direction) => {
          setSortBy(field)
          setSortDirection(direction)
        }}
      />
```

**Step 4: Conditionally render ItemFilters**

Replace ItemFilters section (around line 86-94):
```typescript
      <ItemFilters
        tagTypes={tagTypes}
        tags={tags}
        items={items}
        filterState={filterState}
        filteredCount={filteredItems.length}
        totalCount={items.length}
        onFilterChange={setFilterState}
      />
```

With:
```typescript
      {filtersVisible && (
        <ItemFilters
          tagTypes={tagTypes}
          tags={tags}
          items={items}
          filterState={filterState}
          filteredCount={sortedItems.length}
          totalCount={items.length}
          onFilterChange={setFilterState}
        />
      )}
```

**Step 5: Update item rendering to use sortedItems and pass showTags**

Replace filteredItems.map (around line 112):
```typescript
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
              onTagClick={handleTagClick}
            />
          ))}
```

With:
```typescript
          {sortedItems.map((item) => (
            <PantryItem
              key={item.id}
              item={item}
              tags={tags.filter((t) => item.tagIds.includes(t.id))}
              tagTypes={tagTypes}
              showTags={tagsVisible}
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
          ))}
```

Also update empty state check (around line 103):
```typescript
      ) : filteredItems.length === 0 ? (
```

To:
```typescript
      ) : sortedItems.length === 0 ? (
```

**Step 6: Pass showTags prop in PantryItem**

Modify `src/components/PantryItem.tsx`:

Add to interface (around line 6):
```typescript
interface PantryItemProps {
  item: Item
  tags: Tag[]
  tagTypes: TagType[]
  onConsume: () => void
  onAdd: () => void
  onTagClick?: (tagId: string) => void
  showTags?: boolean // Add this line
}
```

Update function signature and ItemCard call (around line 15-50):
```typescript
export function PantryItem({
  item,
  tags,
  tagTypes,
  onConsume,
  onAdd,
  onTagClick,
  showTags = true, // Add default value
}: PantryItemProps) {
  // ... existing code ...

  return (
    <ItemCard
      item={item}
      quantity={quantity}
      tags={tags}
      tagTypes={tagTypes}
      showTags={showTags} // Add this prop
      {...(estimatedDueDate ? { estimatedDueDate } : {})}
      onConsume={onConsume}
      onAdd={onAdd}
      {...(onTagClick ? { onTagClick } : {})}
    />
  )
}
```

**Step 7: Run all tests to verify integration**

Run: `pnpm test`
Expected: All tests pass

**Step 8: Commit integration changes**

```bash
git add src/routes/index.tsx src/components/PantryItem.tsx
git commit -m "feat(pantry): integrate toolbar with state management and sorting"
```

---

## Task 6: Add Integration Tests

**Files:**
- Modify: `src/routes/index.test.tsx`

**Step 1: Add toolbar integration tests**

Add to `src/routes/index.test.tsx` at the end, before closing describe block:

```typescript
  it('user can toggle filters visibility', async () => {
    const user = userEvent.setup()

    await createTagType({ name: 'Category', color: 'blue' })
    await createTag({ typeId: 'type-1', name: 'Vegetables' })
    await createItem({ name: 'Tomatoes', tagIds: ['tag-1'] })

    renderApp()

    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
    })

    // Initially filters hidden (default)
    expect(
      screen.queryByRole('button', { name: /category/i }),
    ).not.toBeInTheDocument()

    // Click filter button to show
    await user.click(screen.getByRole('button', { name: /toggle filters/i }))

    // Filters now visible
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /category/i }),
      ).toBeInTheDocument()
    })
  })

  it('user can toggle tag visibility', async () => {
    const user = userEvent.setup()

    const categoryType = await createTagType({ name: 'Category', color: 'blue' })
    const vegTag = await createTag({
      typeId: categoryType.id,
      name: 'Vegetables',
    })
    await createItem({
      name: 'Tomatoes',
      tagIds: [vegTag.id],
      targetQuantity: 5,
      refillThreshold: 2,
    })

    renderApp()

    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
    })

    // Initially tags hidden - shows count
    expect(screen.getByText('1 tag')).toBeInTheDocument()
    expect(screen.queryByText('Vegetables')).not.toBeInTheDocument()

    // Click tags button to show
    await user.click(screen.getByRole('button', { name: /toggle tags/i }))

    // Now shows individual badges
    await waitFor(() => {
      expect(screen.queryByText('1 tag')).not.toBeInTheDocument()
      expect(screen.getByText('Vegetables')).toBeInTheDocument()
    })
  })

  it('user can sort items by name', async () => {
    const user = userEvent.setup()

    await createItem({ name: 'Tomatoes', targetQuantity: 5, refillThreshold: 2 })
    await createItem({ name: 'Apples', targetQuantity: 10, refillThreshold: 3 })
    await createItem({ name: 'Pasta', targetQuantity: 3, refillThreshold: 1 })

    renderApp()

    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
    })

    // Open sort menu
    await user.click(screen.getByRole('button', { name: /expiring/i }))

    // Select Name
    await user.click(screen.getByRole('menuitem', { name: /^name$/i }))

    // Items now alphabetical
    await waitFor(() => {
      const items = screen.getAllByRole('heading', { level: 3 })
      expect(items[0]).toHaveTextContent('Apples')
      expect(items[1]).toHaveTextContent('Pasta')
      expect(items[2]).toHaveTextContent('Tomatoes')
    })
  })

  it('user can toggle sort direction', async () => {
    const user = userEvent.setup()

    await createItem({ name: 'Apples', targetQuantity: 10, refillThreshold: 3 })
    await createItem({ name: 'Zucchini', targetQuantity: 5, refillThreshold: 2 })

    renderApp()

    await waitFor(() => {
      expect(screen.getByText('Apples')).toBeInTheDocument()
    })

    // Sort by name ascending
    await user.click(screen.getByRole('button', { name: /expiring/i }))
    await user.click(screen.getByRole('menuitem', { name: /^name$/i }))

    await waitFor(() => {
      const items = screen.getAllByRole('heading', { level: 3 })
      expect(items[0]).toHaveTextContent('Apples')
    })

    // Click name again to reverse
    await user.click(screen.getByRole('button', { name: /name.*↑/i }))
    await user.click(screen.getByRole('menuitem', { name: /^✓ name$/i }))

    // Now descending
    await waitFor(() => {
      const items = screen.getAllByRole('heading', { level: 3 })
      expect(items[0]).toHaveTextContent('Zucchini')
    })
  })
```

**Step 2: Run integration tests**

Run: `pnpm test src/routes/index.test.tsx`
Expected: All new integration tests pass

**Step 3: Run all tests**

Run: `pnpm test`
Expected: All 84+ tests pass

**Step 4: Commit integration tests**

```bash
git add src/routes/index.test.tsx
git commit -m "test(pantry): add integration tests for toolbar controls"
```

---

## Task 7: Final Verification

**Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests pass (84+ tests)

**Step 2: Check TypeScript**

Run: `pnpm typecheck`
Expected: No type errors

**Step 3: Run linter**

Run: `pnpm lint`
Expected: No lint errors

**Step 4: Verify Storybook**

Run: `pnpm storybook`
Check:
- Components/PantryToolbar - all 6 stories render
- Components/ItemCard - TagsHidden story shows tag count

**Step 5: Manual testing in dev**

Run: `pnpm dev`

Test flows:
1. Toggle filters on/off - ItemFilters appears/disappears
2. Toggle tags on/off - badges switch to "X tags" count
3. Sort by each criterion - items reorder correctly
4. Toggle sort direction - order reverses
5. Refresh page - sort preferences persist (localStorage)
6. Close tab, reopen - filters/tags reset to hidden (sessionStorage)

**Step 6: Final commit if any cleanup needed**

```bash
git add .
git commit -m "chore(pantry): final cleanup and verification"
```

---

## Summary

**Files Created:**
- `src/components/PantryToolbar.tsx`
- `src/components/PantryToolbar.test.tsx`
- `src/components/PantryToolbar.stories.tsx`
- `src/lib/sortUtils.ts`
- `src/lib/sortUtils.test.ts`

**Files Modified:**
- `src/lib/sessionStorage.ts` - Added UI/sort preferences storage
- `src/lib/sessionStorage.test.ts` - Added storage tests
- `src/routes/index.tsx` - Integrated toolbar, state, sorting
- `src/components/PantryItem.tsx` - Added showTags prop
- `src/components/ItemCard.tsx` - Implemented tag visibility toggle
- `src/components/ItemCard.stories.tsx` - Added TagsHidden story
- `src/routes/index.test.tsx` - Added integration tests

**Test Coverage:**
- 12 sort utility tests
- 9 toolbar unit tests
- 4 toolbar integration tests
- 6 storage tests
- Storybook stories for visual testing

**All features implemented per design:**
✓ Filter visibility toggle (sessionStorage, default hidden)
✓ Tag visibility toggle (sessionStorage, default hidden, shows count when hidden)
✓ Sort dropdown (5 criteria, localStorage, default expiring asc)
✓ Icon-only buttons for filter/tags, icon+text for sort
✓ Active state styling
✓ Sort direction toggle
