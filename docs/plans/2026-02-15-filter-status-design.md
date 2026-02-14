# Filter Status Display Design

**Date:** 2026-02-15
**Status:** Approved

## Overview

Improve filter visibility by always showing filter status (item count and clear button) when filters are active, regardless of the filter toggle state in the toolbar.

## Current State

The pantry page has a filter toggle in PantryToolbar that controls `filtersVisible` state. When the toggle is OFF (`filtersVisible === false`), the entire ItemFilters component is hidden, including:
- Tag filter dropdowns
- "Showing N of N items" message
- Clear filter button

**Problem:** When filters are active but the toggle is OFF, users have no visual indication that filters are applied or an easy way to clear them.

## Requirements

When filters are active (`filterState` has values), always display:
- "Showing N of N items" message
- Clear filter button

This should happen regardless of the `filtersVisible` toggle state.

**Behavior:**
- When `filtersVisible === true`: Show full ItemFilters (dropdowns + status bar)
- When `filtersVisible === false` AND `hasActiveFilters === true`: Show only status bar (hide dropdowns)
- When `filtersVisible === false` AND `hasActiveFilters === false`: Show nothing

## Approach

**Selected: Extract FilterStatus Component**

Create a new FilterStatus component that displays the filter status bar (message + clear button). This provides clean separation of concerns and reusability.

**Alternatives considered:**
1. Add "compact" mode prop to ItemFilters - rejected due to increased component complexity
2. Conditional rendering split in pantry page - rejected due to tight coupling

## Architecture

### New Component

**File:** `src/components/FilterStatus.tsx`

Displays filter status information and clear action.

**Props:**
- `filteredCount: number` - Number of items after filtering
- `totalCount: number` - Total number of items
- `hasActiveFilters: boolean` - Whether any filters are active
- `onClearAll: () => void` - Callback to clear all filters

**Responsibilities:**
- Display "Showing N of N items" message
- Show/hide clear filter button based on hasActiveFilters
- Call onClearAll when clear button clicked

### Modified Files

**File:** `src/routes/index.tsx` (Pantry page)

Update conditional rendering logic:
1. Calculate `hasActiveFilters` from filterState
2. Replace current `{filtersVisible && <ItemFilters />}` with:
   - If `filtersVisible === true`: render ItemFilters
   - Else if `hasActiveFilters === true`: render FilterStatus
   - Else: render nothing

**Changes:**
- Add import for FilterStatus
- Add hasActiveFilters calculation
- Update conditional rendering logic
- Pass appropriate props to FilterStatus

### Optional Future Refactoring

**File:** `src/components/ItemFilters.tsx`

ItemFilters can be refactored to use FilterStatus internally to avoid code duplication. This is not required for the initial implementation but would improve maintainability.

**Before:**
```typescript
<div className="flex items-center h-6">
  <div className="ml-3 text-xs text-foreground-muted">
    Showing {filteredCount} of {totalCount} items
  </div>
  <div className="flex-1" />
  {hasActiveFilters && (
    <Button variant="neutral-ghost" size="xs" onClick={handleClearAll}>
      <X />
      Clear filter
    </Button>
  )}
</div>
```

**After:**
```typescript
<FilterStatus
  filteredCount={filteredCount}
  totalCount={totalCount}
  hasActiveFilters={hasActiveFilters}
  onClearAll={handleClearAll}
/>
```

## Component Design

### FilterStatus Component

```typescript
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FilterStatusProps {
  filteredCount: number
  totalCount: number
  hasActiveFilters: boolean
  onClearAll: () => void
}

export function FilterStatus({
  filteredCount,
  totalCount,
  hasActiveFilters,
  onClearAll,
}: FilterStatusProps) {
  return (
    <div className="flex items-center h-6 px-1 py-1">
      <div className="ml-3 text-xs text-foreground-muted">
        Showing {filteredCount} of {totalCount} items
      </div>
      <div className="flex-1" />
      {hasActiveFilters && (
        <Button variant="neutral-ghost" size="xs" onClick={onClearAll}>
          <X />
          Clear filter
        </Button>
      )}
    </div>
  )
}
```

### Pantry Page Integration

```typescript
// In PantryView function, after filterState is defined:

// Calculate if any filters are active
const hasActiveFilters = Object.values(filterState).some(
  (tagIds) => tagIds.length > 0
)

// In JSX, replace lines 176-186:
{filtersVisible ? (
  <ItemFilters
    tagTypes={tagTypes}
    tags={tags}
    items={items}
    filterState={filterState}
    filteredCount={sortedItems.length}
    totalCount={items.length}
    onFilterChange={setFilterState}
  />
) : hasActiveFilters ? (
  <FilterStatus
    filteredCount={sortedItems.length}
    totalCount={items.length}
    hasActiveFilters={hasActiveFilters}
    onClearAll={() => setFilterState({})}
  />
) : null}
```

## Testing Strategy

### FilterStatus Component Tests

**File:** `src/components/FilterStatus.test.tsx`

**Rendering tests:**
1. Renders "Showing N of N items" message with correct counts
2. Shows clear button when hasActiveFilters is true
3. Hides clear button when hasActiveFilters is false
4. Updates message when counts change

**Interaction tests:**
5. Clicking clear button calls onClearAll callback

