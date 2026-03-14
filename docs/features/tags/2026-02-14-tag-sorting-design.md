# Tag Sorting Design

**Date:** 2026-02-14
**Status:** Approved

## Overview

Implement consistent tag sorting across the application:
- **Tag type menus/sections**: Sort tags alphabetically by name
- **Item cards**: Sort tags by tag type name, then by tag name

## Current State

Tags are currently displayed in database insertion order without any sorting logic. Tags appear in three contexts:

1. **Tag type dropdown** (ItemFilters.tsx) - shows tags within one tag type
2. **Tag type section** (settings/tags.tsx) - shows tags within one tag type
3. **Item card** (ItemCard.tsx) - shows all tags for an item

## Requirements

- Context 1 & 2: Sort tags alphabetically by name
- Context 3: Sort tags by tag type name (alphabetically), then by tag name (alphabetically)
- All sorting should be case-insensitive and ascending (A-Z)

## Architecture

### New Files

Create utility module for tag sorting:

```
src/lib/tagSortUtils.ts       # Tag sorting utility functions
src/lib/tagSortUtils.test.ts  # Unit tests
```

### Component Updates

Three components need updates to use the sorting utilities:

- `src/components/ItemCard.tsx` - sort tags before rendering
- `src/components/ItemFilters.tsx` - sort tags before passing to dropdown
- `src/routes/settings/tags.tsx` - sort tags in each tag type section

## Sorting Utilities

### Function Signatures

```typescript
// Sort tags alphabetically by name (case-insensitive, ascending)
function sortTagsByName(tags: Tag[]): Tag[]

// Sort tags by tag type name, then by tag name (both case-insensitive, ascending)
function sortTagsByTypeAndName(tags: Tag[], tagTypes: TagType[]): Tag[]
```

### Implementation Approach

**sortTagsByName:**
- Use `array.sort()` with `localeCompare` for case-insensitive alphabetical sorting
- Returns new sorted array (non-mutating)

**sortTagsByTypeAndName:**
- Create a map of typeId → tagType for O(1) lookup
- Sort tags by comparing:
  - First: tag type name (via typeId lookup)
  - Then: tag name (if same tag type)
- Use `localeCompare` for both comparisons
- Returns new sorted array (non-mutating)

### Edge Cases

- Tags with missing/invalid typeId: sorted to end
- Empty arrays: return empty array
- Undefined/null inputs: return empty array

## Component Integration

### ItemCard.tsx

```typescript
import { sortTagsByTypeAndName } from '@/lib/tagSortUtils'

// In render logic (around line 131)
const sortedTags = sortTagsByTypeAndName(tags, tagTypes)
// Map over sortedTags instead of tags
```

### ItemFilters.tsx

```typescript
import { sortTagsByName } from '@/lib/tagSortUtils'

// In render logic (around line 68)
const typeTags = tags.filter((tag) => tag.typeId === tagTypeId)
const sortedTypeTags = sortTagsByName(typeTags)
// Pass sortedTypeTags to TagTypeDropdown
```

### settings/tags.tsx

```typescript
import { sortTagsByName } from '@/lib/tagSortUtils'

// In render logic (around line 161)
const typeTags = tags.filter((t) => t.typeId === tagType.id)
const sortedTypeTags = sortTagsByName(typeTags)
// Map over sortedTypeTags instead of typeTags
```

**Note:** TagTypeDropdown component doesn't need changes - it receives pre-sorted tags.

## Testing Strategy

### Unit Tests

Create `src/lib/tagSortUtils.test.ts` with tests for:

**sortTagsByName:**
- Sorts tags alphabetically A-Z
- Case-insensitive sorting (e.g., "apple" before "Banana")
- Handles empty array
- Returns new array (non-mutating)

**sortTagsByTypeAndName:**
- Sorts by tag type name first, then tag name
- Both sorts are case-insensitive
- Handles tags with missing/invalid typeId
- Handles empty arrays
- Returns new array (non-mutating)

### Component Integration Tests

Update existing component tests:
- `ItemCard.test.tsx` - verify tags appear in type-then-name order
- `TagTypeDropdown.test.tsx` - verify tags appear alphabetically
- Settings page tests - verify tags in each section are alphabetically sorted

### Manual Verification

- Check tag display in ItemCard with multiple tag types
- Check tag dropdown in filters
- Check tag type sections in settings page

## Design Decisions

### Why Utility Functions (Approach 2)?

**Alternatives considered:**
1. Component-level inline sorting - Simple but duplicates logic
2. **Utility functions** (chosen) - Reusable, testable, DRY
3. Hook-level sorting - Couples data layer to display logic, less flexible

**Rationale:**
- Utility functions provide reusable, testable sorting logic
- Components remain simple and focused
- No coupling between data hooks and display concerns
- Performance impact negligible for typical tag counts

### Why Component-Level Sorting?

Sorting happens in components (not in hooks/database) because:
- Different contexts need different sorting strategies
- Keeps data layer pure and agnostic to display concerns
- Easy to test and debug
- Flexible for future sorting requirements

### Sort Order Decisions

- **Direction**: Ascending (A-Z) - standard alphabetical order
- **Case sensitivity**: Case-insensitive - better UX, avoids "Z" before "a"
- **Locale**: Using `localeCompare` for proper internationalization support

## Implementation Notes

- All sorting functions are pure (non-mutating)
- Use `localeCompare()` for consistent, locale-aware string comparison
- Sort operations run on every render but with negligible performance impact for typical tag counts (< 50 per item)
- Future optimization: memoize sorted arrays if performance becomes an issue
