# Vendor Item Bulk Assignment — Design

**Date:** 2026-02-19
**Feature:** User can apply a vendor to multiple items at the same time

## Overview

Add a vendor detail page at `/settings/vendors/$id` with two tabs — Info and Items — following the same tabbed pattern as the item detail page. The Items tab provides a searchable checklist of all items with an explicit Save button, allowing the user to assign or remove this vendor from multiple items in one operation.

## Routes

```
src/routes/settings/vendors/$id.tsx         ← parent layout (tabs + back button)
src/routes/settings/vendors/$id/index.tsx   ← Info tab (vendor name editing)
src/routes/settings/vendors/$id/items.tsx   ← Items tab (item checklist)
```

- `/settings/vendors/$id` redirects to the Info tab (index)
- Back button navigates to `/settings/vendors`
- Vendor name shown as the page heading in the parent layout

## Entry Point

`VendorCard` gains a link on the vendor name (or the card itself) that navigates to `/settings/vendors/$id`. The existing edit and delete buttons remain unchanged.

## Info Tab

- Single editable name field, pre-populated from vendor data
- Save button calls `useUpdateVendor` — disabled when no changes
- Dirty state reported to parent layout context

## Items Tab

**Data loading:**
- All items via `useItems()`
- All vendors via `useVendors()` (for rendering vendor badges on each row)

**UI layout:**
```
[ Search box: "Search items..." ]

☑ Milk          Costco
☐ Eggs          Costco  Trader Joe's
☑ Butter
☐ Olive Oil     Whole Foods
...

[ Save ]  (disabled when no changes)
```

**Each row:**
- Checkbox (checked if this vendor is in `item.vendorIds`)
- Item name
- Small vendor badges for all other vendors already assigned to this item
- Rows sorted alphabetically by item name

**Search:**
- Text input filters visible rows by item name
- Hidden rows retain their staged checkbox state (filtering is display-only)

**Save behavior:**
- Computes delta: which items had this vendor added vs. removed
- Calls `updateItem` concurrently (`Promise.all`) for only the changed items
- On success: marks form clean
- On error: shows error message, leaves form dirty for retry

## Dirty State & Navigation Guard

- Parent layout provides a `useVendorLayout` context (same pattern as `useItemLayout`)
- Each tab registers whether it has unsaved changes
- Switching tabs with unsaved changes shows a "Discard / Cancel" confirmation dialog

## Data Operations

No new database operations required. `updateItem(id, { vendorIds: [...] })` already handles partial updates including `vendorIds`.

The Items tab computes the new `vendorIds` array per changed item:
- **Adding this vendor:** `[...existingVendorIds, thisVendorId]`
- **Removing this vendor:** `existingVendorIds.filter(id => id !== thisVendorId)`

## Files to Create

- `src/routes/settings/vendors/$id.tsx`
- `src/routes/settings/vendors/$id/index.tsx`
- `src/routes/settings/vendors/$id/items.tsx`
- `src/hooks/useVendorLayout.tsx`

## Files to Modify

- `src/components/VendorCard.tsx` — add navigation link to vendor detail page
