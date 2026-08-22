### The Items tabs are global assignment pages

Settings entities (tags, vendors, recipes, shelves) are **global**, and so are the
four `…/$id/items` assignment tabs that attach items to them. Since issue #247
part 2 those tabs neither read nor write the active location's stock.

Three rules, all four tabs alike
(`settings/{tags,vendors,recipes}/$id/items.tsx`, `settings/shelves/$shelfId/items.tsx`):

1. **No stock is rendered.** Each passes `showStock={false}` to `ItemCard`,
   which suppresses all five stock-derived renderings — the quantity text, the
   `UnitBadge`, the `ItemProgressBar`, the **severity card tint** and the
   **inactive dimming**. The last two are styling rather than content and are
   exactly what a partial gate misses: a card still tinted red or still dimmed
   is still leaking one location's state onto a global page. See
   `components/CLAUDE.md`.

2. **Two buckets, not four.** Rows are ordered *assigned, then unassigned*, each
   keeping the toolbar's sort order. There is deliberately **no** active/inactive
   split: "inactive" is `targetQuantity === 0`, which stayed per-location after
   the v16 field move (see `src/db/CLAUDE.md`), so it has no global meaning here.
   Worse, `useItems()` joins the **active** location, so an item stocked only
   elsewhere arrives zeroed and a bare `isInactive()` would sink it — the
   `stockId` trap documented in `lib/quantityUtils.ts`. Removing the bucketing
   removed four instances of that trap; do not reintroduce `isInactive` on these
   pages.

3. **Create-from-search creates globally and stocks nowhere.** Typing a name
   that matches nothing offers `+ Create "<name>"`; the new item lands in the
   catalog attached to this entity, with **no `ItemStock` row in any location**.
   The tags/vendors/recipes tabs get this by passing `catalogOnly` to
   `NewItemDialog`; the shelves tab bypasses the dialog and passes
   `useCreateItem({ catalogOnly: true })` at its own call site. It is opt-in
   rather than the default because the pantry's Add flow shares the same dialog
   and must keep stocking here. The created item is an intentional **orphan** —
   already a supported state: `getAllItems` surfaces it with `ZERO_STOCK` and no
   `stockId`, `getStockedItems` (and therefore the pantry) excludes it, and the
   Add combobox finds it.

**Known follow-up (not fixed):** `NewItemDialog`'s *select-existing* path still
stocks the chosen item in the active location via `useAddItemToLocation()`, so on
a Settings tab **create-new stocks nowhere while select-existing stocks here**.
`catalogOnly` deliberately governs the create path only. Closing the gap also
means reworking the combobox's `aria-disabled` "already here" rendering and
`isSelectable`, which are built on the same stocking assumption. Recorded in the
design doc (`docs/features/settings/2026-08-23-design-global-settings-pages.md`).

### Shelf filters tab shows global counts

`settings/shelves/$shelfId/filters.tsx` renders ` (N)` after every tag, vendor
and recipe badge, so the user can see how many items each filter option selects.
The counts come from the map-shaped hooks `useTagItemCounts()`,
`useVendorItemCounts()` and `useRecipeItemCounts()` (`src/hooks/CLAUDE.md`) —
per-id helpers like `getItemCountByTag` are one async query each and cannot be
called in a badge loop.

**The tag count expands descendants.** The shelf tag filter selects a tag *and
all its descendants* (`lib/shelfUtils.ts`, `getTagAndDescendantIds`), so a
direct-assignment count would report 0 for a parent tag that in fact selects a
dozen items. `useTagItemCounts()` runs the same expansion; vendors and recipes
have no hierarchy and count plain membership.

These are **per-entity** counts ("how many items carry this tag"), not a preview
of the composed filter — whose real semantics are OR-within-tag-type,
AND-between-types.

### Cascade Deletion

Deleting a tag, tag type, or vendor automatically cleans up all item references:

- **Delete tag** → removes tag from all item `tagIds` arrays (+ bumps `updatedAt`)
- **Delete tag type** → deletes all child tags (which cascade to items), then deletes the type
- **Delete vendor** → removes vendor from all item `vendorIds` arrays (+ bumps `updatedAt`)
- **Delete location** → deletes that location's `ItemStock` rows, its `inventoryLogs`, and its carts + cart items; the default location (`'local'`) cannot be deleted. Global `Item`s survive — see `settings/locations/CLAUDE.md`

**Local mode:** Cascade logic lives in `src/db/operations.ts` (`deleteTag`, `deleteTagType`, `deleteVendor`). The hooks (`useDeleteTag`, `useDeleteTagType`, `useDeleteVendor`) also invalidate the `['items']` query cache after deletion.

**Cloud mode:** Cascade is handled server-side in the GraphQL resolvers (`apps/server/src/resolvers/tag.resolver.ts`, `vendor.resolver.ts`) using Prisma `deleteMany` / `updateMany` — no extra client-side cleanup needed.

**Count helpers** for confirmation dialogs: `getItemCountByTag`, `getItemCountByVendor`, `getTagCountByType` in `src/db/operations.ts`; corresponding hooks `useItemCountByTag`, `useItemCountByVendor`, `useTagCountByType`.
