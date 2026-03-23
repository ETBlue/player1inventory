# Bug: Item Tags Tab — New Tag Not Auto-Assigned to Item

## Bug Description

In the item detail tags tab, when a user creates a new tag via the "New Tag" dialog, the tag is created but **not automatically assigned to the current item**. The user must manually click the new tag badge to assign it.

This differs from the vendor tab (and recipe tab) behavior, where creating a new entity immediately assigns it to the current item.

## Root Cause

`handleAddTag` in `apps/web/src/routes/items/$id/tags.tsx` called `createTag.mutate()` (fire-and-forget) without waiting for the result or calling `updateItem.mutate()` with the new tag's ID. The vendor tab uses `createVendor.mutateAsync()` and follows up with an `updateItem.mutate()` call.

## Fix Applied

Changed `handleAddTag` in `apps/web/src/routes/items/$id/tags.tsx` to:
- Use `createTag.mutateAsync()` (awaits result)
- After success, call `updateItem.mutate({ id, updates: { tagIds: [...item.tagIds, newTag.id] } })` to immediately assign the new tag

Matches the existing pattern in `vendors.tsx`.

## Test Added

`apps/web/src/routes/items/$id/tags.test.tsx` — new test:
`"user can create a new tag and it is automatically assigned to the item"`

Verifies that after creating a tag via the dialog, the item's `tagIds` in IndexedDB contains the new tag's ID.

## PR / Commit

Part of `fix/cloud-mode-bugs` branch.
