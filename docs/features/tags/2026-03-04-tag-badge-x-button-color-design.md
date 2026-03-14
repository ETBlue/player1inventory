# Design: Tag Badge X Button Color Match

**Date:** 2026-03-04
**Status:** Approved

## Problem

In Settings > Tags, each tag badge has a colored border (e.g. `border-blue` for a blue tag type), but the adjacent X (delete) button always uses `neutral-outline` styling — giving it a gray border regardless of the tag color. This creates a visual inconsistency.

## Solution

Override the border and icon color on the X button's `buttonClassName` using the tag type's color dynamically.

**File:** `src/routes/settings/tags/index.tsx`
**Component:** `DraggableTagBadge`

**Change:**
```tsx
// Before
buttonClassName="h-5 rounded-full rounded-tl-none rounded-bl-none -ml-px"

// After
buttonClassName={`h-5 rounded-full rounded-tl-none rounded-bl-none -ml-px border-${tagType.color} text-${tagType.color}`}
```

The `cn()` / tailwind-merge setup in `Button` will override `border-neutral text-neutral` from `neutral-outline` with the dynamic color classes.

## Why This Approach

- Consistent with existing dynamic class pattern in the same file (`bg-${tagTypeColor}` in `DroppableTagTypeCard`)
- Single-line change, no new components or button variants needed
- Scope is minimal: one file, one prop

## Result

The X button retains its transparent background (outline style) but its border and icon color match the tag badge — e.g. a blue tag gets a blue-bordered X button instead of gray.
