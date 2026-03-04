# Inactive Items Sort Design

Date: 2026-03-03

## Overview

Two improvements to how inactive items behave across all item list pages:

1. **Inactive items at bottom** — all item list pages place inactive items at the bottom, matching pantry's existing behavior
2. **Inactive items stock sort** — when sorting by stock, inactive items use a binary 100%/0% progress instead of the normal stock calculation

**What makes an item inactive:** `isInactive(item)` from `src/lib/quantityUtils.ts` — returns `true` when `targetQuantity === 0 && refillThreshold === 0`.

---

## Feature 1: Inactive Items at Bottom

The pantry page already implements this. All other item list pages need to match.

### Non-assignment pages (shopping)

Copy the pantry's existing pattern exactly. After `sortItems`, split and render:

```typescript
const activeItems = sortedItems.filter((item) => !isInactive(item))
const inactiveItems = sortedItems.filter((item) => isInactive(item))
```

Render order: `activeItems` → "N inactive items" count label → `inactiveItems`

The count label uses the same markup as the pantry:
```tsx
{inactiveItems.length > 0 && (
  <div className="bg-background-surface px-3 py-2 text-foreground-muted text-center text-sm">
    {inactiveItems.length} inactive item{inactiveItems.length !== 1 ? 's' : ''}
  </div>
)}
```

### Assignment tabs (tag items, vendor items, recipe items)

Assignment takes priority over inactive status. Inactive items sink to the bottom of their respective group. No explicit count label — the existing `opacity-50` visual treatment on inactive `ItemCard` components provides the cue.

After `sortItems`, split into four buckets:

```typescript
const assignedActive     = sortedItems.filter(item => isAssigned(item) && !isInactive(item))
const assignedInactive   = sortedItems.filter(item => isAssigned(item) && isInactive(item))
const unassignedActive   = sortedItems.filter(item => !isAssigned(item) && !isInactive(item))
const unassignedInactive = sortedItems.filter(item => !isAssigned(item) && isInactive(item))
const filteredItems = [
  ...assignedActive,
  ...assignedInactive,
  ...unassignedActive,
  ...unassignedInactive,
]
```

Render order: assigned-active → assigned-inactive → unassigned-active → unassigned-inactive

### Affected files

- `src/routes/shopping.tsx` — add active/inactive split + count label
- `src/routes/settings/tags/$id/items.tsx` — replace two-bucket split with four-bucket split
- `src/routes/settings/vendors/$id/items.tsx` — same
- `src/routes/settings/recipes/$id/items.tsx` — same (already has pre-sort split; restructure accordingly)

---

## Feature 2: Inactive Items Stock Sort

**File:** `src/lib/sortUtils.ts`

When sorting by stock, inactive items (targetQuantity === 0, refillThreshold === 0) cannot use the normal `quantity / targetQuantity` progress (division by zero). Instead:

- **Inactive + quantity > 0** → progress treated as `1.0` (100%)
- **Inactive + quantity = 0** → progress treated as `0.0` (0%)

Status rank stays `'ok'` for inactive items (they always meet their 0 refill threshold). This means:
- Within the inactive section, items with any stock sort before empty inactive items (sort desc/best-first)
- Inactive items do not mix with active items' error/warning buckets

**Implementation:** In the stock sort comparator in `sortItems`, override the progress calculation for inactive items:

```typescript
import { isInactive } from '@/lib/quantityUtils'

// In stock sort, for each item:
const rawProgress = (quantities.get(item.id) ?? 0) / item.targetQuantity
const progress = isInactive(item)
  ? (quantities.get(item.id) ?? 0) > 0 ? 1 : 0
  : rawProgress
```

Requires adding `import { isInactive } from '@/lib/quantityUtils'` to `sortUtils.ts`.
