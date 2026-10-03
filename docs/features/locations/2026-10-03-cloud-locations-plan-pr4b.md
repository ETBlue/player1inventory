# Cloud locations PR 4b — implementation plan

**Date:** 2026-10-03
**Status:** 🔲 Pending
**Design:** [cloud locations PR 4 design](2026-10-02-cloud-locations-pr4-design.md)
**Brainstorming:** [PR 4 brainstorming](2026-10-02-brainstorming-pr4.md)
**Branch:** `feature/cloud-locations-pr4b`
**Worktree:** `.worktrees/feature-cloud-locations-pr4b`, based on `main` at `fbdd8869`
(PR 4a merged)

---

## What this PR is

The payload shape and **both** import readers, in one diff.

4a added the server surface and nothing calls it. 4b is the client: cloud export becomes
lossless, cloud import carries real locations, and the code that existed only to collapse a
pantry onto one location is deleted.

**Why export and import cannot be split.** Two import readers use the **old payload shape as
a signal**, so changing the export alone breaks them:

| Export change | Reader that breaks | Evidence |
|---|---|---|
| Cloud export starts carrying `itemStocks` | `flattenPayloadForCloud` returns early when `itemStocks` is absent (`importData.ts:365`), treating absence as "already flat". A cloud → cloud import would start flattening: collapsed onto one location, cart prefixes stripped. | `importData.ts:361-433` |
| Cloud export starts carrying `locations` | `deserializeLocation` derives `isDefault` from `raw.id === 'local'` (`importData.ts:137-144`). A cloud backup's ids are cuids, so nothing is flagged and `ensureDefaultLocationRow()` adds a stray empty default. | then `importData.ts:1120` |

The same absence is also read at `importData.ts:263` (`upgradeLegacyPayload`) and
`importData.ts:460` (`resolveFlattenLocationId`). Three readers, one signal.

## What the user gets (UX)

Two real gains, both needing a **deploy**, not just a merge.

1. **Signing in stops throwing away your pantry.** Today a local → cloud copy keeps one
   location's stock and silently discards every other location. The dialog that warns about
   it is deleted because the warning stops being true.
2. **Cloud backups become complete.** Today a cloud export cannot restore your locations,
   your per-location stock, which location a log belongs to, or — found while planning —
   any log's **message**, because `logKey` and `logParams` are dropped too.

## What the developer gets (DX)

| Gain | Specifics |
|---|---|
| Less code to maintain | `flattenPayloadForCloud` (73 lines), `resolveFlattenLocationId` + its two helpers (45 lines), `MigrationLocationWarningDialog` (4 files), 4 i18n keys × 2 languages, and 2 of the 6 `stockDualWrite` calls |
| Less to remember | the "a payload with no `itemStocks` is a cloud export" sniff test goes away. It is an invisible coupling between one writer and three readers, and it is why 4a and 4b could not be cut the other way round |
| Fewer ways to get it wrong | one remap rule replaces three different location decisions — flatten's chosen location, `deserializeLocation`'s id test, and the resolvers' default fallback |
| A failure that now has a name | both `verifyRelations` copies gain a location assertion. Today **neither checks a location or a quantity**, so every imported item could land in the wrong location and both specs would still pass |
| PR 5 gets smaller | its teardown list drops from 6 `stockDualWrite` calls to 4, plus the inline `applyUnitSwitch` block |

**DX cost, stated plainly.** Two more entries in each of the two hardcoded `entityGroups`
arrays (`importData.ts:1528-1661` and `:1698-1831`) plus `computeTotalBatches`
(`:1854-1866`) — three hand-maintained lists that must agree, and nothing checks that they
do. Miss `computeTotalBatches` and the progress bar overruns silently. And this PR
**removes the mirror that currently hides a broken stock upload**: if the new `itemStocks`
upload has a bug, every imported item lands in the catalog stocked **nowhere**, invisible,
with no error. That is a real loss of safety net and it is why task 8 exists.

---

## Ground rules for every task

0. **THE WEB SUITE IS RED ON THIS BRANCH UNTIL TASK 3, ON PURPOSE.** Task 1 added two
   failing tests in `apps/web/src/lib/importData.test.ts`, in the describe block
   `importCloudData — a cart id keeps its location prefix (PR 4b task 3)`. They describe
   behaviour task 3 builds. **Do not "fix" them, skip them, or delete them.** Measured
   2026-10-03 at `640bbc53`: `pnpm test:web` gives **2 failed / 2259 passed (2261)**, 1
   failed / 248 passed file. Any other failure is yours.

