# Split Sort Controls Design

**Date:** 2026-02-13

**Goal:** Split the combined sort dropdown into two separate buttons for better UX clarity - one for criteria selection, one for direction toggle.

**Rationale:** Separating criteria and direction into distinct controls makes the sorting mechanism more discoverable and intuitive. Users can quickly toggle direction without reopening the dropdown menu.

---

## Component Structure & Layout

### Buttons

1. **Sort Criteria Button** (dropdown trigger)
   - Shows current sort field as text: "Expiring", "Name", "Quantity", "Status", or "Updated"
   - Opens dropdown menu with 5 criteria options
   - Uses `size="default"` and `variant="neutral-ghost"`
   - Background highlights active item in dropdown

2. **Sort Direction Button** (toggle)
   - Icon-only using lucide-react icons: `<ArrowUp />` or `<ArrowDown />`
   - Single click toggles between asc/desc
   - Uses `size="icon"` to match Filter/Tags buttons
   - Uses `variant="neutral-ghost"` for consistency

### Layout

```tsx
<Button variant="neutral-ghost">Filter</Button>
<Button variant="neutral-ghost">Tags</Button>
<div className="flex items-center gap-1"> {/* Reduced gap for grouping */}
  <DropdownMenu>...</DropdownMenu>      {/* Criteria: "Expiring" */}
  <Button size="icon"><ArrowUp /></Button> {/* Direction */}
</div>
<span className="flex-1" />
<Link><Button>Add item</Button></Link>
```

The wrapper div with `gap-1` creates visual grouping without adding borders or backgrounds.

---

## Button Behaviors & Interactions

### Sort Criteria Dropdown

- Opens menu with 5 options: Expiring soon, Name, Quantity, Status, Last updated
- Active item has `bg-background-base` background highlighting
- Clicking an item updates `sortBy` state
- Direction remains unchanged when switching criteria
- No direction arrows shown in dropdown items (since direction is separate)

### Sort Direction Toggle

- Displays `<ArrowUp />` when `sortDirection === 'asc'`
- Displays `<ArrowDown />` when `sortDirection === 'desc'`
- Click toggles: asc ↔ desc
- Independent of criteria selection
- Works on current sortBy field

### Callback Changes

- Keep existing `onSortChange(field, direction)` callback
- Criteria button calls: `onSortChange(newField, sortDirection)` - preserves current direction
- Direction button calls: `onSortChange(sortBy, newDirection)` - preserves current field

### Accessibility

- Criteria button: `aria-label="Sort by criteria"`
- Direction button: `aria-label="Toggle sort direction"`

---

## Testing Strategy

### Unit Tests (PantryToolbar.test.tsx)

**Update existing tests:**
- "renders three control buttons" → "renders five control buttons" (Filter, Tags, Criteria, Direction, Add)
- Remove test for combined sort button showing "Name ↓"

**Add new tests:**
- "displays current sort criteria as text" - verify button shows "Name", "Expiring", etc.
- "displays ArrowUp icon when direction is asc"
- "displays ArrowDown icon when direction is desc"
- "calls onSortChange with toggled direction" - click direction button, verify field preserved

**Update existing tests:**
- "calls onSortChange with new field" - verify direction preserved when switching criteria
- Remove direction arrows from dropdown item assertions

### Integration Tests (index.test.tsx)

**Update existing tests:**
- "user can sort items by name" - click criteria dropdown, select Name (no direction change)
- "user can toggle sort direction" - click direction button instead of dropdown item
- Verify sorting actually works with separated controls

### Storybook Stories

**Update to show:**
- Default state (Expiring + ArrowUp)
- Different criteria (Name, Quantity, etc.)
- Descending direction (ArrowDown)
- Both buttons in various states

---

## Implementation Approach

### Changes Required

**PantryToolbar.tsx:**
- Import `ArrowUp` and `ArrowDown` from lucide-react
- Remove `handleSort` function (no longer toggles direction)
- Add criteria handler: `handleCriteriaChange(field)` - calls `onSortChange(field, sortDirection)`
- Add direction handler: `handleDirectionToggle()` - calls `onSortChange(sortBy, sortDirection === 'asc' ? 'desc' : 'asc')`
- Wrap both buttons in `<div className="flex items-center gap-1">`
- Remove direction arrows from dropdown menu items
- Keep `bg-background-base` highlighting for active criteria

**Test Updates:**
- PantryToolbar.test.tsx: Update 2 tests, add 4 new tests
- index.test.tsx: Update 2 integration tests to use separate buttons
- Update test assertions to find criteria button by text and direction button by icon

**Storybook Updates:**
- Update existing stories to show new button arrangement
- Add story showing direction toggle

### No Changes Needed

- Parent component (PantryView) - same callback signature
- Storage utilities - same data structure
- Sort utilities - same sorting logic
