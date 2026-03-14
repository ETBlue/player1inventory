# Cascade Deletion Design

**Date:** 2026-02-20

## Problem

Deleting a tag, tag type, or vendor leaves stale references in items:
- Items keep deleted `tagIds` in their array
- Items keep deleted `vendorIds` in their array
- The vendor delete dialog incorrectly claims items are unaffected

Tag type deletion partially works: the UI manually loops and calls `deleteTag`, but misses cleaning up item references.

## Approach

Cascade logic lives in the **operations layer** (`src/db/operations.ts`). This is the right layer for data integrity logic, and is a clean cut when migrating to a real backend (operations.ts gets replaced by API calls; cascade is handled by DB foreign key constraints instead).

## Design

### 1. `src/db/operations.ts`

**`deleteTag(id)`**
1. Find all items where `tagIds.includes(id)`
2. Update each: remove id from `tagIds`, bump `updatedAt`
3. Delete the tag record

**`deleteTagType(id)`**
1. Get all tags where `typeId === id`
2. Call `deleteTag(tag.id)` for each (cascades to items)
3. Delete the tag type record

**`deleteVendor(id)`**
1. Find all items where `vendorIds?.includes(id)`
2. Update each: remove id from `vendorIds`, bump `updatedAt`
3. Delete the vendor record

Add two new read operations for dialog impact counts:
- `getItemCountByVendor(vendorId)` — count items with that vendorId (mirrors existing `getItemCountByTag`)
- `getTagCountByType(typeId)` — count tags under a tag type

### 2. `src/hooks/useTags.ts` + `src/hooks/useVendors.ts`

After each delete mutation succeeds, also invalidate `['items']` so item list and detail pages reflect removed tag/vendor immediately.

Add new query hooks for impact counts:
- `useItemCountByVendor(vendorId)` — mirrors `useItemCountByTag`
- `useTagCountByType(typeId)` — for tag type delete dialog

### 3. UI — confirmation dialog text

**Delete tag** (`TagDetailDialog`):
> "This will remove '[Tag]' from N items."

**Delete tag type** (`tags.tsx` ConfirmDialog):
> "This will delete '[Type]' and its N tags, removing them from all assigned items."

**Delete vendor** (`vendors/index.tsx` ConfirmDialog):
> "This will remove '[Vendor]' from N items."
*(replaces current "Items assigned to this vendor will not be affected.")*

### 4. `src/routes/settings/tags.tsx`

Remove the manual tag-deletion loop in `handleDeleteTagType` — it is now redundant since `deleteTagType` in operations.ts handles child tag cleanup.

## Out of Scope

- No Dexie transactions (not the current pattern; backend migration will provide atomicity via FK constraints)
- No undo/restore functionality
