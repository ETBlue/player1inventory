# Item Tags Page Visual Improvements

**Date:** 2026-02-16
**Status:** Approved

## Overview

Enhance the item tags page (`/items/$id/tags`) with three improvements:
1. Title Case capitalization for tag type names
2. Visual dividers between tag type sections
3. Ability to add new tags directly from the item page

## Design Decisions

### 1. Tag Type Capitalization

**Implementation:** CSS `capitalize` class
**Rationale:** Simple, no utility function needed. Transforms "food categories" → "Food Categories"

**Change:**
```tsx
<p className="text-sm font-medium text-foreground-muted mb-1 capitalize">
  {tagType.name}
</p>
```

### 2. Section Dividers

**Style:** Horizontal line with spacing
**Rationale:** Clear visual separation between tag type groups

**Change:**
```tsx
<div className="first:mt-0 mt-6 first:pt-0 pt-3 first:border-t-0 border-t border-border">
  {/* tag type section */}
</div>
```

- First section: no border or spacing
- Subsequent sections: `mt-6` (margin-top), `pt-3` (padding-top), `border-t` (top border)

### 3. Add Tag Functionality

**Approach:** Reuse existing `AddTagDialog` component
**Rationale:** Consistent with settings page, immediate save behavior matches toggle behavior

**Components:**
- Button: Small ghost button with Plus icon, placed inline with tags
- Dialog: Existing `AddTagDialog` component
- Hook: `useCreateTag` for immediate persistence

**State Management:**
```tsx
const [addTagDialog, setAddTagDialog] = useState<string | null>(null) // stores typeId
const [newTagName, setNewTagName] = useState('')
const createTag = useCreateTag()
```

**Handler:**
```tsx
const handleAddTag = () => {
  if (addTagDialog && newTagName.trim()) {
    createTag.mutate({
      name: newTagName.trim(),
      typeId: addTagDialog,
    })
    setNewTagName('')
    setAddTagDialog(null)
  }
}
```

## User Flow

1. User views item tags page with Title Case tag type names and dividers
2. User clicks "+ Add Tag" button in any tag type section
3. Dialog opens, user enters new tag name
4. Tag is created and immediately appears in the list
5. Dialog closes automatically

## Implementation Notes

**File:** `/src/routes/items/$id/tags.tsx`

**New Imports:**
```tsx
import { Plus } from 'lucide-react'
import { AddTagDialog } from '@/components/AddTagDialog'
import { Button } from '@/components/ui/button'
import { useCreateTag } from '@/hooks'
```

**No new components needed** - reuses existing `AddTagDialog`

**Scope limitation:** Only supports adding tags (not tag types) from item page. Users must go to Settings to create new tag types.

## Design Rationale

- **Minimal approach:** Small, focused changes that enhance without overcomplicating
- **Consistency:** Reuses existing components and patterns from settings page
- **Lightweight:** Keeps item page simple compared to settings page
- **Immediate feedback:** No save button needed, consistent with existing toggle behavior
