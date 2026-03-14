# Design: Combined Search + Create Input for Vendor Items Tab

**Date:** 2026-02-21
**Status:** Approved

## Overview

Replace the two-element toolbar (search input + `+ New` button that opens a second inline row) with a single combined input that handles both searching existing items and creating new ones.

## UI & Interaction

The toolbar row changes from two elements to a single full-width input:

```
Before:
[ Search items...              ] [ + New ]

After:
[ Search or create item...                ]
```

**Normal state** (input empty or has text with ≥1 match): shows matching items as checkboxes, no create row.

**Zero-match state** (typed text matches no items): shows a single `+ Create "<name>"` row in place of the list.

```
[ xyz                                     ]

  + Create "xyz"
```

**Interactions:**
- Click `+ Create "<name>"` row → creates item, clears input, refocuses input
- Press `Enter` when zero-match row is shown → same as clicking it
- Press `Escape` → clears the input, returns to full list
- Empty input → full list shown, no create row

## State Changes

Remove:
- `isCreating: boolean`
- `newItemName: string`

The existing `search` string state doubles as the creation input. No new state variables needed.

## Data Flow

Same `useCreateItem` call as today, using `search.trim()` as the item name:

```ts
createItem.mutateAsync({
  name: search.trim(),
  vendorIds: [vendorId],
  tagIds: [],
  targetUnit: 'package',
  targetQuantity: 1,
  refillThreshold: 1,
  packedQuantity: 0,
  unpackedQuantity: 0,
  consumeAmount: 1,
})
// on success: setSearch(''), refocus input ref
```

After success, TanStack Query cache invalidation (already in `useCreateItem`) re-fetches items; the new item appears alphabetically with its checkbox checked.

## Files Changed

| File | Change |
|------|--------|
| `src/routes/settings/vendors/$id/items.tsx` | Remove `isCreating`/`newItemName` state; remove `+ New` button and inline input row; add `+ Create` row in filtered list when zero matches; update placeholder; add input ref for refocus |

## Testing

- User sees `+ Create "<name>"` row only when search has text and zero items match
- User can create an item by clicking the create row
- User can create an item by pressing Enter when the create row is visible
- After creation, input is cleared and refocused
- Pressing Escape clears the input and returns to full list
- `+ New` button and secondary inline input are gone
- Existing search behavior is unchanged (items still filter as user types)
