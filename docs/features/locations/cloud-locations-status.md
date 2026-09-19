# Cloud Locations — Status

Status: 🔄 **In Progress** — PRs 0, 1, 2 and 3a are ✅ merged. **PR 3 is now complete**:
3b is ✅ built on `feature/cloud-locations-pr3b` and 3c is ✅ built on
`feature/cloud-locations-pr3c`. Neither is merged or deployed. PRs 4 and 5 are 🔲 pending.

Docs for this feature:
[brainstorming](2026-08-30-brainstorming-cloud-locations.md) ·
[design](2026-08-30-cloud-locations-design.md) ·
[PR 0 + PR 1 plan](2026-08-30-cloud-locations-plan-pr0-pr1.md) ·
[PR 2 plan](2026-08-30-cloud-locations-plan-pr2.md) ·
[PR 3 split brainstorming](2026-09-16-brainstorming-pr3-split.md) ·
[PR 3a plan](2026-09-16-cloud-locations-plan-pr3a.md) ·
[PR 3b brainstorming](2026-09-17-brainstorming-pr3b.md) ·
[PR 3b plan](2026-09-17-cloud-locations-plan-pr3b.md) ·
[PR 3c brainstorming](2026-09-20-brainstorming-pr3c.md) ·
[PR 3c plan](2026-09-20-cloud-locations-plan-pr3c.md) ·
[**deploy runbook**](../../global/backend/2026-09-18-deploy-runbook-cart-rekey.md)

> **Nothing here is deployed yet.** PR 3b re-keys a primary key, and the migration
> and the new server code must go out in the same deploy. Read the
> [deploy runbook](../../global/backend/2026-09-18-deploy-runbook-cart-rekey.md)
> before deploying anything in this series.

---

## Where this stands

The goal is full cloud parity for locations. Cloud gains `Location` and `ItemStock` in
both Prisma and GraphQL, plus location-scoped carts, logs, cooking and search. Every
`isCloud` stock bypass is **deleted**, not ported to the cloud path.

The work lands as **5 staged PRs**, with `Item`'s five state columns dropped last.
PR 3 was later split into **3a, 3b and 3c** — see
[the split brainstorming](2026-09-16-brainstorming-pr3-split.md). The rule is the same one
PR 1 and PR 5 already use: additive changes first, destructive changes last.

