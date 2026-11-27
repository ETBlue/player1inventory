# Design: expiry from the last restock

Date: 2026-11-26. Branch `feature/expiry-from-last-restock`, from `develop` at `f28be289`.
Owner request, the same day: "calculation for item expiration: use the last inventory log
with positive delta (either cart checkout or stock count), instead of using last purchase
date". Owner decision after the options below: **option 3, one rule for both** the expiry
and the Purchased sort.

**This reverses option A** of `2026-11-25-inventory-log-layout-design.md` (its line 18: "A
stock count never changes the 'last purchased' date or the expiry date"). That doc now
points here.

## Summary

1. **Where it sits.** A "days from purchase" item expires `estimatedDueDays` after its last
   purchase date. Since 2026-11-25 a Stock tab save or a Quick update that changes the
   amount writes a `stockCount` log row. Option A skipped those rows, so a person who
   restocked by counting, not by checking out a cart, kept the old expiry.
2. **Relations.** Server and web, no schema change, no migration. Any release order works:
   the server's `lastPurchaseDates` keeps its arguments and its answer shape. Until both
   are deployed, cloud and local may disagree for an item with a positive stock count.
3. **What the user gets** once merged and deployed:
   - Counting stock up (a Stock tab save, a Quick update) restarts a "days from purchase"
     expiry from that day, in both modes.
   - The **Purchased** sort uses the same date, so a counted-up item moves too.
   - The pantry shows the new date right after the save, with no reload.
4. **What the developer gets:**
   - One rule, in two places that say the same thing: the newest log row at the location
     with `delta > 0`, any kind.
   - The server query loses its `logKey` filter and its SQL `NULL` trap.
   - A same-tab refresh gap is closed (below), so the save itself reads the date again.
   - Cost: the name `lastPurchaseDate(s)` now means "last restock". It stays, with a
     comment (see *Names*).

## The rule

The base date is the `occurredAt` of the newest `InventoryLog` row for the item **at that
location** with `delta > 0`. A checkout row, a stock count that raised the amount, and an
old row with no `logKey` all count. A row with `delta <= 0` never counts. With no such row
there is no base date, and the item shows no expiry (unchanged).

| Place | Code |
|---|---|
| server | `lastPurchaseDates` in `apps/server/src/resolvers/inventoryLog.resolver.ts`: `where: { itemId, locationId, delta: { gt: 0 } }`, newest `occurredAt` |
| local | `getLastPurchaseDate` in `apps/web/src/db/operations.ts`: the location's logs, `delta > 0`, newest |

The `date` expiration mode is not touched: it uses the stored `dueDate` and no log.

## The options that were weighed

| # | Option | Why not / why |
|---|---|---|
| 1 | web only: one `itemLogs` read per visible item | one request per card and every log of every item; issue #305 removed exactly this |
| 2 | web only: the whole-household `inventoryLogs` | every log of the household on every list page |
| 3 | drop the stock count filter in both places | **chosen**: no schema change, any deploy order, one rule for expiry and the Purchased sort |
| 4 | a new nullable `lastRestockDate` field next to `date` | keeps the Purchased sort on option A, but needs server first, then web, and two dates to keep apart |

## The same-tab refresh

Before this change a stock count could not move the date, so a save did not read the date
again. Now it must:

| Mode | Change |
|---|---|
| local | `useUpdateItem` also invalidates `['sort']` (the `useItemSortData` keys) |
| cloud | `useUpdateItem`'s stock write also refetches `LastPurchaseDates` by name. The live `LOG` event never reaches the tab that made the change |

## Names

`lastPurchaseDate`, `lastPurchaseDates`, `getLastPurchaseDate`, `purchaseDates` and the
`ItemCard` prop keep their names. Renaming them would touch the GraphQL field (a breaking
schema change), a generated hook and about 20 call sites, for no change in behaviour. The
two functions that apply the rule carry a comment saying the date means "last restock".

## Tests

- Server (`inventoryLog.resolver.test.ts`, the block *counts every row that added stock*,
  which replaces *ignores stock count rows*): a checkout row; a newer positive stock count;
  an old `null`-key row; a newer negative and zero row do not move the date; a positive
  stock count at another location does not count; only a negative row gives `null`.
- Local (`operations.test.ts`): the same six, plus a real `updateItem` save that raises
  the amount.
- Hooks: `useItems.test.tsx` (local) and `useItemStockWrites.cloud.test.tsx` (cloud): after
  a save that raises the amount, `useItemSortData`'s date moves without a remount.
- Mutation checks, server and local each: accept any delta, ignore the location, put the
  stock count filter back. Plus: drop the `['sort']` invalidation, drop the
  `LastPurchaseDates` refetch. Each one turned a test red.
- E2E `expiry-from-restock.spec.ts`, `local` and `cloud`: Yogurt bought 20 days ago and
  Kefir 5 days ago (30 days from purchase) show 10 and 25 days and sort Yogurt first by
  Purchased; a Quick update of Yogurt moves it to 30 days and after Kefir, with no reload.
  The cloud seed uses the import mutations, because `upsertItemStock` now writes a stock
  count row dated now, which would be a restock under this rule.