1. **Run `pnpm install` and `pnpm codegen` first if the worktree is fresh.** This worktree
   was made with a plain `git worktree add`, which skips the hook that does it, so
   `node_modules/` and `src/generated/` may be missing. The symptom is
   `vitest: command not found` or a missing generated type — not a code bug. `e2e/CLAUDE.md`
   warns about the second one.

2. **Measure your own baseline.** Run the check on the unmodified tree first and diff the
   **outputs**, not the numbers. Measured 2026-10-03 at `fbdd8869`: web **2259 tests / 249
   files**, server **346 / 24**. Every count in this plan goes stale on its own — PR 4a had
   six tasks in a row find a stale one.
3. **`import.resolver.test.ts`'s stubs cannot see an ownership check.** `:195` does
   `p.location.findFirst.mockResolvedValue(DEFAULT_LOCATION)`, which answers yes for any id.
   Server-side tests touching ownership go in a separate file with the stateful fakes.
4. **Read every fake before trusting it.** PR 4a found holes in five:
   `stockFake.matchesStock`, `inventoryLogFake` (no `findUnique`/`upsert`, discarded
   `data.id`), `shoppingFake.cart.upsert`, `stockFake.location.create`,
   `stockFake.itemStock.create`.
5. **Run the mutation check and report it — and check it goes red for the reason you
   claim.** PR 4a task 6 had a check go red on a `P2002` instead of the assertion it was
   testing, which proved nothing.
6. **Run `pnpm codegen` after every schema or operation change.** Nothing to commit — both
   generated directories are gitignored (`.gitignore:58-59`).
7. One commit per task, with scope.

---

## Task 1 — prove the cart-id leak, two parts

The brainstorming log records the leak as **traced through six files and unproved**. This
task settles it. If part 1 passes on `main`, the trace has a mistake and the finding is
**withdrawn**, not explained away.

### Part 1 — the red-to-green proof (unit)

In `apps/web/src/lib/importData.test.ts`, assert the behaviour 4b will create: a local
payload's cart id **keeps** its location prefix on the way to cloud.

```
given a local payload with a cart id `loc_garage:vendor_1`
when the cloud upload payload is built
then the cart id is still `loc_garage:vendor_1`, and its cartItems still point at it
```

**This must be RED on `main`** — `importData.ts:403-413` slices the prefix off today. Run it
and paste the failure text before writing any production code.

### Part 2 — the hazard, as a labelled characterisation test

An API-only cloud spec: two users each create a cart with the bare id `'no-vendor'`, and the
second user's cart items end up in the first user's cart row.

**This is green on `main` and still green after 4b.** `Cart.id` is a global primary key
(`schema.prisma`), so two users genuinely cannot both hold `'no-vendor'`, and no client
change fixes that. 4b's fix is to stop producing bare ids at all.

So part 2 is **not evidence the leak is closed**. It is a negative control in the sense root
`CLAUDE.md` describes, and it must say so in its own header comment, naming issue #327 and
pointing at part 1 as the real proof. A test that reports as coverage it does not give is
worse than no test.

**Two users is harder than it looks.** `e2e/utils/cloud.ts:8-23`'s `makeGql(request)`
hardcodes `'x-e2e-user-id': E2E_USER_ID`, and `cleanupCloudData` does the same
(`cloudTeardown.ts:68`). `e2e/constants.ts:19` has one user constant. So:

- add an optional `userId` parameter to `makeGql` and to `cleanupCloudData`, defaulting to
  `E2E_USER_ID` so all 19 existing cloud specs are untouched;
- add a second constant;
- **clean up both users** in `beforeEach` and `afterEach`, or the second user's rows outlive
  the run and the next spec inherits them.

`VITE_E2E_TEST_USER_ID` is baked into the web build as a single value
(`playwright.config.ts:8, 90`), so the **browser cannot be a second user**. This spec has no
browser, like `location-scoped-writes.spec.ts` and `cleanup-endpoint.spec.ts`.

Add the new spec to the `cloud` project's `testMatch` (`playwright.config.ts:200`) and to
the `local` project's `testIgnore`.

**Report:** part 1's failure text on `main`, and whether part 2 behaves as predicted. If
either surprises you, stop and say so before continuing.

---

**Done 2026-10-03** — `915368fa`, `4a1c8f2f`, `640bbc53`. **The leak finding stands.**

Part 1 is red, with the bare id the trace predicted:

```
FAIL src/lib/importData.test.ts > importCloudData — a cart id keeps its location prefix
AssertionError: expected [ 'no-vendor', 'vendor_1' ]
         to deeply equal [ 'loc_garage:no-vendor', 'loc_garage:vendor_1' ]
```

A second test shows the other half of the same loss: carts at any location other than the
flattened one are **dropped entirely** (`expected [] to deeply equal [...]`).

The agent also ran the check in reverse, unasked: replacing the filter-and-slice block with
a pass-through turned both tests green, and restoring it turned them red again. So they are
pinned on that exact code, not on something incidental.

**Part 2 reproduces the leak end to end against real Postgres**, and the harm is readable
two ways: `cartItemCountByItem(itemId)` answers `1` for user B, while the same query with
B's own `locationId` answers `0`. B owns a cart item it can find at none of its own
locations.

Two things to carry forward:

- **Task 1's first test passes `{ locationId: 'loc_garage' }` to `importCloudData`, and
  task 7 removes that option.** Delete the argument then; the assertions stand. Neither this
  plan nor task 1's brief spotted the collision — it is noted at the call site.
- **The fixture's carts deliberately sit at non-default locations.** Task 3's remap maps the
  payload's default onto the destination's default, so a cart prefixed with the payload
  default will legitimately change id. Asserting it verbatim would let task 3 "fix" the test
  task 1 exists to pin.

`makeGql(request, userId)` and `cleanupCloudData(request, userId)` now take an optional user,
defaulting to `E2E_USER_ID`, so all 18 existing call sites across 10 files are untouched.
**Issue #320's two-user purge spec (4c) no longer has to build this.**

Two things confirmed in passing, both already filed:

- **#322** — nothing type-checks `e2e/`. There is no `e2e/tsconfig.json` and no tsconfig
  includes the directory, so `pnpm build` cannot catch a type error in a spec.
- **#324** — the flaky `cooking.stories.test.tsx` offline-banner test failed at load average
  **28.09** and passed at **2.48**. Load-related, as suspected.

## Task 2 — cloud export becomes lossless

`apps/web/src/lib/exportData.ts`, `apps/web/src/apollo/operations/export.graphql`.

### `fetchCloudPayload` (`:162-232`)

Add two queries to the existing nine-query `Promise.all` (`:177-199`):

| Add | Document |
|---|---|
| `locations` | `GetLocationsDocument` — already exists at `apollo/operations/locations.graphql:1-10` and selects `id, name, order, isDefault, createdAt, updatedAt`. Reuse it; do not write a second one |
| `itemStocks` | **new** `AllItemStocks` operation for 4a's `allItemStocks: [ItemStock!]!` |

Pass both into `buildExportPayload` (`:219`). `ExportPayload` needs **no change** — it
already declares `itemStocks?` and `locations?` at `:52-53`.

### `sanitiseCloudPayload` (`:67-94`)

It maps all nine arrays through the `to*Input` mappers and has **no branch for the two new
keys**. Add them, using the two new mappers from task 3.

### The log fields

`export.graphql:1-10`'s `InventoryLogs` query selects six fields. Add **three**:

```graphql
query InventoryLogs {
  inventoryLogs {
    id itemId delta quantity occurredAt note
    locationId      # 4a added it to the type as ID!
    logKey          # dropped today
    logParams       # dropped today
  }
}
```

`locationId` is what 4b needs. `logKey` and `logParams` are a **pre-existing data loss**:
`ItemLogs` (`inventoryLogs.graphql:7-18`) already selects them, so a cloud backup silently
drops every log's message today. Decided 2026-10-03 to fix it here, because this is the
lossless-backup PR and it is the same query.

`toInventoryLogInput` (`importData.ts:624-637`) returns six of nine fields. It must pass all
three new ones through. **It is shared** — `sanitiseCloudPayload` uses the same mapper, so
one change fixes export and import together.

### Tests

**`fetchCloudPayload` has no test at all today.** `exportData.test.ts` has 4 describes and 9
its, none naming it; every consumer mocks it (`DataModeCard/index.test.tsx:53`,
`ExportCard/index.test.tsx:9`). Add its first test: a cloud export carries `locations`,
`itemStocks`, and a log with `locationId`, `logKey` and `logParams`.

### Mutation check 1

Drop `itemStocks` from the `Promise.all`. The new export test must go red. A green result
means the test reads the payload key without asserting its contents.

---

## Task 3 — the remap rule, and the mappers

`apps/web/src/lib/importData.ts`.

### The rule

