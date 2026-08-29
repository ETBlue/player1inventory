# Cloud Locations — design

**Date:** 2026-08-30
**Status:** 🔲 Designed, not implemented
**Branch:** `feature/cloud-locations`
**Brainstorming:** [2026-08-30-brainstorming-cloud-locations.md](2026-08-30-brainstorming-cloud-locations.md)
**Closes the deferral in:** [2026-08-23-cloud-locations-deferred-requirements.md](2026-08-23-cloud-locations-deferred-requirements.md)
**Related:** [locations design](2026-06-11-locations-design.md) · [location RBAC](../../global/permissions/2026-08-29-design-location-rbac.md) · [global stock settings](../items/2026-08-22-design-global-stock-settings.md)

## Goal

Cloud mode gains full behavioral parity with local mode for locations: location management,
per-(item × location) stock, location-scoped pantry / shopping / cooking / logs, and the
location-aware three-section item search. Every `isCloud` bypass that exists only because
cloud lacks `ItemStock` is **deleted**, not ported.

## Non-goals

- **Location RBAC** — membership, roles, invites, join/leave. Guards are RBAC-*shaped* but
  single-user in body. See [RBAC design](../../global/permissions/2026-08-29-design-location-rbac.md).
- **Issue #273** — blocked on RBAC's open question about location-independent entities.
- **Re-scoping `Tag` / `Vendor` / `Recipe` / `Shelf`** — they keep flat `userId` filters.
- **System predefined items** — the motivation for the schema shape, but not built here.

## 1. Data model

### `Location` (new)

`id` · `name` · `order` · `isDefault` · `userId` · `createdAt` · `updatedAt`, with
`@@index([userId, order])`. Cascades to `ItemStock`, `InventoryLog` and `Cart`.

Exactly one `isDefault` row per user. It is **not** derivable from `order`:
`LocationList.tsx:58` disables dragging *of* the default row, but dnd-kit's `disabled` only
prevents that row being picked up — another row dragged above it still displaces it, so the
default's `order` is not stable.

### `ItemStock` (new)

`id` · `itemId` · `locationId` · the five state fields (`targetQuantity`, `refillThreshold`,
`packedQuantity`, `unpackedQuantity`, `dueDate`) · `createdAt` · `updatedAt`.

```prisma
@@unique([itemId, locationId])   // mirrors local's [itemId+locationId] compound index
@@index([locationId])
```

The `@@unique` is load-bearing, not decorative: it is what makes "stocked here" a single
unambiguous row, and it is the constraint a test fake must actually enforce rather than
silently dedupe (see §7).

**`ItemStock` deliberately carries no `userId`.** Every other cloud model has one, so its
absence is a decision: an `ItemStock` is scoped *through* its location
(`where: { location: { userId } }`), the shape RBAC needs, and the pattern `RecipeItem`
already uses (`{ recipe: { userId } }`). A `userId` column would put
`stock.userId === ctx.userId` within easy reach at every call site — precisely the guard the
RBAC design forbids.

### `Item` (changed)

Drops the five state fields; keeps identity plus the eight configuration fields
(`packageUnit`, `measurementUnit`, `amountPerPackage`, `targetUnit`, `consumeAmount`,
`estimatedDueDays`, `expirationThreshold`, `expirationMode`).

This is the shape a shared predefined-item catalog requires — nothing per-user or
per-location remains on the row, so a future system item becomes a question of *who owns it*,
not of restructuring it. That is the reason this design chose a client-side join (§2).

### `InventoryLog` (changed)

Gains `locationId` — column, FK, and index — matching local's v15 index.

### `Cart` (changed)

Gains `locationId` (indexed FK) **and** re-keys its primary key to local's composite
`${locationId}:${vendorId | 'no-vendor'}` via the shared `cartIdFor` / `parseCartId` in
`@p1i/types`, which `apps/server` already depends on.

Deliberately denormalized — the id is a **cross-mode wire contract** (backups round-trip by
id, `bulkUpsertShoppingCarts` upserts by id), the column is the **query and authorization
key**. Neither alone does both jobs.

### Local: Dexie v18

Adds `isDefault` to `locations`, backfilling `isDefault: id === 'local'`. Per
`src/db/CLAUDE.md`, fresh databases never run upgrade functions, so `ensureDefaultLocation`
must seed the flag from `on('populate')` as well. No store/index change is required —
`isDefault` is not indexed — so v18 restates v17's `.stores()` unchanged, as v7, v11 and v17 do.

