# Design: an "Active here" switch for each item at each location

Date: 2026-11-26. Brainstorming: `2026-11-26-brainstorming-item-stock-active.md`. Plan:
`2026-11-26-item-stock-active-plan.md`.

## Summary

1. **Where it sits.** Today an item is "inactive" at a location when its target there is 0
   (`targetQuantity === 0`). To hide an item from focus, the person taps the target down to 0;
   to bring it back, they tap it up again and must remember the old number. This design adds a
   per-location boolean, `ItemStock.isActive`, and makes it the only source of "inactive".
2. **Relations.** Two PRs, server first, because the web will select a new field:
   - **PR 1, server** (`feature/item-stock-active-server`). One additive migration with one
     backfill. Merged into `develop`, then released (`develop` → `main`). The web is not
     changed, so PR 1 alone changes nothing on screen.
   - **PR 2, web** (`feature/item-stock-active-web`). Merged into `develop` only after Railway
     shows PR 1 deployed. Released in the next release.
   - It builds on the consumable items work (#424, #427) and the stock count log (#423). It
     blocks nothing.
3. **What the user gets** once both PRs are merged AND deployed:
   - An **Active here** switch in the pantry quick edit dialog and on the item Stock tab.
   - Turning an item off keeps its target and refill numbers. Turning it on again brings the
     item back exactly as it was. No tapping, nothing to remember.
   - An active item can have target 0. It means "active, with no target".
   - On the day of the release every screen looks the same as before: every item that showed
     as inactive (target 0) is still inactive.
   - After PR 1 alone: nothing visible.
4. **What the developer gets:**
   - **One rule, in one place.** `isStockActive` in `@p1i/types` decides "active". Today the
     rule is `targetQuantity === 0`, and it is also written in comments in about 15 files.
   - **Fewer ways to get it wrong.** The `ZERO_STOCK` trap (an item not stocked here reads as
     inactive) stays guarded by `isInactiveHere`, and a new row now says what it is.
   - **A cost.** One more stock field to carry through every stock path: GraphQL type and two
     inputs, `writeStock`, copy-on-add, the two stock imports, export, Dexie, `STOCK_FIELD_KEYS`,
     the two forms, and the test fixtures. `STOCK_FIELD_KEYS`' type check makes `tsc` find the
     web half of these.

## The rule

| Value of `isActive` | Meaning |
|---|---|
| `true` | active at this location, whatever the target is. Target 0 = "no target" |
| `false` | inactive at this location, whatever the target is |
| missing (`undefined` or `null`) | old data only: read as `targetQuantity !== 0`, the old rule |

`isStockActive({ isActive, targetQuantity })` in `packages/types/src/index.ts` is the one
reader:

```ts
export function isStockActive(stock: {
  isActive?: boolean | null | undefined
  targetQuantity: number
}): boolean {
  return typeof stock.isActive === 'boolean'
    ? stock.isActive
    : stock.targetQuantity !== 0
}
```

**Why a fallback for a missing value, and not "missing = active"** (like `isConsumable`):

- E2E seed helpers (`e2e/helpers/fixture.ts`, `e2e/helpers/locationSeed.ts` and others) write
  raw IndexedDB rows AFTER Dexie has opened at the newest version, so no upgrade runs on them.
  Several seed target 0 rows. With "missing = active" they would all turn active.
- A backup file, a test fixture or a stale Apollo cache entry can hold a row with no value.
  The fallback gives such a row the meaning it had when it was written.
- Every writer still writes the value. The fallback is for rows nobody wrote since the change.

**`ZERO_STOCK` carries no `isActive`** (`apps/web/src/lib/itemStock.ts:13`). So the join for an
item NOT stocked here reads as inactive through the fallback, exactly as today, and
`isInactiveHere` still returns `false` for it because it checks `stockId` first. Nothing about
the "not stocked here" case changes.

**Every NEW row is written with `isActive: true`** unless the caller says otherwise. This is
the trap in this design: four writers create a row by spreading `ZERO_STOCK`. Without an
explicit `true` a new row with target 0 would read as inactive through the fallback. See
*New rows* below.

## Every place that decides or shows "inactive" today

Line numbers are on `develop` at `68da5522`.

### The rule itself (changes its body)

| File:line | Today | After |
|---|---|---|
| `apps/web/src/lib/quantityUtils.ts:271` `isInactive` | `targetQuantity === 0` | `!isStockActive(item)`. The type widens to `Pick<Stock, 'targetQuantity' \| 'isActive'>` |
| `apps/web/src/lib/quantityUtils.ts:534` `isInactiveHere` | `isStockedHere && isInactive` | unchanged body; it reads the new `isInactive` |
| `apps/web/src/lib/quantityUtils.ts:545` `isEmptyStock`, `:552` `isLowStock` | `!isInactive(item) && …` | unchanged body |
| `apps/web/src/lib/quantityUtils.ts:369` and `:395` `getStockPreview` status | `isInactive({ targetQuantity })` | `isInactive({ targetQuantity, isActive })`. `StockPreviewValues` gains `isActive: boolean`, so the dialog and the Stock tab preview the switch before Save |

Keeping the names `isInactive` / `isInactiveHere` means the 20-odd call sites below do not move.
Only the predicate body changes. That is on purpose: a reviewer reads one diff, not twenty.

### Readers (no code change; they follow the predicate)

| File:line | What it shows |
|---|---|
| `components/item/ItemCard/ItemCard.tsx:161`, `:172` | the card's `opacity-80` dimming and its `default` variant (no status colour) |
| `components/item/ItemStockSummary/ItemStockSummary.tsx:71`, `:75`, `:83` | the bar's `inactive` colour and the screen-reader word "Inactive" |
| `components/pantry/PantryListView.tsx:148-149`, `:400-406` | active list, then the "N inactive items" section |
| `components/pantry/RecipeDetailView.tsx:307-308`, `:367-372` | the same split in a recipe |
| `components/pantry/ShelfDetailView.tsx:522-525`, `:550-557` | the same split on a shelf |
| `components/pantry/VendorDetailView.tsx:286-287`, `:344-349` | the same split for a vendor |
| `components/pantry/RecipeGroupView.tsx:67`, `ShelfGroupView.tsx:80`, `:133`, `VendorGroupView.tsx:48` | the group card's active count |
| `routes/shopping/$vendorId.tsx:352-360`, `:582-602` | the cart page's active and inactive sections (cart and pending) |
| `hooks/useVendorCartCounts.ts:34` and `routes/shopping/index.tsx:141-142`, `:195`, `:219` | `VendorCartCard`'s "N inactive" count |
| `lib/sortUtils.ts:38-49` | the `stock` sort: an inactive item's progress is 1 or 0 |
| `routes/cooking.tsx:555-556` | the recipe card's empty and low counts (through `isEmptyStock` / `isLowStock`) |

### Places that read the target as "inactive" WITHOUT the predicate (must change)

| File:line | Today | After |
|---|---|---|
| `components/pantry/RecipeGroupView.tsx:72`, `ShelfGroupView.tsx:86`, `:138`, `VendorGroupView.tsx:53` (group pack totals through `getItemPackUnits`) | an inactive item adds its packed amount, and 0 to the target (its target IS 0). Its refill (often 0) is added too | an inactive item adds its packed amount, and **0** to the target and **0** to the refill. So an inactive item with target 5 does not change the group bar. Same numbers as today for every migrated row |
| `components/shared/GroupCard/GroupCard.tsx:44-47` | group status `inactive` when the summed target is 0 | `inactive` when `activeCount === 0`; else `getStockStatus(...)`. A group of active items with no target is not grey |
| `components/item/ItemProgressBar/ItemProgressBar.tsx:333-354` (target 0 branch) | comment "target=0 means inactive" | behaviour stays (full bar when stock > 0, empty bar when not); the comment changes to "no target" |
| `lib/sortUtils.ts:42`, `:49` | `a.targetQuantity > 0 ? qty / target : 1` | stays. An active item with no target counts as full (progress 1) |

### Comments and docs that state the old rule (text change only)

`packages/types/src/index.ts:71`; `apps/server/src/lib/itemStockWrite.ts:187`;
`apps/web/src/db/operations.ts:1004-1005`; `ItemCard.tsx:158`; `ItemStockSummary.tsx:73`;
`lib/quantityUtils.ts:521-533`, `:538-540`; `routes/cooking.tsx:551`;
`routes/shopping/$vendorId.tsx:190-191`, `:347-351`; the four settings item lists
(`recipes/$id/items.tsx:163-166`, `shelves/$shelfId/items.tsx:233-236`,
`tags/$id/items.tsx:195-198`, `vendors/$id/items.tsx:225-228`); `apps/web/src/db/CLAUDE.md`
(v16 section); `apps/web/src/components/CLAUDE.md:179`; `apps/web/src/routes/CLAUDE.md:429`.

### i18n

| Key | en today | After |
|---|---|---|
| `items.form.targetQuantity.hint` (`en.json:391`, `tw.json:391`) | "Item becomes inactive when set to 0" / 「設為 0 時，這個品項會變成暫時沒在用」 | "0 means no target" / 「設為 0 表示沒有目標數量」 |
| new `items.form.isActive.label` | | "Active here" / 「在這裡使用中」 |
| new `items.form.isActive.hint` | | "Off: the item shows as inactive at this location. Its target and refill stay." / 「關閉後，這個品項在這個地點會顯示為暫時沒在用。目標數量和補貨點都會保留。」 |

The Chinese word for inactive stays 「暫時沒在用」, the same as `shopping.inactiveItems` and
`shopping.cartCard.inactive` use today.

## What an ACTIVE item with target 0 shows

Owner answer 1: "active, no target". The code already handles target 0 in each place, so
almost nothing needs new code:

| Surface | Shows | Code |
|---|---|---|
| card | in the active list, not dimmed | `isInactive` false |
| bar | full bar in the status colour when stock > 0; an empty outlined bar when stock is 0 | `ItemProgressBar` target 0 branch, unchanged. `ItemCountBar` (non-consumable) draws 0 squares plus any stock above the target, unchanged |
| quantity text | `3 / 0 pack`, unchanged (owner question 4) | `ItemStockSummary` |
| status colour | `getStockStatus(current, refill)`: `ok` with refill 0; with a refill above 0 the usual warning or error | unchanged |
| `stock` sort | progress 1 (full), so it sorts with full items | `sortUtils.ts:42` unchanged |
| empty and low counts | counted when the stock is below or at a non-zero refill, like any active item | `isEmptyStock`, `isLowStock` |
| group totals | adds packed, adds target 0 | unchanged |
| cart suggested amount | `max(1, ceil(0 − packed))` = 1 | `suggestedCartAmount`, unchanged |

## What an INACTIVE item with a target shows

| Surface | Shows |
|---|---|
| card | in the inactive section, dimmed (`opacity-80`), no status colour |
| bar | the target's segments, in the inactive colour |
| quantity text | `2 / 5 pack` (the real target, kept) |
| empty and low counts, group active count, group target and refill | not counted |
| `stock` sort | progress 1 when it has stock, else 0 (today's rule for inactive) |
| cart suggested amount | from the target: `max(1, ceil(5 − 2))` = 3. Inactive blocks nothing (owner answer 3), and the person ticked it on purpose |
| cart, cooking, checkout, recipes | all allowed (owner answer 3). Nothing reads `isActive` on those paths |

## Server (PR 1)

| Part | Change |
|---|---|
| Prisma | `ItemStock.isActive Boolean @default(true)` (`apps/server/prisma/schema.prisma:305`) |
| Migration | `20261126000000_add_item_stock_is_active`, two statements in one file: `ALTER TABLE "ItemStock" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;` then `UPDATE "ItemStock" SET "isActive" = false WHERE "targetQuantity" = 0;`. No `RAISE EXCEPTION` guard: the column is `NOT NULL DEFAULT true`, so no row can be left `NULL`, and there is nothing to count |
| `apps/server/prisma/CLAUDE.md` | a named exception in *Adding a `NOT NULL` column WITH a constant default*: a constant default PLUS one backfill `UPDATE` that depends on another column. Why: every row that showed as inactive must still be inactive on the first request after the deploy |
| GraphQL type | `ItemStock.isActive: Boolean!` (`schema/itemStock.graphql:6`) |
| GraphQL inputs | optional `isActive: Boolean` on `ItemStockInput` (`itemStock.graphql:84`) and on `ItemStockImportInput` (`import.graphql:128`). Optional, so today's web documents stay valid |
| `toData` (`itemStock.resolver.ts:45`) | copies `isActive` when it is a boolean. `null` and a missing key both mean "leave it" (the column is `NOT NULL`; the rule from the consumable migration) |
| `writeStock` (`lib/itemStockWrite.ts:144`) | `StockWrite` gains `isActive?: boolean`. `create` writes `isActive: data.isActive ?? true` EXPLICITLY. The Prisma fakes do not apply column defaults, so a value left to the database is one no test can see |
| `upsertItemStock` | no other change. `stockCountChange` compares only the on-hand totals, so a save that only flips the switch writes NO `stockCount` log row and publishes `STOCK` alone (the existing `logged ? ['STOCK','LOG'] : ['STOCK']` branch at `itemStock.resolver.ts:209`) |
| `ensureStockAtLocation` (copy-on-add, `itemStockWrite.ts:223`) | the new row gets `isActive: true` (owner question 1). It still inherits target, refill and due date |
| `addItemToLocation`, `checkout`, `consumeRecipes` | no change of their own; they create rows through `ensureStockAtLocation` and `writeStock`, so a new row opens active. None of them reads `isActive`, so nothing is blocked (owner answer 3) |
| `applyUnitSwitch` | no change. Its `stockConversions` carry the converted target, refill and unpacked amount only (`TrackedQuantities`). The web never sends `isActive` there. A unit switch keeps each location's switch as it was. Test: an inactive row with target 5 stays inactive after a switch |
| `bulkCreateItemStocks` (`import.resolver.ts:2053`), `bulkUpsertItemStocks` (`:2263`) | they spread `...quantities` from the input. **Trap:** an optional GraphQL input arrives as `null` when the file has none, and `null` on a `NOT NULL` column is a Prisma error. So both take `isActive` out of the spread and write `isActive ?? targetQuantity !== 0` (the same fallback as `isStockActive`). An old backup restores with the old meaning |
| export | `allItemStocks` returns the field through `toGraphQL`'s spread; no resolver code |
| `importCheck`, `/e2e/cleanup`, `emptyHouseholdWhere` | no change: no new table, no new id |
| live events | a switch change goes through `upsertItemStock`, which already publishes `STOCK`. The web refetches `PantryData` and `ItemStocksForItem` on `STOCK` (`apps/web/src/apollo/liveUpdates.ts:147`). The live guard list does not change (no new mutation) |
| `verify-migration.ts` | before the last deploy, seed (raw SQL) stock rows with target 0, target 5 and target 0.5. After it, assert: the column exists on `"ItemStock"`, is `NOT NULL` with default `true`; the target 0 row reads `false`; the other two read `true`; a row inserted without the column reads `true`; an explicit `NULL` is refused (`23502`). Add the migration to the `last` group in `scripts/migrationDeploys.ts` |
| `@p1i/types` | `isStockActive` only (a structural parameter). The `ItemStock.isActive?` field waits for PR 2: the interface feeds the web's `StockFields`, and `STOCK_FIELD_KEYS`' type check would fail the web build in PR 1. `consumeItem` and the other quantity helpers do not need it |

### Old web against the new server (the window between the two releases)

- `isActive` is new output and new OPTIONAL input only, so every document of today's web
  stays valid. Nothing breaks.
- Today's web shows inactive by `targetQuantity === 0`, and it never sends `isActive`.
- **The drift:** in the window, a row whose target the old web sets to 0 stays
  `isActive: true` on the server. After the web release it shows as active with no target,
  and the person turns it off once. A row the old web moves from 0 up to 5 stays
  `isActive: false`, and after the web release it shows inactive. Owner question 3 asks
  whether the server should copy the old rule for a save that sends a target but no
  `isActive`. The recommendation is no, and to keep the window short.
- Phones still on an old bundle after the web release behave the same way until they
  accept the update prompt. Their saves never touch `isActive`.

### New web against the old server

**Must not happen.** `PantryData`, `ItemStocksForItem`, `UpsertItemStock`,
`AddItemToLocation` and `AllItemStocks` will select `isActive`, so the old server fails them
with `GRAPHQL_VALIDATION_FAILED`: a blank pantry. That is why PR 2 merges into `develop` only
after Railway shows PR 1 deployed.

### As built: PR 1

Branch `feature/item-stock-active-server`, from `develop` at `f9639847`. Migration folder
`20261126000000_add_item_stock_is_active`. **Built on the branch, not merged, not
deployed.** The web is not changed: `pnpm codegen` adds the field to the web types, and no
web document selects it yet.

| Part | Commit | As built |
|---|---|---|
| `isStockActive` | `30f57bc4` | in `@p1i/types` (`packages/types/src/index.ts`), with a structural parameter. A boolean `isActive` decides; a missing or `null` value keeps the old rule (`targetQuantity !== 0`). The `ItemStock.isActive?` field of the interface waits for PR 2, as planned. Tests in `apps/server/src/lib/isStockActive.test.ts` (5), because `packages/types` has no test runner |
| Prisma and migration | `f78c3991` | `isActive Boolean @default(true)`; the two statements of the table above, written by hand. The named exception is in `apps/server/prisma/CLAUDE.md`. The folder is in the `last` group of `scripts/migrationDeploys.ts` |
| `verify-migration.ts` | `f78c3991` | `seedItemStockIsActiveBackfill` writes three stock rows (target 0, 5 and 0.5) with raw SQL before the last deploy; `assertItemStockIsActive` reads them back after it, and checks the type, `NOT NULL`, `DEFAULT true`, a new row with no value, and `23502` for an explicit `NULL` |
| `stockFake` | `db28577c` | keeps `isActive` like any other column, with NO default, and refuses `null`. 4 new tests in `stockFake.test.ts` |
| GraphQL, `toData`, `writeStock`, copy-on-add | `b2490d6d` | as in the table above. `ItemStock.isActive: Boolean!`, optional `ItemStockInput.isActive`. `writeStock` creates with `isActive: data.isActive ?? true`; `ensureStockAtLocation` always opens a new row active (owner answer 1A) |
| The two stock imports | `b5ecc6c6` | optional `ItemStockImportInput.isActive`. Both take `isActive` out of the `...quantities` spread and write `isStockActive({ isActive, targetQuantity })`. `bulkUpsertItemStocks` writes it in `create` AND `update` |
| Export | `dfb96193` | no resolver code: `toGraphQL` spreads the row. One test pins it |

**What differs from the design and the plan:**

| Design or plan said | As built | Why |
|---|---|---|
| the imports write `isActive ?? targetQuantity !== 0` inline | they call `isStockActive` | one rule in one place. Same result: `isStockActive` treats `null` like a missing value |
| tests in `itemStock.resolver.test.ts` "or a new file" | all S.3 resolver tests in ONE new file, `itemStock-active.resolver.test.ts` (14 tests: `upsertItemStock`, copy-on-add, checkout, cooking, `applyUnitSwitch`) | the existing files use different fakes; one file with one mock factory covers every path |
| (not in the design) | three `ItemStock` Prisma calls in `verify-migration.ts` got a `select` (two in `assertLocationMigrationsBeforeDrop`, one in `assertDropUserScope`) | **trap:** they run BEFORE the last deploy, and the Prisma client is built from the FINAL schema, so it asks for the missing `isActive` column and fails with `P2022`. For the `create` this is worse: the "duplicate is refused with `P2002`" check would read `P2022` and fail for the wrong reason |
| "the stock fake must keep `isActive`. Check that it does not invent a default" | the fake did NOT keep it at all before `db28577c`: its `create` and `update` copied only the columns they knew, so `isActive` was dropped | without the fix, every "the row is written active / inactive" test would have read `undefined` |
| (not in the design) | `allItemStocks` got its own test (`dfb96193`) | the design said "no resolver code" for export, but nothing tested it. The test seeds an inactive row with target 9 and an active row with target 0, so a field rebuilt from the target fails too |

**Tests.** Server **2987 / 92 files** before the branch (at `f9639847`), **3026 / 94**
after. The S.3 commit (`b2490d6d`) records that its tests were checked by mutation;
the list of mutations is in the S.3 task report, not in the repo. The export test
(`dfb96193`) went red on two mutations of `toGraphQL`: `isActive` set to `undefined`
("Cannot return null for non-nullable field ItemStock.isActive.") and `isActive` rebuilt as
`targetQuantity !== 0`.

**Real SQL.**

- `verify:migration` on the Neon test branch: _Pending: filled in by the main session._
- `pnpm test:e2e:all`: _Pending: filled in by the main session._

**Known gaps of PR 1:**

- **`applyUnitSwitch` can write `isActive`.** `UnitSwitchStockConversionInput.quantities` is
  an `ItemStockInput`, so it has the new optional field, and the resolver passes it through
  `toData` to `writeStock`. A client that sends `isActive` inside `stockConversions` changes
  the switch. The web never sends it there (its conversions carry target, refill and the
  unpacked amount only), and the caller already needs `participant` on that location, the
  same right `upsertItemStock` needs. So it is not a new right, only a second path. No test
  pins it either way.
- **A replace import of an old file sets the switch from the target**, also on a row that
  exists: `bulkUpsertItemStocks` writes `isStockActive` in `update`. A stored `true` on a
  row with target 0 becomes `false`. This is the design's rule ("an old backup restores with
  the old meaning"); it is named here so nobody reads it as a bug.
- **No real-SQL test of the new code paths** besides `verify:migration` and the existing
  E2E specs. No E2E spec reads `isActive` until PR 2.
- The old-web drift in the window between the two releases (see above).

## Web (PR 2)

| Part | Change |
|---|---|
| Type | `ItemStock.isActive?: boolean` (`packages/types/src/index.ts:65`). Optional, like `Item.consumable`, because old rows and files have none. `StockFields` gets it through `Omit` |
| `STOCK_FIELD_KEYS` (`lib/itemStock.ts:29`) | add `'isActive'`. Its type check (`StockFieldKeysAreExhaustive`) makes `tsc` fail until it is added. With it, `updateItem` routes `isActive` to the stock row, `stripStockFields` drops it, `pickStockFields` copies it, and `touchesStock` sees it |
| `ZERO_STOCK` | unchanged (no `isActive`). See *The rule* |
| `toStockInput` (`hooks/useItems.ts:235`) | emits `isActive` when the key is present |
| `toCreateStockInput` (`hooks/useItems.ts:263`) | sends `isActive: fields.isActive ?? true` |
| GraphQL documents | select `isActive` in `PantryData`, `ItemStocksForItem`, `UpsertItemStock`, `AddItemToLocation` (`apollo/operations/itemStocks.graphql`) and `AllItemStocks` (`export.graphql`). The two import documents do not need it (their answers are thrown away) |
| `lib/deserialization.ts:35` (cloud rows) | passes `isActive` through (it spreads the row today; check it keeps a boolean) |

### New rows (local)

Four local writers create a row by spreading `ZERO_STOCK`. Each must write
`isActive: true` unless its input says otherwise:

| Writer | File:line |
|---|---|
| `upsertItemStock` create branch | `db/operations.ts:162-171` |
| `addItemToLocation` (copy-on-add) | `db/operations.ts:183-204`. With a source row, `pickStockFields` would COPY the source's `isActive`; it must be set to `true` instead (owner question 1) |
| `createItem` | `db/operations.ts:287` (through `pickStockFields(input)`, `:359`). The Add dialog (`NewItemDialog.tsx:179-187`) sends target 0, so a new item is active with no target (owner question 2) |
| `consumeRecipesBatch` create branch | `db/operations.ts:1302` |

`checkout` creates through `addItemToLocation` (`operations.ts:1015`), so it follows that row.

### Dexie

Version 22, the same stores as 21 (`isActive` is not indexed). Upgrade on `itemStocks`: a row
whose `isActive` is not a boolean gets `isActive = targetQuantity !== 0`; a stored boolean
stays (so running it twice changes nothing). `on('populate')` needs no change: a fresh
database has no stock rows at that point. Tests in a new `db/upgradeV22.test.ts`: a version-21
database with four rows (target 0, target 5, a stored `true` with target 0, a stored `false`
with target 5) so "derive where missing" differs from "derive everywhere", and a fresh
database. `upgradeV21.test.ts` must check `verno` is at least 21, not exactly 21.

### Import and export

| Path | Rule |
|---|---|
| local import, `deserializeItemStock` (`lib/importData.ts:166`) | writes `isActive: isStockActive(raw)`. `legacyStockFromItem` (`:214`, pre-v15 files) goes through it too |
| cloud import, `toItemStockInput` (`lib/importData.ts:1523`) | sends `isActive: isStockActive(stock)`, so the web and the server agree on an old file |
| export | local mode exports the Dexie row as it is; cloud export selects the field. A new backup carries `isActive` in both modes |

### The switch

- **Quick edit dialog** (`components/item/QuickUpdateDialog/QuickUpdateDialog.tsx`): a new
  local state `localActive`, starting at `isStockActive(item)`. One row with a `Switch`
  (`components/ui/switch`) and its `Label`, placed above the target row. It joins the
  "nothing changed" check (`:200`) and the two save payloads (`:174`, `:194`, `:245`). It is
  passed to `getStockPreview`, so the bar turns grey as soon as the switch is off.
- **Item Stock tab** (`components/item/ItemForm/ItemForm.tsx`, stock section; saved by
  `buildStockUpdates` in `routes/items/$id/stock.tsx:122`): a new form value `isActive`, in
  `ItemFormValues`, `DEFAULT_VALUES` (`true`), the dirty check (`:246-254`), the reset
  (`:289-297`) and the stock section, above the target row. Same `Switch` and `Label`
  pattern as the Consumable switch (`:617-632`).
- **The all-locations pager** (`routes/items/$id/index.tsx:59`, `:210-211`, `:385`): its
  per-location values and its "same stock" compare must include `isActive`, or a switch
  change on one location reads as no change.
- **Target and Refill stay editable** while the switch is off (owner answer 2).
- **No switch on the card** (owner answer 4).
- **Viewer role:** on the Stock tab the switch is disabled in `ItemForm`'s `readOnly` mode,
  which already disables the steppers, Pack, Unpack and the Consumable switch for a location
  `viewer` (`ItemForm.tsx:124-128`, `usePermissions().canEditLocation`). The quick edit
  dialog follows whatever it does for a viewer today; the implementer checks that first and
  says what they found.
- **A11y:** the `Switch` has `id`, the `Label` has `htmlFor`, and the hint has an id the
  switch names in `aria-describedby`, the same as the Consumable switch. The state is the
  switch's own `aria-checked`; no extra live region. Axe scans of the dialog and the Stock
  tab, light and dark.

## Interactions

| With | Result |
|---|---|
| non-consumable items (#434) | none. A non-consumable item has a switch too. `ItemCountBar` gets the `inactive` status through `ItemStockSummary`'s `progressStatus`, as today |
| the `stockCount` log (#423) | flipping the switch writes NO log row, in both modes: `stockCountChange` compares only `packedQuantity` and `unpackedQuantity` (`packages/types/src/inventoryLog.ts:57`). Local `updateItem` uses the same function. A save that flips the switch AND changes the amount writes one row, for the amount |
| expiry from last restock (#438) | none |
| recipes and cooking | none. Cooking does not read `isActive` except through the empty and low counts |
| live updates | `STOCK`, see the server table |

## Tests and E2E

### PR 1 (server)

- `itemStock.resolver.test.ts` (or a new `itemStock-active.resolver.test.ts`):
  `upsertItemStock` with `isActive: false` writes it; with no key leaves a stored `false`;
  with `null` leaves it; a new row with no key is `true`; a switch-only save writes no
  `stockCount` log and publishes `STOCK` alone.
- `itemStockWrite.test.ts`: `ensureStockAtLocation` opens a new row active even when the
  source row is inactive; it returns an existing inactive row untouched.
- `cart-checkout` and `recipe-consume` tests: checkout and cooking of an inactive item
  succeed, and the row stays inactive.
- `applyUnitSwitch`: an inactive location stays inactive.
- `import-itemStock.resolver.test.ts`: both bulk mutations write a given `true` and `false`,
  and derive a missing value from the target (target 0 → `false`, target 5 → `true`).
- The stock fake (`src/test/stockFake.ts`) must keep `isActive` like any other column, and
  `create` must not invent a default for it. Check that it does not.
- `verify-migration.ts` on the Neon test branch (run by the main session, with the owner's
  consent).
- Mutation checks, each must go red: remove the `UPDATE` from the migration (verify script);
  drop `isActive` from `writeStock`'s `create` (new-row test); write `isActive: source.isActive`
  in copy-on-add (copy-on-add test); replace the import's `?? targetQuantity !== 0` with
  `?? true` (import test); pass `null` through in `toData` (the `null` test).

### PR 2 (web)

- `quantityUtils.test.ts`: `isInactive` for `{ true, 0 }`, `{ false, 5 }`, `{ missing, 0 }`,
  `{ missing, 5 }`; `isInactiveHere` still false for `ZERO_STOCK` with no `stockId`;
  `isEmptyStock` / `isLowStock` for an inactive item with target 5; `getStockPreview` status.
- `@p1i/types`: `isStockActive` for the same four cases.
- The group views and `GroupCard`: an inactive item with target 5 adds nothing to the group
  target, and a group of active no-target items is not `inactive`. The fixture needs an
  inactive item WITH a target, or the test cannot tell the old rule from the new one.
- `PantryListView`, the cart page and `useVendorCartCounts`: an inactive item with target 5
  is in the inactive section; an active item with target 0 is in the active section. Both
  fixtures are needed; one alone passes against the old rule.
- `db/operations.test.ts`: each of the four new-row writers opens `isActive: true` with
  target 0; copy-on-add from an inactive source opens active; `updateItem` with only
  `isActive` writes no `stockCount` log.
- `db/upgradeV22.test.ts` (see *Dexie*).
- `lib/importData.test.ts`: a file with no `isActive` derives it (local and cloud payload).
- `QuickUpdateDialog` and `ItemForm` (Stock tab): the switch shows the stored value, sends
  `isActive` on Save, keeps target and refill, and the bar turns grey before Save. Stories:
  an inactive item with a target in both.
- E2E, a new `e2e/tests/item-stock-active.spec.ts`, in `local` and in `CLOUD_SPECS`: turn an
  item with target 5 off in the quick edit dialog, see it in the inactive section with
  `x / 5`, turn it on again and see it back with target 5; the same on the Stock tab of a
  second location while the first location stays active; read the stock back
  (`e2e/helpers/stockReadback.ts`) for `isActive`; axe scans of the dialog and the Stock tab,
  light and dark. The seed helpers (`e2e/helpers/fixture.ts`, `locationSeed.ts`) gain an
  optional `isActive`, and the three backup fixtures in `e2e/fixtures/` stay without it on
  purpose (they prove an old file still imports with the old meaning).
- Mutation checks, each must go red: `isInactive` back to `targetQuantity === 0` (the
  "inactive with target 5" tests); drop `isActive: true` from `upsertItemStock`'s create
  branch (the new-row test); drop `'isActive'` from `STOCK_FIELD_KEYS` (`tsc`, and the save
  test); remove `isActive` from the pager's compare (the pager test); drop the Dexie
  upgrade's derive (the upgrade test).

## Release order

1. PR 1 (server) merges into `develop`.
2. Release `develop` → `main` (a merge commit). Railway deploys the server and runs
   `prisma migrate deploy`. **`develop` today holds 114 commits that `main` lacks, including
   unreleased server work** (the stock count log, the shim removal, consumable-only recipes).
   PR 1 touches `upsertItemStock`, which that work changed, so PR 1 cannot be based on `main`
   the way #424 was. This release ships all of it (owner question 5).
3. Wait until Railway shows that commit's deployment active. Check that a new deploy really
   started (release #403 needed a manual start).
4. Run `pnpm --filter server e2e:db:migrate` on this machine for the local E2E database.
5. PR 2 (web) merges into `develop`, then the next release.

## Not changing

Recipes, cooking rules, checkout rules, the cart, the item card's controls, `Item`.

## Known gaps

- The drift in the window between the two releases (see above).
- The `isStockActive` fallback means "the switch is the only source" is true for every row
  written after the change, and for every migrated row, but NOT for a row with no value,
  which still follows the target. That is on purpose (E2E seeds and old files), and it is
  stated here so nobody reads the fallback as a bug.
- Copy-on-add differs between modes in WHICH source row it picks (`itemStockWrite.ts:205`).
  It does not matter for `isActive`, because a new row always opens active.

## Owner questions

1. **Does a NEW stock row at a location open active?** (adding an item to a location,
   checkout or cooking at a location where it was not stocked)
   - A (recommended): always active. Adding or buying it here is a choice to use it here.
   - B: copy the switch from the source row, like target and refill.
2. **Does a new item made in the Add dialog (target 0) start active?**
   - A (recommended): active, with no target. It shows in the active list as `0 / 0`.
   - B: inactive, as it is today.
3. **In the window between the server and the web releases, should the server copy the old
   rule?** (a save that sends a target but no `isActive` sets `isActive = target !== 0`)
   - A (recommended): no. Keep the window short. At most a few rows need one tap after the
     web release.
   - B: yes, in `upsertItemStock` only, removed in a later release. The new web must then
     always send `isActive` with a target, or the rule fires on new-web saves too.
4. **What text does an active item with no target show?**
   - A (recommended): `3 / 0 pack`, as today. No code change.
   - B: `3 pack`, with no `/ 0`.
5. **Which release path?**
   - A (recommended): PR 1 into `develop`, then a release of all of `develop` (it includes
     114 unreleased commits). Then PR 2.
   - B: PR 1 on its own from `main`, like #424. This needs a hand-made copy of the
     `upsertItemStock` change without the stock count log, and a rebase of `develop` after.

**Answered 2026-11-26:** 1–4 are A. 5: release the current `develop` first, make `develop`
again from the new `main`, then do PR 1 and PR 2 on it. See the brainstorming log.