> Preserve payload location ids verbatim, except the payload's default, which maps onto the
> destination's default.

Build a `Map<payloadLocationId, destinationLocationId>` with exactly one non-identity entry.
Apply it to four places:

| Field | Shape |
|---|---|
| `itemStocks[].locationId` | plain id |
| `inventoryLogs[].locationId` | plain id — only reachable once task 2 exports it |
| `shoppingCarts[].id` | `${locationId}:${vendorId\|'no-vendor'}` |
| `cartItems[].cartId` | the same composite |

**Reuse `parseCartId`** (`apps/server/src/lib/cartId.ts`, mirrored in `packages/types`) for
the cart ids. Do not hand-roll `split(':')` — a vendor id **can** contain a colon, because
`bulkCreateVendors` stores `VendorInput.id` verbatim with no format check, and
`cartId.test.ts` already pins 16 cases including that one. PR 4a task 4 hit this.

### The ordering hazard that broke 4a

**Read the destination's locations AFTER `clearAllData`, never before.**

On the `clear` path the client reads **nothing** today: `clearAllData` fires at
`importData.ts:1901` and `fetchCloudExistingData` is only called at `:1914`, on the non-clear
path. So 4b has to **add** the read. `clearAllData` deletes every `Location` row, and
`ensureDefaultLocation` re-creates a default lazily on the next `locations` read — so a
`GetLocations` issued before the clear returns an id that no longer exists.

This is the same class of bug that broke PR 4a: a location id that was valid when it was read
and gone by the time it was used. Put the reason in a comment at the call site.

### New mappers

There is no `toLocationInput` and no `toItemStockInput`. Add both, matching the nine existing
mappers' shape (`:549-675`). `LocationInput` has **no `isDefault`** field
(`import.graphql:81-115`) — the payload's default is never uploaded as a row, because its id
is remapped onto the destination's existing default. `ItemStockImportInput`
(`import.graphql:142-153`) is a **replace** input: every field is required except `dueDate`.

### Deleted here

| Deleted | Lines |
|---|---|
| `flattenPayloadForCloud` | `:361-433` — one call site, `:1886` |
| `resolveFlattenLocationId` | `:456-471`, plus `resolveByCartLocations` `:475-487` and `pickLocationId` `:491-500` |
| its call site and the error path | `ImportCard.tsx:168-171`, and the `settings.import.unknownLocations` toast at `:173` — check whether that i18n key is now dead |
| the `itemStocks`/`locations` `void` block | `:428-432` |
| the cart prefix strip | `:403-413` — **this is the leak fix**, and task 1 part 1 is its proof |

### Tests that die

14 `it`s go away outright, and 18 need edits:

| Block | Line | its | Fate |
|---|---|---|---|
| `importCloudData — local → cloud stock flattening (v15 split)` | 2256 | 7 | **all 7 die.** The last, `'a cloud-shaped payload (no itemStocks) passes through untouched'` (`:2559`), is the one encoding the signal 4b removes |
| `resolveFlattenLocationId — cloud file import cannot silently zero stock` | 2665 | 7 | **all 7 die** with the function |
| `cloud import input mappers — strip server-only fields` | 1480 | 13 | needs cases for the two new mappers and the three new log fields |
| `importCloudData — batched cloud import` | 1819 | 5 | batch-count and order assertions break — task 4 |

**Do not delete a dying test without reading what it asserted.** Some encode behaviour 4b
keeps. Say which you deleted and why, one line each.

### Mutation check 2

Map **every** payload location to the destination default, not just the payload's default.
A test asserting a two-location payload arrives as two locations must go red. The fixture
needs **more than one** non-default location or the check cannot fail.

---

## Task 4 — upload order and the five new operations

### The order

Both `bulkCreate` (`:1518-1682`) and `bulkUpsert` (`:1688-1831`) build the same hardcoded
`entityGroups` array and iterate it in order. Today: `tagTypes, tags, vendors, items,
recipes, inventoryLogs, shoppingCarts, cartItems, shelves`.

Insert:

| New entity | Position | Why |
|---|---|---|
| `locations` | **before `items`** | it is the parent of `itemStocks`, and cart ids name it. 4a's `resolveCartLocations` falls back to the caller's default for an **unclaimed** location id (`import.resolver.ts:245`), so a cart uploaded before its location lands in the wrong place — silently, with no error |
| `itemStocks` | **after `items`** | it is a child of both `Item` and `Location`. 4a's `requireOwnItemStockRefs` scopes `itemId` to the caller, so an unknown item is refused |