## 2. GraphQL surface and the client-side join

### Types

`Location` (`id`, `name`, `order`, `isDefault`, timestamps) and `ItemStock` (`id`, `itemId`,
`locationId`, the five state fields, timestamps). `Item` and `UpdateItemInput` lose the five
state fields; writes to them route through `upsertItemStock`.

### Queries

| Query | Purpose |
|---|---|
| `locations` | the switcher and Settings › Locations; lazily creates the user's default if absent |
| `itemStocks(locationId: ID!)` | every stock in one location — the pantry's join source |
| `itemStocksForItem(itemId: ID!)` | every location's row for one item — the Stock-tab pager |

### Mutations

`createLocation` · `updateLocation` · `deleteLocation` · `reorderLocations` ·
`addItemToLocation(itemId, locationId, sourceLocationId)` · `removeItemFromLocation` ·
`upsertItemStock`.

Three more must each be **one server-side `prisma.$transaction`**, because Apollo has no
client-side transaction:

- **`applyUnitSwitch`** — the `Item`'s configuration, every location's converted quantities,
  and `RecipeItem.defaultAmount` on every affected recipe. Local does this in a single Dexie
  `rw`; partial failure otherwise leaves mixed units silently. Recorded as a designer
  requirement on 2026-08-23.
- **`consumeRecipes`** — cooking's "done": stock quantities, logs, and `Recipe.lastCookedAt`.
- **`applyShelfFilterPicks`** — already transactional; its writes are re-pointed at `ItemStock`.

### The join: one request, one function

A single operation asks for both root fields — no extra round trip:

```graphql
query PantryData($locationId: ID!) {
  items { ...ItemFields }
  itemStocks(locationId: $locationId) { ...StockFields }
}
```

The cloud branch then calls **`joinItemStock`** — the *same* function local mode calls, not a
parallel implementation. To make that literal, `joinItemStock` and `stripStockFields` move
from `db/operations.ts` (the Dexie module) to a mode-neutral `lib/itemStock.ts`, with
`operations.ts` re-exporting so no local call site changes. They are pure functions over
plain objects and live in the Dexie file only for historical reasons.

`useStockedItems()` derives from the same query result — the items having a row in
`itemStocks` — rather than issuing another request.

### Why the bypasses disappear

`joinItemStock` sets `stockId` from the row, so a cloud item with no stock in the active
location gets `stockId: undefined`, exactly like local. `isStockedHere` therefore works
unchanged in cloud, and `useShowStock` collapses to it with no mode branch. The
deferred-requirements doc's instruction to "revisit every `isCloud` bypass" is satisfied
**structurally** — they are removed, not translated.

### The one new hazard: Apollo cache keying

`ItemStock` normalizes by `id` automatically, but the `itemStocks` root field needs
`keyArgs: ['locationId']` in the type policy. Without it, switching locations overwrites the
cached list and the pantry renders the previous location's stock. This gets an explicit test (§7).

## 3. Retiring the `'local'` sentinel

`DEFAULT_LOCATION_ID` is the literal string `'local'` and does four jobs. Three break in cloud:

1. **Active-location fallback**, from a storage key (`'active-location-id'`) shared by both
   modes — sign into cloud and the stored id names no cloud location.
2. **A validity shortcut.** `useActiveLocation.tsx:62` returns early when the active id equals
   `DEFAULT_LOCATION_ID`, *before* checking it against the loaded list. In cloud that makes
   `'local'` permanently "valid": it is never corrected and every location-scoped query
   returns empty. This is the sharpest edge in the feature — a silently empty pantry, not a
   cosmetic fallback.
3. **The undeletable marker** (`operations.ts:1268`) — no cloud analog.
4. Plus `importData.ts:213`, where the v16 collapse rule prefers the row whose
   `locationId === 'local'`; cloud-sourced payloads never match and it silently falls through
   to "oldest row".

### Resolution

- **`isDefault` replaces the sentinel** in both modes (§1). `deleteLocation`'s guard becomes
  `if (location.isDefault) throw`.
- **The storage key becomes per-mode** — `active-location-id:local` / `active-location-id:cloud`.
  The old bare key is read once and migrated into the local slot so existing users are not reset.
