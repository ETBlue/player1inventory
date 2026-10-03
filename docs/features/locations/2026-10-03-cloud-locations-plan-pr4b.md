# Cloud locations PR 4b — implementation plan

**Date:** 2026-10-03
**Status:** 🔄 Built 2026-10-04 — gate red on one E2E test, not yet pushed
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

**Done 2026-10-03.** Web tests **2259 → 2267 passing** (+8), still with only task 1's two
intended failures. Server unmoved at 346/24. `pnpm build` clean.

`fetchCloudPayload` had **zero** tests before this. It has three now, and the fixture seeds
**two** locations with **different** quantities, so a change that reads only one location's
stock fails instead of passing. The log sits at the **non-default** location on purpose: at
the default, a restore that falls back to the default would land on the right answer by
accident.

**`InventoryLogInput` already accepts all three new fields**, all optional
(`import.graphql:49-67`): `logKey: String`, `logParams: JSON`, `locationId: ID`.

**Neither new array needs a filter**, and the reason `cartItems` is filtered does not
transfer. `CartItem.userId` and `Cart.userId` are separate columns that **can** disagree —
that is issue #327. `ItemStock` has no `userId` column at all, and its FK cascades to both
`Item` and `Location` (`schema.prisma:279-280`) mean an orphan cannot exist. `locations` is
unfiltered because the payload's default **must** be present for the remap to find it.

**One ground rule was not followed, and the agent said so.** It did not run the whole suite
on the unmodified tree before editing, and reported that its +8 arithmetic "corroborates the
brief but is not the same as measuring it". Recording the admission rather than the number.

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
| `cloud import input mappers — strip server-only fields` | 1480 | 13 → **18** | **already done by task 2**, including the `Date` → ISO path both directions need. Do not add them again |
| `importCloudData — batched cloud import` | 1819 | 5 | batch-count and order assertions break — task 4 |

**Do not delete a dying test without reading what it asserted.** Some encode behaviour 4b
keeps. Say which you deleted and why, one line each.

### Mutation check 2

Map **every** payload location to the destination default, not just the payload's default.
A test asserting a two-location payload arrives as two locations must go red. The fixture
needs **more than one** non-default location or the check cannot fail.

---

**Done 2026-10-03.** **The suite is GREEN again: 2268 passed / 249 files.** Task 1's two
tests pass, which was this task's success signal. `importData.ts` is **55 lines shorter**
even after adding the remap.

**The remap touches FIVE fields, not the four this plan listed.** `locations[].id` was
missing. Without it the payload's default row keeps its own id and `bulkCreateLocations`
creates a **stray extra location** beside the destination's real default. The design doc's
§1 table had the same omission while its prose was right; both are now fixed.

**A defect task 2 left, found and fixed here.** The cloud export dropped `isDefault`, so a
cloud-sourced payload named no default and the remap was a no-op in that direction. The
export **file** must carry the flag — it is the only place the import side can learn which
location was the payload's default — while `LocationInput` has no such field, so
`toLocationInput` still drops it for the **upload**. Two jobs, now correctly separated:
`sanitiseCloudPayload` re-adds the flag after mapping. Task 2's one contradicting assertion
was inverted, with the reason recorded. Commit `3322f322`.

Left unfixed, it would have ended a cloud → cloud "clear and import" with a stray empty
default location beside the restored one.

**Three mutation checks, not two.** The extra one is the ordering hazard: reading the
destination's locations **before** `clearAllData` now fails a named test
(`user clearing cloud before an import maps onto the default that exists after the clear`)
with `expected [ 'cloud_default_before:vendor_1' ] to deeply equal
[ 'cloud_default_after:vendor_1' ]`. So the rule that broke PR 4a is guarded, not just
commented.

**Three more tests died than this plan counted.** `ImportCard/index.test.ts`'s describe
`ImportCard — cloud import scopes stock to the local active location` held 3 `it`s pinning
the deleted wiring; rewritten to 2 asserting the inverse rule. The plan's count of 14 covered
`lib/importData.test.ts` only.

**`parseCartId` is reachable from `apps/web`** via `@/types` → `@p1i/types`, the same copy
`useShoppingCart.ts` uses. The `apps/server/src/lib/cartId.ts` duplicate exists only because
plain Node cannot load that `.ts` in production.

**`settings.import.unknownLocations` is dead** and was removed from both locale files.

**Three traps worth keeping:** a bare cart id must gain no prefix (`parseCartId('no-vendor')`
returns `{ locationId: 'no-vendor' }`, so a blind rebuild would make it
`cloud_default:no-vendor`); a log with no `locationId` must stay without one, or it overrides
the server's documented fallback; and the resumable-import session must record the **raw**
payload, because on the `clear` path the remap cannot run until the clear has.

## Task 4 — upload order and the four new operations

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

### Four new Apollo operations

`BulkCreateLocations`, `BulkUpsertLocations`, `BulkCreateItemStocks`, `BulkUpsertItemStocks`.

**Corrected 2026-10-03 after task 2:** this said *five*, including `AllItemStocks`, and
claimed none existed. **Task 2 already created `AllItemStocks`**, in `export.graphql` beside
`AllCartItems` — both are whole-account snapshot reads used by the export writer and by
`fetchCloudExistingData`. Do not write a second copy.

### `fetchCloudExistingData` and `ExistingData` — **this instruction was WRONG**

This section said both "need the two new entities, or conflict detection cannot see an
existing location or stock row". **Following it would have broken every cloud import.**
Corrected 2026-10-03 by task 4, which added **no** fields to either type:

- A **location** would conflict on *every* cloud import. The remap rewrites the payload
  default's id to the destination account's default, and that row always exists — so an id
  check always matches, `hasConflicts` is always true, and **every import, including a clean
  one, stops at the conflict dialog.**
- A **stock** row's conflict is never the user's decision. It follows its item, and the item
  is already in the summary.
- Task 3 had already shipped this rule locally: `importLocations`'s comment says locations
  are "never reported as conflicts, like carts".

Adding the fields would also have cost two extra network queries per import that nothing
reads. The reason is now written on the `ConflictSummary` type and at `detectConflicts`.

**`partitionPayload` DID need changing, and this plan never mentioned it.** It builds
`toCreate` with `{ ...payload }` and overrides nine keys, so both new arrays passed through
the spread into **both** sides — every location and stock row uploaded twice on `replace`.
The routing task 4 settled on:

