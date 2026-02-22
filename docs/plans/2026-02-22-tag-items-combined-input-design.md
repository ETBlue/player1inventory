# Design: Combined Search + Create Input for Tag Items Tab

**Date:** 2026-02-22
**Status:** Approved

## Overview

Apply the same combined search+create input pattern (previously implemented for the vendor items tab in PR #47) to the tag detail page's Items tab.

## UI & Interaction

Identical to the vendor items tab:

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
- Press `Escape` → clears the input
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
  tagIds: [tagId],          // pre-assigned to this tag
  vendorIds: [],
  targetUnit: 'package',
  targetQuantity: 1,
  refillThreshold: 1,
  packedQuantity: 0,
  unpackedQuantity: 0,
  consumeAmount: 1,
})
// on success: setSearch(''), refocus input ref
```

## Files Changed

| File | Change |
|------|--------|
| `src/routes/settings/tags/$id/items.tsx` | Remove `isCreating`/`newItemName` state and handlers; add `inputRef`, `handleCreateFromSearch`, `handleSearchKeyDown`; update JSX (remove `+ New` button and inline input row; add `+ Create` row; update placeholder; update empty-state conditions) |
| `src/routes/settings/tags/$id/items.test.tsx` | Create new file — extract Items Tab tests from `$id.test.tsx`, update for new combined input pattern |
| `src/routes/settings/tags/$id.test.tsx` | Remove `describe('Tag Detail - Items Tab', ...)` block; fix 3 placeholder refs (`/search items/i` → `/search or create item/i`) in Info Tab and Tab Navigation tests |

## Test Coverage

New/updated tests in `$id/items.test.tsx`:

- User can see all items in the checklist
- User can see already-assigned items as checked
- User can filter items by name (updated placeholder)
- User can assign this tag to an item by clicking the checkbox
- User can remove this tag from an item by clicking the checkbox
- User can see other tags as badges on items
- User can create an item by typing a name and pressing Enter (rewritten — types directly into combined input)
- User sees a create row only when search has text and zero items match (new)
- User can create an item by clicking the create row (new)
- User can clear the search by pressing Escape (new)
- User does not see the New button (new)
- Shows "No items yet" when there are no items
- Shows "No items found" when search has no matches (updated placeholder)
