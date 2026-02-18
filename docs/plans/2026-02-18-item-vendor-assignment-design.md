# Item-to-Vendor Assignment UI Design

**Date:** 2026-02-18
**Status:** Approved

## Overview

Add a Vendors tab to the item detail page (`/items/$id/vendors`) where users can assign or unassign vendors to an item by clicking toggle badges. Follows the tags tab pattern exactly.

## Decisions

- **Location:** New dedicated tab in item detail, between Tags and Log
- **Interaction:** Click-to-toggle badges, immediate save, no Save button
- **Inline create:** None — vendor creation stays in Settings → Vendors
- **Pattern:** Mirror `src/routes/items/$id/tags.tsx`

## Data Layer

No changes needed. `vendorIds?: string[]` already exists on `Item`. `updateItem` already accepts partial updates. Saving vendor assignment:

```ts
updateItem.mutate({ id, updates: { vendorIds: newVendorIds } })
```

No new DB operations or hooks required. Uses existing `useUpdateItem` and `useVendors`.

## UI / Route

### New tab icon — `src/routes/items/$id.tsx`

Add a `Store` icon tab between Tags and Log, linking to `/items/$id/vendors`. No dirty state guard needed (changes save immediately).

### New route — `src/routes/items/$id/vendors.tsx`

**When no vendors exist in the system:**
- Empty state: "No vendors yet. Add vendors in Settings → Vendors." with a link to `/settings/vendors`

**When vendors exist:**
- All vendors shown as click-to-toggle badges (sorted alphabetically)
- Assigned vendors: filled/colored style with X icon
- Unassigned vendors: outlined/ghost style
- Clicking a badge toggles assignment and immediately saves via `updateItem`
- No section headers (vendors have no type/category grouping)
- No Save button

**Tab dirty state:** None — every toggle saves immediately, no navigation guard needed.

## Testing

File: `src/routes/items/$id/vendors.test.tsx`

- `user can see all vendors on the vendors tab`
- `user can see assigned vendors highlighted`
- `user can assign a vendor to an item`
- `user can unassign a vendor from an item`
- `user can see empty state when no vendors exist`

Tab icon addition covered by existing `src/routes/items/$id.test.tsx`.

## Out of Scope

- Inline vendor creation from the vendors tab
- Vendor grouping or categorization
- Bulk assign/unassign
