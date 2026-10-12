# Plan — four E2E specs that run in no cloud project (#323)

**Date:** 2026-10-12
**Branch:** `feature/cloud-spec-coverage` · worktree `.worktrees/feature-cloud-spec-coverage`
**Base:** `main` at `f8b89474`
**Issue:** #323

PR 2 of two. PR 1 (#345) made `e2e/` type-checked and linted, which is why it went first: the fixtures this PR writes are checked by `pnpm typecheck:e2e`, where before they would have been checked by nothing.

## Why this matters

Every server unit test runs against a hand-written Prisma fake. **A resolver named by no `cloud` spec has never run against real Postgres.** Issue #284 found three real bugs that way which ~2000 passing unit tests could not see.

Measured on this branch: **29 spec files under `e2e/tests/`, 22 in the `cloud` project's `testMatch`, 7 outside.**

## What the investigation changed

#323 names four cloud candidates. After reading all four, **three are worth doing and one is not.**

### `onboarding.spec.ts` is dropped, and the reason is filed as #347

`useOnboardingSetup` imports `createItem`, `createTag`, `createTagType` and `createVendor` from `@/db/operations`, which is pure Dexie — `grep -c "apollo\|useQuery\|gql" apps/web/src/db/operations.ts` returns **0** — and the hook's own comment says "Local-mode only".

So in cloud, `user can select template items and complete onboarding` would write to IndexedDB, reach **zero** resolvers, and still pass `await expect(page).toHaveURL('/')`, because `onboarding.tsx` navigates on local mutation success. That is a test that reports as covered and is not. Its other two tests pass and add no resolver coverage beyond `items`, `tags`, `vendors` and `locations`, all covered many times over.

**#347** tracks the product gap. This PR does not touch that spec.

### The cheapest spec and the most valuable spec are different

| Spec | Tests | Cost | New resolvers against real SQL |
|---|---|---|---|
| `settings/shelves.spec.ts` | 1 | lowest — likely under 15s in cloud | `shelf(id:)`, `deleteShelf` |
| `settings-global-pages.spec.ts` | 2, one skipped in cloud | low | none new; it proves the client-side join still suppresses stock when stock arrives over GraphQL |
| `unified-item-search.spec.ts` | 10 | highest — around 1.1 to 1.5 min added | **`applyShelfFilterPicks`**, `updateShelf(itemIds:)`, `shelf(id:)` |

**`applyShelfFilterPicks` is the single highest-value target in #323, and the issue never names it.** `apps/server/src/resolvers/shelf.resolver.ts:85` is a `prisma.$transaction` doing `deleteMany` plus `createMany` on the composite-key `ItemTag` and `ItemVendor` join tables, a `recipeItem.create`, and a `findUniqueOrThrow`. Its own comment describes a Postgres `READ COMMITTED` deadlock it guards against. No cloud spec calls it, and the root `CLAUDE.md` records that the Prisma fake models only the interactive callback form of `$transaction` — so real SQL is the only way to exercise it.

**Expect the possibility of a real failure on first contact.** That is the point of the work, not a reason to avoid it.

### `Fixture` has six gaps, not the four #323 lists

`e2e/helpers/fixture.ts`'s `Fixture` has six keys: `locations`, `vendors`, `items`, `stocks`, `shelves`, `recipes`.

| Gap | Named by #323? | Needed by |
|---|---|---|
| `tags` | yes | specs 2 and 3 |
| `tagTypes` | yes | specs 2 and 3 |
| `inventoryLogs` | yes | none of these |
| `cartItems` / `shoppingCarts` | yes | none — see below |
| **`shelves[].filterConfig`** | **no** | spec 3, tests 7 and 8 |
| **`items[].tagIds`** | **no** | specs 2 and 3. `seedCloudFixture` hardcodes `tagIds: []` |

**No server work is needed.** `bulkCreateTagTypes` and `bulkCreateTags` already exist and both preserve fixture ids (`TagTypeInput` and `TagInput` declare `id: ID!`). The whole gap is in the `Fixture` type and the two seed helpers. **Order matters:** `bulkCreateTags` drops any tag whose `typeId` does not already exist, so tag types go first.

### Two false comments probably explain why this sat

- `settings-global-pages.spec.ts:11-14` — *"cloud has no `ItemStock` and no locations, so neither behaviour is meaningful there"*. Untrue since cloud-locations PR 1; `useItems()` in cloud reads `itemStocks(locationId:)` through `PantryData` and joins client-side.
- `unified-item-search.spec.ts:22` — refers to *"the `test.skip` guards below"*. That file has **zero** `test.skip` calls.

Correct both while in the files.

## Two fixture rules, confirmed against source

1. **Exactly one location must set `isDefault: true`**, or `defaultFixtureLocation` throws. Both seed helpers call it.
2. **Keep the default location first in the array.** `seedLocalFixture` writes `order: index`; `seedCloudFixture` skips the default and discards its array position. **The hazard is that cloud is silent, not that cloud breaks** — a 2026-09-24 measurement found that moving the default out of first position left cloud unchanged at 4 passed / 1 skipped and made **local** fail 1.

## A counting rule for the success criteria

`test.skip(condition, reason)` is a **runtime** skip, so Playwright still collects the test. Adding one moves the passed/skipped split, not the `--list` total. State expected results as "N passed / M skipped per project", measured per file — never as a collected count.

---

## Task 1 — `settings/shelves.spec.ts` into cloud

**The cheapest, and it establishes the pattern the next two reuse.**

Its seed today is a hand-written `page.evaluate` with `indexedDB.open('Player1Inventory')` and a direct `objectStore('shelves').put(...)` — not even `seedRows`. `Fixture` already covers what it needs:

```ts
const FIXTURE: Fixture = {
  locations: [{ key: 'HOME', name: 'My Home', isDefault: true }],
  vendors: [], items: [], stocks: [],
  shelves: [{ id: shelfId, name: 'My Test Shelf', type: 'selection', order: 1, itemIds: [] }],
  recipes: [],
}
```

`ShelfInput` declares `id: ID!`, so the fixed uuid survives into Postgres and the spec keeps navigating by literal id.

1. Replace the hand-written seed with `seedLocalFixture` / `seedCloudFixture`, branching on `baseURL === CLOUD_WEB_URL`.
2. Add `cleanupCloudData` to **both** `beforeEach` and `afterEach` — `e2e/helpers/cloudTeardown.ts` says to use both, so a previous crashed run cannot leave data behind.
3. Add `'**/settings/shelves.spec.ts'` to the `cloud` project's `testMatch`. **One edit only** — the `local` project has no `testMatch`, so it keeps running there automatically. Do **not** add a `testIgnore` entry; its local run is real coverage.

**Watch the two-files-one-basename trap.** `e2e/tests/shelves.spec.ts` (the pantry group view) is already in cloud via `'**/tests/shelves.spec.ts'`. Your new entry must be `'**/settings/shelves.spec.ts'` so the two stay distinct.

**One thing the investigation could not settle:** whether the shelf card renders at `/?groupBy=shelf` in cloud with `itemIds: []` and no items in the account. The local test asserts `getByText('My Test Shelf')` is visible. If `ShelfGroupView` treats an empty account differently from an empty shelf, this surfaces on first run. Report what you see rather than working around it.

**Mutation check.** Break `deleteShelf`'s cloud branch — or the `shelf(id:)` selection — and confirm the cloud run goes red. A spec that passes against a broken resolver is not coverage.

---

## Task 2 — `settings-global-pages.spec.ts` test 1 into cloud

**This is where `Fixture` gains tags.** Doing it on a two-entity fixture is much easier than inside the ten-test spec.

1. Add `tags`, `tagTypes` and `items[].tagIds` to `Fixture`, and thread them through **both** `seedLocalFixture` and `seedCloudFixture`. Use `bulkCreateTagTypes` then `bulkCreateTags` — in that order, because `bulkCreateTags` drops a tag whose `typeId` does not exist yet. `seedCloudFixture` currently hardcodes `tagIds: []` when it calls `bulkCreateItems`; that has to take the fixture's value.
2. Rewrite test 1's four `seedRows` calls onto the fixture. **`locationId: 'local'` is hardcoded at line 99** and is the main blocker — it must come from the fixture's resolved location id.
3. `consumeAmount: 0` at line 89 should become `1`. A 0 is a state the app never creates and `ItemForm` flags it invalid. The spec never opens that form so it does not fail today, but do not carry it into a rewrite.
4. **Skip test 2 in cloud** — `test.skip(baseURL === CLOUD_WEB_URL, …)` with a reason naming that `Sidebar.tsx` has no mode conditional, so a cloud run measures the same markup twice.
5. Fix the false header comment at lines 11-14.
6. Add `'**/settings-global-pages.spec.ts'` to the `cloud` `testMatch`.

**Mutation check.** The value here is that `showStock={false}` still suppresses stock when the stock arrives over GraphQL rather than from Dexie. Break that suppression and confirm the cloud run goes red — if it stays green, the cloud half of this test proves nothing and you should say so.

---

## Task 3 — `unified-item-search.spec.ts` into cloud

**The most valuable and the most work.** Do it last, so only `shelves[].filterConfig` remains to add.

1. Add `shelves[].filterConfig` to `Fixture` and to `seedCloudFixture`'s `bulkCreateShelves` call. `ShelfInput` already declares `filterConfig: FilterConfigInput`.
2. Rewrite the seeding: five `beforeEach` seeds plus six more in test bodies, 15 `seedRows` sites in all.
3. **`HOME = 'local'` (line 25) and `OFFICE = 'office-loc'` (line 26) both have to go.** In cloud the default location id is a server cuid and non-default locations come back from `createLocation`.
4. **Drop the `shoppingCarts` seed rather than translating it.** In cloud, `/shopping/{vendorId}` resolves its cart through the `vendorCart(vendorId, locationId)` query, which creates the cart when missing, plus `bootstrapCarts`. Seeding a cart with the local id shape would be wrong.
5. Fix the false `test.skip` comment at line 22.
6. Add `'**/unified-item-search.spec.ts'` to the `cloud` `testMatch`.

**Two things the investigation could not settle. Check both early rather than at the end:**

- **Test 4 uses the literal `'no-vendor'` in a URL** (`shopping.searchInCart('no-vendor', 'milk')`). In cloud the cart id is `` `${locationId}:${vendorId | 'no-vendor'}` ``, and `cart-id-cross-user-leak.spec.ts` exists because a bare `'no-vendor'` id collided across users (#327). Whether the route resolves it correctly in cloud is unknown.
- **`applyShelfFilterPicks` has never run against Postgres.** Tests 7 and 8 reach it. A first-run failure is a real possibility and would be a genuine finding — report it rather than adjusting the test to pass.

**Mutation check.** Break `applyShelfFilterPicks` — drop one of its `createMany` calls — and confirm tests 7 or 8 go red in cloud. This is the assertion the whole PR exists for.

---

## Task 4 — documentation

1. `e2e/CLAUDE.md` — the cloud spec list and counts; the `Fixture` section gains tags, tagTypes, tagIds and filterConfig.
2. Root `CLAUDE.md` — the cloud `testMatch` file count, and the list of which resolvers have real-SQL coverage.
3. `docs/INDEX.md` — a row under `testing`.
4. This plan — its final state, including anything the investigation got wrong.

---

## Verification gate

```bash
pnpm lint
pnpm build 2>&1 | tee /tmp/p1i-build-csc.log
grep 'TS6385' /tmp/p1i-build-csc.log && echo FAIL || echo OK
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
pnpm test
pnpm typecheck:e2e
```

The first line is the **root** `pnpm lint` since #345 — it covers `apps/web` **and** `e2e/`. `apps/web` has **4** pre-existing warnings; `e2e/` has **13** accepted. Neither may grow.

**Baseline on this branch:** web **2304** / 251 files, server **391** / 27 files, local **174 passed / 5 skipped**, cloud **102 passed / 6 skipped**, pwa **69**. Re-measure rather than subtracting.

**Run `pnpm codegen` in a fresh worktree.** It has been run here. If `pnpm test:web` ever reports about **1176** tests with **124 failed suites** and zero failed tests, that is a missing codegen, not starvation — every failure reads `Failed to resolve import "@/generated/graphql"`.

**Final phase:** the three projects as separate invocations, `cloud` in chunks. Swap has been near its limit all week. A killed run, or a failing set that **moves** between runs, is starvation; an assertion with a value difference is real. Two failures in #342 and one in #345 were all transient and all proved so by running the spec alone and re-running the chunk.

## What the user gets (UX)

Nothing. Tests.

## What the developer gets (DX)

| Gain | Specifics |
|---|---|
| A transaction that has never met SQL finally runs | `applyShelfFilterPicks`, with its documented `READ COMMITTED` deadlock hazard |
| Four more resolvers with real-SQL coverage | `shelf(id:)`, `deleteShelf`, `updateShelf(itemIds:)`, plus `applyShelfFilterPicks` |
| A fixture that can express what specs need | `Fixture` gains tags, tagTypes, `items[].tagIds` and `shelves[].filterConfig` — four gaps, two of which #323 never listed |
| Honest documentation | two false comments that each told a reader this work was not worth doing |

**DX cost:** the `cloud` project grows by three files and about 1.5 minutes, on a machine where swap already reaches its limit.