| strategy | `locations` | `itemStocks` |
|---|---|---|
| `clear` | create pass | create pass, all rows |
| `skip` | create pass | create pass, **only the items actually added** |
| `replace` | create pass | **upsert pass**, all rows |

`locations` is on the create pass for every strategy, because the carts and logs that name
them are sent on that pass — the upsert pass would place them *after* the carts, the exact
silent failure this task exists to prevent. `itemStocks` is on the upsert pass for `replace`
because `bulkCreateItemStocks` **skips** a row whose `(itemId, locationId)` pair is taken,
so the create pass would silently discard the quantities the user asked to restore.

### Mutation check 3

Move `locations` to **after** `shoppingCarts`. A test asserting an imported cart's
`locationId` column matches its id's prefix must go red. This is the check that proves the
order matters — without it, the order is an unverified claim.

---

**Done 2026-10-03** — `cbb5d7ad`, `457431e4`. Web **2268 → 2275 passing** (+7), 249 files,
all green. Server unmoved at **346 / 24**. `pnpm build` clean, no `TS6385`. Biome: the same
**4** pre-existing warnings in `src/routes/shopping/index.tsx`.

**THE THREE HAND-MAINTAINED LISTS ARE NOW ONE.** `bulkCreate`'s array, `bulkUpsert`'s array
and `computeTotalBatches` were structurally identical apart from the mutation document, so
they became one `ENTITY_SPECS` table. `runBulkBatches(args, mode)` walks it for both passes
and `computeTotalBatches` reduces over the same list. The resumable-session logic is
untouched — the key is still `${entityType}:${i}`. The DX cost this plan warned about is
therefore **not paid**: a new entity cannot be sent in one place and counted in another.

**`partitionPayload` HAD TO CHANGE, AND THIS PLAN DID NOT MENTION IT.** It builds `toCreate`
with `{ ...payload }` and then overrides nine keys, so the two new arrays passed through the
spread into **both** sides. On `replace` that is every location and every stock row uploaded
twice. The routing now is:

| strategy | `locations` | `itemStocks` |
|---|---|---|
| `clear` | create pass | create pass, all rows |
| `skip` | create pass | create pass, **only the items actually added** |
| `replace` | create pass | **upsert pass**, all rows |

Two reasons behind it, both needed:

- `locations` goes to the **create** pass on every strategy, because the carts and logs that
  name them are sent on that pass. Sending them on the upsert pass would put them *after*
  the carts, which is the silent default-location failure this task exists to prevent. The
  cost: `replace` does not rename an existing location to the backup's name, where the local
  import does. A location row holds only a name and an order, so no user data is lost.
- `itemStocks` goes to the **upsert** pass on `replace`, because `bulkCreateItemStocks`
  **skips** a row whose `(itemId, locationId)` pair is already taken. Sending stock to the
  create pass under `replace` would silently discard the quantities in the file the user
  chose to restore.

Routing each to exactly one pass also keeps them clear of the pre-existing bug below.

**A PRE-EXISTING BUG FOUND, NOT FIXED.** On `replace`, `bulkCreate` and `bulkUpsert` share
one `ImportSession` and one key format, `${entityType}:${i}`, with no mode in it. So when
both passes carry rows for the same entity, the upsert pass finds the create pass's key and
**skips its own batch**. A payload with one new item and one conflicting item therefore
never updates the conflicting item — the exact data the user asked to replace. It is
reachable today for all nine older entities and is independent of upload order, so it needs
its own test and its own E2E pass. Recorded in a comment at the key, and neither new entity
can hit it.

**Four things this plan's task 4 got wrong.**

1. **`fetchCloudExistingData` and `ExistingData` need NO new fields.** The plan said
   "conflict detection on the `skip` and `replace` paths cannot see an existing location or
   stock row" without them. Detection never looks: neither entity is ever a conflict, which
   is the rule **task 3 already shipped for the local import** (`importLocations`'s own
   comment says locations are "never reported as conflicts, like carts"). A location would
   conflict on **every** cloud import — the remap rewrites the payload default's id to the
   destination's default, and that row always exists — so `hasConflicts` would always be
   true and every import, including a clean one, would stop at the conflict dialog. A stock
   row's conflict is never the user's decision either; it follows its item, and the item is
   already in the summary. Adding the two fields would have cost two network queries per
   cloud import that nothing reads. `ConflictSummary` and `hasConflicts` are unchanged for
   the same reason, with the decision written on the type.
2. **The `importCloudData — batched cloud import` block did not break.** The plan predicted
   its "batch-count and order assertions break — task 4". All 5 pass unchanged: its payloads
   carry only `items`, so both new entities have zero batches and the total is the same.
3. **Mutation check 3 as written cannot be run.** It says a test asserting "an imported
   cart's `locationId` column matches its id's prefix must go red". No unit test can read a
   server column — the mock client records the mutation, not the database. That assertion
   belongs to a cloud E2E spec (task 8). The order tests assert the **sequence of mutation
   documents** instead, which fails the same way for the same reason.
4. Every line number in the task was stale, as ground rule 2 predicts: `bulkCreate` was at
   `:1589` not `:1518`, `bulkUpsert` at `:1759` not `:1688`, `computeTotalBatches` at
   `:1925` not `:1854`.

**Three mutation checks, all red for the reason claimed.**

| Mutation | Result |
|---|---|
| `locations` moved after `shoppingCarts` | **3 red.** The sequence test printed the moved line; `expected 5 to be greater than 9` (stock before its location); `expected 7 to be less than 6` (locations after the carts) |
| `itemStocks` moved before `items` | **2 red.** `expected 5 to be greater than 6` — stock at index 5, items at 6 |
| `computeTotalBatches` left on a stale nine-entity list | **1 red.** `expected 9 to be 11` — it counted 9 batches while the loop sent 11 |

**The fixtures seed THREE locations** — one default plus two others — with three stock rows
at three different locations carrying three different quantities (1, 7, 3). With one
location, or with equal quantities, "each row keeps its own `locationId`" and "every row got
the default" give the same answer.

**The order tests assert the whole sequence**, not that both calls happened. "Both were
called" passes against every wrong order, which is the only failure this task exists to
prevent.

**No `isDefault` reaches the wire.** One test asserts it: `Location_one_default_per_user_key`
is a unique partial index, so a second default would raise `P2002` **after** `clearAllData`
had run.

---

**Done 2026-10-03.** Web **2268 → 2275 passing**, all green. Server unmoved at 346/24.

