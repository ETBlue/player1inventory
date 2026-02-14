# Tabbed Item Form Design

**Date:** 2026-02-15
**Status:** Approved

## Overview

Restructure the item editing experience with tabs to separate concerns and improve usability. Create a simplified single-page flow for new items and a tabbed interface for existing items with unique URLs for each tab.

## Goals

1. Separate stock status (current state) from item configuration (settings)
2. Enable quick stock updates without navigating through configuration fields
3. Provide unique URLs for each tab for deep linking and browser navigation
4. Simplify new item creation with a focused single-page flow
5. Reduce cognitive load by showing only relevant fields per task

## Route Structure

### New Item Creation

**Route:** `/items/new`

Single page combining Info fields + Tags section (no tabs). After save, user chooses:
- "View item" → Navigate to `/items/{newId}` (Stock tab)
- "Back to list" → Navigate to `/`
- "Create another" → Clear form, stay on `/items/new`

### Existing Item Editing

**Parent Route:** `/items/$id`
- Renders layout with fixed top bar containing tabs
- Provides shared item data via context
- Manages unsaved changes detection across tabs

**Child Routes:**
- `/items/$id` (index) → Stock Status tab (default)
- `/items/$id/info` → Item Info tab
- `/items/$id/tags` → Tags tab

**File Structure:**
```
src/routes/items/
  new.tsx                 # Create new item page
  $id.tsx                 # Parent layout with top bar
  $id/index.tsx           # Stock tab (default)
  $id/info.tsx            # Info tab
  $id/tags.tsx            # Tags tab
```

## Component Architecture

### Parent Layout (`/items/$id.tsx`)

Renders fixed top bar with:
- Back button (navigate to `/`)
- Item name (read-only, truncated if long)
- Tab navigation (Stock | Info | Tags)
- History button (link to `/items/$id/log`)
- Delete button (with confirmation)

Responsibilities:
- Provide shared item data to child routes
- Monitor dirty state from child tabs
- Show discard confirmation when switching tabs with unsaved changes
- Render `<Outlet />` for tab content

### Tab Components

**1. Stock Status Tab (`$id/index.tsx`)**

Form fields:
- Packed Quantity (number, min 0, step 1)
- Unpacked Quantity (number, min 0, step consumeAmount, only for dual-unit items)
- Expiration Mode (dropdown: Specific Date | Days from Purchase)
- Expiration Value (date input OR number input, conditional based on mode)

Features:
- Save button at bottom (disabled when no changes)
- Real-time validation on blur/change
- Reports dirty state to parent layout
- On save: Updates stock-related fields, shows "Stock updated" toast

**2. Item Info Tab (`$id/info.tsx`)**

Form fields (in order):
- Name (text, required)
- Package Unit (text)
- Measurement Unit (text)
- Amount per Package (number, disabled when no measurement unit)
- Track target in measurement (switch, always visible, disabled when no measurement unit)
- Target Quantity (number)
- Refill When Below (number)
- Amount per Consume (number, required)
- Expiration Warning Threshold (number, days)

Features:
- Save button at bottom (disabled when no changes)
- Real-time validation on blur/change
- Reports dirty state to parent layout
- On save: Updates all item configuration, shows "Item info updated" toast
- Item name in top bar updates immediately after save

**3. Tags Tab (`$id/tags.tsx`)**

UI:
- Tag selection interface (grouped by tag type, badge-style toggles)
- No save button

Features:
- Immediate save on tag selection/deselection
- Optimistic UI update
- If save fails: Revert UI, show error toast
- Never reports dirty (always clean)

### New Item Page (`/items/new.tsx`)

**Layout:**
- Fixed top bar with: Back button, "New Item" title (no tabs, no action buttons)
- Main content with combined form

**Form Fields:**
Single form containing:
- All Item Info fields (Name*, Package unit, Measurement unit, Amount per package, Track target switch, Target quantity*, Refill threshold*, Amount per consume*, Expiration warning threshold)
- Tags section at bottom
- Save button at bottom

**Behavior:**
- Save button always enabled
- Real-time validation on blur/change
- On Save with errors: Show toast listing errors
- On Save success: Show toast with three action buttons

## State Management

### Dirty State Tracking

Each tab with save button (Stock, Info):
- Maintains `initialValues` snapshot when tab loads
- Tracks `currentValues` as form state
- Computes `isDirty = currentValues !== initialValues`
- Save button disabled when `!isDirty`

### Parent Layout Communication

Tabs register dirty state with parent layout via context:
```typescript
const { registerDirtyState } = useItemLayout()
registerDirtyState(isDirty)
```

Parent listens for route changes and checks if any tab is dirty before navigation.

### Navigation Guard

When user navigates to different tab while current tab is dirty:
1. Prevent navigation
2. Show confirmation dialog: "You have unsaved changes. Discard changes?"
3. If confirmed: Allow navigation (changes lost)
4. If cancelled: Stay on current tab

Guard does NOT apply when:
- Clicking Save (form submits normally)
- Navigating away from Tags tab (never dirty)
- Current tab is clean (no unsaved changes)

### Validation Flow

