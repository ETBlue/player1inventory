# Design: inventory log layout and stock count rows

Date: 2026-11-25. Branch `feature/inventory-log-layout`, from `develop` at `333dc2ca`.
Brainstorming: `2026-11-25-brainstorming-inventory-log-layout.md`.

## Summary

1. **Where it sits.** The item Log tab lists stock changes. It shows only purchases and
   cooking, in packages, with a sentence translated when the row was written. The most
   common change, a manual correction (盤點, "stock count"), is not logged at all.
2. **Relations.** Server and web. No migration: `logKey` and `logParams` already exist.
   Builds on `develop` after #420.
3. **What the user gets** once merged and deployed:
   - Each row: `−30 g · Stock count ........ 470 g`, then `Wed, Nov 25, 2026 · 14:30`.
   - Stock tab saves and Quick updates show in the log.
   - Amounts in the item's own unit. Vendor and recipe names follow renames, and the label
     follows the reader's language.
   - A stock count never changes the "last purchased" date or the expiry date.
4. **What the developer gets:**
   - Logs store data, not text. One mapping in the web turns a row into a label.
   - The stock count log cannot be forgotten by a client: the server writes it.
   - Cost: the Log tab has to read three row shapes (new keys, old keys, old `note` only).

## The row

| Part | Rule |
|---|---|
| Row 1, left | sign, amount, unit, then the label of the kind (table below) |
| Row 1, right | the quantity after the change, with the unit |
| Row 2 | date, weekday and time in the app language. English `Wed, Nov 25, 2026 · 14:30`; Traditional Chinese `2026/11/25（週三）14:30`. Use `Intl.DateTimeFormat` with the i18n language |
| Unit | the item's tracking unit: `measureUnit` when the item tracks in measurement, else `packageUnit`. A value stored in packages is multiplied by `amountPerPackage` when the item tracks in measurement |
| Numbers | rounded for display (at most 2 decimals, no trailing zeros) |

| Kind (`logKey`) | `logParams` | English | Traditional Chinese |
|---|---|---|---|
| `purchase` | `{ vendorId, vendorName }`, both `null` for the no-vendor cart | Bought at {vendor}; no vendor: "Bought" | 在 {vendor} 購買；no vendor:「購買」 |
| `cooking` | `{ recipes: [{ id, name }] }`, may be empty | Used in {recipes}; none: "Used in cooking" | 用於 {recipes}；none:「烹飪使用」 |
| `stockCount` | none | Stock count | 盤點 |

- The name shown is the CURRENT name of the vendor or recipe when it still exists, else the
  stored snapshot. Recipe names are joined with the language's list separator.
- **Old rows stay readable.** `shopping.log.purchasedAt` shows as a purchase with
  `logParams.vendor`; `cooking.log.consumedVia` / `consumedViaRecipe` as cooking with
  `logParams.recipes` (a string). A row with no `logKey` shows its `note`. An unknown key
  shows nothing as the label, never the raw key.
- **Units of old and new rows** (see brainstorming): checkout `delta` and `quantity` are in
  packages; cooking `delta` is in the tracking unit and `quantity` in packages. Stock count
  rows store both in packages, like checkout. The display converts per kind.

## Writing