**The predicted DX cost became a gain.** This plan said three hand-maintained lists would
have to agree. Task 4 unified them into one `ENTITY_SPECS` table of eleven entries, each
holding a `create` and an `upsert` closure; `runBulkBatches(args, mode)` walks it for both
passes and `computeTotalBatches` reduces over the same list. Adding an entity and forgetting
a site is now impossible. The resumable-session key format is unchanged.

**A pre-existing bug found and deliberately not fixed — now issue #330.** `bulkCreate` and
`bulkUpsert` share one `ImportSession`, and the batch key is `${entityType}:${i}` with **no
mode**. On `replace`, when an entity has rows in both passes, the upsert pass finds the
create pass's key and **skips its own batch** — so a payload with one new item and one
conflicting item never updates the conflicting item, which is exactly the data the user
chose to replace. Reachable today for all nine older entities. Neither new entity can hit it,
because each goes to exactly one pass. Recorded in a comment at the key line.

**This plan's prediction about the batched-import tests was wrong.** It said
`importCloudData — batched cloud import`'s batch-count and order assertions "will break".
All 5 pass unchanged — their payloads carry only `items`, so both new entities have zero
batches. The block that broke was `partitionPayload`'s `it.each` over the three strategies,
now three named tests asserting the routing rules above.

**One accepted behaviour change:** `replace` does not rename an existing cloud location to
the name in the backup, where the local import does. Accepted on purpose, so locations stay
on the create pass ahead of the carts. A location row holds only a name and an order, so no
user data is lost.

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

**Done 2026-10-03** — `b0dd69cb`. Web **2275 → 2285 passing** (+10), 249 files, all green.
Server unmoved at **346 / 24** — no server file was touched. `pnpm build` clean, no
`TS6385`. Biome: the same **4** pre-existing warnings in `src/routes/shopping/index.tsx`
at 187, 191, 211, 215.

**THIS TASK'S INSTRUCTION WAS WRONG, AND FOLLOWING IT WOULD HAVE BROKEN TWO REAL CASES.**
Both this plan and the design's §1 note said to change `deserializeLocation` so it carries
the file's `isDefault` instead of deriving it. The derive is correct and was kept. The real
fix is one call in `importLocalData`; `deserializeLocation` got a comment only.

Locally the flag and the id are the **same fact**: the v18 upgrade fn sets
`isDefault = (id === DEFAULT_LOCATION_ID)` (`db/index.ts:628`) and `ensureDefaultLocation`
only ever creates that one id. Once the remap has rewritten the payload default's id to
`DEFAULT_LOCATION_ID`, deriving flags exactly that row. **Carrying the flag instead was run
as a mutation and turned 4 tests red:**

| Case | What carrying the flag does |
|---|---|
| a pre-v18 backup — no `isDefault` key anywhere | **zero** rows flagged. `ensureDefaultLocationRow` cannot repair it: the `local` row exists, so it returns early. `expected [] to deeply equal [ 'local' ]`, twice |
| a hand-edited file flagging a second row | **two** rows flagged. `expected true to be false` and `expected [ 'office' ] to deeply equal [ 'local' ]` |

The file's flag is **not** ignored — it is read one step earlier, by
`findPayloadDefaultLocationId`, which is what decides the remap.

**Mutation check 4 as written is a no-op**, for the same reason: the line it says to
"restore" was never changed. The checks that do exercise the fix are below.

**The shared rule was reused, not copied.** `buildLocationRemap` and `applyLocationRemap`
were already exported and direction-agnostic, so the local side is one call with
`DEFAULT_LOCATION_ID` as the destination default. No second rule exists to drift.

**NO ORDERING HAZARD ON THIS SIDE.** The hazard that broke PR 4a cannot exist here, because
the destination's default is **not read from the database at all** — it is the module
constant `DEFAULT_LOCATION_ID` (`packages/types/src/index.ts:222`), guaranteed by the v18
upgrade fn and `ensureDefaultLocation`. So the remap's position relative to
`db.locations.clear()` does not matter. It sits before the clear, at the top of
`importLocalData`, because `detectConflicts` and `partitionPayload` on the `skip` and
`replace` paths must see remapped ids too. Written as a comment at the call site, including
"do not improve it into a `db.locations` read".

**One call covers all three strategies.** Each strategy hands the **whole** payload to
`importLocations` and `importItemStocks`, so remapping once in `importLocalData` is enough
— there are three call sites of each helper but only one place the ids have to be rewritten.

| strategy | what the remapped default row does |
|---|---|
| `clear` | `bulkPut` writes it on `local`, with the backup's name |
| `skip` | filtered out by `existingIds`, so the live `local` row keeps its own name — correct for "skip adds what is missing" |
| `replace` | `bulkPut` overwrites the live `local` row, name included |

**Applied AFTER `upgradeLegacyPayload`, not before.** That function can invent location ids
of its own (it places a legacy payload's synthesised stock and cart prefixes in the caller's
`locationId`), so remapping afterwards is what stops an id it created from escaping the rule.
It also leaves `collapseStockConfig`'s existing `createdAt` tie-break untouched. The
"no `itemStocks` means pre-v15" signal it reads is **unaffected** — task 2 made the cloud
export carry `itemStocks`, so absence now means pre-v15 and nothing else, which is exactly
what that branch assumes. Two stale comments on it were corrected: a cloud payload is no
longer inline-stock-shaped, and its `locationId` parameter no longer decides where a cloud
backup lands.

**A COLLISION THE REMAP RULE DOES NOT COVER, found by an existing test.**
`db/upgradeV18.test.ts:235` already pins a hand-edited payload where `local` carries
`isDefault: false` and `office` carries `isDefault: true`. Under the bare rule, `office`
remaps onto `local` — and the payload's own `local` row is already there, so two rows share
one id and the write keeps one. **A location disappears.** `buildLocationRemap` now returns
an empty map when the destination's default id is already held by a different payload row.
Nothing is lost by that: the remap exists only to stop a stray *second* default appearing,
and that cannot happen when the destination's default id is in the payload already. The
guard went into the **shared** function, so it protects the cloud direction too.

**For a pre-v18 backup with no `isDefault`, the payload's default is the row whose id is
`DEFAULT_LOCATION_ID`** — `findPayloadDefaultLocationId`'s existing fallback. Every real
pre-v18 local backup has that row, because the local default is undeletable. If a file has
neither a flag nor that id, nothing is remapped and `ensureDefaultLocationRow` adds the
`local` row: still exactly one default, plus one extra row. That is the honest answer —
guessing a default from `order` or from array position would be inventing one.

**Three mutation checks, all red for the reason claimed.**

