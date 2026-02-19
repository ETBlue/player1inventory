# Design: Create New Items from Vendor Items Page

**Date:** 2026-02-19
**Status:** Approved

## Overview

Users can create a new inventory item directly from the vendor detail page's Items tab. The new item is immediately assigned to the current vendor.

## UI & Interaction

A `+ New` button appears to the right of the existing search input. Clicking it opens an inline input row between the search bar and the item list:

```
[ Search items...              ] [ + New ]
[ _________________________________ ] [✓] [✗]   ← inline input, when open
─────────────────────────────────────────
  ☑ Apples
  ☐ Bananas
  ...
```

- **Enter** or clicking ✓ confirms creation
- **Escape** or clicking ✗ cancels
- Empty name cannot be submitted (confirm button disabled)
- While `isPending`, the confirm button is disabled
- On error, the input stays open with an inline error message

## Data Flow

Only `src/routes/settings/vendors/$id/items.tsx` changes.

On confirm, `useCreateItem` is called with:

```ts
createItem.mutate({
  name,                    // from the input
  vendorIds: [vendorId],   // pre-assigned to this vendor
  tagIds: [],
  targetUnit: 'package',
  targetQuantity: 1,
  refillThreshold: 1,
  packedQuantity: 0,
  unpackedQuantity: 0,
  consumeAmount: 1,
})
```

After success:
- The inline input collapses; the row returns to search + `+ New`
- TanStack Query cache invalidation (already in `useCreateItem`) re-fetches items; the new item appears alphabetically with its checkbox checked
- The `toggled` staged state is untouched — pending assignments/unassignments are preserved

## Files Changed

| File | Change |
|------|--------|
| `src/routes/settings/vendors/$id/items.tsx` | Add `+ New` button, inline input state, `useCreateItem` call |

## Testing

New test cases for the vendor items tab:

- User can open the inline input by clicking `+ New`
- User can create an item by typing a name and pressing Enter
- Created item appears in the list with its checkbox checked (assigned to the vendor)
- Created item has `vendorIds` containing the current vendor ID
- Pressing Escape cancels creation without creating an item
- Empty name cannot be submitted (confirm disabled)
- Existing staged changes (`toggled` state) are preserved after creation
