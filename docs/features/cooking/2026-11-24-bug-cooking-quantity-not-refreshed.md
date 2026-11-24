# Bug: the cooking page keeps the old quantity after Done (cloud)

Date: 2026-11-24. Issue #404. Found by the owner during step D.8 of the households release,
and seen again on the households bundle in production.

## Bug description

In cloud mode, after **Done** on `/cooking`, the server lowers the stock of the cooked
items. But the quantity bar of each cooked item (`ItemCard`) keeps the old value. It shows
the new amount only after the user leaves the page and comes back.

## Root cause

- The quantity bar reads `useItems()`, which in cloud mode reads the `PantryData` query
  (`itemStocks` → the normalized `ItemStock:<id>` rows), with `cache-and-network`.
- The cloud branch of `useConsumeRecipes` (`apps/web/src/hooks/useRecipes.ts`) sends
  `ConsumeRecipes` with no `refetchQueries`, no `update` and no `refetchAfterWrite`.
- `ConsumeRecipes` returns only `itemResults { itemId success error }` and `allSucceeded`.
  It returns no `ItemStock`, so Apollo has nothing to put in its cache.
- The hook's `onSuccess` invalidates the TanStack keys `['items']` and `['recipes']`. In
  cloud mode those queries are off, so this does nothing.
- The server sends the live `STOCK` event to other tabs only, never to the tab that made
  the change.

So nothing reads `PantryData` again until the page mounts again. The same gap leaves
`GetRecipes` (`lastCookedAt`) stale on the page.

Shopping checkout looks right only because it moves to `/shopping` after the checkout, and
the new page reads `PantryData` again. It does not refetch `PantryData` either.

Local mode should not have this bug: the local write invalidates `['items']`, which matches
the key `useItems()` reads.

## Fix applied

The cloud branch of `useConsumeRecipes` (`apps/web/src/hooks/useRecipes.ts`) now gets the
location id once, awaits the mutation, and then awaits
`refetchAfterWrite([...stockListRefetches(locationId), { query: GetRecipesDocument }])`
through `useRefetchAfterWrite()`. `stockListRefetches` is now exported from `useItems.ts`
(not copied). It gives `PantryData` as `{ query, variables }` for the location the cook was
sent to, and `'ItemStocksForItem'` by name.

- Not `'PantryData'` by name: a skipped observer parked on the `'local'` sentinel would be
  read again and the server would answer `FORBIDDEN`.
- Not the mutation's own `refetchQueries` with `awaitRefetchQueries`: one failed read would
  reject a cook the server saved. `refetchAfterWrite` never rejects.
- The Done dialog stays busy until the reads land, like the other stock writes.
- Offline: `offlineWriteLink` fails the mutation at once (`OfflineWriteError`), so the
  refetch never runs and nothing hangs.

Not changed: shopping checkout has the same missing `PantryData` refetch. It looks right only
because it moves to `/shopping` after the checkout.

## Test added

`apps/web/src/hooks/useConsumeRecipes.cloud.test.tsx`, 2 tests, with the real Apollo cache.
The `ConsumeRecipes` mock changes the server state (5 → 3 packages, `lastCookedAt` null →
set), so a read before the cook and a read after it give different answers. The test reads
the cache right after `mutateAsync`, with no `waitFor`, so a read that is started but not
awaited fails.

- Red before the fix: `expected 5 to be 3` and `expected undefined to deeply equal
  2026-11-24T08:00:00.000Z`.
- Mutation checks, each red: the refetch call removed (2 red); `stockListRefetches` given
  another location (1 red); `GetRecipesDocument` removed (1 red); `await` changed to `void`
  (1 red).
- Not added: an E2E step that checks the quantity on `/cooking` right after Done. The
  existing `cooking.spec.ts` checks only after moving to the item page, which hides this bug.

## PR / commit

- Fix: `7f58f62a` fix(cooking): refresh the stock after cooking in cloud mode
- Doc: the commit that adds this file