- **The validity shortcut is deleted.** Once `locations` has loaded, an `activeLocationId`
  absent from it falls back to the `isDefault` location. No id is special-cased as always-valid.
- `DEFAULT_LOCATION_ID` survives only as the id the local seed happens to use. Nothing
  branches on it.

This is the one part of the design that changes **local-mode** behavior. Accepted
deliberately: the alternative is a permanent fork.

## 4. The Postgres migration

One migration, ordered so each step is valid on a database built only from committed history
(`apps/server/prisma/CLAUDE.md`).

1. **`CREATE TABLE "Location"`**, then seed one `isDefault` row per user —
   `SELECT DISTINCT "userId"` **unioned across all nine user-scoped tables**, not just `Item`.
   A user with only tags and no items still needs a location.
2. **`CREATE TABLE "ItemStock"`** with its `@@unique` and FKs.
3. **Copy** each `Item`'s five state fields into an `ItemStock` under its owner's default
   location. Every existing item becomes stocked there — what local's v15 did.
4. **Drop** the five columns from `Item`. *(Deferred to PR 5 — see §8.)*
5. **`InventoryLog.locationId`** — add nullable → backfill from the owner's default → `SET NOT NULL` → FK + index.
6. **Split the shared `'no-vendor'` cart.** Must precede step 7. See §5.
7. **`Cart.locationId`** — add / backfill / `SET NOT NULL` / FK, then re-key, `CartItem`
   first so it can still join on the old id:

   ```sql
   ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_cartId_fkey";
   UPDATE "CartItem" ci SET "cartId" = c."locationId" || ':' || c."id"
     FROM "Cart" c WHERE ci."cartId" = c."id";
   UPDATE "Cart" SET "id" = "locationId" || ':' || "id";
   ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey"
     FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE;
   ```

Plus a **lazy `ensureDefaultLocation` server-side**: the `locations` query creates a default
for any user who has none. That covers users with zero rows at migration time and every user
who signs up afterwards, mirroring local's populate + upgrade double-seeding.

## 5. The `'no-vendor'` cross-user leak (fixed here)

`cart.resolver.ts:9-16`:

```ts
const cartId = vendorId ?? 'no-vendor'
let cart = await prisma.cart.findUnique({ where: { id: cartId } })   // no user scoping
if (!cart) cart = await prisma.cart.create({ data: { id: cartId, userId } })
```

`Cart.id` is the primary key and `'no-vendor'` is a **literal shared by every user**.
Vendor-keyed carts are fine (vendor ids are per-user cuids), but the no-vendor cart is one
global row: the first user to open it owns it, and every other user's `vendorCart(null)`
returns that row.

**Impact.** Item data does not cross — `cartItems` filters by `userId`. But `lastPurchasedAt`
does, and `checkout` writes `where: { id: cartId }`, so one user's checkout stamps another
user's row. Most users never get a no-vendor cart of their own, so `allCarts` silently omits
it for them.

**Fix.** The composite id repairs it structurally: `${locationId}:no-vendor` is per-user
because `locationId` is. The migration must additionally **split the shared row**: for each
distinct `userId` among `CartItem`s pointing at `'no-vendor'`, create
`${theirDefaultLocationId}:no-vendor` and repoint their rows — *before* the §4.7 re-key, which
would otherwise drag every other user's cart items into whichever user happens to own the row.
This is the step most likely to be got wrong and gets a dedicated multi-user fixture test.

## 6. Data movement across modes

**No payload version bump.** `ExportPayload` already declares `itemStocks?` and `locations?`
(`exportData.ts:52-53`); local exports have populated them since v15. Cloud simply stops
ignoring them.

**Cloud export** — `fetchCloudPayload` gains two parallel queries (`locations`, and
`itemStocks` across all locations). Cloud backups become lossless.

**Cloud import** — `importCloudData` today destructures `locations`/`itemStocks` into `void`
(`importData.ts:414-418`) and calls `flattenToLocation`. It instead:

1. reads the destination account's locations,
2. builds a payload-id → cloud-id map with one rule: **preserve payload location ids
   verbatim, except the payload's default, which maps onto the destination's `isDefault`
   location**,
3. rewrites `itemStocks[].locationId`, `inventoryLogs[].locationId` and cart ids
   (`${locationId}:${vendorId}` → `${mappedId}:${vendorId}`) through it,
4. uploads locations, items, itemStocks, logs and carts.

