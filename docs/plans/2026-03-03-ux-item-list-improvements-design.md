# UX Item List Improvements — Design

Date: 2026-03-03

## Overview

Two UX improvements to item list pages:

1. **Checked items on top** — in tag/vendor/recipe items tabs, assigned items always float to the top of the list
2. **Sort staleness fix** — after editing an item's quantity or expiration and returning to any list page, the sort order reflects the updated data immediately

---

## Feature A: Checked Items On Top

### Context

Tag, vendor, and recipe items tabs are assignment pages where users check/uncheck items to assign them. Currently, checked (assigned) and unchecked (unassigned) items are sorted together. This makes it hard to see current assignments at a glance.

### Design

After the existing two-branch filter pipeline produces a sorted list, split by assignment status and concatenate:

```typescript
// Existing: items are filtered and sorted by active sort field
const sortedItems = sortItems(filteredOrSearchedItems, ...)

// New: float assigned items to top, preserving sort order within each group
const assignedItems = sortedItems.filter(item => isAssigned(item.tagIds))
const unassignedItems = sortedItems.filter(item => !isAssigned(item.tagIds))
const displayItems = [...assignedItems, ...unassignedItems]
```

- Both groups maintain their relative sort order from `sortItems`
- The split applies regardless of which sort field is active
- Behavior is fixed (not a user toggle)

### Affected Files

- `src/routes/settings/tags/$id/items.tsx`
- `src/routes/settings/vendors/$id/items.tsx`
- Recipe items tab (to be identified during implementation)

---

## Feature B: Sort Staleness Fix

### Root Cause

Item list pages define three TanStack Query sort queries alongside the main items query:

- `['items', 'quantities']` — computes quantity per item for stock sort
- `['items', 'expiryDates']` — computes expiry dates (async DB lookups) for expiring sort
- `['items', 'purchaseDates']` — computes last purchase dates (async DB lookups) for purchased sort

When an item is saved, `useUpdateItem` calls `invalidateQueries(['items'])`, which invalidates all four queries simultaneously. They all refetch in parallel. The sort queries' `queryFn` captures the `items` array from the React closure — but at that moment, the main items query hasn't resolved yet, so the closure still holds the old items. Sort data is always one version behind.

### Design

Three targeted changes per affected page:

**1. `quantities` → `useMemo`**

Quantities are a pure synchronous computation from the items array. Converting to `useMemo` eliminates the race entirely:

```typescript
const quantities = useMemo(() => {
  const map = new Map<string, number>()
  for (const item of items ?? []) {
    map.set(item.id, getCurrentQuantity(item))
  }
  return map
}, [items])
```

**2. `expiryDates` → items-derived queryKey**

Expiry dates require async DB lookups (`getLastPurchaseDate`) so they stay as a TanStack Query. The queryKey includes fields from items that affect expiry computation:

```typescript
const expiryKey = (items ?? [])
  .map(i => `${i.id}:${String(i.dueDate)}:${String(i.estimatedDueDays)}`)
  .join(',')

const { data: allExpiryDates } = useQuery({
  queryKey: ['sort', 'expiryDates', expiryKey],
  queryFn: async () => { /* same queryFn, items closure is now guaranteed fresh */ },
})
```

When items update, `expiryKey` changes → new queryKey → cache miss → queryFn runs with fresh items.

**3. `purchaseDates` → items-derived queryKey**

Purchase dates depend on purchase logs (not item fields), so only item IDs are needed in the key:

```typescript
const purchaseKey = (items ?? []).map(i => i.id).join(',')

const { data: allPurchaseDates } = useQuery({
  queryKey: ['sort', 'purchaseDates', purchaseKey],
  queryFn: async () => { /* same queryFn */ },
})
```

The checkout mutation should also invalidate `['sort', 'purchaseDates']` to update sort after shopping.

### Affected Pages

The fix pattern applies to all item list pages. Each page will be audited during implementation to confirm which sort queries it defines:

- `src/routes/index.tsx` (pantry)
- `src/routes/shopping.tsx`
- `src/routes/settings/tags/$id/items.tsx`
- `src/routes/settings/vendors/$id/items.tsx`
- Recipe items tab