| Mutation | Result |
|---|---|
| the remap call removed from `importLocalData` | **8 red.** `expected 4 to be 3` (the stray row), `expected { id: 'local', name: 'My Home', … } to match object { name: 'Cloud Home' }`, `expected undefined to be 1` (stock at `local`), `expected 'cloud_default_cuid:vendor_1' to be 'local:vendor_1'`, `expected 'cloud_default_cuid' to be 'local'` (the log) |
| every payload location mapped to the destination default, not just the payload's | **12 red** — 7 of them task 3's cloud-direction tests, which proves the rule really is shared. The one this task owns: `expected [ 'local' ] to deeply equal [ 'cloud_cabin_cuid', …(2) ]` — all three locations collapsed into one row |
| `locations[].id` dropped from `applyLocationRemap`, the other four fields kept | **7 red**, including `expected 4 to be 3`. This is the check that proves the **fifth** field carries the stray-default fix |

**One assertion is a negative control and is now labelled as one.** "Exactly one row has
`isDefault: true`" **stays green** with the remap removed: the three cloud rows arrive
unflagged, then `ensureDefaultLocationRow` adds one flagged `local` row — exactly one, just
the wrong one. The assertions that actually fail are the flagged row's **name** and the
**row count**. Both are in the same tests, with the measured failure text written beside
them.

**The fixtures seed THREE locations** — one default (`cloud_default_cuid`, flagged) and two
others (`cloud_office_cuid`, `cloud_cabin_cuid`) — with three stock rows carrying three
different quantities (1, 7, 3). With one non-default location, "map only the payload's
default" and "map every location onto the local default" give the same answer.

**10 new tests** in `apps/web/src/lib/importData.test.ts`, describe block
`importLocalData — a cloud backup keeps every location (PR 4b task 5)`: one default row,
no stray row, non-default ids verbatim, each quantity in its own location, a bare cart id
left unprefixed, each log's location (including a log with none), `skip`, `replace`, a
pre-v18 backup, and the collision guard.

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

**Done 2026-10-03** — `0f21809e`, plus a doc-comment commit. Server **346 → 347**
(+1: one test replaced, one added). Web unmoved at **2285 / 249**, all green — no web file
was touched. `pnpm build` clean, no `TS6385`. Biome: the same **4** pre-existing warnings in
`src/routes/shopping/index.tsx` at 187, 191, 211, 215.

**Measured after the change**, not assumed: **4** `stockDualWrite` resolver calls
(`item.resolver.ts:191`, `cart.resolver.ts:178`, `recipe.resolver.ts:103`,
`itemStock.resolver.ts:137`) in 4 files, and **5** `REMOVED IN PR 5` markers. Both match
what PR 5's teardown list should now say.

**The brief's count of "down from 6 and 7" mixes two different things.** There were never 7
`REMOVED IN PR 5` markers. There were **5 `REMOVED IN PR 5` plus 2 `REMOVED IN PR 4b`** — 7
`DUAL-WRITE` markers of both kinds. The 5 was already 5 before this task, and the two
removed markers were the 4b ones. The design doc's §3 phrasing ("7 `REMOVED IN PR 5`
markers") has the same mistake.

**THE UPLOAD CHAIN HOLDS, read link by link.** This matters because the deleted mirror was
the only thing making an imported item visible in the cloud pantry.

| Link | Where | Verdict |
|---|---|---|
| Local export carries stock | `exportData.ts:172-173` reads `db.itemStocks` and `db.locations` | holds |
| Cloud export carries stock | `exportData.ts:313-314` from `locations` + `allItemStocks` | holds |
| Remap rewrites ids, drops nothing | `importData.ts:540-549` | holds |
| `itemStocks` is in the upload table | ONE `ENTITY_SPECS` entry with a real `select` and both a `create` and an `upsert` closure. Being in the list means both passes can send it — the brief's "in both passes" question is moot since task 4 merged the three arrays | holds |
| All three strategies send it somewhere | `clear` → create pass, all rows; `skip` → create pass, only the newly added items' rows; `replace` → upsert pass, all rows | holds |
| Server writes the row the payload names | `bulkCreateItemStocks` (`import.resolver.ts:1022`) and `bulkUpsertItemStocks` (`:1162`) take `locationId` per row | holds |
| Pantry reads `ItemStock` | `PantryData($locationId)` → `itemStocks(locationId:)` (`itemStock.resolver.ts:46`) | holds |

One honest caveat on `skip`: a payload item that conflicts **by name only** keeps an id no
cloud row holds, so `stocksForItems` drops its stock on purpose — `requireOwnItemStockRefs`
would answer `Forbidden` and kill the whole import. That is task 4's deliberate choice, and
it means `skip` genuinely does not restock an item it skipped. Correct for `skip`, but worth
knowing.

**Both mutation checks went red, each for the reason claimed.**

| Mutation | Result |
|---|---|
| `itemStocks` entity deleted from `ENTITY_SPECS` (`apps/web/src/lib/importData.ts`) | **5 red** in `importData.test.ts`, all in task 4's `locations and stock upload in dependency order` block. The sharpest: `expected -1 to be greater than 5` — `BulkCreateItemStocks` is absent from the mutation sequence entirely. Also `expected [ 'ClearAllData', …(10) ] to deeply equal [ 'ClearAllData', …(11) ]`, `expected [ … ] to include 'BulkUpsertItemStocks'`, and `expected 10 to be 11` from `computeTotalBatches` |
| the `bulkCreateItems` mirror restored | **1 red**, the create-side test only: `expected "vi.fn()" to not be called at all, but actually been called 1 times` at `import.resolver.test.ts:417`, on `p.itemStock.upsert` |
| the `bulkUpsertItems` mirror restored | **1 red**, the upsert-side test only, same message at `:521` |

The two mirror checks were run **separately on purpose**. One test cannot pin two
byte-identical calls: with only the create-side test, restoring the upsert-side mirror stays
green. That is why the replacement is two `it`s, not one. Nothing here was unobservable — the
mirror writes `itemStock.upsert`, and a `vi.fn()` recorder can see a call it should not have
received even though it cannot see which location a row landed in.

