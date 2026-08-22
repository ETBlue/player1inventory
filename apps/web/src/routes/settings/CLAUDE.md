### Known gap — the Items tabs still leak location-scoped stock

Settings entities (tags, vendors, recipes, shelves) are **global**, and the four
`…/$id/items` assignment tabs are meant to be too. They still classify with a bare
`isInactive()` over `useItems()`, which joins every item against the **active
location's** `ItemStock` — so an item stocked only elsewhere arrives zeroed and
reads as inactive on a page that should not know about locations at all.

The v16 field move (stock configuration onto `Item` — see `src/db/CLAUDE.md`) is
**part 1** of the fix and does not close this: `targetQuantity`, which
`isInactive` reads, is deliberately still per-location. **Part 2** (issue #247)
rescopes these pages. The gap is real in the window between the two PRs.

### Cascade Deletion

Deleting a tag, tag type, or vendor automatically cleans up all item references:

- **Delete tag** → removes tag from all item `tagIds` arrays (+ bumps `updatedAt`)
- **Delete tag type** → deletes all child tags (which cascade to items), then deletes the type
- **Delete vendor** → removes vendor from all item `vendorIds` arrays (+ bumps `updatedAt`)
- **Delete location** → deletes that location's `ItemStock` rows, its `inventoryLogs`, and its carts + cart items; the default location (`'local'`) cannot be deleted. Global `Item`s survive — see `settings/locations/CLAUDE.md`

**Local mode:** Cascade logic lives in `src/db/operations.ts` (`deleteTag`, `deleteTagType`, `deleteVendor`). The hooks (`useDeleteTag`, `useDeleteTagType`, `useDeleteVendor`) also invalidate the `['items']` query cache after deletion.

**Cloud mode:** Cascade is handled server-side in the GraphQL resolvers (`apps/server/src/resolvers/tag.resolver.ts`, `vendor.resolver.ts`) using Prisma `deleteMany` / `updateMany` — no extra client-side cleanup needed.

**Count helpers** for confirmation dialogs: `getItemCountByTag`, `getItemCountByVendor`, `getTagCountByType` in `src/db/operations.ts`; corresponding hooks `useItemCountByTag`, `useItemCountByVendor`, `useTagCountByType`.
