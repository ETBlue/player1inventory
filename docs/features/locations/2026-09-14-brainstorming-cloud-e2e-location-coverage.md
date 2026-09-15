# Brainstorming — cloud E2E coverage for locations (issue #284)

**Date:** 2026-09-14
**Issue:** #284
**Context:** comes before PR 3 of the five-PR cloud-locations series.

## Starting point

Issue #284 said cloud E2E covers no location surface, and that the fix was to
build a GraphQL seed helper so the location specs could run in cloud mode.

Two claims in the issue turned out to be wrong. Both were checked against the
source before anything was planned.

## What the code actually says

### 1. A GraphQL request helper already exists

`e2e/utils/cloud.ts` exports `makeGql(request)`. It posts to `CLOUD_GRAPHQL_URL`
with the `x-e2e-user-id` header and throws on a GraphQL error. Six specs already
use it: `shopping`, `cooking`, `item-logs`, `item-list-state-restore`,
`settings/recipes`, `settings/import-export-cloud`.

So the transport is done. What is missing is a fixture layer on top of it.

### 2. `/e2e/cleanup` never deletes `Location`

`apps/server/src/index.ts:29-45` deletes 12 models:

```
inventoryLog, cartItem, cart, itemTag, itemVendor, recipeItem,
item, tag, tagType, vendor, recipe, shelf
```

`location` is not there. Neither is `itemStock`.

`ItemStock` is covered by accident — it has `onDelete: Cascade` on `itemId`, so
deleting items removes the stock rows. `Location` has no such protection.

Every cloud run therefore leaves its locations in the test Neon branch forever.
`ensureDefaultLocation` (`location.resolver.ts:38`) returns early when the user
has any location at all, so run 2 starts with whatever run 1 left behind. A test
such as "user can create a location", which expects to see only "My Home", would
pass once and fail after that.

This has been harmless so far only because no cloud spec creates a location. It
blocks every spec we want to add.

`clearAllData` (`import.resolver.ts:537-562`) already deletes both models in the
correct order, with a comment explaining why `itemStock` must go before both
`item` and `location`. That is the template for the fix.

### 3. Two of the five location specs do not seed IndexedDB at all

All five carry the same copy-pasted comment: "every fixture here seeds
**IndexedDB** through `page.evaluate()`". It is true in three files and false in
two.

| Spec | Seeds IndexedDB? | Evidence |
|---|---|---|
| `settings/locations.spec.ts` | No | UI-driven, 0 `seedRows` calls |
| `location-switcher.spec.ts` | No | UI-driven, 0 `seedRows` calls |
| `location-not-stocked-here.spec.ts` | Yes | 6 `seedRows` calls, lines 133-199 |
| `item-stock-pager.spec.ts` | Yes | 6 `seedRows` calls |
| `item-stock-input.spec.ts` | Yes | 3 `seedRows` calls |

`settings/locations.spec.ts` drives everything through the page: go to
`/settings/locations`, click "Add location", type a name. Its only
`page.evaluate` is the `afterEach` that clears IndexedDB.

`location-switcher.spec.ts` is the same. Its `seedOfficeLocation()` helper (line
76) clicks through the settings page, and its items are made through the Add
combobox.

So 13 of the 16 tests in this work need no seed helper. They need the cleanup
fix, a cloud teardown call, the `test.skip` guards removed, and a `testMatch`
entry.

This is another instance of the rule in root `CLAUDE.md`: an explanatory comment
is a claim, not a fact.

### 4. The bulk import mutations accept client-supplied ids

`ItemInput`, `VendorInput`, `ShelfInput` and `RecipeInput` in
`apps/server/src/schema/import.graphql` all start with `id: ID!`. So a cloud seed
can write those four entity kinds under the same fixed ids the local fixture
already uses.

There is no `LocationInput` and no `ItemStockInput` — PR 4 adds them. So location
ids are the only ones that must come back from the server.

One catch: `bulkCreateItems` calls `mirrorStockToDefaultLocation`
(`import.resolver.ts:87`), so every imported item gets a stock row at the default
location. `createItem` does not do this.

## Questions asked and answers given

**Q1. How much coverage should this work add?**
A: Fix cleanup first, prove it with one spec, decide the rest later.

**Q2. `settings/locations.spec.ts` needs no seed helper. Which spec proves the
work?**
A: Both `settings/locations.spec.ts` and `location-switcher.spec.ts`.

**Q3 (after finding that neither of those two seeds IndexedDB). Include the
cheapest spec that does need a seed helper?**
A: Yes — add `location-not-stocked-here.spec.ts`. 3 more tests, and it forces the
general seed helper that PR 3 will reuse.

**Q4. How should the cloud seed handle the id mismatch?**
A: Use the bulk mutations with the fixture's own fixed ids, then correct the one
stock row that `mirrorStockToDefaultLocation` puts in the wrong place. Only
location ids are dynamic. The fixture data is written once, so the local and
cloud paths cannot drift apart.

**Q5. What happens when a newly-enabled spec fails against real SQL?**
A: Fix small, file large. Anything contained in the web client or a resolver gets
fixed in this PR. Anything needing a schema change or a migration gets an issue
plus a `test.fixme` on that one test, and the rest lands green.

## Decisions

| Decision | Choice |
|---|---|
| Scope | `/e2e/cleanup` `Location` fix, a GraphQL seed helper, 3 specs, 16 tests |
| Specs | `settings/locations`, `location-switcher`, `location-not-stocked-here` |
| Seed design | Bulk mutations with the fixture's fixed ids; location ids returned from the server |
| Found bugs | Fix web-client and resolver bugs here; schema or migration work becomes an issue plus `test.fixme` |

## Deliberately out of scope

- `item-stock-pager.spec.ts` and `item-stock-input.spec.ts`. They seed carts and
  inventory logs, and cart ids change shape in PR 3. Converting them now would
  mean converting them twice.
- `shelves.spec.ts`, `vendors-group.spec.ts`, `recipes-group.spec.ts`,
  `unified-item-search.spec.ts`. They have no cloud awareness at all and would
  each need a cloud fixture written from nothing.
- The false "WHY LOCAL-ONLY" comment in `item-stock-pager.spec.ts` and
  `item-stock-input.spec.ts` is accurate for those two files, so it stays. The
  copies in the three specs we convert get rewritten or deleted.
