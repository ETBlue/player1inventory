# Plan — Location entity (implementation)

**Design:** `2026-06-11-locations-design.md` · **Brainstorming:** `2026-06-11-brainstorming-locations.md`
**Branch:** `worktree-feature-locations` (rebased on `main` after PR #1 / item-detail-tabs merged)
**Prereq landed:** PR #1 — item-detail tab restructure (Stock tab exists at `/items/$id/stock`; `Item` has `wikidataUrl`/`note`). Dexie is at **v13**.

## Approach

Local-first. Five sequential PRs, ordered so the inert scaffolding (the entity, then the switcher) lands first and the dead family-group code is removed, *before* the invasive `Item → Item + ItemStock` split — at which point the switcher and locations already exist to plug into. TDD per phase; full verification gate after each; E2E on each PR's final step. Cloud (GraphQL/Prisma) deferred except where PR C explicitly removes family-group backend code.

> **Two Dexie migrations:** PR A bumps to **v14** (add `locations` + seed default). PR D bumps to **v15** (add `itemStocks`, migrate stock fields, `locationId` on logs, re-key carts). Incremental and independently shippable.

---

## PR A — Location entity + Settings › Locations CRUD (inert)

**Goal:** Introduce the `Location` entity and a settings page to manage it. Locations exist but affect nothing else.

1. **Types** (`packages/types/src/index.ts`): `Location` (`id`, `name`, `order`, `createdAt`, `updatedAt`); export `DEFAULT_LOCATION_ID = 'local'`.
2. **Dexie v14** (`apps/web/src/db/index.ts`): add `locations` (`id, order, name`). Upgrade fn + fresh-DB seed: create the default `Location {id:'local', name:'My Home', order:0}` if absent.
3. **Operations** (`src/db/operations.ts`): `getLocations`, `createLocation`, `updateLocation`, `deleteLocation`, `reorderLocations`. Delete is a plain row delete this PR (nothing references locations yet); the default (`'local'`) cannot be deleted. Tests in `operations.test.ts`.
4. **Hooks** (`src/hooks/useLocations.ts`): `useLocations`, `useCreateLocation`, `useUpdateLocation`, `useDeleteLocation`, `useReorderLocations` — dual-mode shape (local implemented; cloud stubbed/guarded).
5. **Settings page:** `settings/locations.tsx` (layout) + `settings/locations/index.tsx` (list) mirroring the shelves pattern; drag-reorder via `@dnd-kit` (`ShelfList`-style); add/rename/delete; default location has no delete control. Register in `settings/index.tsx` (icon + `SettingsNavCard`).
6. **i18n + stories + tests + a11y + E2E:** keys in all locales; list/dialog stories + smoke tests; add the route to `a11y.spec.ts` (light + dark); E2E for create/rename/delete/reorder + the default-undeletable guard.

**Verify:** full gate + E2E `--grep "settings|a11y"`. Nothing else in the app changes.

---

## PR B — Location switcher on pantry/shopping/cooking (inert)

**Goal:** A global active-location selector that persists and updates its label — but does **not** yet scope any data.

1. **`useActiveLocation`** (`src/hooks/`): React Context + localStorage-persisted active-location id; defaults to `'local'`; falls back to the default if the stored id no longer exists. Provider mounted near the app root.
2. **Switcher component** (shared): icon-sized trigger at the **left of the top toolbar** showing the active location name's **first letter**; dropdown lists locations by `order` + a trailing **"Manage"** → `/settings/locations`.
3. **Mount** on the pantry, shopping, and cooking toolbars. Selecting a location updates the active-location state + trigger label and persists — but every page still reads stock off `Item`, so **no displayed data changes** yet.
4. **i18n + stories + tests + a11y + E2E:** switcher stories (multiple locations, active marked); E2E that switching updates the trigger letter and persists across reload, and that "Manage" navigates to settings.

**Verify:** full gate + E2E `--grep "items|shopping|cooking|a11y"`. Behaviour otherwise unchanged.

---

## PR C — Remove the family-group feature (UI + DB)

**Goal:** Delete the untested alpha global family-group feature; per-location membership becomes the documented cloud sharing model.

1. **UI:** remove `FamilyGroupCard` (component + its render in the settings page) and any nav/strings.
2. **Client GraphQL:** remove the family-group queries/mutations (`myFamilyGroup`, `create/join/leave/disbandFamilyGroup`) and regenerate types; remove `Item.familyId` usage.
3. **Server (`apps/server`):** remove the `FamilyGroup` schema type, resolver, and Prisma model + `Item.familyId`; add a Prisma migration dropping the table/column. *(This is the "DB" removal.)*
4. **Tests + docs:** delete obsolete tests/stories; note in design docs that sharing is now per-location (cloud TODO).

**Verify:** full gate (web) + server build/typecheck + E2E `--grep "settings|a11y"`.

---

## PR D — Data-model split + migration + scoping (the big one)

**Goal:** Split stock off `Item` into per-`(item × location)` `ItemStock`, migrate, and make the switcher actually scope pantry/shopping/cooking.

1. **Types:** add `ItemStock` (id, itemId, locationId, packed/unpacked, target/threshold, units, amountPerPackage, consumeAmount, expiration fields, timestamps). Remove the stock/unit/expiration fields from `Item` (keep id, name, tagIds, vendorIds, wikidataUrl, note, timestamps).
2. **Dexie v15:** add `itemStocks` (`id, itemId, locationId, [itemId+locationId], updatedAt`); add `locationId` to `inventoryLogs`; re-key carts to `${locationId}:${vendorId|'no-vendor'}`. **Upgrade fn:** for each `Item`, create an `ItemStock` under `'local'` carrying its stock fields, then strip them; set `locationId='local'` on every log; re-key carts/cart-items.
3. **Operations/hooks:** `itemStock*` CRUD incl. **copy-on-add** (inherit all fields except packed/unpacked → 0); rewrite stock reads/writes (current qty, stock status, checkout, cooking-consume, quick-update, log queries, `lastPurchasedAt`) to use the active location's `ItemStock`; `useItemStock(itemId, locationId)`, `useItemStocks(itemId)`. Location **delete now cascades** its `ItemStock` rows, carts/cart-items, and logs (extend PR A's delete).
4. **Scope the pages** (switcher from PR B becomes live):
   - **Pantry:** show only items with an `ItemStock` in the active location; cards render that location's stock. **Add button → combobox** over all items the user can access — select existing (creates an `ItemStock` via copy-on-add) or create new (item + stock in active location). Creating an item stocks it in the active location.
   - **Shopping:** carts per `(activeLocation × vendor)`; checkout writes the active location's stock/logs.
   - **Cooking:** consume from the active location's `ItemStock`; recipe items not stocked there shown unavailable.
