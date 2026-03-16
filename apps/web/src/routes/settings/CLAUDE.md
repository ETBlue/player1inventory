### Cascade Deletion

Deleting a tag, tag type, or vendor automatically cleans up all item references:

- **Delete tag** → removes tag from all item `tagIds` arrays (+ bumps `updatedAt`)
- **Delete tag type** → deletes all child tags (which cascade to items), then deletes the type
- **Delete vendor** → removes vendor from all item `vendorIds` arrays (+ bumps `updatedAt`)

**Local mode:** Cascade logic lives in `src/db/operations.ts` (`deleteTag`, `deleteTagType`, `deleteVendor`). The hooks (`useDeleteTag`, `useDeleteTagType`, `useDeleteVendor`) also invalidate the `['items']` query cache after deletion.

**Cloud mode:** Cascade is handled server-side in the GraphQL resolvers (`apps/server/src/resolvers/tag.resolver.ts`, `vendor.resolver.ts`) using MongoDB `$pull` — no extra client-side cleanup needed.

**Count helpers** for confirmation dialogs: `getItemCountByTag`, `getItemCountByVendor`, `getTagCountByType` in `src/db/operations.ts`; corresponding hooks `useItemCountByTag`, `useItemCountByVendor`, `useTagCountByType`.