That single-remap rule is what makes the composite cart id pay off: cloud → local → cloud
preserves every id, so carts still upsert by id. Only the default remaps, and only on a first
local → cloud copy.

Legacy payloads need no new code: `importData.ts:243-274` already normalizes pre-v15 inline
stock into `itemStocks` with `locationId: 'local'`, and `'local'` is simply that payload's
default, flowing through the same map.

**Import GraphQL surface** — `LocationInput` / `ItemStockInput` plus `bulkCreate` / `bulkUpsert`
pairs for each. `ItemInput` drops the five state fields: the client normalizer already
produces split shapes for every payload version, so the server input stays clean rather than
accepting both.

**Post-login migration** — `usePostLoginMigration` loses the `{ locationId: activeLocationId }`
option, the "cloud has no per-location ItemStock" comment, and the
`activeLocationId === DEFAULT_LOCATION_ID` branch of its `locationResolved` gate (§3). It
becomes an ordinary faithful import.

**Purge** — `purgeUserData` deletes `ItemStock` via `{ location: { userId } }` (no `userId`
column, §1), then `Location`. `purge-coverage.test.ts` must be confirmed to actually fail when
a model is omitted, not assumed to.

## 7. Verification

A green test proves the test passes, not that it would catch a regression
(root `CLAUDE.md` → *Proving a Test Works*).

- **Real Postgres, not the fake — blocking.** All ~100 server tests run against a hand-written
  stateful Prisma fake; nothing executes resolvers against SQL. The migration gets a scratch
  database built from *committed history*, seeded with a multi-user fixture that includes the
  shared `'no-vendor'` cart, then `migrate deploy` and assertions on every step of §4–§5.
- **Fakes must model the constraint.** `@@unique([itemId, locationId])` must actually throw in
  the fake, or `addItemToLocation`'s idempotency is unpinned; `$transaction` must actually roll
  back, or `applyUnitSwitch`'s atomicity test is vacuous. Both are failure modes this repo has
  already hit.
- **Every location test needs two locations.** With one, "count items stocked here" and "count
  all items" return the same number — the canonical vacuous fixture here. Each cloud location
  test gets a fixture stocked only at *another* location.
- **Mutation checks, reported.** For each new behavior: invert it in source, confirm RED,
  restore. The report names which mutations ran and that each went red.
- **Each deleted `isCloud` bypass gets a cloud test that would have failed while it existed.**
  Otherwise "the bypasses are gone" is an unverified claim.
- **The `keyArgs: ['locationId']` policy gets its own test** — switch location, assert the
  stock changes rather than serving the prior location's rows.
- **E2E** — `--grep "items|shopping|cooking|settings|shelves|vendors-group|recipes-group|a11y"`.
  Pantry group views are touched, so `shelves|vendors-group|recipes-group` are mandatory.

### Known blocker, surfaced not solved

Cloud E2E is gated on `TEST_CLOUD_MODE`, which per **issue #260** is *set nowhere*
(`e2e/CLAUDE.md`). Cloud E2E specs can be written but **will not execute** until that is
addressed. A green gate that skipped every cloud spec is not evidence.

## 8. Rollout — five staged PRs

Additive first, so a browser running a stale bundle keeps working until the final contract step.

| PR | Contents |
|---|---|
| **1** | Prisma `Location` + `ItemStock`, migration §4.1–4.3, `requireLocationRole`, Location + ItemStock resolvers, GraphQL types. `Item` keeps its columns and still serves them — nothing breaks. |
| **2** | Web cloud path switches to the new types: `joinItemStock` extracted to `lib/itemStock.ts`, `PantryData` query, Apollo `keyArgs` policy, every `isCloud` bypass deleted, Dexie v18 + `isDefault`, per-mode storage key, corrected reconcile effect. |
| **3** | Carts and logs: migration §4.5–4.7 (including the §5 `'no-vendor'` split), composite cart ids, location-scoped logs, `consumeRecipes` and `applyUnitSwitch` transactions. |
| **4** | Import / export / post-login migration / purge (§6). |
| **5** | **Contract:** drop the five `Item` columns and remove them from the GraphQL type and inputs. |

Mirrors how locations itself (5 PRs) and unified item search (4 PRs) landed in this repo.

## Open questions

None blocking. Deferred by decision: everything in *Non-goals*, and issue #260 (cloud E2E
gating), which is a pre-existing infrastructure gap rather than a question about this design.