| PR | Status | What it covers |
|---|---|---|
| **0** | ✅ merged — [#281](https://github.com/ETBlue/player1inventory/pull/281) | Closes issue #260. Cloud had **zero** E2E coverage of vendor carts and checkout. Both tests now run and pass. |
| **1** | ✅ | `Location` + `ItemStock` Prisma models, the additive backfill migration, `requireLocationRole`, both GraphQL schemas, both resolver sets, purge coverage, and a dedicated E2E test database. |
| **2** | ✅ | The web client's cloud path moves onto `Location` / `ItemStock`. Writes split client-side. A five-site server dual-write keeps `Item`'s legacy columns fed until PR 5. |
| **3a** | ✅ merged — [#291](https://github.com/ETBlue/player1inventory/pull/291) | The **additive** migration: `InventoryLog.locationId` and `Cart.locationId` added, backfilled and constrained. No `Cart.id` re-key. Inventory logs scoped by location, server and client. |
| **3b** | ✅ built, not merged | The destructive half: the `'no-vendor'` split, the composite `Cart.id` re-key, the cart resolvers, vendor carts at the right time, `checkout`, `consumeRecipes`, and **five** `!isCloud` bypasses (the plan said two). |
| **3c** | ✅ built, not merged | `applyUnitSwitch` and `removeItemFromLocation`'s cloud cascade. Two new features, blocked by neither 3a nor 3b. **PR 3 ends here.** |
| **4** | 🔲 Pending | Import, export, post-login migration and purge (design §6). |
| **5** | 🔲 Pending | **Contract step:** drop the five `Item` columns, remove them from the GraphQL type and inputs, delete `apps/server/src/lib/stockDualWrite.ts` and all of its call sites. |

Two pieces of follow-on work sit beside the PR series:

| Work | Status |
|---|---|
| Cloud E2E coverage for locations — issue #284 | ⚠️ Partly done (2026-09-14). Issue stays open. |
| The silent stock drop — issue #287 | ✅ Fixed at the source (2026-09-16). |

### Two prerequisites the series was built behind

1. **Issue #260 as a standalone pre-PR.** Cloud had zero E2E coverage of vendor carts and
   checkout. The four seeded tests skipped in the cloud project, and the two cloud
   replacements were gated on a variable that was never set. This became PR 0.
2. **A dedicated test database, as PR 1 groundwork.** The `'no-vendor'` split test needs
   more than one user, but cloud E2E shared the dev database, with cleanup scoped to a
   single `E2E_USER_ID`.

---

## Key decisions

| Decision | Reason |
|---|---|
| **Client-side join.** `Item` drops its 5 state fields. | This is the shape a future shared predefined-item catalog needs. |
| **`ItemStock` carries no `userId`.** | It is scoped through its location, so the RBAC-forbidden `row.userId === ctx.userId` guard is out of reach. |
| **Explicit `isDefault` replaces the `'local'` sentinel in both modes** (Dexie v18). | dnd-kit lets the user drag the default row out of first place, so "lowest `order`" is not a stable marker. |
| **Composite `Cart.id` plus a `locationId` column.** | The composite id is the wire contract; the column is the query key. |
| **Auth is parity-first, behind an RBAC-shaped `requireLocationRole` helper.** | RBAC itself and issue #273 stay out of scope. |

### A live bug this series fixes

Cloud has a **cross-user `'no-vendor'` cart leak**. `Cart.id` is the primary key, and
`'no-vendor'` is a literal string shared by every user. So `lastPurchasedAt` crosses
accounts, and one user's checkout stamps another user's row. **PR 3b fixes it** — the
re-key is the destructive half of the split, so it is not in PR 3a. Fixed in code, **not yet
deployed**: the fix only reaches production when the migration runs there.

---

## PR 0 ✅ — cloud E2E baseline

[#281](https://github.com/ETBlue/player1inventory/pull/281), closes issue #260.

Cloud had zero E2E coverage of vendor carts and checkout — exactly the surface PR 3
rewrites. PR 0 turned those tests on against today's code, so PR 3 is measured against a
known-good baseline. Both tests now run and pass.

## PR 1 ✅ — the cloud data model

Shipped:

- `Location` and `ItemStock` Prisma models
- The additive backfill migration
- `requireLocationRole`
- Both GraphQL schemas and both resolver sets
- Purge coverage
- A dedicated E2E test database

### Two latent bugs found and fixed on the way

| Bug | Effect if left |
|---|---|
| Every resolver return site serialized `Date` fields as **epoch milliseconds**, not ISO strings. | It would have reopened issue #263's Invalid-Date class from the server end, showing up in PR 2. |
| `purgeUserData` reported an `itemStocks` count of about 0. | `ON DELETE CASCADE` ran before `purgeUserData`'s own `deleteMany`, so there was nothing left to count. |

## PR 2 ✅ — the web client moves onto Location / ItemStock

What changed:

- `useLocations` becomes dual-mode.
- One `PantryData($locationId)` query, joined through the **same** `joinItemStock` that
  local mode calls. The function was extracted to `lib/itemStock.ts`.
- A per-mode `active-location-id:<mode>` storage key. The `'local'`-is-always-valid
  shortcut is **deleted**.
- Dexie v18 plus `Location.isDefault` replaces the sentinel as the undeletable marker, in
  both modes.
- **Every `isCloud` stock bypass in the item/pantry path is removed**: `useShowStock`,
  `useItemSearchTail`, `useItemSearchTailWiring`, `NewItemDialog`, and the Stock tab's
  `CloudStockTab` placeholder, which is now one dual-mode pager.

Writes are split client-side:

| What | Goes to |
|---|---|
| Configuration fields | `updateItem` |
| The five state fields | `upsertItemStock(itemId, locationId)` |

A **five-site server dual-write** keeps `Item`'s legacy columns fed until PR 5:

| Site | Resolver | Note |
|---|---|---|
| `cart.resolver.ts` | `checkout` | |
| `recipe.resolver.ts` | `consumeRecipes` | |
| `item.resolver.ts` | `updateItem` | |
| `itemStock.resolver.ts` | `upsertItemStock` | The **reverse** mirror, `ItemStock` → `Item`. Added because the PR-2 client stopped sending stock to `updateItem` at all. |
| `import.resolver.ts` | `bulkCreateItems`, `bulkUpsertItems` | Found in task 10b. Two markers in one file. |

`grep -rn "REMOVED IN PR 5" apps/server/src` returns **6 markers across 5 files** — the import
file carries two. Measured 2026-09-16.

Earlier text in this row said "four-site". That was written at PR 2 time, before the import
paths were found, and was left behind when the fifth was added.

### Four unplanned tasks

| Task | Why it was needed |
|---|---|
| **6b** | Three cross-mode paths were feeding the cloud cuid into local Dexie. Results: an empty local pantry after a cloud→local copy, every multi-location backup refused, and every migrated item uploaded with zeroed stock. |
| **6c** | The migration warning listed *cloud* locations while gating a destructive one-shot copy. |
| **9b** | A bypass that Task 8's `isCloud` sweep missed, because it was spelled `isLocal ? … : true`. |
| **10b** | Three regressions that only cloud E2E could see. See the table below. |

**The three 10b regressions** all come from the same window: a fresh session, before
`GetLocations` resolves, while `activeLocationId` is still the `'local'` sentinel.

| Regression | Fix |
|---|---|
| Location-scoped **writes** were sent with the sentinel and refused. | `useCloudLocationId` now resolves the target at call time. |
| A **name-based** `refetchQueries: ['PantryData']` refetched even the observer that `skip` had parked on that sentinel. Under `awaitRefetchQueries` it then rejected a mutation that had already succeeded. | The refetch is now targeted at the written location. |
| `bulkCreateItems` / `bulkUpsertItems` wrote **no `ItemStock` at all**, so a cloud import finished "successfully" with every item invisible in the pantry. | Now the **fifth** dual-write, added to PR 5's teardown list. |

**No unit test could see any of these.** Every cloud fixture seeds
`active-location-id:cloud` with a real cuid, so the fixture pre-resolves the very thing
that breaks.

---

## PR 3a ✅ — the additive migration and location-scoped logs

Branch `feature/cloud-locations-pr3a`.
[Plan](2026-09-16-cloud-locations-plan-pr3a.md) · [split brainstorming](2026-09-16-brainstorming-pr3-split.md).

The five commits that carry the work (four more carry docs):

| Commit | What |
|---|---|
| `fd162bdc` | `InventoryLog.locationId` and `Cart.locationId` — added, backfilled, `NOT NULL`, FK, index. No `Cart.id` re-key. |
| `2982bd98` | The inventory-logs API scoped by location. New `apps/server/src/test/inventoryLogFake.ts`. |
| `277626d1` | Every cloud caller passes the active location. New `apps/web/src/hooks/useCloudLocationKnown.ts`. |
| `a291dcfb` | All four `locationId` arguments tightened to `ID!`; the server-side fallback removed. |
| `fb758d3e` | The migration rehearsal against a production copy — passed. |

Test counts after this PR: **185** server, **2051** web.

### The migration

`apps/server/prisma/migrations/20260916000000_add_location_to_log_and_cart/migration.sql`.
Hand-written. Four phases per column, in this order:

1. `ADD COLUMN "locationId" TEXT` — nullable
2. backfill from the owner's default `Location`, joined on `userId`
3. a `DO $$ ... RAISE EXCEPTION` guard that fails if any row is still NULL
4. `SET NOT NULL`, then the FK, then the index

Both FKs are `ON DELETE CASCADE`, which matches what local mode's `deleteLocation`
already does. `CartItem` already cascades from `Cart`, so deleting a location removes
cart items too.

One index: `InventoryLog_itemId_locationId_occurredAt_idx`. `Cart.locationId` gets none —
nothing reads it in PR 3a, and PR 3b's re-key puts the location into the primary key.

### `Cart.locationId` is written and read by nothing

That is on purpose. The column lands additively now so PR 3b's re-key has a column to
build on. **Do not wire any cart query to it.** Every existing cart query keeps working
after this migration, which is the reason the PR can be reviewed and reverted on its own.

### The logs API

| Query / mutation | Before | After |
|---|---|---|
| `itemLogs(itemId)` | `where: { itemId, userId }` | `locationId: ID!`, scoped to one location |
| `inventoryLogCountByItem(itemId)` | same | `locationId: ID!`, scoped to one location |
| `lastPurchaseDates(itemIds)` | same | `locationId: ID!`, scoped to one location |
| `addInventoryLog(...)` | wrote no location | `locationId: ID!`, `requireLocationRole(..., 'member')` |
| `inventoryLogs` | all of the user's | **unchanged, whole-account on purpose** |

`inventoryLogs` stays whole-account because it is the snapshot path, not a screen. Its
only callers are `apps/web/src/lib/exportData.ts` and `apps/web/src/lib/importData.ts`.
Both must see every location or a backup loses rows. The reason is written into the
schema file.

The three reads go through `requireLocationRole(ctx, locationId, 'viewer')`. No
`row.userId === ctx.userId` check was added anywhere.

**All four arguments are `ID!`, not nullable.** They were nullable with a server-side
default-location fallback for exactly one commit, while the server change landed ahead of
its client. Do not make them nullable again: an omitted argument reads the wrong location
in silence, while a missing required argument fails loudly at codegen time.

### The client

| File | Change |
|---|---|
| `useInventoryLogs.ts` | `useItemLogs` cloud branch passes the active location |
| `useItems.ts` | `useLastPurchaseDate` passes it; `useAddInventoryLog` resolves the target with `useCloudLocationId()` at call time |
| `useItemSortData.ts` | the batched `LastPurchaseDates` query passes it |
| `apollo/client.ts` | `keyArgs` for `itemLogs`, `inventoryLogCountByItem` and `lastPurchaseDates` |
| `hooks/useCloudLocationKnown.ts` | **new** — the read-side gate |

**`useInventoryLogCountByItem` has no cloud caller.** It is Dexie-only. The generated
`useInventoryLogCountByItemQuery` is used by two test stubs and by no component, and the
`InventoryLogCountByItem` operation document has no caller at all. The Stock tab's remove
confirmation prints those counts in **local mode only**, which
`apps/web/src/routes/items/CLAUDE.md` already records. The document still gained
`$locationId: ID!` so the schema and the operations stay in step. PR 3c is where a cloud
caller appears, together with `removeItemFromLocation`'s cascade.

`useCloudLocationKnown` was private to `useItems.ts` since PR 2. Task 4 moved it to its own
file so the three inventory-log readers can use it too. It answers one question: is
`activeLocationId` a location this account actually has? On a fresh cloud session it is
not — the id is still the `'local'` sentinel until `GetLocations` resolves. With the
server fallback gone, a read sent in that window comes back `FORBIDDEN`, and Apollo keeps
it as a live observer that a later by-name refetch will retry and fail again.

The `keyArgs` lists are **not** a restatement of Apollo's default, unlike the `itemStocks`
one. `locationId` is one of several arguments on all three fields, so dropping it collapses
two locations into one cache entry, which then serves another location's logs after a
switch. `apps/web/src/apollo/client.test.ts` reads the cache directly and guards this.

### What still writes the wrong location

**`checkout` and `consumeRecipes` still write the caller's default location.** A user who
checks out while viewing their Garage writes the log against their Kitchen. PR 3a does not
fix it, and cannot: a cloud `Cart` has no usable location until PR 3b re-keys it, and
`ConsumeRecipesInput` carries no location at all. Both sites call `ensureDefaultLocation`
and carry a marker.

`grep -rn "PR 3b:" apps/server/src` returned **4 markers in 3 files** at the end of PR 3a —
that was PR 3b's checklist, the way `REMOVED IN PR 5` is PR 5's. **All four are gone since
PR 3b; the grep now returns 0.** The table is kept as history:

| File | Line | What it marks |
|---|---|---|
| `cart.resolver.ts` | 16 | the cart id becomes `${locationId}:${vendorId}` |
| `cart.resolver.ts` | 125 | `checkout` writes the default location |
| `vendor.resolver.ts` | 19 | one permanent cart per (location, vendor) |
| `recipe.resolver.ts` | 113 | `consumeRecipes` writes the default location |

This is the same limitation `apps/server/src/lib/stockDualWrite.ts` already carries and
documents.

### The inventory-log tests used to be call recorders

**Do not count the old inventory-log read tests as coverage of anything.**

`inventoryLog` was never in `apps/server/src/test/stockFake.ts`. It was four bare
`vi.fn()` inside `inventoryLog.resolver.test.ts`, with no `where` handling of any kind. A
recorder returns whatever `mockResolvedValue` gave it, so it could not tell **any** scoped
query from an unscoped one — not `locationId`, not `userId`, not `itemId`. Every read
assertion in that file was checking the mock's own return value.

Fixed by writing `apps/server/src/test/inventoryLogFake.ts`, which applies Prisma's `where`
semantics key by key.

This is the third such fake in this repo, after the `findFirst` fake that hardcoded
`i.userId === where.userId` and the `createMany` fake that silently deduped. **A call
recorder is the weakest form** — the other two at least had a `where` to get wrong. The
general rule is in root `CLAUDE.md`: write test doubles to model the constraint, not the
happy path.

### Verification, run 2026-09-17

Full gate green: `pnpm lint`, the root `pnpm build` (codegen + web + server `tsc`, no
`TS6385`), `pnpm build-storybook`, `pnpm check`, and `pnpm test` — 185 server plus 2051 web,
all passing.

Full E2E, both projects, no `--grep`: **251 tests — 232 passed, 11 skipped, 8 failed**. The
8 are the four `item-list-state-restore.spec.ts` cases that already fail on `main`, once in
`local` and once in `cloud` (issue #280, left alone on purpose). Nothing else failed.
`item-logs.spec.ts` — the spec most likely to catch a mistake in this PR, and one of the 12
files in the cloud `testMatch` — passed all 3 cases in both projects.

### `verify-migration.ts` now parks two migrations

`apps/server/scripts/verify-migration.ts` holds a `MIGRATIONS` list and parks those
migrations **by name**. It now names both `20260830000000_add_location_and_item_stock` and
`20260916000000_add_location_to_log_and_cart`. New assertions for this migration were
added; without them the script proved PR 1's migration and said nothing about this one.

**Whoever writes the next location migration must add it to that list**, or `migrate reset`
replays it against a database that lacks what it needs.

---

## PR 3b ✅ — the cart re-key

Branch `feature/cloud-locations-pr3b`.
[Plan](2026-09-17-cloud-locations-plan-pr3b.md) · [brainstorming](2026-09-17-brainstorming-pr3b.md) ·
[**deploy runbook**](../../global/backend/2026-09-18-deploy-runbook-cart-rekey.md).

The commits that carry the work:

| Commit | What |
|---|---|
| `dd311306` | `cartIdFor` / `parseCartId` made usable from the server. |
| `2a14c8a4` | The migration — the `'no-vendor'` split, then the re-key — and the cart resolvers, in one commit. |
| `c792a2f6` | The migration's assertions in `verify-migration.ts`. |
| `32470f1d` | Vendor carts created at the right time: `createVendor` for the active location, `bootstrapCarts` for the rest. |
| `60c8b65e` | Real `locationId` for `checkout` and `consumeRecipes`. |
| `6f138032` | The web client follows the composite cart id. |
| `49255c49` | The last three nullable `locationId` arguments tightened to `ID!`. |
| `0ad0cdb5` | The not-stocked-here partition runs in cloud too — five `!isCloud` bypasses removed. |
| `0e00f9cd` | The cloud bootstrap effect stopped looping on every render. |

Test counts after this PR: **226** server, **2061** web. Both suites green.

### The migration

`apps/server/prisma/migrations/20260917000000_rekey_cart_to_location_vendor/migration.sql`.
Hand-written, two phases, and **the order is the correctness argument**.

| Phase | What |
|---|---|
| **A** | Split the shared `'no-vendor'` cart. One new `${their own locationId}:no-vendor` per *other* user who holds a `CartItem` on the shared row, then repoint their rows. |
| **B** | The re-key. `CartItem` first, while it can still join on the old id, then `Cart`. |

Phase A must run first. `'no-vendor'` is one literal row that one user owns. If phase B
renamed it first, phase B's `CartItem` update joins on `cartId = Cart.id`, so **every other
user's items would follow that row into the owner's cart**.

**Four checks, in two `DO $$` guard blocks, each raising a message that names what it
found.** One after phase A: any `CartItem` of another user left on the shared row, which
means that user has no default `Location` — the message lists them. Three after phase B,
before the foreign key goes back on: a `Cart.id` with no separator, a `Cart.id` that does
not start with its own `locationId`, and a `CartItem` pointing at a `Cart` that no longer
exists.

**The doubled-prefix check exists because of a real mistake caught in review.** The design's
original SQL had no clause excluding the carts phase A creates, so it would have re-keyed
them a second time and written `loc:loc:no-vendor`. Task 1 added the clause; the rehearsal
then confirmed the fix against real data. A `startsWith` test would not have seen it.

### The `'no-vendor'` cross-user leak is fixed

That was the live bug: `Cart.id` is the primary key and `'no-vendor'` is a literal every
account shares, so one user's checkout stamped another user's `lastPurchasedAt`.

**The assertion that proves it** — in the 13-user fixture in
`apps/server/scripts/verify-migration.ts` — is that **user-l's new cart opens with a `NULL`
`lastPurchasedAt` instead of inheriting user-k's.** A cart-count assertion alone would not
catch it: the row can exist and still carry the wrong timestamp. `verify:migration` passed
with **41 assertions** against `TEST_DATABASE_URL` on 2026-09-18.

Two of those 41 are labelled in the script as structural invariants that cannot go red on
their own, and their own text says so. They are sanity checks. Do not count them.

**That run needed the user's explicit consent.** Prisma's AI guardrail blocks an agent from
running `migrate reset` without `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. It was
granted for that one run, for `TEST_DATABASE_URL` only. Ask again next time.

**One gap in the script's own guard.** It compares `TEST_DATABASE_URL` / `TEST_DIRECT_URL`
against the dev vars by parsed host + pathname. It does **not** check them against
`PROD_COPY_DATABASE_URL`. That was verified by hand before the run — all three hosts are
distinct. Worth closing in a later PR.

### The production rehearsal did not exercise the split at all

Run 2026-09-18 against a fresh Neon branch of production. **Passed.** The env override was
proved first: `prisma migrate status` with and without it reported **different hosts**. Both
migrations then applied — `20260916000000` (PR 3a) and `20260917000000` — because production
has not been deployed yet.

The hashes moved where they should. This is the opposite of PR 3a, where the proof was that
nothing changed.

| Set | Rows | Before | After | Expected |
|---|---|---|---|---|
| `Cart.id` | 37 | `2f459450498737da` | `a95da980bc85c0b3` | **changed** — re-keyed |
| `CartItem.cartId` | 13 | `d8fa5adb55a18fd7` | `ef345b98ff1f8625` | **changed** — repointed |
| `CartItem.id` | 13 | `d321211b1b04b290` | `d321211b1b04b290` | **unchanged** — rows move, not recreated |

The third row matters most. A changed `CartItem.id` would mean the migration deletes and
recreates rows, which loses anything it does not copy by hand.

Cart shapes went from 1 literal `'no-vendor'` and 0 with a colon, to 0 and 37. Counts
unchanged: 37 carts, 13 cart items, 173 items, 1374 logs. All five assertions returned 0:
no cart id without a colon, no row still under `'no-vendor'`, no orphan `CartItem`, no cart
id that is not `locationId:original`, **no doubled prefix**.

**What it does not prove — read this before trusting the pass.**

1. **Phase A did no work at all.** Zero production accounts had a `CartItem` on the shared
   row. The split loop ran over an empty set. So this rehearsal covers the **re-key** at
   real scale and says **nothing** about the **split**. The only thing that tests the split
   is the 13-user fixture in `verify:migration`.
2. Two assertions cannot fail, because production has one user: the cross-user ones.

### All 218 pre-existing server tests stayed green through Task 3

That is a measurement, not a pass.

Task 3 changed `checkout` and `consumeRecipes` from writing the caller's **default**
location to writing the **real** one. Every older checkout test uses a cart at the default
location, and every older cooking test omits `locationId`. For those fixtures "the cart's
location" and "the caller's default location" are the **same string**, so they cannot tell
the two implementations apart.

Only the new test groups can. That is written into both groups' comment headers, so nobody
later counts the old tests as coverage of this behaviour. This is the same shape as PR 3a's
call-recorder finding and PR 2's one-location fixtures. It keeps recurring because a
single-location fixture is the natural thing to write.

Three new tests are **negative controls** and say so in their own text:
`running bootstrapCarts twice creates nothing the second time`,
`a cart at the Kitchen still writes the Kitchen`, and
`an explicit Kitchen still writes the Kitchen`. They stay green under their mutations by
construction. They are controls, not evidence.

### The plan said two `!isCloud` bypasses; five had to go

Removing only `isUnstockedHere` (`shopping/index.tsx`) and `isRecipeUnstockedHere`
(`cooking.tsx`) would have left them partitioning on numbers that are not location-scoped.
Three more lost their mode branch at the same time:

| Site | What it was doing |
|---|---|
| `useVendorCartCounts.ts` | a global tally plus a hard-coded `inactiveCount: 0` |
| `cooking.tsx` `availableItemIds` | built without the stocked-here filter in cloud |
| `shopping/index.tsx` `cartForVendor` | still built the bare cloud cart id |

A fifth bypass, the stocked-here gate in `shopping/$vendorId.tsx`, rested on the same false
reason and went with them.

The reason all five ever existed was the **cart and the consumption path**, never "cloud
items have no `stockId`" — they have carried one since PR 2.

On the server side, the matching checklist is also finished: `grep -rn "PR 3b:"
apps/server/src` returns **0**, down from the 4 markers in 3 files PR 3a left.

### The `mirrorItemStockToItem` instruction in the plan was wrong

The plan listed it as a third site that should move off the default location. **Following
that would have introduced a bug**, so it was not done:

1. It writes the **reverse** direction — one location's `ItemStock` back onto `Item`'s five
   legacy columns. Those columns exist for a browser on a stale bundle, which renders one
   number per item and has no location concept. The default location's stock is the only
   value correct to show it. A Garage edit mirrored there would report the Garage's numbers
   as the Kitchen's.
2. Its only call site (`itemStock.resolver.ts:109`) is already guarded by
   `if (location.isDefault)`. The function never took the default as a *fallback* — the call
   site chooses, correctly.
3. `stockDualWrite.ts` carried **no `PR 3b:` marker**. The plan's own gate never pointed at
   it.

What that file did need was comment repair. Its "NOT LOCATION-AWARE, AND DELIBERATELY SO"
section became false the moment `checkout` and `consumeRecipes` started passing real
locations.

### A bug the unit tests could not see, and E2E caught

The first cloud bootstrap effect listed `locations` in its dependency array. `useLocations()`
maps its cloud result, so that array has a new identity every render: effect → mutation →
`AllCarts` refetch → render → effect, without end.

**All 7 unit tests passed against 92 calls**, because every assertion used `toContain`.
`/shopping` never reached `networkidle` and the cloud E2E case timed out. Fixed with a
derived boolean plus a ref, and pinned by a test that goes red at
`expected [...92 entries] to have a length of 1`.

`toContain` cannot see "and 91 more". Assert the count when the count is the thing that
matters.

### Three more findings from Task 4

1. **`pnpm codegen` cannot check an input-object field.** A missing field *argument* fails
   GraphQL validation, so codegen catches it. A missing field of an *input object* is valid
   in the document and fails one stage later, while coercing the variable. So
   `ConsumeRecipesInput.locationId` is caught by `tsc` (`TS2741`), not by codegen, and the
   runtime error is `BAD_USER_INPUT`, not `GRAPHQL_VALIDATION_FAILED`.
2. **The `e2e/` seeds are a caller class no static check can reach.** They build GraphQL as
   plain template literals, so neither codegen nor `tsc` sees them. Three `createVendor`
   seeds in `shopping.spec.ts` broke, plus two that created items with no `ItemStock` row —
   which only started mattering once the cloud stocked-here gate went live. Only Playwright
   found them.
3. **The cache-key mutation repeated PR 3a's result exactly.** The hook-level test stays
   green because `cache-and-network` refetches on every switch; the cache-level test in
   `apollo/client.test.ts` goes red. Not reshaped to force a red.

### What cloud E2E does and does not cover — a correction

The PR 3b plan claims, in its "Owed before the deploy" section, that **no cloud E2E spec
names `checkout`, `consumeRecipes` or `bootstrapCarts`**. That claim is **false**, and it was
copied forward into several task briefs. Measured 2026-09-18 from the cloud project's
`testMatch`:

| Path | Covered in cloud E2E? |
|---|---|
| `checkout` | **Yes** — 4 cases in `shopping.spec.ts` run in the cloud project. |
| `consumeRecipes` | **Yes** — `cooking.spec.ts` and `item-logs.spec.ts` both cook in cloud. |
| `bootstrapCarts` | **Yes** — `ActiveLocationProvider` calls it on every active-location change, so all 78 cloud tests run it. |

Cloud E2E hits real Postgres (`E2E_TEST_MODE=true` routes `prisma.ts` at
`TEST_DATABASE_URL`), so `createMany({ skipDuplicates: true })` has executed against a real
database.

**The real gap is narrower and still owed: no automated test has ever run the new server
code against data this migration produced.** Cloud E2E starts from an empty database —
`/e2e/cleanup` deletes everything first — so every row it reads was written by the new code
itself. The rehearsal migrated real rows but started no application code against the result.
**A manual smoke test is owed before the deploy.** Step 6 of the
[deploy runbook](../../global/backend/2026-09-18-deploy-runbook-cart-rekey.md) lists the
exact actions, and it requires **two locations**. With one location, "the cart's location"
and "the caller's default location" are the same string, so the location-scoping half of the
test proves nothing.

### A gap recorded, not fixed

**`useDeleteLocation`'s cloud branch refetches only `GetLocations`.** Since PR 3a both
`Cart.locationId` and `InventoryLog.locationId` cascade, so the database **does** delete the
rows — but the open page's `AllCarts`, `AllCartItems` and `ItemLogs` observers can still hold
rows that are already gone. A reload clears it. Outside Task 4's scope, so it was left alone
on purpose and written down here instead.

`removeItemFromLocation`'s per-item cascade stays PR 3c's, as its own comment says.

### Verification, run 2026-09-18

Full gate green: `pnpm lint`, the root `pnpm build` (codegen + web + server `tsc`, no
`TS6385`), `pnpm build-storybook`, `pnpm check`, and `pnpm test` — 226 server plus 2061 web,
all passing.

Full E2E, both projects, no `--grep`: **251 tests — 234 passed, 9 skipped, 8 failed** in
11.1 minutes. The 8 are the four `item-list-state-restore.spec.ts` cases that already fail on
`main`, once in `local` and once in `cloud` (issue #280, left alone on purpose):

| Project | Failing case |
|---|---|
| `local` and `cloud` | `user can navigate to item detail and back with search state preserved` |
| `local` and `cloud` | `user can navigate to item detail and back with sort state preserved` |
| `local` and `cloud` | `user can navigate to item detail and back with scroll position restored` |
| `local` and `cloud` | `user can navigate to item detail and back with scroll position restored when filter panel is open` |

Nothing else failed.

**The two cloud cases Task 4 unskipped both pass.** They are
`user sees a shopping vendor stocked only at another location below the divider` and
`user sees a recipe stocked only at another location below the divider, still disabled`, in
`e2e/tests/location-not-stocked-here.spec.ts`. Their skip reason named PR 3b and the two
`!isCloud` partition bypasses. The skipped count dropped from 11 in PR 3a to 9 here, which
is those two cases going live.

---

## PR 3c ✅ — the unit switch and the remove cascade

Branch `feature/cloud-locations-pr3c`, based on `6abd0948`.
[Plan](2026-09-20-cloud-locations-plan-pr3c.md) · [brainstorming](2026-09-20-brainstorming-pr3c.md).

Two features, plus the test-double work the first one needed. **No migration.** Both
features write tables that already exist.

| Commit | What |
|---|---|
| `d655efc4` | The Prisma fake learns to roll back a `$transaction`. |
| `e197a6b9` | `applyUnitSwitch` — schema, resolver, client. |
| `fb411304` | `removeItemFromLocation` cascades logs and cart entries. |
| `35e27bc3` | `cartItemCountByItem` takes an optional `locationId`. |
| `06b27242` | The Stock tab's cascade counts render in cloud too. |

### `applyUnitSwitch` never existed in the cloud schema at all

This is the fact most worth keeping. Design §2 named the mutation. PR 1 shipped
`itemStock.graphql` **without it**. So before PR 3c a cloud unit switch left **every
location's quantities in the old unit** — the item moved to the new unit and the numbers
did not.

**No test failed on that, and no test could**, because `buildStockConversions` gated on
`isLocal`. The dialog listed no conversions in cloud, so the cloud branch was never asked
to write one. The gate hid the missing mutation from every test that might have found it.

Removing the gate exposed two more cloud-only gaps behind it:

| Gap | What the user got |
|---|---|
| The cloud confirm path saved the item's configuration and the recipe amounts, but **never any quantity**. | The switch looked like it worked and silently dropped the conversions. |
| A **unit-only** switch never opened the dialog in cloud at all. | No confirmation, no conversion. |

Both are fixed. `handleConfirmAdjustments` now has one path for both modes.

### The resolver is one transaction, and one authorization rule

`applyUnitSwitch(input: ApplyUnitSwitchInput!): Item!`. The input mirrors local's
`UnitSwitchBatchInput`: `itemId`, `updates`, `stockConversions` (one per location) and
`recipeUpdates`.

| Rule | Why |
|---|---|
| The item update, every location's conversion and every recipe rewrite run in **one** `prisma.$transaction`. | A failure partway leaves the item on the new unit while some locations and recipes hold old-unit numbers. Mixed units, silently, with no error to act on. |
| **Every** location in `stockConversions` goes through `requireLocationRole(..., 'member')` **before** the transaction opens. One refusal fails the whole mutation with `FORBIDDEN`. | Converting only the locations the caller may write leaves the item in mixed units too — the same corruption, just authorized. Checking first means a refusal has written nothing even if rollback were broken. This cannot fire today; it is shaped this way so RBAC is one function body later. |

**`applyUnitSwitch` needed its own dual-write mirror**, written with `tx` inside the
transaction. `mirrorItemStockToItem` could **not** be reused: it uses the module-level
`prisma`, so its write would survive a rollback and leave `Item` and `ItemStock` in
**different units** — the exact corruption the transaction exists to prevent. The mirror
is default-location-only, the same rule `upsertItemStock` follows, and PR 5 removes it.

`buildItemUpdateData` was extracted from `updateItem` so both writers share one mapping.

### The Prisma fake now models `$transaction` rollback

PR 2 left `$transaction` out of `stockFake.ts` on purpose, so no test could claim
atomicity it had not earned. `applyUnitSwitch` earns it.

`runInTransaction` snapshots every registered store with `structuredClone`, keeps the
writes when the callback returns, and restores the snapshot when it throws. It is
**exported**, so `itemStock.resolver.test.ts` — which has its own hand-written prisma
mock — imports it instead of keeping a second copy. A second copy could silently do
nothing, and then every atomicity test resting on it would report as covered.

**It supports only the interactive callback form**, `$transaction(async (tx) => …)`.
The array form, `$transaction([p1, p2])`, **throws on purpose**: JavaScript evaluates the
array before `$transaction` is called, so the writes have already landed by then, and a
snapshot taken at that moment would report a rollback that never happened. Four resolvers
use the array form today (import, purge, location, `index.ts`) and none is tested through
this fake.

The snapshot is a **deep** copy. A shallow copy restores each array but shares the row
objects inside it, so a changed field would survive the rollback and the fake would report
an atomicity it never had. `configureTransaction({ txClient, stores })` lets a test file
register a wider mocked prisma and its own stores, so one rollback covers `item` and
`recipe` too.

### The remove cascade

Cloud's `removeItemFromLocation` deleted the `ItemStock` row alone. It now deletes the
same two families local does, in one `prisma.$transaction`:

- the item's inventory logs at that location
- the item's entries in that location's carts

Two differences from local, both because the cloud schema is stricter:

| Local | Cloud |
|---|---|
| Logs filter `(log.locationId ?? DEFAULT_LOCATION_ID) === locationId` — Dexie holds logs written before the Location feature. | `locationId` alone. `InventoryLog.locationId` is NOT NULL since PR 3a, so a fallback would tell the next reader that NULLs are possible when they are not. |
| Cart entries are matched with `parseCartId` on the cart id. | The relation filter `where: { itemId, userId, cart: { locationId } }`, reading `Cart.locationId`. |

### The cascade reads `Cart.locationId`, not the cart id

Task 3 first used `parseCartId`, because the plan named it, and then flagged the better
option. Task 4 switched it.

`Cart.locationId` is the real column PR 3a added, and the cart id
`${locationId}:${vendorId | 'no-vendor'}` is **derived from it**. Filtering the source
column is one statement; parsing the derived string meant reading every cart entry for the
item and filtering in memory.

**Both call sites changed together** — the delete in `removeItemFromLocation` and the
count in `cartItemCountByItem` — so one rule decides membership. If they disagreed, the
Stock tab's dialog would show a number the removal does not match.

Correcting the plan while doing it: the plan's mutation check said a vendor id containing
`':'` catches a cart id matched by string prefix. **It does not.** `Location.id` is a cuid
and never contains a colon, so ``startsWith(`${locationId}:`)`` and `parseCartId` give the
same answer for every input. What a prefix match gets wrong is the **missing delimiter**:
`'loc-a2:ven-1'.startsWith('loc-a')` is `true`. That whole question is moot now — with a
relation filter there is no string to prefix-match.

The replacement check is direct: **drop `cart: { locationId }` and the test asserting
another location's cart entries survived goes red.** It does, in both specs.

### The fakes did not model the relation filter, and had to be taught

This is the third time in this series a test double could not tell the right
implementation from a wrong one. Root `CLAUDE.md` names the other two.

| Spec | What its `cartItem` double did with `cart: { locationId }` |
|---|---|
| `cart.resolver.test.ts` | Nothing — `count` was a plain `vi.fn()` told to resolve to a number, so the `where` clause was never read at all. |
| `itemStock.resolver.test.ts` | Nothing — its hand-written matcher walked `where` key by key and had no `cart` key, so an unknown key was silently ignored. |

Left alone, **every test in this section would have passed against a resolver with no
location scope at all.**

The fix is `apps/server/src/test/cartItemFake.ts`: one shared matcher, used by both specs,
that resolves `cart` the way Postgres does — follow `CartItem.cartId` to its `Cart` row and
read that row's `locationId` **column**, never the id text. A `CartItem` whose cart is
missing from the store throws a named fixture error rather than quietly not matching,
because `CartItem.cartId` is a NOT NULL foreign key and real Postgres cannot reach that
state.

Each spec also gained a test that only a column-reading resolver can pass: a fixture whose
cart **id text and `locationId` column disagree**. Production cannot reach that state —
`cartIdFor` builds the id out of the column — and that is what makes it the one fixture
that tells the two rules apart.

### `cartItemCountByItem` was not location-scoped before this PR

The plan asked only whether the count **hooks** had cloud branches. The gap was larger: the
server query counted **every** location, so the cloud dialog would have shown a number
bigger than what the removal deletes. The query took an optional `locationId`:

- no `locationId` — unchanged, the whole-account count the item list uses
- with one — the caller needs the `viewer` role on it, and only that location's carts count

### The Stock tab's confirmation line works in cloud now

`Inventory logs: N · Cart entries: N` rendered in local mode only, because cloud had no
per-item cascade to count — naming rows a cloud removal would not touch is worse than
naming none. The cascade exists, so the `mode === 'local'` guard is gone and both count
hooks gained a cloud branch.

The cloud remove mutation also evicts the cached fields the cascade empties: the two
counts, `itemLogs`, `inventoryLogs`, `lastPurchaseDates`, `cartItems` and `allCartItems`.
The local branch already did the same through `queryClient.invalidateQueries`.

### Mutation checks

Every one went RED and was then restored.

| Mutation | What failed |
|---|---|
| Rollback made a no-op | `expected [ ... ] to have a length of 2 but got 3` |
| Deep copy made shallow | `expected 100 to be 2` |
| `applyUnitSwitch`'s `$transaction` dropped | `expected "package" to be "measurement"` |
| Only the first location's role checked | `expected undefined to be 'FORBIDDEN'` |
| Only the default location converted | `expected 3000 to be 6` on the garage row |
| The `isLocal` gate on `buildStockConversions` restored | red |
| The hook's cloud branch removed | red |
| The cascade deletes only the stock row | 4 tests |
| `locationId` dropped from the log filter | 1 test |
| The cascade's `$transaction` dropped | 1 test |
| **`cart: { locationId }` dropped from the cascade delete** | 2 tests — `expected [ 'ci-a-other', 'ci-theirs' ] to deeply equal [ 'ci-a-other', 'ci-a2', 'ci-theirs' ]` |
| **`cart: { locationId }` dropped from the count** | 2 tests — `expected 3 to be 2` |
| **The shared matcher made to ignore `where.cart`** | 4 tests, two per spec — proof the fake does the work |
| The `mode === 'local'` guard restored on the confirmation line | red, cloud test only |
| The cloud count falling back to the Dexie count | red |

Every fixture holds **two** of the caller's locations plus a stranger's, with different
values, so "here" and "everywhere" are different answers. A single-location fixture cannot
fail any of these.

### `Cart.locationId` has no index — the plan said it did

The PR 3c plan says `Cart.locationId` is "a real indexed column". **It is not indexed.**
The PR 3a migration says so on purpose: *"No standalone index on `Cart`.`locationId`"*,
because PR 3b's re-key was about to put the location into the primary key.

The relation filter is still the right choice — it is about reading the source column
instead of a derived string — but not for the index reason the plan gave. The two queries
are driven by `CartItem_itemId_idx` and reach `Cart` by its primary key, and a user holds
few carts, so no index was added. This is now recorded on the `Cart` model in
`schema.prisma`.

### Verification, run 2026-09-20

Full gate green, each command run from the path the root `CLAUDE.md` names:

| Command | Result |
|---|---|
| `(cd apps/web && pnpm lint)` | pass — 4 pre-existing warnings in `shopping/index.tsx`, none new |
| `pnpm build` (root: codegen + web + server `tsc`) | pass, exit 0. `git status` showed no codegen drift |
| `grep 'TS6385' /tmp/p1i-build-pr3c-t4.log` | no match |
| `(cd apps/web && pnpm build-storybook)` | pass |
| `(cd apps/web && pnpm check)` | pass — the same 4 warnings |
| `pnpm test` | pass — **259 server + 2116 web**, 0 failures |

`pnpm verify:migration` was **not** run, and no migration was written. PR 3c touches only
tables PR 3a and PR 1 already created.

Full E2E, all three projects, no `--grep`: **322 tests — 305 passed, 9 skipped, 8 failed**
in 12.7 minutes.

The 8 are the four `item-list-state-restore.spec.ts` cases that already fail on `main`,
once in `local` and once in `cloud` (issue #280, left alone on purpose):

| Project | Failing case |
|---|---|
| `local` and `cloud` | `user can navigate to item detail and back with search state preserved` |
| `local` and `cloud` | `user can navigate to item detail and back with sort state preserved` |
| `local` and `cloud` | `user can navigate to item detail and back with scroll position restored` |
| `local` and `cloud` | `user can navigate to item detail and back with scroll position restored when filter panel is open` |

Nothing else failed. The skipped count is 9, unchanged from PR 3b.

**The total rose from 251 to 322 because of the PWA work, not this branch.** That work
merged into this branch's base and added a third Playwright project:

| Project | Tests |
|---|---|
| `local` | 175 (was 173) |
| `cloud` | 78 (unchanged) |
| `pwa` | 69 (new) |

`e2e/constants.ts` also gained `PWA_WEB_PORT = 5176`, so **four** ports must be free before
an E2E run, not three: 5174, 5175, 5176 and 4001.

---

## Follow-on work

### Cloud E2E coverage for locations ⚠️ — issue #284 (2026-09-14)

This sits between PR 2 and PR 3 on purpose. PR 3 carries the riskiest migration of the
series, and it should not start with locations untested in cloud.

What landed:

- `/e2e/cleanup` now deletes `Location` and `ItemStock`. Before this it deleted neither,
  so cloud runs left their locations in the test database forever and
  `ensureDefaultLocation` never recreated a clean default.
- `purge-coverage.test.ts` gained `index.ts` as a third purge path.
- Three specs joined the cloud project.

| Spec | Test cases | Run in cloud |
|---|---|---|
| `settings/locations.spec.ts` | 5 | 5 |
| `location-switcher.spec.ts` | 14 | 14 |
| `location-not-stocked-here.spec.ts` | 5 | 3 |
| **Total** | **24** | **22** |

The two cases that do not run in cloud are the not-stocked-here cases. They are blocked on
PR 3b removing the `!isCloud` partition bypasses in `shopping/index.tsx` and `cooking.tsx`.

New helpers: `e2e/helpers/cloudTeardown.ts`, `fixture.ts`, `localSeed.ts`, `cloudSeed.ts`.
One fixture is described as plain data, then translated per mode.

The cloud `testMatch` is now **12 files, up from 9**.

**The cleanup fix also broke `cooking.spec.ts` in cloud**, which the full run caught. That
spec seeds stock over GraphQL before loading the app. With locations no longer leaking
between runs, there was no default location yet, so `mirrorStockToDefaultLocation` dropped
the write in silence. Fixed with a new `ensureCloudDefaultLocation` helper. The rule —
**any cloud seed that writes stock must create the default location first** — is now
recorded in `e2e/CLAUDE.md`.

**Issue #284 stays open.** Still to do: `item-stock-pager`, `item-stock-input`, the four
group-view specs, and the teardown refactor of the nine older cloud specs.

Docs: [brainstorming](2026-09-14-brainstorming-cloud-e2e-location-coverage.md) ·
[design](2026-09-14-cloud-e2e-location-coverage-design.md) ·
[plan](2026-09-14-cloud-e2e-location-coverage-plan.md)

### The silent stock drop ✅ — issue #287 (2026-09-16)

`defaultLocationId` returned `null` for a user with no `Location`, and five resolvers then
dropped the write.

`ensureDefaultLocation` moved to `apps/server/src/lib/defaultLocation.ts` and now
**creates** the default location instead of returning `null`. So `updateItem`,
`bulkCreateItems`, `bulkUpsertItems`, `checkout` and `consumeRecipes` all keep their stock.
The common path still costs one query.

`ensureCloudDefaultLocation` stays in the E2E seed, because `seedCloudFixture` needs the
location's id and name.

Doc: [bug report](../../global/bugs/2026-09-16-bug-default-location-silent-drop.md)

---

## What each remaining PR owes

Known deferrals are listed in the
[PR 2 plan](2026-08-30-cloud-locations-plan-pr2.md#deferred-work--recorded-here-because-this-is-where-the-next-reader-will-look).
The main ones:

### PR 3a owes — nothing

PR 3a is complete and merged as [#291](https://github.com/ETBlue/player1inventory/pull/291).

### PR 3b owes — nothing in code. One thing before the deploy.

Every item PR 3b was listed as owing is done: the `'no-vendor'` split, the composite
`Cart.id` re-key, the cart resolvers rewritten with it, vendor carts created at the right
time, real `locationId` for `checkout` and `consumeRecipes`, five `!isCloud` bypasses
removed, the new migration added to `MIGRATIONS` in
`apps/server/scripts/verify-migration.ts` with assertions, and the rehearsal against a
production copy. `grep -rn "PR 3b:" apps/server/src` returns **0**.

| Still owed | Where |
|---|---|
| **The manual smoke test**, before the deploy. No automated test has run the new server code against data this migration produced. It must use **two** locations. | Step 6 of the [deploy runbook](../../global/backend/2026-09-18-deploy-runbook-cart-rekey.md) |
| **The deploy itself**, following the runbook. The migration and the new server code must go out together. Take a Neon branch of production first — a re-key has no `migrate down`. | The [deploy runbook](../../global/backend/2026-09-18-deploy-runbook-cart-rekey.md) |

Carried forward to a later PR, not blocking:

| Item | Why |
|---|---|
| `useDeleteLocation`'s cloud branch refetches only `GetLocations`. | `AllCarts`, `AllCartItems` and `ItemLogs` observers can hold rows the database has already cascaded away. A reload clears it. See the PR 3b section above. |
| `verify-migration.ts`'s safety guard does not check `TEST_DATABASE_URL` against `PROD_COPY_DATABASE_URL`. | It checks only the dev vars. Verified by hand for the 2026-09-18 run; a script should do it. |

### PR 3c owes — nothing in code. One smoke test before the deploy.

Both features are built: `applyUnitSwitch` in the schema, the resolver and the client; and
`removeItemFromLocation`'s three-delete cascade with its counts shown in both modes. PR 3c
writes **no migration**, so it adds nothing to the deploy runbook's migration steps.

| Still owed | Where |
|---|---|
| **A manual cloud smoke test of a removal.** No cloud E2E spec names `removeItemFromLocation`, so its `$transaction` has never run against real Postgres — every server test runs on hand-written fakes. Use **two** locations and check that the other location's logs and cart entries survive. | Fold into step 6 of the [deploy runbook](../../global/backend/2026-09-18-deploy-runbook-cart-rekey.md), which already owes a two-location smoke test for PR 3b. |
| **A manual cloud smoke test of a unit switch.** Same reason: no cloud E2E spec names `applyUnitSwitch`. Use an item stocked in **two** locations and a recipe, and check that both locations' quantities and the recipe's `defaultAmount` moved. | Same step. |

Carried forward, not blocking:

| Item | Why |
|---|---|
| `consumeRecipes` is **not** wrapped in a `prisma.$transaction`. | It writes row by row, so a cooking session that fails partway can leave some items consumed and some not. Local mode has `consumeRecipesBatch`, one Dexie transaction. No PR owns this today. |
| No cloud E2E spec covers `applyUnitSwitch` or `removeItemFromLocation`. | Belongs with issue #284's remaining work. The two manual smoke tests above are the stop-gap. |

PR 3c was blocked by neither 3a nor 3b.

### PR 4 owes

PR 4's main scope is **import, export, post-login migration and purge**, design §6. Those
four paths still know nothing about `Location`. Plus these two:

| Item | Why it matters |
|---|---|
| Decide whether `usePostLoginMigration`'s copy id should be validated. | The hook copies by the **unvalidated** `readStoredLocationId('local')`; the dialog warns by the **validated** `resolveLocalActiveLocationId()`. They diverge when the slot names a **deleted** location: every item uploads with zeroed stock and every cart is dropped, silently, and the one-shot ref blocks a retry. |
| Remove `locationResolved`'s `activeLocationId === DEFAULT_LOCATION_ID` branch. | Design §6 already schedules it. Since Task 6b the copy target is the local slot, so this gate no longer guards it. |

### PR 5 owes

Drop the five `Item` columns, remove them from the GraphQL type and inputs, and tear down
**all five** dual-write sites:

| # | Site | Direction |
|---|---|---|
| 1 | `cart.resolver.ts` `checkout` | `Item` → also `ItemStock` |
| 2 | `recipe.resolver.ts` `consumeRecipes` | `Item` → also `ItemStock` |
| 3 | `item.resolver.ts` `updateItem` | `Item` → also `ItemStock` |
| 4 | `itemStock.resolver.ts` `upsertItemStock` → `mirrorItemStockToItem` | **`ItemStock` → `Item`** (the reverse mirror) |
| 5 | `import.resolver.ts` `bulkCreateItems` and `bulkUpsertItems` | `Item` → also `ItemStock` |

`grep -rn "REMOVED IN PR 5" apps/server/src` is the checklist. `addItemToLocation` and
`removeItemFromLocation` have **no** mirror on purpose: they change membership, which
`Item`'s columns cannot express.

---

## Corrections to the design, measured false

Two claims in the design doc were checked during PR 2, found false, and corrected in place.

### 1. The Apollo `keyArgs` "cache-keying hazard" does not exist

The design said `itemStocks` needed `keyArgs: ['locationId']`, or else switching locations
would overwrite the cached list. **That is wrong.** Apollo Client 4 already includes every
argument of a root field in its store key by default, so `keyArgs: ['locationId']` on a
field whose only argument is `locationId` is a no-op. Measured against the version in this
repo:

| Type policy | `ROOT_QUERY` keys | Read back A |
|---|---|---|
| none (default) | `itemStocks({"locationId":"A"})`, `itemStocks({"locationId":"B"})` | `a1` ✓ |
| `keyArgs: ['locationId']` | `itemStocks:{"locationId":"A"}`, `itemStocks:{"locationId":"B"}` | `a1` ✓ |
| `keyArgs: false` | `itemStocks` (one entry) | **`b1`** ✗ |

Only `keyArgs: false` produces the collapse, and nothing writes that.

**What was real** is the other half of PR 2's Task 4: `apollo/client.ts` built
`new InMemoryCache()` **twice**, so cloud E2E would have exercised a different cache than
production. Both now share one `createCache()` factory.

### 2. "A stale bundle keeps working" is only true in one case

Design §8 states the invariant with no conditions. The precise version:

| Case | Preserved for a stale bundle? |
|---|---|
| A stock **value** edit at the **default** location | **Yes** — `mirrorItemStockToItem` writes `Item`'s five columns |
| A stock **value** edit at a **non-default** location | **No, by design.** `Item` has one set of columns and no location concept. Mirroring one location would let a Garage edit corrupt what the stale bundle reports for the Kitchen |
| **Membership** changes — `addItemToLocation` / `removeItemFromLocation` | **No, on purpose.** `Item`'s columns cannot express which locations an item is stocked in. Any mirror would invent a value |
| **Atomicity** of the mirror | **No.** The mirror is a second Prisma statement, not part of a `$transaction`. `ItemStock` can be written and the `Item` mirror can fail |

The invariant that **is** held: a stale bundle keeps working for a single-location user
editing their default location's stock. Per the production rehearsal, that is every
current production account.

---

## Production rehearsal

### Rehearsal 1 — run 2026-08-30, before PR 1. **PASSED.**

Method: a schema + data branch off production, then `migrate deploy`, then 10 read-only
assertions. The branch was deleted afterwards.

| Measurement | Result |
|---|---|
| Distinct users | **1** |
| `Item` rows → `ItemStock` rows | 167 → **167** |
| Default locations created | 1 |
| Accounts sharing the `'no-vendor'` cart | **0** |

All ten assertions passed: one location per user, exactly one default, no user missed by
the union, one stock per item, no item left without one, no duplicate
`(itemId, locationId)`, no orphan stock, no cross-user stock, all five `Item` state columns
intact, and every copied value verbatim.

**What this means for PR 3b:** the split will touch **zero production rows**, and the
cross-user `'no-vendor'` leak has never affected anybody. It still gets fixed — the second
account to sign up hits it immediately — but it carries no data risk and no urgency.

**Limitation:** with one user, several assertions cannot fail. "No cross-user stock" and
"no missed user" are trivially satisfied. This rehearsal proves the migration works at
real scale and data shape. The **synthetic three-user fixture** is what tests the scoping.

### Rehearsal 2 — measurement 2026-09-16, PR 3a migration 2026-09-17. **Both PASSED.**

Rehearsal 2 splits into two jobs. Only the first could be done before PR 3's migration
existed. Job 2 then split again with the PRs: PR 3a rehearses its additive migration
(done, below), PR 3b rehearses the re-key separately (still owed).

**Job 1 — re-measure production. DONE 2026-09-16.** Read-only SELECTs against a Neon branch
copied from production, pointed at `PROD_COPY_DATABASE_URL`. No writes, no migration run.

| Metric | Rehearsal 1 (2026-08-30) | Rehearsal 2 (2026-09-16) |
|---|---|---|
| Distinct users across the nine tables | 1 | 1 |
| Items | 167 | 173 |
| Carts | 37 | 37 |
| Cart items | — | 19 |
| Inventory logs | — | 1,364 |
| **Accounts with a `CartItem` on `'no-vendor'`** | **0** | **0** |
| Locations / of which default | 1 | 1 / 1 |
| `ItemStock` rows | 167 | 173 |
| Items with no stock row | — | 0 |
| Cross-user stock rows | — | 0 |

**The PR 3b number holds: zero accounts share the `'no-vendor'` cart.** The split touches one
`Cart` row and no `CartItem`. PR 1's migration is live in production and its backfill is
intact — 173 items, 173 stock rows, none missed, one default location.

**Production's migration history contains a recovered failure.** `_prisma_migrations` holds
two rows named `20260609100000_permanent_vendor_carts`: one `ROLLED BACK` (error 42703,
`column "vendorId" of relation "Cart" does not exist`) and one applied. That is the normal
`migrate resolve --rolled-back` recovery pattern and it does **not** block `migrate deploy`,
which only stops on a row with both `finished_at` and `rolled_back_at` null. There is no such
row. Whoever deploys PR 3a or PR 3b should expect the duplicate name and not treat it as a
blocker.

**Job 2a — rehearse PR 3a's additive migration. DONE 2026-09-17. PASSED.**

`20260916000000_add_location_to_log_and_cart` was applied to a fresh Neon branch copied
from production. Only that one migration ran, and nothing else was written. The branch was
deleted afterwards.

**The env override was proved before any write.** `prisma migrate status` was run twice,
once with `DATABASE_URL` / `DIRECT_URL` pointed at the `PROD_COPY_` vars and once without.
The two reported **different hosts**, so the redirect was real. Do this every time: a
silent fall back to the dev database would apply the migration to dev and still print
success, which makes the whole rehearsal meaningless.

**`Cart.id` is byte-identical.** Proved by hashing the full sorted id sets before and after,
not by asserting row by row:

| Set | Rows | Before | After |
|---|---|---|---|
| `Cart.id` | 37 | `2f459450498737da` | `2f459450498737da` |
| `CartItem.id` | 19 | `b17cd2b1fcbf5589` | `b17cd2b1fcbf5589` |
| `CartItem.cartId` | 19 | `eee4bd7fa2425c6e` | `eee4bd7fa2425c6e` |
| `InventoryLog.id` | 1364 | `6890d2b0760e75db` | `6890d2b0760e75db` |

The additive/destructive split held. No re-key leaked into PR 3a.

| Assertion | Result |
|---|---|
| Logs with no `locationId` | 0 |
| Carts with no `locationId` | 0 |
| Logs not pointing at their owner's **default** location | 0 |
| Carts not pointing at their owner's default location | 0 |
| Row counts changed | none — 173 items, 1364 logs, 37 carts, 19 cart items, 1 location, 173 stocks |
| `NOT NULL` on both columns | yes |
| Both FKs, `ON DELETE CASCADE` | yes |
| `InventoryLog_itemId_locationId_occurredAt_idx` created | yes |

**Two assertions cannot fail on this data.** "Logs whose location belongs to another user"
and the cart equivalent are trivially satisfied, because production has exactly one user —
the same limitation Rehearsal 1 recorded. This run proves the migration works at real scale
and on the real data shape. The multi-user synthetic fixture is what tests cross-user
scoping. Do not read this pass as covering both.

**One reported FAIL was the assertion script, not the migration.** It matched foreign keys
on `%locationId%`, which also catches `ItemStock_locationId_fkey` from PR 1, so it counted
3 and expected 2. Scoped to the two tables this migration touches, the count is exactly 2.
Recorded because a green-looking rehearsal with a broken assertion is worse than a red one.

**Job 2b — rehearse PR 3b's re-key. DONE 2026-09-18. PASSED.** Run against a **fresh**
Neon branch, not the one PR 3a used, because a rehearsal writes to its target. The full
result — the three hashes, the five assertions, and what the run does **not** prove — is in
the `PR 3b ✅ — the cart re-key` section above.

**The green result did not prove the split works, exactly as predicted here.** Zero
production accounts held a `CartItem` on the shared `'no-vendor'` row, so phase A ran over
an empty set and did no work at all. The 13-user synthetic fixture in `verify:migration` is
the only thing that tests the split.

**Never point `pnpm verify:migration` at a production copy.** `scripts/verify-migration.ts`
opens with `migrate reset`, which drops and recreates the public schema. Rehearsal 1 avoided
it for this reason. See `apps/server/.env.example` for the rules on `PROD_COPY_DATABASE_URL`.