**Test structure:**
```typescript
describe('FilterStatus', () => {
  it('displays correct item counts', () => {
    render(<FilterStatus
      filteredCount={5}
      totalCount={10}
      hasActiveFilters={true}
      onClearAll={vi.fn()}
    />)

    expect(screen.getByText('Showing 5 of 10 items')).toBeInTheDocument()
  })

  it('shows clear button when filters are active', () => {
    render(<FilterStatus
      filteredCount={5}
      totalCount={10}
      hasActiveFilters={true}
      onClearAll={vi.fn()}
    />)

    expect(screen.getByRole('button', { name: /clear filter/i })).toBeInTheDocument()
  })

  it('hides clear button when no filters are active', () => {
    render(<FilterStatus
      filteredCount={10}
      totalCount={10}
      hasActiveFilters={false}
      onClearAll={vi.fn()}
    />)

    expect(screen.queryByRole('button', { name: /clear filter/i })).not.toBeInTheDocument()
  })

  it('calls onClearAll when clear button is clicked', async () => {
    const onClearAll = vi.fn()
    const user = userEvent.setup()

    render(<FilterStatus
      filteredCount={5}
      totalCount={10}
      hasActiveFilters={true}
      onClearAll={onClearAll}
    />)

    await user.click(screen.getByRole('button', { name: /clear filter/i }))
    expect(onClearAll).toHaveBeenCalledOnce()
  })
})
```

### Pantry Page Integration Tests

**File:** `src/routes/index.test.tsx` (or create if doesn't exist)

**Conditional rendering tests:**
1. When filtersVisible=true, renders ItemFilters (full view)
2. When filtersVisible=false and hasActiveFilters=true, renders FilterStatus only
3. When filtersVisible=false and hasActiveFilters=false, renders nothing
4. FilterStatus disappears after clearing filters

### ItemFilters Tests

**File:** `src/components/ItemFilters.test.tsx`

**Regression tests:**
- All existing tests should continue to pass
- No changes needed unless ItemFilters is refactored to use FilterStatus internally

## Design Decisions

### Why Extract FilterStatus Component?

**Chosen approach:** Create separate FilterStatus component

**Rationale:**
- **Single Responsibility:** FilterStatus handles only status display, ItemFilters handles filter controls
- **Reusability:** FilterStatus can be used in other contexts (e.g., search results, other filtered lists)
- **Testability:** Easier to test status display independently from filter logic
- **Maintainability:** Changes to filter UI don't affect status bar and vice versa
- **Future-proof:** Easy to refactor ItemFilters to use FilterStatus internally later

**Alternatives rejected:**
1. **Compact mode prop:** Would make ItemFilters more complex with conditional rendering throughout
2. **Pantry page conditional rendering:** Tight coupling between page and component internals, hard to maintain

### Why Not Modify ItemFilters Directly?

We could add logic to ItemFilters to hide dropdowns when in "compact" mode, but this:
- Violates single responsibility (one component doing two different things)
- Makes the component harder to understand and test
- Couples the status bar to the filter dropdowns unnecessarily

By extracting FilterStatus, we get a clean separation that can be independently tested and reused.

### Styling Consistency

FilterStatus uses the same styling as the status bar in ItemFilters to maintain visual consistency:
- Same height (`h-6`)
- Same text styling (`text-xs text-foreground-muted`)
- Same button variant (`neutral-ghost` size `xs`)
- Same spacing (`px-1 py-1`, `ml-3`)

## Implementation Notes

### Minimal Changes

The implementation requires minimal changes to existing code:
- One new component file (FilterStatus.tsx)
- One new test file (FilterStatus.test.tsx)
- Small update to pantry page conditional rendering logic
- No changes to ItemFilters (unless optional refactoring is done)

### Data Flow

```
filterState (pantry page)
    ↓
hasActiveFilters = Object.values(filterState).some(...)
    ↓
Conditional rendering decision
    ↓
FilterStatus receives: filteredCount, totalCount, hasActiveFilters, onClearAll
    ↓
User clicks "Clear filter"
    ↓
onClearAll() → setFilterState({})
    ↓
hasActiveFilters becomes false → FilterStatus unmounts
```

### Edge Cases

1. **No items in list:** FilterStatus shows "Showing 0 of 0 items" - this is correct behavior
2. **All items filtered out:** FilterStatus shows "Showing 0 of N items" - user can see filters are too restrictive
3. **Filters active but toggle off:** FilterStatus appears (this is the main feature)
4. **No filters active:** FilterStatus doesn't render (saves space)

### Performance Considerations

- `hasActiveFilters` calculation is O(n) where n = number of tag types with filters
- Typically very small (< 10), so performance impact is negligible
- Could memoize if needed, but not necessary for initial implementation

## Future Enhancements

Potential future improvements (not part of this design):

1. **Refactor ItemFilters:** Use FilterStatus internally to avoid code duplication
2. **Filter count badge:** Show number of active filters in the status message
3. **Expandable filters:** Click status bar to expand/show filter dropdowns
4. **Keyboard shortcut:** Hotkey to clear all filters
5. **Filter persistence:** Remember filter state across sessions (already implemented for filterState, would work automatically)

These are not required for the initial implementation but could be added based on user feedback.
