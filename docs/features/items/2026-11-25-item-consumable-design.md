# Design: consumable and non-consumable items

Date: 2026-11-25. Brainstorming: `2026-11-25-brainstorming-item-consumable.md`.

## Summary

1. **Where it sits.** Every item shows a percentage bar against its target. That fits things
   that get used up. For cups or slippers the count of pieces is what matters.
2. **Relations.** Two PRs, because the web will select a new field:
   - **PR 1, server** (`feature/item-consumable-server`, from `main` at `56d7de3a`, PR into
     `main`, released on its own). One additive migration.
   - **PR 2, web** (from `develop` after `main` is merged back into it). Merged into `develop`
     only after Railway shows PR 1 deployed.
3. **What the user gets** once both are deployed: a Consumable switch on the item Info tab; a
   square count bar for non-consumables; a Consumable filter on every item list. After PR 1
   alone: nothing visible.
4. **What the developer gets:** one boolean with a safe default; the bar and the filter are
   separate components with stories.

## PR 1: server

| Part | Change |
|---|---|
| Prisma | `Item.consumable Boolean @default(true)`. Migration `ALTER TABLE "Item" ADD COLUMN "consumable" BOOLEAN NOT NULL DEFAULT true`. Every existing item becomes consumable |
| GraphQL | `Item.consumable: Boolean!`; optional `consumable: Boolean` on `CreateItemInput`, `UpdateItemInput` and the import `ItemInput` |
| Resolvers | create, update and the two item imports write it when given; an omitted value keeps the stored one (update) or the default (create, import) |
| Old bundles | the field is new output and new OPTIONAL input only, so today's web keeps working. `oldBundleCompat.test.ts` must stay green unchanged |
| `verify-migration.ts` | asserts the column exists, is NOT NULL, defaults to true, and that a row written before the migration reads `true` |

### As built: PR 1

Branch `feature/item-consumable-server`, from `main` at `56d7de3a`. Migration folder
`20261125000000_add_item_consumable`. Merged into `main` as #424 (merge `b3b419bd`) and
deployed by Railway on 2026-11-25. `develop` was then rebased onto `main`. The dev database
has the migration too.

| Part | As built |
|---|---|
| Migration | the one statement above, nothing else. No backfill and no guard: Postgres fills every existing row with `true` |
| `createItem` | writes `consumable: input.consumable ?? true`. It does not leave the value to the column default, so the tests can see it |
| `updateItem` (`buildItemUpdateData`, also used by `applyUnitSwitch`) | writes `consumable` only when it is not `undefined` and not `null`. `null` means "leave it", because the column is `NOT NULL` |
| `bulkCreateItems`, `bulkUpsertItems` | `consumable ?? true`, in `create` AND in `update`. A replace takes the file's value, and a file with no value means "consumable", so a replace with no value writes `true` (owner decision 2026-11-25: keep this) |
| Read | no new code. `toGraphQL` (`item.resolver.ts`) and `itemToGraphQL` (`import.resolver.ts`) spread the Prisma row, and every field that returns `Item` goes through one of them |
| `oldBundleCompat.test.ts` | **this table's row above was wrong.** graphql-js reports every new optional input field as a "dangerous" change, so the test went red. The three `consumable` lines were added to its expected list (owner decision 2026-11-25), after checking that no old document or variable sends `consumable` |
| Tests | `apps/server/src/resolvers/item-consumable.resolver.test.ts`, 15 tests against `ownedRowFake` |
| `verify-migration.ts` | `assertItemConsumable`, plus a `select` on two `Item` calls that run before the last deploy. Run on the Neon test branch on 2026-11-25 with the owner's consent: every check ok, including the 9 `add_item_consumable` checks |
| Web | no change. `pnpm codegen` adds the field to the web types; no web document selects it yet |

Until PR 2 the web's import and export do not carry `consumable`. So a cloud backup made
now has no value, and a "replace" import of it writes `true`. No client can write `false`
before PR 2, so no item can lose a `false` by this.

## PR 2: web

### The switch

- Item Info tab: **Consumable**, on by default. New items default to on.
- Off: the item counts whole packages only. The measurement settings, opened packs and the
  expiration settings are hidden.
- Turning it off on an item that tracks in a measurement unit switches it to packages. The
  save shows the same converted amounts confirm as a unit change today
  (`applyUnitSwitch`).
- Hidden expiration settings are KEPT, so turning it back on restores them. A non-consumable
  shows no expiry chip.

### The bar (`ItemCountBar`)

- Fixed-size squares, one per piece. Filled = in stock; outlined = missing up to the target.
- At most 20 squares, then a `+N` label. The card height does not change.
- The refill threshold square gets a marker, like the tick on `ItemProgressBar`.
- Status colors as today: out of stock uses the error color, low stock the warning color.
- `ItemCard` uses it when `consumable` is false; everything else keeps `ItemProgressBar`.

### The filter

- A **Consumable** dropdown (All / Consumable / Not consumable) in `ItemFilters`, on every
  item list (pantry, shopping, shelves, the settings item lists). Default All. Remembered the
  same way as the other filters.

### Local mode and files

- Dexie: a new version; an item with no `consumable` reads as `true` (no upgrade write
  needed, or a forward-only upgrade that sets it; the implementer follows `db/CLAUDE.md`).
- Import and export carry `consumable`. A file without it imports as consumable.

### As built: PR 2

Branch `feature/item-consumable-web`, from `develop` at `079f1756`. No server change.

