# Design: Vendor Items Immediate Save on Checkbox Click

**Date:** 2026-02-19
**Status:** Approved

## Problem

The vendor items tab (`/settings/vendors/$id/items`) uses a staged state pattern: checkbox clicks accumulate in a `toggled` map and nothing is persisted until the user clicks the Save button. This is inconsistent with the tags tab on item detail, which saves immediately on click.

## Goal

Make each checkbox click immediately save the vendor assignment change. Remove the Save button.

## Approach

**Option A — Immediate mutate** (chosen). Each `handleToggle` call fires `updateItem.mutateAsync` directly instead of updating a local `toggled` map. Matches the established pattern used by the Tags tab on item detail.

## Design

### Changes to `src/routes/settings/vendors/$id/items.tsx`

**Remove:**
- `toggled` state map and all logic that reads/writes it
- `isDirty` derived value and the `useEffect` that calls `registerDirtyState`
- `handleSave` function
- The Save `<Button>` at the bottom of the list

**Update `handleToggle`:**
- Compute new `vendorIds` array (add or remove current vendor)
- Call `updateItem.mutateAsync` directly

**Disable checkbox during mutation:**
- Track which item IDs are currently saving (local `Set` state or per-item pending flag)
- Disable the checkbox for any item with a pending mutation
- This prevents race conditions when migrating to a real backend in the future

**Simplify `isAssigned`:**
- Remove the `toggled` overlay logic
- Read directly from `item.vendorIds`

### Changes to `src/hooks/useVendorLayout.tsx`

None. The Items tab simply stops calling `registerDirtyState`, so the navigation guard continues to work — it will only fire when the Info tab has unsaved vendor name changes.

### No changes to

- `+ New` inline item creation flow
- Search input
- Parent layout navigation guard (`$id.tsx`)
- Info tab (`$id/index.tsx`)

## Trade-offs

- Individual mutation per click (not batched). Rapid clicks on the same item are prevented by disabling the checkbox while its mutation is in-flight.
- Backend-safe: `isPending` guard protects against race conditions after future IndexedDB → backend migration.