| Writer | Change |
|---|---|
| `checkout` (web, both modes) | sends `logKey: 'purchase'` and the new params. Sends no `note` |
| cooking (web, both modes) | sends `logKey: 'cooking'` and the new params. Sends no `note` |
| `upsertItemStock` (server) | reads the old row, writes the new one, and when the on-hand total changed, writes one `stockCount` log row, all in ONE transaction. `quantity` = the new packed total; `delta` = new total − old total (a missing old row counts as 0). `userId` = the caller, `occurredAt` = now. Publishes `LOG` with `STOCK` when it wrote a row |
| local mode | the same row, in the same Dexie transaction as the stock write, but ONLY for the manual paths (the Stock tab Save, Quick update, and an item's first amount). The local `upsertItemStock` helper is also called by local checkout and item create, so the log must not be written inside it unconditionally |

- "The on-hand total changed": compare the packed total (`getPackedTotal` rule) before and
  after. A save that changes only the target, the threshold or the due date writes no row.
- `addItemToLocation` and `applyUnitSwitch` write no stock count row (a new empty row, and a
  unit conversion, are not corrections).
- Cloud: the web's only `upsertItemStock` callers are `useUpdateItem` and `useCreateItem`.
  Both are manual paths, so the server rule fits.

## Last purchase date

Option A, the same in both modes: the newest row with `delta > 0` whose `logKey` is not
`stockCount`. In Prisma this must keep rows whose `logKey` is `null`:
`OR: [{ logKey: null }, { logKey: { not: 'stockCount' } }]`. A plain
`NOT: { logKey: 'stockCount' }` drops `null` rows in SQL.

## Release

One release. Server first is safer: with the new server and the old web, the old Log tab
shows new rows with `t('stockCount')`, which prints the raw key until the web deploys.

## Tests

- Server: a stock save that changes the amount writes one row with the right `delta`,
  `quantity`, key, user and location; a save that changes only the target writes none; the
  stock write and the log are one transaction (a failing log write leaves no stock change);
  `LOG` is published only with a row; `lastPurchaseDates` ignores a newer positive stock
  count and still counts an old `null`-key positive row.
- Web local: the Stock tab Save and Quick update write one row; local checkout and item
  create write no stock count row; `getLastPurchaseDate` follows option A.
- Log tab: the three row shapes; unit conversion; current name vs snapshot; both languages.
- Mutation checks: remove the log write → red; remove the "changed" check → red; remove the
  option A filter → red; use `NOT` instead of the `OR` → red (needs a `null`-key row).
- E2E: one test per mode. Change an amount on the Stock tab, open Log, see the stock count
  row; buy an item, see "Bought at …" with the vendor. Axe scan of the Log tab, light and
  dark.

## Not in this design

- Editing or deleting log rows.
- Rows from before a unit switch are converted with today's `amountPerPackage`, and a cooking
  amount written before a unit switch may show in the wrong unit. Known, not fixed here.

## As built (2026-11-25)

Built on `feature/inventory-log-layout`. No migration and no GraphQL schema change; the
old-bundle test (`apps/server/src/test/oldBundleCompat.test.ts`) stays green.

| Part | Where |
|---|---|
| The kinds and the stock count rule, shared | `packages/types/src/inventoryLog.ts`: `PURCHASE_LOG_KEY`, `COOKING_LOG_KEY`, `STOCK_COUNT_LOG_KEY`, `PurchaseLogParams`, `CookingLogParams`, `stockCountChange(before, after, amountPerPackage)` |
| Server stock count row | `upsertItemStock` (`apps/server/src/resolvers/itemStock.resolver.ts`): one `$transaction` with `SELECT … FOR UPDATE` on the stock row, read the old row, `writeStock`, read the item's `amountPerPackage`, then `inventoryLog.create` when `stockCountChange` says the total moved. Publishes `['STOCK', 'LOG']` only when it wrote the row |
| Server last purchase date | `lastPurchaseDates`: `OR: [{ logKey: null }, { logKey: { not: 'stockCount' } }]` |
| Local stock count row | `updateItem` (`apps/web/src/db/operations.ts`), one Dexie transaction over `items`, `itemStocks`, `inventoryLogs` |
| Local last purchase date | `getLastPurchaseDate` skips `stockCount` rows |
| Writers | checkout sends `logKey: 'purchase'`, `{ vendorId, vendorName }`, no `note`; cooking sends `logKey: 'cooking'`, `{ recipes: [{ id, name }] }`, no `note` |
| Display | `apps/web/src/lib/inventoryLogDisplay.ts` (`logKindOf`, `logUnitOf`, `logAmountsOf`, `logLabelOf`, `formatLogDelta`, `formatLogNumber`, `formatLogTime`); `routes/items/$id/log.tsx` lays it out |
| Strings | `items.history.kind.*`, `items.history.listSeparator`, `items.history.when`, `items.history.afterLabel` |

Differences from the design above:

- **Item create writes no stock count row, in either mode, in practice.** The *Writing*
  table lists "an item's first amount" as a local manual path, and the *Tests* section says
  "local checkout and item create write no stock count row". These two disagree. Local
  `createItem` writes no row (it writes stock through `upsertItemStock`, not `updateItem`).
  The server would write one if a create sent a non-zero amount, because cloud create calls
  `upsertItemStock`. Every create path in the web sends 0 for all amounts today
  (`NewItemDialog`, the shelf, recipe, tag and vendor Items tabs, the cart page), and onboarding
  is local only, so neither mode writes a row on create. If a create with an amount is added
  later, the two modes will differ.
- **An unknown `logKey` shows the row's `note` if it has one**, else no label. The design
  said "nothing as the label"; a `note` is human text, so it is shown.
- **The list of recipes is joined with a translated separator** (`", "` / `"、"`), not
  `Intl.ListFormat`. The web's TypeScript `lib` is ES2020, which has no `ListFormat` type.
- **An old purchase row of the no-vendor cart** stored the translated "No vendor" text as
  the vendor name. The Log tab reads that text, in either language, as "Bought".
- **A save that changes only `amountPerPackage` is not a stock count.** Both totals use the
  item's `amountPerPackage` after the write, in both modes.
- The log list is a `<ul>` named "Log" (`items.detail.tabs.history`), one `<li>` per row, and
  the date is in a `<time>`. The right-hand number has a screen-reader prefix,
  "After the change:".

Known gaps:

- The design's "Not in this design" items stand: rows from before a unit switch use today's
  `amountPerPackage`.
- No E2E test checks a renamed vendor or recipe; the unit tests and the `NewLogShapes` story
  do.
