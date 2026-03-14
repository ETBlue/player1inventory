# Tag Detail Page Design

**Date:** 2026-02-21
**Status:** Approved

## Overview

Add a tag detail page with Info and Items tabs, mirroring the existing vendor detail page pattern. This provides a dedicated space for editing tag properties and managing item assignments.

## Requirements

- User can navigate to tag detail page from tags list
- Tag detail page has 2 tabs: Info and Items
- Visual and behavioral patterns match vendor detail page
- Info tab: edit tag name with save button
- Items tab: searchable item checklist with immediate save + New button

## Architecture

### High-Level Structure

The tag detail page mirrors the vendor detail page architecture:

- **Tabbed layout** with Info and Items tabs
- **Navigation guard** to prevent losing unsaved changes
- **Context provider** (`TagLayoutProvider`) for dirty state coordination
- **Smart back navigation** using `useAppNavigation` hook
- **Presentational form component** (`TagNameForm`) for the Info tab

### URL Structure

Flat structure matching vendor pattern:
- `/settings/tags` - Tags list (overview)
- `/settings/tags/$id` - Tag detail Info tab
- `/settings/tags/$id/items` - Tag detail Items tab

## Components & Files

### New Files

**Routes:**
- `src/routes/settings/tags/$id.tsx` - Parent layout with tabs, back button, navigation guard, discard dialog
- `src/routes/settings/tags/$id/index.tsx` - Info tab (tag name editing)
- `src/routes/settings/tags/$id/items.tsx` - Items tab (searchable item checklist)

**Hooks:**
- `src/hooks/useTagLayout.tsx` - Context provider for dirty state tracking

**Components:**
- `src/components/TagNameForm.tsx` - Presentational form (name input + save button)

### Modified Files

- `src/routes/settings/tags.tsx` - Update TagBadge onClick to navigate to detail page, remove TagDetailDialog

### Pattern Consistency

Each file mirrors its vendor counterpart:
- `vendors/$id.tsx` → `tags/$id.tsx`
- `vendors/$id/index.tsx` → `tags/$id/index.tsx`
- `vendors/$id/items.tsx` → `tags/$id/items.tsx`
- `useVendorLayout.tsx` → `useTagLayout.tsx`
- `VendorNameForm.tsx` → `TagNameForm.tsx`

## Data Flow

### Info Tab

1. Load tag via `useTags()` hook, find by ID from route params
2. Initialize local state with `tag.name`
3. Track dirty state: `isDirty = name !== tag.name`
4. Register dirty state with `useTagLayout()` context
5. On save: call `useUpdateTag()` mutation
6. On success: auto-navigate back via `goBack()`

### Items Tab

1. Load all items via `useItems()` hook
2. Check assignment: `item.tagIds.includes(tagId)`
3. On checkbox toggle:
   - Update `item.tagIds` array
   - Call `useUpdateItem()` mutation (immediate save)
   - No staged state, no Save button
4. Search: client-side filtering by item name
5. + New button:
   - Opens inline input
   - Creates item with `tagIds: [currentTagId]` pre-assigned
   - Saves immediately to database
6. Display: show other tags as neutral badges next to each item

### Dirty State Management

- Info tab registers dirty state with `TagLayoutProvider`
- Items tab never has dirty state (immediate saves)
- Parent layout checks `isDirty` before navigation
- Shows discard confirmation dialog when needed

## Navigation & Routing

### Entry Points

- From tags list: Click tag badge → `/settings/tags/$id`
- From settings: Click "Tags" card → `/settings/tags`

### Navigation Behavior

- Back button: `useAppNavigation('/settings/tags')` with smart history tracking
- Tab switching: respects dirty state guard
- After save: auto-navigate back to previous page
- Discard dialog: appears when navigating with unsaved changes

### UI Layout

**Top bar:**
- Back button (left)
- Tag name as title (center-left)
- Tab icons (right)
- Border bottom with active tab indicator

**Tab icons:**
- Info tab: `Settings2` icon
- Items tab: `ListTodo` icon

## Design Decisions

### Why mirror vendor pattern?

Following the "rule of three" - don't abstract until you have 3+ cases. Duplicating the vendor pattern for tags keeps code clear and maintainable. If we add a third entity type later, we can refactor with better understanding of actual variations.

### Why flat URL structure?

Simpler URLs that match the vendor pattern. While tags belong to tag types, the URL doesn't need to reflect this hierarchy. Tags have unique IDs and can be accessed directly.

### Why name-only in Info tab?

Keeps the tag-type relationship immutable after creation. Matches vendor pattern (vendors only have name). Moving tags between types would add UI complexity and potential data confusion.

### Why remove edit dialog?

Consolidates tag editing into the detail page. Having both a quick-edit dialog AND a detail page would be redundant. The detail page provides more space and better context for managing tags.

## Testing Strategy

### Integration Tests

Create `src/routes/settings/tags/$id.test.tsx` with "user can..." scenarios:

**Info tab:**
- User can view tag detail page and see tag name
- User can edit tag name and save changes
- User sees discard dialog when navigating away with unsaved changes
- User can cancel discard and keep changes
- User can confirm discard and lose changes
- Back button navigates to previous page (or tags list fallback)

**Items tab:**
- User can navigate between Info and Items tabs
- User can assign/unassign items to tag via checkboxes
- User can search items in Items tab
- User can create new item with tag pre-assigned
- User sees other tags as badges on items

**Edge cases:**
- Tag not found (404 scenario)
- Empty items list in Items tab
- Search with no results

### Component Tests

- `TagNameForm.tsx` - Basic rendering, prop handling
- `useTagLayout.tsx` - Context provider behavior

## Implementation Notes

- Reuse existing hooks: `useTags()`, `useUpdateTag()`, `useItems()`, `useUpdateItem()`, `useCreateItem()`
- Follow vendor implementation patterns closely
- Maintain consistent styling with design token system
- Use `useAppNavigation` for smart back navigation
- Register dirty state with context provider pattern