**`computeTotalBatches` (`:1854-1866`) hardcodes the same nine arrays.** Miss it and the
progress bar overruns. Its header comment at `:1501-1507` already lists only eight entities
— it is stale before you start.

### Five new Apollo operations

None exists yet — confirmed by `grep` over `apps/web/src/generated/graphql.ts`.
`apollo/operations/import.graphql` holds 19 operations and ends at line 211.

`AllItemStocks`, `BulkCreateLocations`, `BulkUpsertLocations`, `BulkCreateItemStocks`,
`BulkUpsertItemStocks`.

### `fetchCloudExistingData` and `ExistingData`

`fetchCloudExistingData` (`:1449-1499`) runs the **same nine queries** as
`fetchCloudPayload`, and `ExistingData` (`:726-736`) has nine fields. Both need the two new
entities, or conflict detection on the `skip` and `replace` paths cannot see an existing
location or stock row.

### Mutation check 3

Move `locations` to **after** `shoppingCarts`. A test asserting an imported cart's
`locationId` column matches its id's prefix must go red. This is the check that proves the
order matters — without it, the order is an unverified claim.

---

## Task 5 — the local side of the remap

`deserializeLocation` exists **twice**, and only one copy is this task's subject:

| Copy | File:line | Behaviour | Tested |
|---|---|---|---|
| import | `importData.ts:137-144` | **derives** `isDefault` from `raw.id === DEFAULT_LOCATION_ID`; uses `toDate` | no direct test |
| shared | `lib/deserialization.ts:112` | keeps `isDefault` as given; uses `parseWireDate` with an epoch fallback | `deserialization.test.ts:287-337`, 3 its |

Change the **import** copy. Apply the same remap in reverse: the payload's default maps onto
`DEFAULT_LOCATION_ID`, everything else keeps its id. Then exactly one row is flagged and
`ensureDefaultLocationRow()` (`db/index.ts:77`, called at `importData.ts:1120`) adds nothing.

Do not touch the shared copy. Say in a comment why the two differ, or the next person will
merge them.

### Mutation check 4

Restore `isDefault: raw.id === DEFAULT_LOCATION_ID`. A cloud → local import test asserting
exactly one default row and no stray row must go red.

---

## Task 6 — remove the two import dual-writes

| Marker | Resolver | The call it guards |
|---|---|---|
| `import.resolver.ts:450-468` | `bulkCreateItems` | `:469-475` |
| `import.resolver.ts:709-727` | `bulkUpsertItems` | `:728-734` |

Both calls are byte-identical `mirrorStockToDefaultLocation(userId, id, {…})`. The import at
`import.resolver.ts:6` becomes unused — delete it or lint fails.

**`stockDualWrite.ts` itself survives.** `item.resolver.ts:3, 191` is still a caller, plus
the `mirrorStock` callers PR 5 owns. **Leave `apps/server/src/lib/defaultLocation.ts`
alone** — its comment at `:10-11` says it must outlive PR 5. The `ensureDefaultLocation`
import at `import.resolver.ts:4` is still needed by `resolveLogLocations` (`:93`) and
`resolveCartLocations` (`:222`).

### The test that must be replaced, not deleted

`import.resolver.test.ts:364`, `'user importing items has each one stocked in their default
location'`. It asserts `itemStock.upsert` was called with
`where: { itemId_locationId: { itemId, locationId: DEFAULT_LOCATION.id } }` and that the
location lookup was scoped to the caller.

Replace it with the new contract: an imported item is stocked in the location **its
`ItemStock` row names**, not the caller's default. Deleting it leaves the new behaviour
uncovered.

### Mutation check 5

Delete the `itemStocks` entity group from `entityGroups`. The replacement test must go red —
with the mirror gone, nothing else stocks an imported item. **This is the sharpest risk in
the PR**: if the upload breaks, every imported item is stocked nowhere, invisible, with no
error.

---

## Task 7 — the migration gate and the warning dialog

### The gate

`usePostLoginMigration.ts`: delete `migrationLocationId` (`:38`) and the
`activeLocationId === DEFAULT_LOCATION_ID` branch of `locationResolved` (`:51-54`). Keep the
"locations have loaded" half, with an honest reason:

```ts
// The remap maps the payload's default location onto THIS account's
// isDefault row, so the copy cannot start until the destination's
// locations are known.
const locationsLoaded = locations !== undefined
```

Both `{ locationId }` passes go: `:82-84` and `:125-127`. `importCloudData` loses the option.

