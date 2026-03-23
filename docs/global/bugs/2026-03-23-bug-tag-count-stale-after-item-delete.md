# Bug: Tag Item Count Stale After Item Deletion (Cloud Mode)

## Bug Description

In the settings tags page, when an item is deleted, the item count displayed for each tag does not update in **cloud mode**. The stale count persists until the page is manually refreshed.

This affects the delete confirmation dialog (which shows "X items use this tag") and the badge count display.

Local mode is unaffected — `invalidateQueries({ queryKey: ['items'] })` covers the tag count query via prefix matching.

## Root Cause

`useDeleteItemMutation` in `apps/web/src/hooks/useItems.ts` only included `GetItemsDocument` and `GetRecipesDocument` in its `refetchQueries` list. The tag item count is fetched via a dedicated Apollo query (`ItemCountByTagDocument`), which was not in the list, so it stayed stale after item deletion.

Vendor counts are unaffected because `useVendorItemCounts()` derives counts client-side from `useItems()` data — it automatically recomputes when `GetItemsDocument` is refetched.

Note: A client-side derivation approach (like vendors) was considered but rejected because pagination is planned. Client-side derivation would break when items are paginated.

## Fix Applied

Extended `buildRefetchQueries` in `apps/web/src/hooks/useItems.ts` to accept an optional `tagIds?: string[]` parameter (mirrors the existing `vendorIds?: string[]` pattern). Spreads per-tag `{ query: ItemCountByTagDocument, variables: { tagId } }` entries into the refetch list.

Updated the `handleDelete` call-site in `apps/web/src/routes/items/$id/index.tsx` to pass `tagIds: item.tagIds` alongside the existing `vendorIds`.

## Test Added

`apps/web/src/hooks/useItems.test.ts` — new test:
`"refetches ItemCountByTagDocument for each tagId when deleting in cloud mode"`

Verifies that `cloudDelete` is called with `refetchQueries` containing the correct per-tag entries.

## PR / Commit

Part of `fix/cloud-mode-bugs` branch.
