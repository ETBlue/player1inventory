# Tag Filtering on Home Page

**Date:** 2026-02-11
**Status:** Design Complete

## Overview

Add tag-based filtering to the home page, allowing users to filter the pantry item list by selecting tags organized by tag type. Users can click tags in item cards to quickly activate filters, and combine multiple tags across different dimensions to narrow down results.

## User Experience

### Filter Controls

Multiple dropdown menus appear between the page header and item list - one dropdown per tag type. Each dropdown:

- Shows the tag type name styled with the tag type's color
- Displays a visual indicator (dot or highlight) when filters are active for that type
- Contains checkboxes for multi-selecting tags within that type
- Shows dynamic counts next to each tag: `☑ Vegetables (12)`
- Includes an individual "Clear" option when selections exist

### Overall Filter Feedback

- Displays "Showing X of Y items" to show filtered vs total count
- Shows a "Clear all" button when any filters are active
- Hides the entire filter row if no tag types have tags

### Quick Filtering

Clicking a tag badge within an item card activates that tag's filter, providing a natural way to explore related items.

### Filter Persistence

Filter selections persist during the browser session (sessionStorage) but reset when the browser closes.

## Filter Logic

### Selection Behavior

- **Within a tag type:** Multi-select with OR logic
  - Selecting "Vegetables" and "Fruits" shows items with either tag
- **Across tag types:** AND logic
  - Selecting "Vegetables" from Category AND "Fridge" from Location shows items that have both dimensions

### Dynamic Counts

Each tag displays how many items would be shown if selected, considering other active filters. For example:

- If "Fridge" is selected from Location
- "Vegetables (5)" in Category means 5 items are both Vegetables AND in Fridge

This helps users understand the impact of their selections and avoid zero-result combinations.

## Architecture

### Component Structure

```
/routes/index.tsx (PantryView)
├── ItemFilters
│   ├── TagTypeDropdown (per tag type with tags)
│   │   └── DropdownMenu with checkboxes
│   ├── "Showing X of Y items" count
│   └── "Clear all" button (when active)
└── Filtered item list
```

### State Management

**Filter State:**
```tsx
interface FilterState {
  [tagTypeId: string]: string[] // tagTypeId -> array of selected tag IDs
}
```

- Lives in home page component (`/routes/index.tsx`)
- Initialized from sessionStorage on mount
- Saved to sessionStorage on every change
- Passed to `<ItemFilters>` for rendering
- Used to filter items array before rendering

**Session Storage:**
- Key: `pantry-filters`
- Value: JSON stringified `FilterState`
- Automatically cleared on browser close

### New Components

**ItemFilters Component:**
- Renders horizontal row of `<TagTypeDropdown>` components
- Shows "Clear all" button when filters active
- Displays "Showing X of Y items" count
- Only renders dropdowns for tag types that have tags

**TagTypeDropdown Component:**
- Built with shadcn/ui `<DropdownMenu>`
- Trigger button styled with tag type color
- Shows visual indicator when active (dot or highlight)
- Multi-select checkboxes with dynamic counts
- Menu stays open after clicking checkbox
- Individual "Clear" option at top when selections exist

### Modified Components

**ItemCard Component:**
- Tag badges become clickable
- `onClick` with `e.stopPropagation()` to prevent card navigation
- Callback to update filter state when tag clicked

## Implementation Details

### Filtering Algorithm

```tsx
function filterItems(items: Item[], filterState: FilterState, tags: Tag[]): Item[] {
  // If no filters active, return all items
  if (Object.keys(filterState).length === 0) return items

  return items.filter(item => {
    // For each tag type that has selected tags...
    return Object.entries(filterState).every(([tagTypeId, selectedTagIds]) => {
      if (selectedTagIds.length === 0) return true // Skip empty filters

      // Item must have at least ONE of the selected tags from this type (OR logic)
      return selectedTagIds.some(selectedTagId =>
        item.tagIds.includes(selectedTagId)
      )
    })
    // All tag types must match (AND logic across types)
  })
}
```

### Dynamic Count Calculation

```tsx
function calculateTagCount(
  tagId: string,
  tagTypeId: string,
  items: Item[],
  currentFilters: FilterState,
  tags: Tag[]
): number {
  // Simulate selecting this tag with other active filters
  const simulatedFilters = {
    ...currentFilters,
    [tagTypeId]: [...(currentFilters[tagTypeId] || []), tagId]
  }
  return filterItems(items, simulatedFilters, tags).length
}
```

### Edge Cases

1. **No results**: Show empty state with "No items match these filters" and prominent "Clear all" button

2. **Tag deletion**: Automatically remove deleted tag from filter state and update UI

3. **Tag type deletion**: Remove all filters for deleted tag type from state

4. **No tags exist**: Filter row hidden (automatic via "hide empty tag types" rule)

5. **Mobile responsive**: Stack dropdowns vertically or use horizontal scroll on narrow screens

### Performance Considerations

- Filter calculation runs on every render (acceptable for typical pantry sizes)
- Dynamic counts recalculated when dropdown opens (not on every render)
- Consider memoization if performance issues arise

## Testing Strategy

### Unit Tests

**Filter Logic:**
- Empty filters returns all items
- Single tag type, single tag selected
- Single tag type, multiple tags selected (OR logic)
- Multiple tag types selected (AND logic across types)
- Items with no tags filtered out when filters active

**Dynamic Count Calculation:**
- Counts update correctly based on other active filters
- Count is zero when no items would match

**SessionStorage Integration:**
- Filter state persists and restores correctly
- Invalid sessionStorage data doesn't crash the app

### Component Tests

**ItemFilters:**
- Renders correct number of dropdowns based on tag types with tags
- Shows/hides "Clear all" button based on filter state
- Displays correct "Showing X of Y items" count

**TagTypeDropdown:**
- Shows visual indicator when filters active
- Checkboxes reflect selected state
- Dynamic counts displayed correctly
- Individual clear works

**Tag Badge Click:**
- Clicking tag badge activates filter without navigating
- Filter state updates correctly

### Integration Test

Full user flow:
1. Select filters from multiple types
2. See filtered results
3. Click tag in item card
4. Filter updates
5. Clear all
6. Back to full list

## Design Decisions

### Why session persistence over URL params?
- Simpler implementation (no router integration)
- Avoids cluttering URLs
- Still provides persistence within session
- Easier to integrate with tag-click-to-filter feature

### Why dynamic counts over static counts?
- Helps users understand impact of selections
- Prevents selecting tags that would result in zero items
- Better user feedback despite implementation complexity

### Why multi-select within tag types?
- Maximum flexibility for users
- Allows exploring items across multiple categories/locations
- More powerful filtering capabilities

### Why hide empty tag types?
- Keeps UI clean
- Avoids showing non-functional controls
- Filter row appears automatically once tags exist