**Keep `autoImportStarted`** (`:62`). `locationsLoaded` is in the effect's dependency array
(`:113`), so without the one-shot ref a location change mid-flight starts a second copy.

The comment at `:45-50` already says this decision was left to PR 4. Replace it, do not
leave it.

### The dialog

Delete all 4 files in `apps/web/src/components/shared/MigrationLocationWarningDialog/`, both
call sites (`DataModeCard.tsx:7, 447-453` and `PostLoginMigrationDialog.tsx:4, 125-134`), and
the 4 i18n keys at `en.json:637-641` and `tw.json:637-641`.

**Keep `common.cancel`** — it is shared and used elsewhere.

`PostLoginMigrationDialog.tsx:134`'s `onConfirm` calls `importData('append')`. Removing the
dialog must not remove that call; trace where it has to move to.

Check whether `DataModeCard`'s `enableFlow.kind === 'locationWarning'` state and the
`otherLocationNames` wiring become dead, and remove what does.

### Mutation check 6

None — deletion has no mutation check. Instead confirm a **negative control**: the
`DataModeCard` and `PostLoginMigrationDialog` tests must still pass, and the Storybook smoke
test for the deleted dialog must be gone rather than silently skipped. Root `CLAUDE.md`:
*negative controls legitimately stay green, but they are not evidence.*

---

## Task 8 — E2E that can actually see a wrong location

**Neither `verifyRelations` copy asserts a location or a quantity today.** They are separate
copies, and they differ:

| Copy | Lines | Checks |
|---|---|---|
| cloud, `import-export-cloud.spec.ts` | `:89-131` | 6 |
| local, `import-export-local.spec.ts` | `:97-143` | 7 — it also checks `Fixture Shelf` at `/?groupBy=shelf` |

So **every imported item could land in the wrong location and both specs would still pass**.
That is the guard this PR needs most, because task 6 removes the mirror that currently hides
exactly that failure.

Add to both copies, using `e2e/helpers/stockReadback.ts` (`readStocksForItem` `:39`,
`readStockAt` `:58`):

- the fixture has **more than one location**, with different quantities in each;
- after the round trip, each location's quantities are read back and match;
- the item is stocked in the location the payload named, not the default.

Also add:

| Case | Project |
|---|---|
| cloud → cloud keeps every location (today it keeps one) | cloud |
| cloud → local keeps every location, and exactly one row is `isDefault` | local |
| local → cloud keeps every location | cloud |
| a log's `locationId`, `logKey` and `logParams` survive a cloud round trip | cloud |

`import-export-cloud.spec.ts:37` defines its own local `seedCloudFixture`, **shadowing** the
helper in `e2e/helpers/cloudSeed.ts`. Decide whether to use the helper or extend the local
copy, and say which.

---

## Task 9 — gate and docs

1. The full Verification Gate from root `CLAUDE.md`, each command with an explicit path.
2. `pnpm test` from the repo root — both workspaces.
3. **`pnpm test:e2e:all`**, never the bare `pnpm test:e2e`, no `--grep`. A failure is a hard
   stop. **This PR changes behaviour**, so the baseline will move — report the new numbers
   and say which project gained what. PR 4a's "expected unchanged" was the wrong framing and
   it hid a real regression until the gate ran.
4. Docs: `docs/INDEX.md`, `cloud-locations-status.md`, the design doc's 4b rows and its
   mutation-check table, and this plan's task notes.
5. Re-count and record: `stockDualWrite` calls and `REMOVED IN PR 5` markers. Expected after
   task 6: **4 calls** and **5 markers**. Verify, do not assume.
6. Check whether `settings.import.unknownLocations` is now a dead i18n key.

---

## Known gaps this PR will leave

| Gap | Owner |
|---|---|
| Issue **#327** — nine `bulkUpsert*` mutations let one user take ownership of another's row; nine `bulkCreate*` silently drop the caller's own row | #327, its own PR |
| Issue **#320** — the two production purge paths have no real-SQL test | 4c |
| `Item`'s five state columns, and 4 remaining `stockDualWrite` calls | PR 5 |
| `updatedAt` pass-through on the four new bulk mutations is unresolved — no local test can settle it, because every server test runs against a fake | needs real SQL |
| Local allows two `ItemStock` rows on one `[itemId, locationId]` pair (the Dexie index at `db/index.ts:612` is **not** unique) while Postgres forbids it, so such a local DB cannot round-trip | accepted |
| PR 3b's migrated-data check — nothing has run the new server code against rows the re-key migration converted | still owed from 3b |
