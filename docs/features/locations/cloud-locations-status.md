# Cloud Locations — Status

Status: 🔄 **In Progress** — PRs 0, 1 and 2 are ✅ merged. PRs 3, 4 and 5 are 🔲 pending.

Docs for this feature:
[brainstorming](2026-08-30-brainstorming-cloud-locations.md) ·
[design](2026-08-30-cloud-locations-design.md) ·
[PR 0 + PR 1 plan](2026-08-30-cloud-locations-plan-pr0-pr1.md) ·
[PR 2 plan](2026-08-30-cloud-locations-plan-pr2.md)

---

## Where this stands

The goal is full cloud parity for locations. Cloud gains `Location` and `ItemStock` in
both Prisma and GraphQL, plus location-scoped carts, logs, cooking and search. Every
`isCloud` stock bypass is **deleted**, not ported to the cloud path.

The work lands as **5 staged PRs**, with `Item`'s five state columns dropped last.

| PR | Status | What it covers |
|---|---|---|
| **0** | ✅ merged — [#281](https://github.com/ETBlue/player1inventory/pull/281) | Closes issue #260. Cloud had **zero** E2E coverage of vendor carts and checkout. Both tests now run and pass. |
| **1** | ✅ | `Location` + `ItemStock` Prisma models, the additive backfill migration, `requireLocationRole`, both GraphQL schemas, both resolver sets, purge coverage, and a dedicated E2E test database. |
| **2** | ✅ | The web client's cloud path moves onto `Location` / `ItemStock`. Writes split client-side. A five-site server dual-write keeps `Item`'s legacy columns fed until PR 5. |
| **3** | 🔲 Pending | Carts and logs: migration §4.5–4.7 (with the `'no-vendor'` split), composite cart ids, location-scoped logs, `consumeRecipes` and `applyUnitSwitch` transactions. |
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
accounts, and one user's checkout stamps another user's row. PR 3 fixes it.

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
PR 3 removing the `!isCloud` partition bypasses in `shopping/index.tsx` and `cooking.tsx`.

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

### PR 3 owes

| Item | Why it matters |
|---|---|
| **`applyUnitSwitch` was never added to the schema.** Design §2 lists it; PR 1 shipped `itemStock.graphql` without it. | A cloud unit switch still leaves **every location's quantities in the old unit**. No test fails on it, because `buildStockConversions` gates on `isLocal`, so the dialog never lists conversions the cloud branch could not write. |
| A cloud cascade for `removeItemFromLocation`. | The resolver deletes the `ItemStock` row only. That is why the Stock tab's confirmation line *"Inventory logs: N · Cart entries: N"* renders in local mode only. |
| Real `locationId` scoping for `checkout`, `consumeRecipes` and `mirrorItemStockToItem`. | All three target the caller's default location today. Under location RBAC that is wrong, not just coarse: a `member` has no `isDefault` row for someone else's location. |
| Removing the two surviving `!isCloud` partition bypasses — `shopping/index.tsx:166` and `cooking.tsx:180`. | They switch off the "not stocked here" partition. Two of the five `location-not-stocked-here` cases stay `test.skip` until they go. |
| **Production rehearsal 2** — see below. | It re-measures the `'no-vendor'` count against production as it is then. |

### PR 4 owes

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

**What this means for PR 3:** the split will touch **zero production rows**, and the
cross-user `'no-vendor'` leak has never affected anybody. It still gets fixed — the second
account to sign up hits it immediately — but it carries no data risk and no urgency.

**Limitation:** with one user, several assertions cannot fail. "No cross-user stock" and
"no missed user" are trivially satisfied. This rehearsal proves the migration works at
real scale and data shape. The **synthetic three-user fixture** is what tests the scoping.

### Rehearsal 2 — measurement run 2026-09-16. Migration rehearsal still owed.

Rehearsal 2 splits into two jobs. Only the first can be done before PR 3's migration exists.

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

**The PR 3 number holds: zero accounts share the `'no-vendor'` cart.** The split touches one
`Cart` row and no `CartItem`. PR 1's migration is live in production and its backfill is
intact — 173 items, 173 stock rows, none missed, one default location.

**Production's migration history contains a recovered failure.** `_prisma_migrations` holds
two rows named `20260609100000_permanent_vendor_carts`: one `ROLLED BACK` (error 42703,
`column "vendorId" of relation "Cart" does not exist`) and one applied. That is the normal
`migrate resolve --rolled-back` recovery pattern and it does **not** block `migrate deploy`,
which only stops on a row with both `finished_at` and `rolled_back_at` null. There is no such
row. Whoever runs PR 3's deploy should expect the duplicate name and not treat it as a
blocker.

**Job 2 — rehearse PR 3's migration. STILL OWED.** It cannot run until PR 3's
`migration.sql` exists. Run it against a fresh copy, not this one.

**Never point `pnpm verify:migration` at a production copy.** `scripts/verify-migration.ts`
opens with `migrate reset`, which drops and recreates the public schema. Rehearsal 1 avoided
it for this reason. See `apps/server/.env.example` for the rules on `PROD_COPY_DATABASE_URL`.