**For Stock and Info tabs:**
- Validation runs on blur/change (real-time)
- Errors shown inline below fields
- Save button always enabled (even with validation errors)
- On Save with errors: Show toast with list of all validation errors, prevent submission
- On Save without errors: Submit to database, show success toast

**For Tags tab:**
- No validation needed (tag selection is always valid)
- Saves immediately on change
- Optimistic UI update, revert on failure

### Create Flow Validation

**New item form:**
- Real-time validation on blur/change
- Save button always enabled
- On Save with errors: Show toast listing errors
- On Save success: Create item, show success toast with action buttons

## Top Bar Layout

### Visual Structure

```
[←] [Item Name]    [Stock] [Info] [Tags]           [🕐 History] [🗑 Delete]
```

### Implementation Details

**Positioning:**
- `position: fixed` at top
- `bg-background-elevated` with `border-b`
- `z-50` to stay above content
- Full width

**Layout Sections:**
- **Left**: Back button + Item name (read-only, truncated with `max-w-[300px]`)
- **Center/Left**: Tab navigation (Stock | Info | Tags)
- **Right**: History button + Delete button

**Tab Styling:**
- Active tab: Highlighted (underline or background accent)
- Inactive tabs: Muted color, clearly clickable
- Tabs use `<Link>` components for proper TanStack Router navigation
- Guard intercepts navigation when tab is dirty

**Responsive Behavior:**
- On narrow screens (< 640px): Consider stacking or wrapping
- Item name might be hidden or abbreviated on very small screens
- Tabs might become compact or icon-only

**Main Content:**
- Padding-top (`pt-20` or adjust) to clear fixed bar
- Scrollable content below

## Tab Field Distribution

### Stock Status Tab
- **Purpose:** Quick stock updates and expiration management
- **Fields:** Packed quantity, Unpacked quantity, Expiration mode, Expiration value
- **Save:** Manual via Save button

### Item Info Tab
- **Purpose:** Configure item settings and thresholds
- **Fields:** Name, Package unit, Measurement unit, Amount per package, Track target switch, Target quantity, Refill threshold, Amount per consume, Expiration warning threshold
- **Save:** Manual via Save button

### Tags Tab
- **Purpose:** Categorize items with tags
- **Fields:** Tag selection (grouped by tag type)
- **Save:** Automatic on selection/deselection

## Success Criteria

**New Item Creation:**
- [ ] `/items/new` renders Info fields + Tags in single view
- [ ] No tabs shown on creation page
- [ ] Save button validates and creates item
- [ ] Success toast shows three action buttons (View, List, Create another)
- [ ] Each action navigates correctly

**Existing Item Editing:**
- [ ] `/items/$id` shows Stock tab by default
- [ ] Top bar contains: Back, Item name, Tabs, History, Delete
- [ ] Tabs have unique URLs and work with browser back/forward
- [ ] Stock tab has 4 fields and Save button
- [ ] Info tab has 9 fields and Save button
- [ ] Tags tab has no Save button, updates immediately
- [ ] Save buttons disabled when no changes
- [ ] Real-time validation shows errors inline
- [ ] Clicking Save with errors shows toast
- [ ] Clicking Save without errors updates item
- [ ] Tab switching with unsaved changes shows discard confirmation

**State Management:**
- [ ] Dirty state tracked per tab
- [ ] Navigation guard prevents accidental data loss
- [ ] Tags save immediately without guard
- [ ] Validation runs on blur/change
- [ ] All tests pass

## Technical Notes

**TanStack Router:**
- Use nested routes with layout pattern
- Parent layout provides context to children
- Tab links use `<Link to="...">` for proper navigation
- Navigation guard uses router's `beforeLoad` or similar hook

**State Management:**
- Each tab manages its own form state
- Dirty detection via simple value comparison
- Context provides `registerDirtyState()` for tabs to report status
- Parent aggregates dirty state across all tabs

**Validation:**
- Reuse existing validation logic from current ItemForm
- Real-time errors shown inline (same as current)
- Toast on save with errors (new behavior)

**Database Operations:**
- Stock tab: Updates `packedQuantity`, `unpackedQuantity`, `dueDate`, `estimatedDueDays`
- Info tab: Updates all item configuration fields
- Tags tab: Updates `tagIds` array
- All use existing `updateItem()` mutation

## Future Considerations

This design supports planned enhancements:
- Additional tabs (e.g., Purchase History, Recipes) can be added as new routes
- Tab permissions (show/hide based on user role)
- Tab badges (show counts or status indicators)
- Deep linking to specific tab with pre-filled form (via URL search params)

## Migration Notes

**Breaking Changes:**
- Item edit route structure changes from `/items/$id` (single view) to `/items/$id` (parent with tabs)
- External links to `/items/$id` will still work (shows Stock tab by default)

**Backward Compatibility:**
- All existing functionality preserved
- No database schema changes
- Component props remain compatible where reused

**Rollout Strategy:**
- Build on top of `feature/item-details-layout` branch
- Feature flag if needed for gradual rollout
- Update any deep links in other parts of app to use tab-specific URLs