**Where the replacement test went, and why.** Both `it`s stayed in
`import.resolver.test.ts`, in the `bulkCreateItems` and `bulkUpsertItems` describes. Ground
rule 3 rules out a *which-location* assertion in that file, and that is exactly what these
tests do **not** assert. "This resolver touched `itemStock` not at all" needs no `where`
matching, so a call recorder carries it fine, and the subject is these two resolvers — they
live here. The positive half of the new contract ("each row lands in the location its own
payload names") was already covered before this task by
`import-itemStock.resolver.test.ts:227` and `:596`, against the stateful fake with three
locations in the fixture. Adding a third copy there would have duplicated it.

**One more guard than asked for.** Each test also asserts `p.location.findFirst` was not
called. `mirrorStockToDefaultLocation` resolved the default through `ensureDefaultLocation`,
which is that `findFirst`, and no other path in either resolver reads a location. So a
reinstated mirror fails two independent assertions, not one.

**Four doc comments in `lib/stockDualWrite.ts` named `importData` as a caller** and are now
fixed (its caller table, the "last three stay default-bound" list, the
`defaultLocationId` warning, and `mirrorStockToDefaultLocation`'s own docstring). Comments
are claims, and a stale one here invites the next reader to put the mirror back.

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

**Done 2026-10-03** — `e2de5d2e`, `4f8de27e`, `31c1979c`, `293c82f8`.

> **This note was written in task 9, from the four commits and their messages.** Task 7 left
> no note of its own, so nothing here is attributed to the agent beyond what the diffs and
> commit messages say. Read it as a record of what landed, not as a report of what was
> measured.

**THE COMMENT THIS TASK WAS TOLD TO WRITE WAS FALSE, AND TASK 7 REFUSED TO WRITE IT.** The
plan above dictates the comment `// The remap maps the payload's default location onto THIS
account's isDefault row, so the copy cannot start until the destination's locations are
known`. `importCloudData` reads the destination's default **itself**, with its own
`network-only` `GetLocations` inside `fetchCloudDefaultLocationId`, on every strategy. The
hook's `useLocations()` result feeds the remap nothing, so the gate cannot be what the
comment says it is. The same false reason appeared in the design doc and in brainstorming
**decision 6** — which means the option the user chose there was presented with a
justification that does not hold. Both documents were corrected in `293c82f8`.

**The gate is still kept, for a different and honest reason:** the copy is one-shot and
destructive, and on `clear` it deletes every `Location` row before the remap re-reads them,
so it must not start while the hook's own `GetLocations` is in flight. That reason is argued
from source, not measured, and the comment says so.

**The stated mechanism for keeping `autoImportStarted` was also wrong.** `locationsLoaded`
is a **boolean**, so "a location change mid-flight" does not re-fire the effect and a test
written to that mechanism cannot fail. The real trigger is inside the copy:
`importCloudData` calls `client.resetStore()` on the `clear` path, which refetches
`GetLocations`, so the boolean goes true → false → true while `MIGRATION_PROMPTED_KEY` is
still unset. The ref stays; its comment now names that trigger.

**`importCloudData`'s `locationId` option is gone**, not just unused. Task 3 had left it in
place documented as dead.

**What the dialog deletion took with it.** 4 files / 154 lines in
`MigrationLocationWarningDialog/` — including its `.stories.tsx` and its
`.stories.test.tsx`, so the smoke test is **deleted, not silently skipped** (mutation check
6's negative control). Both call sites went too, and with them more than the dialog:

| Call site | Also removed |
|---|---|
| `PostLoginMigrationDialog` | the TanStack Query over the local `locations` table, `resolveLocalActiveLocationId`, and the `showLocationWarning` state that gated the prompt and disabled the Import button until that read landed. `importData('append')` **is** the copy, and it had two entry points; it is now called straight from the Import button |
| `DataModeCard` | `requestEnableSwitch`, the `locationWarning` variant of `EnableFlow`, the `useLocations()` / `useActiveLocation()` reads, and `disabled={!locationsLoaded}` on all three strategy buttons. The card needs no location list at all now |

**Tests rewritten, not deleted.** `PostLoginMigrationDialog/index.test.tsx` goes from 2
describes / 5 `it`s to 1 / 3; `DataModeCard/index.test.tsx` loses 2 describes / 3 `it`s and
gains 1 / 2. Both pin the inverse rule: one press copies the pantry, no location is named,
and the strategy buttons no longer wait for a list. Two assertions are labelled **negative
controls** — deleting a component cannot make its heading appear.

**The 4 i18n keys** under `settings.migrationLocationWarning` (`title`, `description`,
`leftBehind`, `continue`) are gone from both locale files. **`common.cancel` was kept** — the
dialog used it and so do several others.

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

**Done 2026-10-04** — `1d2a0c89`, `9739daee`. Cloud **2 -> 6** tests (6 passed, 2.0m),
local **3 -> 4** (4 passed, 9.7s). Web **2281 -> 2285 / 248 files**; server unmoved at
**347 / 24**. `pnpm build` clean, no `TS6385`. Biome: the same **4** pre-existing warnings
in `src/routes/shopping/index.tsx` at 187, 191, 211, 215.

**BOTH CLOUD TESTS WERE ALREADY RED ON THIS BRANCH, AND TASK 6'S WORST CASE HAD HAPPENED.**
Measured at `293c82f8` before any edit: 2 failed, both on
`getByRole('heading', { name: 'Fixture Item', level: 3 })` / "element(s) not found" — the
imported item in the catalog and stocked nowhere, invisible in the pantry, with no error
anywhere. Two independent causes:

| Cause | Where it belongs |
|---|---|
| The spec's own cloud seed wrote an item and no stock row. Task 6 removed the mirror that used to cover for it | the spec |
| **`importCloudData` never ran `upgradeLegacyPayload`**, and both fixtures were pre-v15 | **production** |

**The second one is a regression this PR introduced, and it is now fixed** (`1d2a0c89`). A
pre-v15 backup has no `itemStocks` key: stock is inline on each item and cart ids are bare.
Task 3 deleted `flattenPayloadForCloud`, which used to send those inline columns up, and
task 6 deleted the server mirror that turned them into a row. Nothing replaced either, so
such a file imported into cloud mode lost **all** its stock and kept writing **bare cart
ids** — issue #327's leak, still open on that one path. Measured before the fix: the
mutations sent were `["BulkCreateItems", "BulkCreateShoppingCarts"]` and nothing else, with
the cart id still `vendor_1`.

`upgradeLegacyPayloadForCloud` guards on the **absent key and nothing else**. Running the
whole of `upgradeLegacyPayload` on a post-v15 payload would also run `upgradeUnsplitItems`,
and a cloud export's items carry the legacy stock columns as **0 rather than null** — so
`hasInlineStock` answers true for every CATALOG-ONLY cloud item and a cloud -> cloud round
trip would stock each of them at the default location. One of the four new unit tests pins
that.

**`computeTotalBatches` had to move.** On the `clear` path it ran on the raw payload,
because the destination's default cannot be read until the clear has. The upgrade is the one
step that changes an array's LENGTH, so the progress bar would have under-counted by one
batch. It now runs on the prepared payload, with a fourth unit test asserting the final
total equals the number of entity mutations actually sent.

**THE FIXTURES SEED THREE LOCATIONS** — `Fixture Home` (default), `Fixture Office`,
`Fixture Cabin` — with three different quantities (packed 2/7/3, target 4/9/5, refill
1/2/0), one cart at the **non-default** Office, and two logs, one at the default and one at
the Office, each carrying `logKey` and `logParams`. `cloud-backup.json`'s default id is
`aaaaaa000000000000000010`; `local-backup.json`'s is the `local` sentinel. So each direction
exercises the remap.

**The location assertions live in ONE place**, `e2e/helpers/backupAssertions.ts`. The two
`verifyRelations` copies had already drifted, and a third copy of the new checks would drift
too. `e2e/helpers/stockReadback.ts` gained `readLocations`, mode-aware like its neighbours.

**The cloud spec's own `seedCloudFixture` was EXTENDED, not replaced.** `e2e/helpers/
cloudSeed.ts`'s `Fixture` type (helpers/fixture.ts) describes locations, vendors, items,
stocks, shelves and recipes — and nothing else, while `verifyRelations` asserts a tag, a tag
type, an inventory log and a cart item. Switching would have meant widening `Fixture` and
both seed halves, touching the five other specs that use them, for no gain here. The
extended seed writes locations FIRST (the non-default ones with the fixture's **own** ids
through `bulkCreateLocations`, the default **mapped** onto the server's cuid), then stock.

**No second user was needed.** Task 1's optional `userId` on `makeGql` / `cleanupCloudData`
is untouched here.

**A cart row's `locationId` COLUMN is read through
`cartItemCountByItem(itemId, locationId:)`.** The `Cart` GraphQL type exposes `id` and
`lastPurchasedAt` and nothing else, so there is no `locationId` field to select; that query
resolves through `where: { itemId, userId, cart: { locationId } }`, so it reads the column
rather than parsing the id. This is the real-SQL half of task 1's proof — task 1 pinned the
id the client SENDS, and nothing had confirmed which column Postgres wrote.

**FOUND AND PINNED: the backup's default-location NAME does not survive the import the UI
runs, in either mode.** `ImportCard.tsx:111` runs the **`skip`** strategy whenever the
payload raises no conflict, and `skip` means "add what is missing, change nothing already
there". The remap has put the backup's default row on the id the destination already holds,
so that row is always the one `skip` leaves alone — local filters it out by `existingIds`,
cloud's `bulkCreateLocations` skips a taken id. Measured 2026-10-04: a backup whose default
was called "Fixture Home" came back as `[ "Fixture Cabin", "My Home", "Fixture Office" ]` in
**both** projects. Correct for `skip`, and no stock, cart or log is lost — a location row
holds only a name and an order.

**One wrong comment of my own, caught and corrected before it shipped.** The first version
of `DESTINATION_DEFAULT_LOCATION_NAME` blamed task 4's create-pass routing for that name
loss, and claimed local mode kept the backup's name while cloud did not. The local run
disproved it: local gives "My Home" too, because the UI never reaches `clear`. The constant
and both call-site comments now name the `skip` strategy as the cause.

**Three mutation checks, all red for the reason claimed.**

| Mutation | Result |
|---|---|
| uploaded `itemStocks` forced onto the caller's default location (`prepareCloudPayload`) | **4 red.** `expected [ "DEFAULT", "Fixture Cabin", "Fixture Office" ] to deeply equal [ "DEFAULT" ]` at `backupAssertions.ts:168` — every row collapsed onto the default. The cart and log tests stayed green, correctly: that mutation touches neither |
| the `itemStocks` entity deleted from `ENTITY_SPECS` | **4 red.** Two die at `verifyRelations` step 1, `getByRole('heading', { name: 'Fixture Item', level: 3 })` "element(s) not found" — the invisible-item symptom task 6 made possible. The stray-default test says it **directly**: `expected [ "DEFAULT", "Fixture Cabin", "Fixture Office" ] to deeply equal []` — stocked nowhere |
| the cart prefix strip reinstated (what task 3 deleted) | **2 red**, exactly the two cart-column assertions: `cartItemCountByItem(itemId, locationId: <Office>)` `Expected: 1 / Received: 0`. The stock assertions stayed green |

So the three mutations hit three independent assertions, not one shared one.

**Type-checked by hand, because nothing type-checks `e2e/` (issue #322).** A temporary
`tsconfig.e2e-task8.json` scoped to the four touched files, `npx tsc --noEmit`, run on the
**stashed** tree first and then on mine. Both runs printed the same **7** errors — 3
`TS2307` in the cloud spec and 4 in the local spec, all `node:*` with no `@types/node`,
exactly what `e2e/CLAUDE.md`'s table says. `diff` of the two outputs is empty, so the new
code adds none. The temporary tsconfig was deleted.

**What still cannot be seen by any test.**

| Gap | Why |
|---|---|
| The `clear` strategy end to end | `ImportCard` reaches it only through the conflict dialog's "clear and import" button, and no spec drives that dialog. So `clearAllData` + re-import — the one path where the ordering hazard that broke PR 4a lives, and the one where local and cloud really do differ about the default location's name — is covered by unit tests only |
| `replace`, and issue #330 | same reason. #330 (the shared `ImportSession` key with no mode in it) needs `replace` with rows in both passes |
| A pre-v15 file through the real UI | the new coverage is four unit tests. Both E2E fixtures are post-v15 now, on purpose: a pre-v15 fixture cannot carry three locations, so it cannot see a wrong one |
| `updatedAt` pass-through on the four new bulk mutations | still unresolved, as the plan's gap table says. These specs assert quantities and locations, never timestamps |
| The LOCAL half of `readStocksForItem` in a cloud run | it reads IndexedDB, which a cloud run has none of. The helper branches on `baseURL`, so this is correct, but it means the local assertions and the cloud assertions are two different code paths proven separately, not one path proven twice |
| A local export from a database whose items were never split | such a payload has `itemStocks: []`, so `upgradeLegacyPayloadForCloud`'s guard treats it as post-v15 and `upgradeUnsplitItems` does not run on the cloud path. Its inline stock is still dropped on an import into cloud. Left alone deliberately: the alternative over-stocks every catalog-only item (see above), and the state is a test artifact rather than something a Dexie upgrade leaves behind |

**Done 2026-10-04.** Cloud spec **2 → 6** tests, local **3 → 4**. Cloud project 99 → 103
in 20 files, local 175 → 176 in 22. Web 2281 → 2285.

### It found a real regression, not a test gap

**`importCloudData` never ran `upgradeLegacyPayload`.** A pre-v15 backup imported into cloud
mode **lost all of its stock**: every item landed in the catalog stocked nowhere, invisible in
the pantry, with no error. Measured before the fix, the only mutations sent were
`["BulkCreateItems", "BulkCreateShoppingCarts"]`, and the cart id was still the bare
`vendor_1`.

Task 3 deleted `flattenPayloadForCloud`, which used to send the inline columns up. Task 6
deleted the mirror that turned them into a row. **Neither half was replaced, and each task's
own tests passed.** Fixed in `1d2a0c89` by `prepareCloudPayload`, which runs the upgrade and
then the remap.

The guard is **the absent `itemStocks` key and nothing else**. Running the whole upgrade on a
post-v15 payload also runs `upgradeUnsplitItems`, and a cloud export's items carry the legacy
stock columns as **0, not null** — so `hasInlineStock` answers true for every *catalog-only*
cloud item, and a cloud → cloud round trip would stock each one at the default. A unit test
pins that.

### A process failure of mine, worth a rule

**I told task 8 "the suite is GREEN". It was not** — both cloud tests were already failing at
`293c82f8`. I ran `pnpm test:web` and `pnpm test:server` after every task and **never ran the
E2E specs**, so a regression introduced by tasks 3 and 6 sat undetected through tasks 4, 5, 6
and 7.

**Rule for the next multi-task PR: if a task deletes a code path, run the E2E spec that
covers it in that task, not at the end.** Unit tests cannot see this class of failure — every
assertion behind task 6's "the chain holds" judgement was against a fake, and the chain table
it built never mentioned the legacy path at all.

### One flake risk for task 9

The `cloud → cloud` test takes about **30s against a 30s timeout**. It passed 6/6 four times
at load 2–3, and failed once at load **16.46** with `Test timeout of 30000ms exceeded` — the
starvation signature. It may flake in the full gate.

### Other findings

- **A cart row's `locationId` column needs `cartItemCountByItem(itemId, locationId:)`.** The
  `Cart` GraphQL type exposes only `id` and `lastPurchasedAt`; that query resolves through
  `where: { cart: { locationId } }`, so it reads the column rather than the id string. This is
  the real-SQL half of task 1's proof.
- **The log had to stay at the default location.** Both modes scope the item Log tab to the
  *active* location, so moving the fixture's only log would have made `verifyRelations`' "one
  log entry" read 0. A second log sits at the Office instead.
- **`expectStockNotCollapsedOntoDefault` is a restatement, not coverage**, and is labelled as
  such — all three mutations went red through other assertions.
- The location checks live in one module, `e2e/helpers/backupAssertions.ts`, rather than a
  third drifting copy. The two `verifyRelations` copies had already drifted.
- **DX cost:** the cloud spec now takes ~1.9m, up from ~40s, so the gate gains about 70s.

### An agent-caught false comment

Its first version of `DESTINATION_DEFAULT_LOCATION_NAME` blamed task 4's create-pass routing
for the lost default-location name, and claimed local kept the backup's name while cloud did
not. **The local run disproved it** — local gives "My Home" too. The real cause is that
`ImportCard.tsx:111` runs the **`skip`** strategy when nothing conflicts, and `skip` leaves
the destination's existing default row alone in both modes. Corrected before committing.

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

**Done 2026-10-04 — THE GATE IS RED ON ONE E2E TEST. The branch must not be pushed yet.**

Everything except one cloud E2E test passes. Load average 1.6–2.5 throughout, so this is
**not** the starvation signature.

| Command | Result |
|---|---|
| `uptime` before starting | load 2.45 / 2.34 / 2.94 |
| `pnpm codegen` | pass |
| `(cd apps/web && pnpm lint)` | pass — 623 files, the same **4** pre-existing suppression warnings in `src/routes/shopping/index.tsx` at 187, 191, 211, 215 |
| `pnpm build` (root, full) | pass — codegen + web `tsc -b && vite` + server `tsc`. No `error TS` lines |
| `grep 'TS6385' /tmp/p1i-build-pr4b.log` | **no match** |
| `(cd apps/web && pnpm build-storybook)` | pass, exit 0 |
| `(cd apps/web && pnpm check)` | pass — the same 4 warnings |
| `pnpm test` (repo root) | pass — `apps/web` `Test Files 248 passed (248)` / `Tests 2285 passed (2285)` in 57.86s; `apps/server` `Test Files 24 passed (24)` / `Tests 347 passed (347)` in 2.54s; `scripts/spec` 57 pass |
| `pnpm test:e2e:all` → `local` | **PASS** — 5 skipped, 171 passed, 3m16s |
| `pnpm test:e2e:all` → `cloud` | **FAIL(1)** — 1 failed, 7 skipped, 95 passed, 11m59s |
| `pnpm test:e2e:all` → `pwa` | **PASS** — 69 passed, 1m24s |

Against `main`'s last full gate (local 170 passed / 5 skipped, cloud 90 / 7, pwa 69):

| Project | Collected now | Was | Gained |
|---|---|---|---|
| `local` | 176 in 22 files | 175 | **+1** — `import-export-local.spec.ts` 3 → 4 |
| `cloud` | 103 in 20 files | 97 | **+6**, of which 4b owns 5: 1 for `cart-id-cross-user-leak.spec.ts` and 4 for `import-export-cloud.spec.ts` 2 → 6. The sixth arrived between 2026-09-24 and this branch and is not attributable from here |
| `pwa` | 69 in 2 files | 69 | unchanged |

### The failure, and why it is not the flake task 8 predicted

```
[cloud] › e2e/tests/settings/import-export-cloud.spec.ts:314:1
  › user can export and re-import cloud data (cloud → cloud)
Test timeout of 30000ms exceeded.
Error: expect(locator).toBeVisible() failed
Locator: getByLabel('Remove Fixture Item')
Expected: visible / Error: element(s) not found
  at verifyRelations (e2e/tests/settings/import-export-cloud.spec.ts:246:70)
```

Task 8 warned this test might flake under load. **It is not a flake.** Three measurements:

1. It failed in the full gate, then failed **again** with its spec file run alone
   (`--project=cloud e2e/tests/settings/import-export-cloud.spec.ts`, 5 passed / 1 failed,
   2.1m) at load **1.65**. A failing set that moves is starvation; a repeat at low load is
   not.
2. **The page snapshot captured at the failure shows the element present** —
   `checkbox "Remove Fixture Item" [checked]` on the recipe's Items tab, in
   `test-results/…/error-context.md`. The round trip restored the data correctly. The
   assertion lost a race; it did not read a wrong value.
3. Re-run as a single test with `--timeout=90000`: **1 passed (36.5s)**.

So the test needs about **36.5s** against the default 30s `timeout`, and cannot pass as
written. 4b's own new location and quantity readbacks are what pushed it over.

**Not fixed, on purpose** — the brief says a failure is a hard stop, and the three options
trade different things: `test.setTimeout(60000)` on that one test (one line, hides that a
cloud round trip now costs 36s); raising `timeout` for the whole `cloud` project (every
cloud test gets a longer leash, including where 30s is a useful alarm); or splitting
`verifyRelations`' seven UI steps across two tests (more wall time, each test inside budget
and naming its own failure).

**`.husky/pre-push` will not catch this.** It runs `pnpm test`, which is green.

### Steps 5 and 6, verified rather than assumed

- **4** `stockDualWrite` call sites, measured with
  `grep -rnE "await (mirrorStock|mirrorStockToDefaultLocation|mirrorItemStockToItem)\(" apps/server/src/resolvers`:
  `item.resolver.ts:191`, `cart.resolver.ts:178`, `recipe.resolver.ts:103`,
  `itemStock.resolver.ts:137`.
- **5** `REMOVED IN PR 5` markers, **0** `REMOVED IN PR 4b`. The table in the status doc's
  *Amendment 2026-10-03* is correct as written.
- **`settings.import.unknownLocations` is dead and gone.** It appears in no source file and
  in neither locale file — only in these docs.
- `readStoredLocationId` now has **no caller outside `useActiveLocation.tsx`**; the three
  remaining hits are comments. `apps/web/src/hooks/CLAUDE.md` says so and is right.

### Docs updated

| File | What |
|---|---|
| `docs/INDEX.md` | rows 53 and 54 — 4a marked merged (`#328`), 4b's contents and gate state recorded, the cart-id leak moved from "not yet proved" to proved, and the PR 4b plan linked |
| `cloud-locations-status.md` | header, the 4a/4b rows, *PR 4 owes* (both open items closed by task 7), and a new *Amendment 2026-10-04* carrying issue #330, the tasks 3+6 regression and its process rule, the migration gate's false reason, the dual-write re-count, and the gate run |
| `2026-10-02-cloud-locations-pr4-design.md` | status header, the dual-write counts after 4b, mutation-check rows 2–4 filled in with measured failure text, and a new *4b's mutation checks, measured* table of the **14** checks actually run |
| root `CLAUDE.md` | web/server counts 2259/249 + 346/24 → **2285/248 + 347/24**; the cloud `testMatch` 19 of 26 → **20 of 27**; two new paragraphs on `cart-id-cross-user-leak.spec.ts` (a labelled negative control) and on the two import/export specs; the E2E totals 341/26 → **348/27**; and the 2026-10-04 gate measurement, written as a worked example of telling a real failure from a phantom |
| `e2e/CLAUDE.md` | `testMatch` 19 → **20** files, the 20th named, and measured cloud counts 97 → 103 |
| this plan | task 7's missing Done note (reconstructed from its four commits and labelled as such) and this task 9 note |

### What this brief got wrong

1. **"Report the new numbers and say which project gained what" assumed the gate would be
   green.** It is not. The brief's *If the gate fails* clause covered it, so no harm — but
   the expected-outcome table ("cloud 99 → 103, local 175 → 176") reads as a prediction of
   success and is the number a careless reader would copy forward.
2. **Task 8's flake prediction was wrong in substance, not just in degree.** It said the
   `cloud → cloud` test "may flake in the full gate" and attributed one earlier failure to
   load 16.46. The test is **deterministically over budget** at 36.5s against 30s. Blaming
   load once already is how it survived to task 9.
3. **"Task 8 measured the cloud project at 20 files" — true. "cloud 99 → 103" — true.** But
   the brief also said `main`'s last gate was "cloud 90 / 7", which totals 97, so the 99 it
   quotes for this branch before task 8 cannot be derived from anything in the brief. The
   +6 is real; only 5 of it belongs to 4b.
4. **Step 2b asked for findings that were already written.** The migration gate's false
   reason was corrected in `293c82f8` during task 7, and the dual-write counts in
   *Amendment 2026-10-03*. Both were re-verified rather than re-written.
5. **Step 2e said "fill in what you measured" for task 9 only.** Task 7 had no Done note at
   all, which the brief did not flag even though it lists task 8's note as the most
   important thing in the file. A missing note is easier to miss than a wrong one.

## Known gaps this PR will leave

| Gap | Owner |
|---|---|
| Issue **#327** — nine `bulkUpsert*` mutations let one user take ownership of another's row; nine `bulkCreate*` silently drop the caller's own row | #327, its own PR |
| Issue **#320** — the two production purge paths have no real-SQL test | 4c |
| `Item`'s five state columns, and 4 remaining `stockDualWrite` calls | PR 5 |
| `updatedAt` pass-through on the four new bulk mutations is unresolved — no local test can settle it, because every server test runs against a fake | needs real SQL |
| Local allows two `ItemStock` rows on one `[itemId, locationId]` pair (the Dexie index at `db/index.ts:612` is **not** unique) while Postgres forbids it, so such a local DB cannot round-trip | accepted |
| PR 3b's migrated-data check — nothing has run the new server code against rows the re-key migration converted | still owed from 3b |
| Issue **#330** — on `replace`, `bulkCreate` and `bulkUpsert` share one `ImportSession` and the batch key carries no mode, so the upsert pass skips any entity the create pass already keyed. Reachable for all nine older entities | #330, its own PR |
| The `cloud → cloud` E2E test is over its 30s time budget (36.5s). The gate is red on it | needs a decision — see task 9 |
| The `clear` and `replace` strategies have no E2E coverage at all. `ImportCard` reaches them only through the conflict dialog, and no spec drives that dialog | open |
| `importData.ts` is **net +331 lines** (2037 → 2368) despite the deletions. The design doc's *Less code to maintain* row counts what went, not the balance | accepted |