| Part | As built |
|---|---|
| Type | `Item.consumable?: boolean` in `@p1i/types`, OPTIONAL. Plus `isConsumable(item)`: `item.consumable !== false`, so a missing or `null` value means consumable. Every reader goes through it. Optional, not required, because rows and files from before this field have none |
| Dexie | version 21, same stores as 20. Its upgrade sets `consumable: true` on every item with no boolean, and keeps a stored `false`. `createItem` writes `consumable ?? true`. `on('populate')` needs nothing (no items at that point). Tests: `db/upgradeV21.test.ts` |
| Cloud | `consumable` is selected by `GetItem`, `GetItems`, `CreateItem`, `UpdateItem`, `PantryData` and `ApplyUnitSwitch`. `toCreateItemInput` lists it by name; `toUpdateItemInput` passes it through. The import documents (`BulkCreateItems`, `BulkUpsertItems`) do not select it: their answers are thrown away |
| Import and export | `toItemInput` sends a boolean, or `undefined` for anything else, so a file with no value is written `true` by the server. The local import's own `deserializeItem` (`lib/importData.ts`) writes `isConsumable(raw)`. Export carries the stored value in both modes |
| `ItemCountBar` | `components/item/ItemCountBar/`. Squares are `size-2` (8 px) with a `gap-1` (4 px), in an `h-2` row, the height of `ItemProgressBar`. `MAX_COUNT_SQUARES = 20`, then `+N` (`itemCountBar.more`). More pieces than the target are drawn filled. A whole threshold `k` puts the marker in the gap after square `k`; a fractional one inside a square (`getCountMarkerLeft`). A threshold past the 20th square draws no marker. Stories `InStock`, `LowStock`, `OutOfStock`, `MoreThanTwenty`, `AboveTarget` |
| `ItemCard` | not consumable: `ItemCountBar`, the text `{pieces} / {target} {package unit}`, no expiry. An item still tracked in a measurement unit (from an old file) is converted to pieces by `amountPerPackage`, then floored |
| Filter | `ConsumableFilterDropdown` (a radio menu with counts) in `ItemFilters`, before the vendor dropdown. URL param `f_consumable=yes` or `no`, no param = All, read by `useUrlSearchAndFilters` (`consumableFilter`, `setConsumableFilter`; `consumable` is a reserved `f_` key). `filterItemsByConsumable` in `lib/filterUtils.ts` runs after the tag, vendor and recipe filters in `PantryListView`, `ShelfDetailView`, `shopping/$vendorId.tsx`, the four settings item lists, and `ItemListToolbar`'s count. A chosen value counts as an active filter |
| Switch | `ItemForm`'s `consumable` value, first row under "Stock settings". Off hides the "Advanced stock settings" block (track in measurement, measurement unit, amount per package, expiration), and on the Stock tab the Unpacked row, Unpack, Pack and "Expires on". `QuickUpdateDialog` hides the same three. Hidden values stay in the form and are saved unchanged. `buildInfoUpdates` sends `consumable` |
| Measurement → packages | turning the switch off on a measurement item calls the form's own `handleTargetUnitChange(false)`, so the form converts like the "Track in measurement" switch, and Save opens the same converted amounts dialog and sends one `applyUnitSwitch` with `consumable: false` in its `updates`. Turning it on again does NOT move the item back to the measurement unit |
| Due date | the Stock tab and `QuickUpdateDialog` send no `dueDate` key while the field is hidden (the issue #261 rule), so a location's stored date is kept |
| E2E | `e2e/tests/consumable-items.spec.ts`, local and cloud (`CLOUD_SPECS`): turn the switch off and see squares; the gram item's converted amounts; the Not consumable filter on a cart, kept after a reload; axe light and dark. `FixtureItem` gained `consumable` and `measurementUnit` |

Gate, measured 2026-11-25 on this branch: `pnpm test` web **4233 / 401 files**, server
**2983 / 92**, `scripts/spec` **80**; `pnpm test:e2e:all` green on the first try: `local`
205 passed / 11 skipped (4m20s), `cloud` 234 passed / 8 skipped (4m21s), `cloud-neon` 40
passed (11m38s), `pwa` 77 passed (1m40s).

Decisions taken during the build (the brief left them open):

| Question | Choice | Why |
|---|---|---|
| Hide `consumeAmount` too? | **No**, it stays | the design lists measurement, opened packs and expiration only. It is the recipe step, and recipes and cooking do not change |
| A non-consumable's Stock tab bar | `ItemProgressBar`, unchanged | the design says only `ItemCard` uses the new bar |
| Where Quick update hides fields | it hides them too | it shows opened packs and the due date, which the design hides for a non-consumable |
| Onboarding's template filter | no Consumable dropdown | the controlled `ItemFilters` has no URL state and the template items are not stored items |
| More pieces than the target | all drawn filled | the design names only "missing up to the target" |

## Not changing

Recipes, cooking, checkout.

## Tests

- PR 1: resolver tests (create default, update keeps, update sets, import with and without),
  `verify:migration` on the Neon test branch (run by the main session, with the owner's
  consent).
- PR 2: `ItemCountBar` (squares, outline, cap and `+N`, threshold marker, colors) with a story;
  the filter in `filterUtils` and `ItemFilters`; the switch with the converted amounts flow;
  Dexie and import/export. Mutation checks on the cap, the outline and the filter. E2E: make
  an item non-consumable, see the squares, filter on Shopping; axe scans light and dark.
