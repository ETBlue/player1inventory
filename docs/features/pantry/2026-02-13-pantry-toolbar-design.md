# Pantry Toolbar Design

**Date:** 2026-02-13

## Goal

Add three control buttons to the pantry page top bar for managing view preferences: filter visibility toggle, tag visibility toggle, and sorting options.

## Architecture

**Component Structure:**

Create a new `PantryToolbar` component as a presentational component that renders three buttons and handles user interactions through callbacks. State management remains in `PantryView` (index.tsx) to coordinate behavior across the page.

**State Flow:**

```
PantryView (owns state)
  ├─ PantryToolbar (renders controls, calls callbacks)
  ├─ ItemFilters (conditionally rendered based on filtersVisible)
  └─ ItemCard (receives showTags prop based on tagsVisible)
```

**Storage Strategy:**

- **sessionStorage** for UI toggles (temporary per-session)
  - `filtersVisible: boolean` - default false
  - `tagsVisible: boolean` - default false
- **localStorage** for sort preferences (persistent across sessions)
  - `sortBy: SortField` - default 'expiring'
  - `sortDirection: 'asc' | 'desc'` - default 'asc'

## Components

### PantryToolbar Component

**File:** `src/components/PantryToolbar.tsx`

**Props Interface:**

```typescript
interface PantryToolbarProps {
  filtersVisible: boolean
  tagsVisible: boolean
  sortBy: SortField
  sortDirection: SortDirection
  onToggleFilters: () => void
  onToggleTags: () => void
  onSortChange: (field: SortField, direction: SortDirection) => void
}

type SortField = 'name' | 'quantity' | 'status' | 'updatedAt' | 'expiring'
type SortDirection = 'asc' | 'desc'
```

**Layout:**

```tsx
<div className="flex items-center gap-2 px-3 py-2 border-b ...">
  {/* Filter toggle - icon only */}
  <Button
    size="icon-xs"
    variant={filtersVisible ? "neutral" : "neutral-ghost"}
    onClick={onToggleFilters}
  >
    <Filter />
  </Button>

  {/* Tags toggle - icon only */}
  <Button
    size="icon-xs"
    variant={tagsVisible ? "neutral" : "neutral-ghost"}
    onClick={onToggleTags}
  >
    <Tags />
  </Button>

  {/* Sort dropdown - icon + text */}
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

  {/* Add item button - unchanged */}
  <Link to="/items/new">
    <Button><Plus />Add item</Button>
  </Link>
</div>
```

**Button States:**

- **Active state:** When filters/tags visible, button uses `variant="neutral"` (filled background)
- **Inactive state:** When hidden, button uses `variant="neutral-ghost"` (transparent)
- **Sort button:** Always shows current criteria with direction arrow

**Sort Menu Interaction:**

- Click same sort field → toggle direction (asc ↔ desc)
- Click different field → switch to that field with ascending
- Checkmark indicates current sort field
- Arrow in trigger shows current direction

### Modified Components

**ItemCard.tsx:**

Add optional `showTags` prop (default true for backward compatibility):

```typescript
interface ItemCardProps {
  // ... existing props
  showTags?: boolean
  onTagClick?: (tagId: string) => void
}
```

When `showTags={false}`, render tag count instead of badges:

```tsx
{showTags ? (
  <div className="flex flex-wrap gap-1">
    {tags.map(tag => <Badge key={tag.id} .../>)}
  </div>
) : tags.length > 0 ? (
  <span className="text-xs text-foreground-muted">
    {tags.length} {tags.length === 1 ? 'tag' : 'tags'}
  </span>
) : null}
```

**PantryView (index.tsx):**

Add state management:

```typescript
// Load from storage on mount
const [filtersVisible, setFiltersVisible] = useState(() =>
  loadUiPrefs().filtersVisible
)
const [tagsVisible, setTagsVisible] = useState(() =>
  loadUiPrefs().tagsVisible
)
const [sortBy, setSortBy] = useState(() =>
  loadSortPrefs().sortBy
)
const [sortDirection, setSortDirection] = useState(() =>
  loadSortPrefs().sortDirection
)

// Save to storage on change
useEffect(() => {
  saveUiPrefs({ filtersVisible, tagsVisible })
}, [filtersVisible, tagsVisible])

useEffect(() => {
  saveSortPrefs({ sortBy, sortDirection })
}, [sortBy, sortDirection])
```

Replace top bar with PantryToolbar:

```tsx
<PantryToolbar
  filtersVisible={filtersVisible}
  tagsVisible={tagsVisible}
  sortBy={sortBy}
  sortDirection={sortDirection}
  onToggleFilters={() => setFiltersVisible(prev => !prev)}
  onToggleTags={() => setTagsVisible(prev => !prev)}
  onSortChange={(field, direction) => {
    setSortBy(field)
    setSortDirection(direction)
  }}
/>
```