5. **Rewire read sites + tests/stories:** `ItemCard`, `ItemForm` stock section (still single-location on the Stock tab — pager is PR E), pantry views, shopping, cooking, `QuickUpdateDialog`, item log.

**Verify:** full gate + E2E `--grep "items|shopping|cooking|tags|vendors|recipes|a11y"`.

---

## PR E — Item-detail Stock-tab all-locations pager + docs

**Goal:** The Stock tab shows all locations.

1. **Pager** in `/items/$id/stock`: center dots (one per location) under the toolbar, left/right chevrons; opens on the active location, which stays visually marked while viewing others; current page's dot highlighted.
2. **Per page:** stocked → the stock form for that location + **"Remove from location"** (deletes that `ItemStock`, cascades its logs/cart entries); not stocked → empty state + **"Add to location"** CTA (copy-on-add).
3. **Docs:** `settings/locations/CLAUDE.md`; update `routes/CLAUDE.md` (active-location scoping), item routes CLAUDE.md (Stock pager), `db` notes (v14/v15 + ItemStock); flip the INDEX `locations` row to ✅.
4. **i18n + stories + tests + a11y + E2E:** pager states (stocked / not-stocked / active-marked); add/remove-from-location E2E.

**Verify:** full gate + E2E `--grep "items|shopping|cooking|settings|a11y"`.

---

## Cloud TODOs (deferred — documented, not built)

GraphQL/Prisma `Location` + `ItemStock` types/resolvers; per-location **member lists** + invite/join/leave (replacing the removed global `FamilyGroup`); system-wide **item/vendor/tag catalogs** backing the pantry combobox; multi-user **stock sync** per location.

## Open implementation notes (resolve in-phase)

- Exact cart re-key migration for `no-vendor` carts across locations (PR D).
- Whether the pantry combobox hides items already stocked in the active location (PR D).
- Active-vs-viewed indicator styling on the Stock-tab dots (PR E).
- Orphan items (removed from their last location) persist as global `Item`s, re-addable via the combobox — confirm pantry display (hidden) + search (PR D/E).
