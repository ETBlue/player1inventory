# Design — cloud E2E coverage for locations (issue #284)

**Date:** 2026-09-14
**Issue:** #284
**Branch:** `feature/cloud-e2e-locations`
**Brainstorming:** `2026-09-14-brainstorming-cloud-e2e-location-coverage.md`
**Position:** between PR 2 (merged, #283) and PR 3 of the cloud-locations series.

## Goal

Make the cloud E2E project run 16 tests that exercise locations against real
Postgres. Today it runs none.

The reason this comes before PR 3: PR 3 carries the `'no-vendor'` cart-id split,
the riskiest migration in the series. PR 2 shipped with 2042 passing web unit
tests and then failed 13 cloud E2E specs on three real bugs. Going into PR 3 with
the same blind spot is the wrong order.

## What changes

Four things, in this order.

### 1. `/e2e/cleanup` deletes `Location` and `ItemStock`

`apps/server/src/index.ts:29-45` deletes 12 models and misses these two.
`ItemStock` survives by accident, through the `onDelete: Cascade` on its
`itemId`. `Location` does not — cloud runs leave their locations in the test Neon
branch permanently.

`ensureDefaultLocation` (`location.resolver.ts:38`) returns early when the user
has any location, so leftovers are not cleaned up on the next run either. Run 2
of "user can create a location" would see run 1's "Office" and fail.

The fix copies `clearAllData`'s model list and order
(`import.resolver.ts:537-562`).

**Corrected during Task 1.** An earlier draft of this section said `itemStock`
must be deleted before `item` and `location` because `ItemStock_itemId_fkey` is
`ON DELETE CASCADE`. That is wrong for this route. `schema.prisma:236-237` shows
**both** of `ItemStock`'s foreign keys cascade, so the rows go either way and the
order changes nothing that `/e2e/cleanup` can observe. The order only changes the
result in `purgeUserData`, which returns a deleted count. The `itemStock` line is
there to keep the three delete lists identical, not because the route needs it.

The three lists must not drift apart again. `purge-coverage.test.ts` is the
guard, and it reads resolver source from disk rather than a mock.

**What the guard does not cover.** It only checks models that declare a `userId`.
`ItemStock` has none on purpose. So nothing would notice if the `itemStock` line
were removed from `/e2e/cleanup` again — and per the paragraph above, nothing
would break either. Recorded here so it is not counted as covered.

### 2. A shared cloud teardown helper

The nine cloud specs each hand-roll the same `request.delete(.../e2e/cleanup)`
block. The three specs being converted have no cloud teardown at all — their
`afterEach` only clears IndexedDB.

Add one helper. Use it in the three converted specs. Do **not** refactor the nine
existing specs in this PR — that is churn with no test behind it, and it would
hide a real failure inside a large diff.

Cleanup runs in **both** `beforeEach` and `afterEach`, matching
`shopping.spec.ts:14,23`. The `beforeEach` call is the guard against a previous
run that crashed before its teardown.

### 3. A GraphQL seed helper, `e2e/helpers/cloudSeed.ts`

Built on the existing `makeGql` from `e2e/utils/cloud.ts`.

**The fixture is described once, as plain data, and each mode translates it.**
This is the property that keeps the two paths from drifting. A cloud fixture that
has quietly stopped matching its local twin still passes, while proving something
different — the failure mode root `CLAUDE.md` calls a vacuous test.

The shared shape:

```ts
type Fixture = {
  locations: { key: string; name: string; isDefault?: boolean }[]
  vendors:   { id: string; name: string }[]
  items:     { id: string; name: string; vendorIds?: string[] }[]
  stocks:    { itemId: string; location: string /* a locations[].key */ }[]
  shelves:   { id: string; name: string; type: string; order: number; itemIds: string[] }[]
  recipes:   { id: string; name: string; items: { itemId: string; defaultAmount: number }[] }[]
}
```

Entity ids stay fixed in both modes. `ItemInput`, `VendorInput`, `ShelfInput` and
`RecipeInput` all declare `id: ID!`, so the bulk mutations accept the local
fixture's own ids.

**Locations are the exception.** There is no `LocationInput` — PR 4 adds it — so
`createLocation(name:)` returns a server-generated cuid. Locations are therefore
referenced by a symbolic `key` (`'HOME'`, `'OFFICE'`), and both seed functions
return a `Record<key, realId>` map. In local mode that map holds the fixture's
fixed ids (`HOME` is `'local'`, the default-location sentinel). In cloud it holds
cuids.

**Stock reconciliation.** `bulkCreateItems` calls
`mirrorStockToDefaultLocation` (`import.resolver.ts:87`), so every seeded item
lands with a stock row at the default location whether the fixture wants one or
not. The cloud seed therefore reconciles after the bulk create rather than
assuming what the mirror did:

- for every `(item, location)` pair the fixture lists → `upsertItemStock`
- for every pair that exists in the database but is not in the fixture →
  `removeItemFromLocation`

In the not-stocked-here fixture this removes exactly one row: Coffee at Home.
That row is the whole point of the fixture, so the reconciliation step is the
part most worth a mutation check.

### 4. Three specs join the cloud project

| Spec | Tests | What it needs |
|---|---|---|
| `settings/locations.spec.ts` | 5 | cleanup fix + teardown; no seeding |
| `location-switcher.spec.ts` | 8 | cleanup fix + teardown; no seeding |
| `location-not-stocked-here.spec.ts` | 3 | cleanup fix + teardown + seed helper |

For each: remove the `test.skip(baseURL === CLOUD_WEB_URL, ...)` guards, rewrite
the false "WHY LOCAL-ONLY" header comment, and add the file to the `cloud`
project's `testMatch` in `e2e/playwright.config.ts`.

The same header comment is accurate in `item-stock-pager.spec.ts` and
`item-stock-input.spec.ts`, which do seed IndexedDB. It stays there.

## What each of the 16 tests will actually exercise

Worth stating, because "the spec now runs in cloud" is not the same claim as
"these resolvers now touch SQL".

| Resolver | First real SQL coverage from |
|---|---|
| `createLocation` | `settings/locations` — create, reorder |
| `updateLocation` | `settings/locations` — rename |
| `deleteLocation` | `settings/locations` — delete, and the default-location refusal |
| `reorderLocations` | `settings/locations` — reorder |
| `locations` query + `ensureDefaultLocation` | every converted test |
| `upsertItemStock` | `location-switcher` — pantry re-scoping |
| `addItemToLocation` | `location-switcher` — copy-on-add through the combobox |
| `itemStocks` / `PantryData` | `location-not-stocked-here` — all three grouping axes |

`removeItemFromLocation` is exercised by the seed helper's reconciliation, not by
a test assertion. That is seeding, not coverage — the plan records it as such
rather than counting it.

## Risks

**The default location's name.** Cloud's `ensureDefaultLocation` uses
`DEFAULT_LOCATION_NAME = 'My Home'` (`location.resolver.ts:8`), and the local
specs assert on the literal "My Home". These agree today. If they ever diverge,
these specs break in cloud only. Not worth abstracting now; worth knowing.

**`HOME = 'local'`.** `location-not-stocked-here.spec.ts:45` hardcodes the local
sentinel as the Home location id. The symbolic-key indirection exists precisely
to stop that constant leaking into the cloud path.

**Newly-found bugs.** Decided during brainstorming: bugs contained in the web
client or a resolver get fixed in this PR. Anything needing a schema change or a
Prisma migration gets a GitHub issue plus `test.fixme` on that single test, with
the issue number in the annotation, and the rest lands green. No spec is deleted
or re-skipped to make the suite pass.

**Run isolation.** `e2e/CLAUDE.md` — only one E2E suite may run on this machine
at a time. Check ports 5174, 5175 and 4001 are free and stay free for about 90
seconds before starting a run. A run showing `ERR_CONNECTION_REFUSED` is void.

## Not in scope

- `item-stock-pager.spec.ts`, `item-stock-input.spec.ts` — they seed carts and
  inventory logs, and cart ids change shape in PR 3. Converting now means
  converting twice.
- `shelves.spec.ts`, `vendors-group.spec.ts`, `recipes-group.spec.ts`,
  `unified-item-search.spec.ts` — no cloud awareness at all; each needs a cloud
  fixture written from nothing.
- Refactoring the nine existing cloud specs onto the shared teardown helper.
- `LocationInput` / `ItemStockInput` for the bulk import mutations. That is PR 4.

Issue #284 stays open after this PR if any of the above is still wanted; the plan
says which parts it closes.
