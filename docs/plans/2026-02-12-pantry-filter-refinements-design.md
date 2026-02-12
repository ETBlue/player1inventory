# Pantry Filter Refinements Design

**Date:** 2026-02-12
**Status:** Design Complete

## Overview

Refine filter behaviors on the pantry page to provide better user interaction with tag-based filtering.

## Requirements

1. **Toggle filter behavior** - Clicking a tag on an item should toggle it in the filters (add if not active, remove if active)
2. **Show all tags** - Display all tags on pantry items regardless of count (remove 3-tag limit and "+N" badge)

## Current Behavior

**Tag Click:**
- Clicking a tag always adds it to filters
- If tag is already in filter, nothing happens (stays in filter)

**Tag Display:**
- Shows first 3 tags with `.slice(0, 3)`
- Shows "+N" badge if more than 3 tags exist
- User cannot see or interact with tags beyond the first 3

## Design

### 1. Toggle Filter Behavior

**File:** `src/routes/index.tsx`
**Function:** `handleTagClick` (lines 39-59)

**Current logic:**
```tsx
const handleTagClick = (tagId: string) => {
  const tag = tags.find((t) => t.id === tagId)
  if (!tag) return

  const tagType = tagTypes.find((t) => t.id === tag.typeId)
  if (!tagType) return

  setFilterState((prev) => {
    const existingTags = prev[tagType.id] || []
    if (existingTags.includes(tagId)) {
      return prev // Already filtered - do nothing
    }
    // Add tag to filter
    return {
      ...prev,
      [tagType.id]: [...existingTags, tagId],
    }
  })
}
```

**New logic:**
```tsx
const handleTagClick = (tagId: string) => {
  const tag = tags.find((t) => t.id === tagId)
  if (!tag) return

  const tagType = tagTypes.find((t) => t.id === tag.typeId)
  if (!tagType) return

  setFilterState((prev) => {
    const existingTags = prev[tagType.id] || []

    // If tag is already in filter, remove it (toggle off)
    if (existingTags.includes(tagId)) {
      const newTags = existingTags.filter(id => id !== tagId)
      if (newTags.length === 0) {
        // Remove tag type from filter if no tags left
        const { [tagType.id]: _, ...rest } = prev
        return rest
      }
      return {
        ...prev,
        [tagType.id]: newTags,
      }
    }

    // Otherwise add it (toggle on)
    return {
      ...prev,
      [tagType.id]: [...existingTags, tagId],
    }
  })
}
```

**User experience:**
- Click unfiltered tag → adds to filter
- Click filtered tag → removes from filter
- Provides intuitive toggle interaction
- Visual feedback through dropdown UI showing selected state

### 2. Display All Tags

**File:** `src/components/ItemCard.tsx`
**Lines:** 57-84

**Current implementation:**
```tsx
{tags.length > 0 && (
  <div className="flex flex-wrap gap-1 mt-2">
    {tags.slice(0, 3).map((tag) => {
      // ... render badge
    })}
    {tags.length > 3 && (
      <Badge variant="neutral-outline" className="text-xs">
        +{tags.length - 3}
      </Badge>
    )}
  </div>
)}
```

**New implementation:**
```tsx
{tags.length > 0 && (
  <div className="flex flex-wrap gap-1 mt-2">
    {tags.map((tag) => {
      const tagType = tagTypes.find((t) => t.id === tag.typeId)
      const bgColor = tagType?.color
      return (
        <Badge
          key={tag.id}
          variant={bgColor}
          className={`text-xs ${onTagClick ? 'cursor-pointer' : ''}`}
          onClick={(e) => {
            if (onTagClick) {
              e.preventDefault()
              e.stopPropagation()
              onTagClick(tag.id)
            }
          }}
        >
          {tag.name}
        </Badge>
      )
    })}
  </div>
)}
```

**Changes:**
- Remove `.slice(0, 3)` limit
- Remove "+N" badge logic
- All tags visible and clickable
- Natural wrapping with `flex-wrap`

**User experience:**
- All tags immediately visible
- No hidden tags requiring expansion
- All tags clickable for filtering
- Multi-row display for items with many tags

## Implementation Notes

- Both changes are independent and can be implemented separately
- No new dependencies required
- No database changes needed
- No breaking changes to existing APIs
- Filter state persistence (sessionStorage) works unchanged

## Testing

- Verify clicking a filtered tag removes it from filters
- Verify clicking an unfiltered tag adds it to filters
- Verify all tags display on items (no 3-tag limit)
- Verify tag wrapping works correctly for items with many tags
- Verify filter state persistence still works
- Test in both light and dark modes

## Files Modified

1. `src/routes/index.tsx` - Update `handleTagClick` toggle logic
2. `src/components/ItemCard.tsx` - Remove tag display limit
