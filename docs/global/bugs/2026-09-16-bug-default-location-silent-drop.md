# Bug: a stock write was dropped in silence when the user had no Location

- **Issue:** [#287](https://github.com/ETBlue/player1inventory/issues/287)
- **Found:** 2026-09-14, on branch `feature/cloud-e2e-locations` (issue #284)
- **Fixed:** 2026-09-16, on branch `fix/default-location-silent-drop`
- **Area:** cloud backend — the PR-2 stock dual-write bridge

## Bug description

A cloud stock write could disappear with no error anywhere.

`defaultLocationId(userId)` in `apps/server/src/lib/stockDualWrite.ts` returned `null`
when the user had no `Location` row. `mirrorStockToDefaultLocation` then returned early
and wrote nothing:

```ts
const locationId = await defaultLocationId(userId)
if (!locationId) return          // the write disappears here
```

Since PR 2 of cloud locations the cloud pantry reads `ItemStock`, not `Item`'s legacy
columns. So the item was created, its `Item` columns were set, and the item was
**invisible in the pantry**. Nothing logged and nothing threw.

Five call sites were affected:

| File | Function | How it reached the bug |
|---|---|---|
| `apps/server/src/resolvers/item.resolver.ts` | `updateItem` | `mirrorStockToDefaultLocation` |
| `apps/server/src/resolvers/import.resolver.ts` | `bulkCreateItems` | `mirrorStockToDefaultLocation` |
| `apps/server/src/resolvers/import.resolver.ts` | `bulkUpsertItems` | `mirrorStockToDefaultLocation` |
| `apps/server/src/resolvers/cart.resolver.ts` | `checkout` | `defaultLocationId` directly |
| `apps/server/src/resolvers/recipe.resolver.ts` | `consumeRecipes` | `defaultLocationId` directly |

## Root cause

`ensureDefaultLocation` was called from exactly one place: the `locations` query
resolver. Nothing else created a default location. So any account whose first stock write
arrived **before** its first `locations` query lost that write.

The web client always loads the app first, and the app queries `locations`, so a normal
user was not affected. The exposed paths were:

- an API client that calls `bulkCreateItems` or `updateItem` without loading the app
- a cloud E2E spec that seeds over GraphQL before the browser opens
- any future entry point that writes before it reads

### The comment that justified the no-op was wrong

The comment on `mirrorStock` said the silent no-op was acceptable because of "a user
whose account predates PR 1's backfill". That class of user does not exist. PR 1's
migration (`apps/server/prisma/migrations/20260830000000_add_location_and_item_stock/migration.sql`)
backfills one default `Location` for every user holding a row in any of nine tables
(`Item`, `TagType`, `Tag`, `Vendor`, `Recipe`, `Cart`, `CartItem`, `InventoryLog`,
`Shelf`). Every user who predates the backfill and owns any data got a location.

### How it was found

`/e2e/cleanup` started deleting `Location` on 2026-09-14. Every cloud E2E test then began
with zero locations for the first time, and
`[cloud] cooking.spec.ts > user can cook a recipe with partial items and multiple servings`
started failing: the Stock tab showed a packed quantity of 0 where the test expects 6.
That spec seeds stock over GraphQL before the browser loads.

## Fix applied

Option 1 from the issue: create the default location instead of returning `null`.

| File | Change |
|---|---|
| `apps/server/src/lib/defaultLocation.ts` | **New.** Holds `DEFAULT_LOCATION_NAME` and `ensureDefaultLocation(userId): Promise<string>`, which returns the user's default location id and creates it when they have none. |
| `apps/server/src/resolvers/location.resolver.ts` | `ensureDefaultLocation` and `DEFAULT_LOCATION_NAME` moved out to `lib/defaultLocation.ts`; the `locations` query imports it from there. |
| `apps/server/src/lib/stockDualWrite.ts` | `defaultLocationId` is now a thin alias for `ensureDefaultLocation` and returns `string`, never `null`. `mirrorStockToDefaultLocation` lost its `if (!locationId) return`. The false comment on `mirrorStock` is replaced. |
| `apps/server/src/test/stockFake.ts` | Added `location.create`, which enforces the partial unique index on `("userId") WHERE "isDefault"` and throws `P2002` for a second default. |

Three constraints shaped the fix.

**The function lives in `lib/`, not in a resolver.** `stockDualWrite.ts` is in `lib/` and
must not import a resolver module. `lib/defaultLocation.ts` also outlives PR 5, which
deletes `stockDualWrite.ts` entirely.

**The common path still costs one query.** The `findFirst` runs first and returns on its
own. The create path runs only for a user who has no default. A test asserts
`findFirst` is called exactly once in that case, because `checkout` and `consumeRecipes`
call this on every purchase and every cook.

**Race safety is preserved.** The partial unique index means a concurrent second insert
loses with `P2002`. The loser catches it, re-reads, and returns the winner's id. A create
that failed for any other reason finds nothing on the re-read and its error is rethrown
instead of swallowed — the old code swallowed everything, which is what made the original
bug silent.

### One behaviour change worth recording

`ensureDefaultLocation` used to skip the create when the user had **any** location. It now
skips it when the user has a **default** location. A user with locations but no default
should not exist — the migration backfills `isDefault`, `createLocation` always writes
`isDefault: false`, and `deleteLocation` refuses to delete the default — so this repairs a
state nothing can produce today rather than changing a real one.

The callers' `items.length > 0 ? await defaultLocationId(userId) : null` guards in
`cart.resolver.ts` and `recipe.resolver.ts` were left alone. They stop a location being
created when there is nothing to write.

## Test added

`apps/server/src/lib/defaultLocation.test.ts` (new, 5 tests):

| Test | What it pins |
|---|---|
| returns the existing default and creates nothing | the common path, with a second location for the same user and a stranger's `isDefault` row so "the caller's default" is distinguishable from "the first default row in the table" |
| costs exactly one query when the user already has a default | no extra query on the common path |
| creates the default when the user has none, and returns its id | the fix |
| returns the winner id after losing the create race, without a duplicate | `P2002` is caught and the re-read returns the winner |
| rethrows a create failure that is not a lost race | a non-race failure is not swallowed |

`apps/server/src/resolvers/item.resolver.test.ts` (new test): `updateItem` for a user with
no locations creates the default and writes the `ItemStock` row into it. This is the test
that pins the reported bug through a real resolver.

`apps/server/src/resolvers/cart.resolver.test.ts` and
`apps/server/src/resolvers/recipe.resolver.test.ts`: the two tests named "a user with no
locations still checks out / still cooks — the mirror is skipped, not fatal" asserted the
**old** behaviour (`itemStocks` stays empty). They now assert the new one — a default
location is created and the purchase / the cook lands in it.

`apps/server/src/test/stockFake.test.ts` (2 new tests): a second default for one user
throws `P2002`; a default for a different user is allowed. The fake's own constraint is
what makes the create tests able to fail.

### Mutation check

| Mutation in the source | Result |
|---|---|
| `ensureDefaultLocation` returns `null` again when no default is found | RED — 7 tests, including the create test, the `updateItem` test and the `checkout` / `consumeRecipes` tests. Failure text: `expected undefined to be defined`, `expected undefined to match object { isDefault: true, name: 'My Home' }` |
| `ensureDefaultLocation` always creates, even when one exists | RED — 2 tests. Failure text: `expected "vi.fn()" to not be called at all, but actually been called 1 times` and `expected "vi.fn()" to be called 1 times, but got 2 times` |
| the re-read after `P2002` is removed (swallow and return `null`, like the old code) | RED — 2 tests. Failure text: `expected null to be 'loc_home'` and `promise resolved "null" instead of rejecting` |

Each mutation was restored afterwards and the suite went green again (173 server tests).

## Related documentation updated

- `e2e/CLAUDE.md` — the section that told seeds to create the default location first now
  records that the server no longer drops the write, and why
  `ensureCloudDefaultLocation` is still there.
- `e2e/helpers/cloudSeed.ts`, `e2e/tests/cooking.spec.ts`,
  `e2e/tests/location-switcher.spec.ts`, `e2e/tests/settings/locations.spec.ts`,
  `apps/server/src/index.ts`, `apps/server/src/resolvers/import.resolver.test.ts` —
  comments that described the drop or pointed at the old file path.

`ensureCloudDefaultLocation` (`e2e/helpers/cloudSeed.ts`) was **kept**. It is no longer a
workaround: `seedCloudFixture` needs the default location's id to map the fixture's
default key onto, and its name to decide whether to rename it.

## No migration

None needed. The fix changes resolver behaviour only. The partial unique index it relies
on was added by PR 1's migration.

## PR / commit

- Fix + tests: `5a9ebf0e` — *fix(locations): create the default location instead of
  dropping the stock write*, on branch `fix/default-location-silent-drop`
- Docs (this file, `e2e/CLAUDE.md`, `docs/INDEX.md`, the stale comments): the next commit
  on the same branch
- PR: not opened yet