Conditionally render ItemFilters:

```tsx
{filtersVisible && (
  <ItemFilters ... />
)}
```

Pass showTags to ItemCard:

```tsx
<PantryItem
  ...
  showTags={tagsVisible}
/>
```

## Data Flow

### Sorting Logic

**New utility:** `src/lib/sortUtils.ts`

```typescript
export type SortField = 'name' | 'quantity' | 'status' | 'updatedAt' | 'expiring'
export type SortDirection = 'asc' | 'desc'

export function sortItems(
  items: Item[],
  quantities: Map<string, number>,
  expiryDates: Map<string, Date | undefined>,
  sortBy: SortField,
  sortDirection: SortDirection
): Item[]
```

**Sort Criteria:**

- **name:** Alphabetical by item.name
- **quantity:** By current stock level (from quantities map)
- **status:** Priority order: error → warning → ok
  - error: quantity < refillThreshold
  - warning: quantity === refillThreshold
  - ok: quantity > refillThreshold
- **updatedAt:** By item.updatedAt timestamp
- **expiring:** By expiry date (from expiryDates map), null dates sort last

**Data Fetching:**

PantryView fetches all quantities and expiry dates upfront (before sorting) to avoid items jumping around as data loads:

```typescript
// Fetch all quantities at once
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

// Fetch all expiry dates at once
const { data: allExpiryDates } = useQuery({
  queryKey: ['items', 'expiryDates'],
  queryFn: async () => {
    const map = new Map<string, Date | undefined>()
    for (const item of items) {
      const lastPurchase = await getLastPurchaseDate(item.id)
      const estimatedDate = item.estimatedDueDays && lastPurchase
        ? new Date(lastPurchase.getTime() + item.estimatedDueDays * 24 * 60 * 60 * 1000)
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
  sortDirection
)
```

### Storage Utilities

**Extend:** `src/lib/sessionStorage.ts`

Add new storage functions following existing pattern:

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
    if (typeof parsed !== 'object' || parsed === null) {
      return { filtersVisible: false, tagsVisible: false }
    }

    return parsed as UiPreferences
  } catch (error) {
    console.error('Failed to load UI preferences:', error)
    return { filtersVisible: false, tagsVisible: false }
  }
}

// Sort preferences (localStorage)
const SORT_PREFS_KEY = 'pantry-sort-prefs'

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
    if (typeof parsed !== 'object' || parsed === null) {
      return { sortBy: 'expiring', sortDirection: 'asc' }
    }

    return parsed as SortPreferences
  } catch (error) {
    console.error('Failed to load sort preferences:', error)
    return { sortBy: 'expiring', sortDirection: 'asc' }
  }
}
```

## Testing

### Unit Tests: PantryToolbar.test.tsx

Test toolbar in isolation with mocked callbacks:

```typescript
describe('PantryToolbar', () => {
  const defaultProps = {
    filtersVisible: false,
    tagsVisible: false,
    sortBy: 'expiring' as const,
    sortDirection: 'asc' as const,
    onToggleFilters: vi.fn(),
    onToggleTags: vi.fn(),
    onSortChange: vi.fn(),
  }

  it('renders three control buttons', () => {
    render(<PantryToolbar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /filter/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tags/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /expiring/i })).toBeInTheDocument()
  })

  it('shows active variant when filters visible', () => {
    render(<PantryToolbar {...defaultProps} filtersVisible={true} />)
    const filterBtn = screen.getByRole('button', { name: /filter/i })
    expect(filterBtn.className).toContain('neutral')
    expect(filterBtn.className).not.toContain('neutral-ghost')
  })

  it('calls onToggleFilters when filter button clicked', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<PantryToolbar {...defaultProps} onToggleFilters={onToggle} />)

    await user.click(screen.getByRole('button', { name: /filter/i }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('displays current sort criteria with direction', () => {
    render(<PantryToolbar {...defaultProps} sortBy="name" sortDirection="desc" />)
    expect(screen.getByText(/name.*↓/i)).toBeInTheDocument()
  })

  it('calls onSortChange with correct field when menu item clicked', async () => {
    const user = userEvent.setup()
    const onSortChange = vi.fn()
    render(<PantryToolbar {...defaultProps} onSortChange={onSortChange} />)

    // Open dropdown
    await user.click(screen.getByRole('button', { name: /expiring/i }))

    // Click "Name" option
    await user.click(screen.getByRole('menuitem', { name: /name/i }))

    expect(onSortChange).toHaveBeenCalledWith('name', 'asc')
  })
})
```

### Integration Tests: index.test.tsx

Add to existing test file for end-to-end flows:

```typescript
describe('Pantry toolbar integration', () => {
  it('user can toggle filters visibility', async () => {
    const user = userEvent.setup()
    renderApp()

    // Initially hidden (default)
    expect(screen.queryByRole('button', { name: /category/i })).not.toBeInTheDocument()

    // Click filter button
    await user.click(screen.getByRole('button', { name: /filter/i }))

    // Filters now visible
    expect(screen.getByRole('button', { name: /category/i })).toBeInTheDocument()
  })

  it('user can toggle tag visibility', async () => {
    const user = userEvent.setup()
    await createItem({ name: 'Tomatoes', tagIds: ['tag-1', 'tag-2'] })
    renderApp()

    // Initially hidden - shows count
    await waitFor(() => {
      expect(screen.getByText('2 tags')).toBeInTheDocument()
    })

    // Click tags button
    await user.click(screen.getByRole('button', { name: /tags/i }))

    // Now shows individual badges
    expect(screen.queryByText('2 tags')).not.toBeInTheDocument()
    expect(screen.getByText('Vegetables')).toBeInTheDocument()
  })

  it('user can sort items by name', async () => {
    const user = userEvent.setup()
    await createItem({ name: 'Tomatoes' })
    await createItem({ name: 'Apples' })
    await createItem({ name: 'Pasta' })
    renderApp()

    await waitFor(() => {
      expect(screen.getByText('Tomatoes')).toBeInTheDocument()
    })

    // Open sort menu
    await user.click(screen.getByRole('button', { name: /expiring/i }))

    // Select Name
    await user.click(screen.getByRole('menuitem', { name: /name/i }))

    // Items now alphabetical
    const items = screen.getAllByRole('heading', { level: 3 })
    expect(items[0]).toHaveTextContent('Apples')
    expect(items[1]).toHaveTextContent('Pasta')
    expect(items[2]).toHaveTextContent('Tomatoes')
  })

  it('user can toggle sort direction', async () => {
    const user = userEvent.setup()
    await createItem({ name: 'Apples' })
    await createItem({ name: 'Zucchini' })
    renderApp()

    // Sort by name ascending
    await user.click(screen.getByRole('button', { name: /expiring/i }))
    await user.click(screen.getByRole('menuitem', { name: /name/i }))

    await waitFor(() => {
      const items = screen.getAllByRole('heading', { level: 3 })
      expect(items[0]).toHaveTextContent('Apples')
    })

    // Click name again to reverse
    await user.click(screen.getByRole('button', { name: /name.*↑/i }))
    await user.click(screen.getByRole('menuitem', { name: /name/i }))

    // Now descending
    await waitFor(() => {
      const items = screen.getAllByRole('heading', { level: 3 })
      expect(items[0]).toHaveTextContent('Zucchini')
    })
  })
})
```

### Storage Tests: sessionStorage.test.ts

Add tests for new storage functions:

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
})

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
})
```

### Storybook Stories

**PantryToolbar.stories.tsx:**

```typescript
export const Default: Story = {
  args: {
    filtersVisible: false,
    tagsVisible: false,
    sortBy: 'expiring',
    sortDirection: 'asc',
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

export const SortByName: Story = {
  args: {
    ...Default.args,
    sortBy: 'name',
    sortDirection: 'desc',
  },
}
```

## Error Handling

**Storage failures:**
- All storage operations wrapped in try/catch
- Errors logged to console.error
- Return sensible defaults on failure
- App continues working with in-memory state

**Missing data for sorting:**
- If quantities/expiryDates maps are not loaded yet, use empty maps
- sortItems handles missing data gracefully (null dates sort last)
- Items without data appear at end of list

**Invalid sort field:**
- TypeScript ensures only valid SortField values
- If somehow invalid, fall back to 'expiring' default

## Files to Create/Modify

**New files:**
- `src/components/PantryToolbar.tsx` - Toolbar component
- `src/components/PantryToolbar.test.tsx` - Unit tests
- `src/components/PantryToolbar.stories.tsx` - Storybook stories
- `src/lib/sortUtils.ts` - Sorting logic
- `src/lib/sortUtils.test.ts` - Sorting tests

**Modified files:**
- `src/routes/index.tsx` - Add state, replace top bar, apply sorting
- `src/components/ItemCard.tsx` - Add showTags prop
- `src/components/PantryItem.tsx` - Pass showTags prop
- `src/lib/sessionStorage.ts` - Add UI/sort storage functions
- `src/lib/sessionStorage.test.ts` - Add storage tests
- `src/routes/index.test.tsx` - Add integration tests

**Type definitions:**
- Add SortField and SortDirection types (exported from sortUtils.ts)
- Add UiPreferences and SortPreferences interfaces (in sessionStorage.ts)
