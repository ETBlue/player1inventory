# Design — households H3b, shared carts

Branch `feature/households-h3b`, from `develop` at `0dfd536f`.
Brainstorming: [2026-11-14-brainstorming-households-h3b.md](2026-11-14-brainstorming-households-h3b.md).
Parent design: [2026-10-04-households-design.md](2026-10-04-households-design.md), section
*Checkout with a shared cart* and decisions H7 and H8. Where this doc and the parent differ,
this doc is newer.

## Summary

### Where this sits

| Order | Step | State |
|---|---|---|
| 1 | H3a — households, roles, migration, scoping (#375) | merged into `develop`, not deployed |
| 2 | `chore/build-shared-types` — the server can import `@p1i/types` at runtime (#376) | merged into `develop`, not deployed |
| 3 | **H3b — shared carts** | this doc |
| 4 | H3c — live updates for everything shared | new phase, not designed yet |
| 5 | H4 import and export, then H5 invites | not started |

H3b must merge before H5. Until H5 every household has one person, so today's `userId`
filters still give the right answer. From H5 on they would not.

The goal: one location's carts are **shared** by everyone with a role on that location. Every
read and write is scoped by the cart's location, never by who added the row. Shared carts also
bring races that one person never hit; H3b closes those too.

### What the user gets (once merged AND deployed)

Before H5, almost nothing they can see, because nobody shares a household yet. Things one
person can notice:

- Adding the same item twice at once (two devices) gives one row with the sum, not two rows.
- A checkout made from an out-of-date screen is refused with "This cart changed. Please check
  and try again." and the cart reloads. Nothing is bought twice.
- Cooking from two devices at once subtracts both uses. Today the second write replaces the
  first.
- Cooking is all-or-nothing. A failure no longer leaves half a recipe cooked.
- Local mode keeps one row per item per cart too.

After H5: members see and change one shared cart per vendor per location.

### What the developer gets

- **Less to remember:** no `CartItem.userId` filter is left to re-check (12 today). `CartItem.userId`
  only means "added by".
- **Fewer ways to get it wrong:**
  - `@@unique([cartId, itemId])` in Postgres and `&[cartId+itemId]` in Dexie. A duplicate cart
    row is a database error, not a quiet second row.
  - `Cart.userId` is dropped, so `tsc` reports every place that still reads it.
  - The log total and the cooking result are computed on the server from the stored row. The
    browser can no longer send a stale total.
- **Less code to keep in step:** `getPackedTotal`, `consumeItem`, `roundToStep` and
  `decimalPlaces` move to `@p1i/types`. The checkout total rule has one copy.
- **Costs:**
  - Two GraphQL inputs change shape (`CheckoutItemInput`, `ConsumeRecipesItemInput`). An old
    cached web bundle fails checkout and cooking until it reloads (see *Deploy*).
  - Two new Dexie versions (19 and 20).
  - The cart unit-test fakes must become stateful and enforce the new unique rule.

## Decisions

| # | Decision | Owner's answer |
|---|---|---|
| D1 | Checkout sends the cart-item ids and the amounts the screen showed. Any difference refuses the whole checkout | Q1: A |
| D2 | Two adds of one item sum into one row (`upsert` with `increment`) | Q3: A |
| D3 | `viewer` may see a cart; `participant` may add, change, remove, check out and clear | Q4: B |
| D4 | Cooking sends amounts used; the server subtracts them; all-or-nothing | Q5: A, yes |
| D5 | Import merges duplicate cart rows; `add` adds to a cloud row, `replace` replaces it; an update never moves a row | Q6: A |
| D6 | Local mode gets the same rule: a transaction, a merge version, a unique-index version | Q7: all three |
| D7 | Import ownership of `cart` and `cartItem` goes by location role (`participant` or higher) | default, no objection |
| D8 | `deleteVendor` deletes that vendor's carts at every location of the household | default, no objection |
| D9 | One Prisma migration: merge, unique rule, drop `Cart.userId` | Q8: A |
| D10 | Live updates are phase H3c, after H3b and before H5, for everything shared | Q2a: A, Q2b: C |

## What changes

### 1. Database (one migration, D9)

In this order, in one migration file:

1. Merge duplicate `CartItem` rows with the same `(cartId, itemId)`. The kept row is the one
   with the **lowest `id`**, and its `quantity` becomes the sum. `CartItem` has no `createdAt`,
   so the lowest id is the only stable choice. Its `userId` stays, so "added by" is one of the
   people who added it.
2. Add `@@unique([cartId, itemId])`. The existing `@@index([cartId])` becomes redundant;
   decide in the plan whether to drop it.
3. Drop `Cart.userId` and `@@index([userId])` on `Cart`.

`apps/server/scripts/verify-migration.ts` gets a case for each step, including a duplicate
pair with different amounts and a cart that keeps its rows. It runs only against `TEST_*`.

### 2. Server: cart resolvers (D3)

Scope comes from `requireCartLocation(ctx, cartId, role)` (`cart.resolver.ts:32`). No
`where` names `userId` for scope.

| Resolver | Today | After H3b |
|---|---|---|
| `vendorCart` create | `data: { id, userId, locationId }` | no `userId` |
| `allCarts` | `{ userId }` | carts at locations where the caller has a role |
| `cartItems` | `{ cartId, userId }` | `{ cartId }`, `viewer` |
| `cartItemCountByItem` | `{ itemId, userId }`, with or without `cart: { locationId }` | rows in carts at locations where the caller has a role; with `locationId`, that one location |
| `allCartItems` | `{ userId }` | rows in carts at locations where the caller has a role |
| `addToCart` | find `{ cartId, itemId, userId }`, then create or update | `upsert` on `cartId_itemId`, `quantity: { increment }`; create writes `userId` (added by), update never does |
| `updateCartItem`, `removeFromCart` | find `{ id, userId }` | find `{ id }`, then `participant` on its cart's location |
| `checkout` | see section 3 | |
| `abandonCart` | `Cart` by `{ id, userId }`, delete `{ cartId, userId }` | `Cart` by `{ id }`, delete `{ cartId }`, `participant` |
| `bootstrapCarts` | creates with `userId` | no `userId` |

`removeItemFromLocation` (`itemStock.resolver.ts:229`) deletes cart rows by
`{ itemId, cart: { locationId } }`, no `userId`. It already needs `organizer`.

`cartItemCountByItem` must not count a location the caller has no role on. H3a's read scoping
gives the list of such locations; the plan names the helper.

### 3. Server: checkout (D1)

New input:

```graphql
input CheckoutItemInput {
  cartItemId: ID!
  quantity: Float!   # the amount the screen showed for this row
}
```

The client no longer sends a stock total. In one interactive transaction:

1. `requireCartLocation(ctx, cartId, 'participant')`.
2. Read the cart's rows that are being bought (`quantity > 0`).
3. Compare with the input. Refuse the whole checkout if any of these is true:
   - an input id is not in this cart, or is pinned (amount 0);
   - an input amount differs from the stored amount;
   - a stored row being bought is missing from the input.
   The refusal is a `GraphQLError` with code `CART_CHANGED`. Nothing is written.
4. For each row: read the `Item` and the `ItemStock` at the cart's location in the same
   transaction; add the amount with `writeStock(tx, …)`; compute the log total with the shared
   rule (section 6); write the log.
5. Delete the bought rows. Pinned rows stay, as today.

Two people pressing checkout at once: the second transaction finds the rows gone (or the
amounts different) and gets `CART_CHANGED`. Each row is bought once.

The web, on `CART_CHANGED`: refetch the cart and show "This cart changed. Please check and try
again." (new i18n key, both languages).

This section is cloud only. Local mode has one user and keeps its checkout as it is.

The current rule "a row added after you opened the cart fails the checkout with
`BAD_USER_INPUT`" becomes `CART_CHANGED` too. This is a change from the parent design, which
said rows added later stay in the cart and the checkout goes on. The owner chose the stricter
rule (Q1): with no live updates, a changed cart means the screen is out of date.

### 4. Server: cooking (D4)

`ConsumeRecipesItemInput` drops `packedQuantity`, `unpackedQuantity` and `quantity` (the final
numbers and the log total). It keeps `itemId`, `delta`, `note`, `logKey` and `logParams`.

`delta` keeps its meaning, which is the same in both modes: it is `InventoryLog.delta`, the
signed change written to the log. For cooking it is `-totalAmount`, the amount used, in the unit
`consumeItem` takes (measurement units when the item tracks in measurement, otherwise packages).
Checked in `apps/web/src/routes/cooking.tsx`, `handleConfirmDone`. The server uses `-delta` as
the amount to pass to `consumeItem`. As today, `consumeItem` stops at zero, so when stock runs
out the stock falls by less than the log's `delta`. H3b does not change that.

In one interactive transaction, for every item: read `Item` and the `ItemStock` at the input
location, apply the shared `consumeItem`, write the stock with `writeStock(tx, …)`, write the
log with the server-computed total. Any failure rolls back every item and every log. The
cooking page shows one error.

### 5. Server: import and vendors (D5, D7, D8)

- `requireOwnRowOrUnclaimed` for `cart` and `cartItem` (`authz.ts`, about lines 299–306 and
  368): a row is `'own'` when the caller has `participant` or higher on the cart's location.
  A row at another location throws `FORBIDDEN`, as today. An unused id is `'unclaimed'`. The
  catalog models and `inventoryLog` do not change here (H4, #361).
- `bulkCreateCartItems` and `bulkUpsertCartItems`:
  - merge rows with the same `(cartId, itemId)` inside one payload by summing;
  - `add` mode: an existing cloud row gets the amount added;
  - `replace` mode: an existing cloud row gets the amount replaced;
  - an update writes only `quantity`. It never moves a row to another `cartId` or `itemId`.
- `resolveCartItemParents` and the other `Cart.userId` reads in `import.resolver.ts`
  (about lines 612, 1179 and 1594) scope the cart by location role.
- `deleteVendor` (`vendor.resolver.ts:99`) finds that vendor's carts by `parseCartId` at every
  location of the caller's household, and deletes them and their rows.
- `createVendor`'s cart upsert (`vendor.resolver.ts:50`) drops `userId`.

**Decided while building task B.7** (the plan left these open):

| Question | Answer | Why |
|---|---|---|
| Which id does a merged pair keep? | the lowest id of the pair that no row holds and no other pair took; none left → a new id | the migration and local version 19 keep the lowest id, so a backup made before the merge finds its row under the same id. A taken id would raise `P2002` on the primary key |
| `skip`: a pair with one id already in the cloud and another that is new | the whole pair is skipped | an old backup holds a merged pair under several ids. Skipping only the known id would add the others' amounts again on every re-import |
| `replace`: an existing id under another `(cartId, itemId)` | the stored row stays where it is; the pair the payload names gets the amount (set) | "an update never moves a row". Skipping would drop the amount the backup holds for that pair |
| a cart item whose CART is at a location where the caller is `viewer` | the row is SKIPPED, like a cart that is gone | it is a reference that does not resolve. A backup that names an existing ROW there is still refused, by `requireOwnRowOrUnclaimed('cartItem')`. Until B.7 a viewer got `FORBIDDEN` for the whole batch, and a caller with no role got a skip (B.3 stopgap) |
| how is each write done | one `upsert` on `cartId_itemId`, `increment` for `skip` and `clear`, a plain number for `replace` | no read-then-write, so a concurrent `addToCart` cannot cause `P2002` or a lost amount |

**Not yet true end to end.** The web's `replace` strategy (`partitionPayload` in
`apps/web/src/lib/importData.ts`) splits cart items by ID conflict: a row whose id the cloud
does not hold goes to `bulkCreateCartItems`, which ADDS. So on `replace`, a new id whose pair
already has a cloud row is added to that row, not set. The server's `bulkUpsertCartItems`
path that sets it is reached only by an id the cloud already holds. Owed to whichever task
next changes `partitionPayload` (B.8 touches that file).

### 6. Shared code (`packages/types`)

Moved from `apps/web/src/lib/` to `packages/types/src/quantity.ts` (task B.1, `7de5ba26`):

| Function | From |
|---|---|
| `getPackedTotal`, `getCurrentQuantity` | `quantityUtils.ts` |
| `consumeItem`, `roundToStep`, `decimalPlaces` | `quantityUtils.ts` |
| the checkout log total (`buildCheckoutLogQuantities`) | `checkoutQuantities.ts` |

`getCurrentQuantity` was not in the first list, but `consumeItem` calls it. The two web
modules re-export the moved functions, so web imports did not change. The tests stay in
`apps/web`, because `packages/types` has no test runner, and they run against the shared file
(proved by mutation in B.1). The server gets its own tests of the checkout and cooking paths
in B.5 and B.6.

### 7. Web (cloud)

- `useCheckout` sends `{ cartItemId, quantity }` per row. `CheckoutArgs`
  (`useShoppingCart.ts:271`) changes to match. `buildCheckoutLogQuantities` is no longer
  called by the shopping page.
- `CART_CHANGED`: refetch the cart, show the message.
- `useConsumeRecipes` sends amounts used.
- Hook comments that say "member" where the code needs `participant` are corrected.

### 8. Local mode (D6)

| Part | What |
|---|---|
| code | `addToCart` (`db/operations.ts:765`) runs in one Dexie `rw` transaction on `cartItems`. The local import merges duplicate `(cartId, itemId)` rows by summing, with the same `add` / `replace` rule |
| version 19 | upgrade only: merge existing duplicates, keep the lowest id, sum the amounts |
| version 20 | the `cartItems` schema gets the unique compound index `&[cartId+itemId]` |

Dexie creates new indexes **before** a version's upgrade runs, so the merge and the index must
be two versions. A fresh database never runs upgrades; `on('populate')` and the plain version
chain already give it the final schema with no rows to merge. See `apps/web/src/db/CLAUDE.md`.

Local checkout and cooking stay as they are: local mode has one user.

## Deploy

H3b deploys at a checkpoint release, after a fresh rehearsal on a Neon branch of production.
The rehearsal counts, before anything runs:

- duplicate `(cartId, itemId)` groups and their rows;
- carts whose id does not start with their own `locationId`.

**The two changed inputs are a breaking change.** A web bundle selects the old fields, and
GraphQL validation refuses the whole request when the shapes disagree. The server and the web
must deploy back to back. An old cached bundle (an installed PWA) fails checkout and cooking
with a validation error until it reloads. The owner accepted this on 2026-11-15: "it's ok
for old app versions to break since I'm the only one user for now". The plan records it in the
runbook and does not build a server that accepts both shapes.

**The `Cart.userId` drop has the same short window as H3a.** While the old server still runs
after the migration, a request that creates a cart writes into a dropped column and fails. The
runbook deploys with auto-deploy off, as it did for H3a.

## Tests

- Every cart test that checks scope has **two members** with rows in one cart, and a location
  the caller has no role on. With one member, "rows I added" and "rows in this cart" are the
  same, so the test cannot fail.
- The cart fakes become stateful stores, registered with `runInTransaction`
  (`src/test/stockFake.ts`), and they raise `P2002` on a second `(cartId, itemId)` row.
  `cart.resolver.test.ts` uses plain `vi.fn()` recorders today.
- Checkout: one test per `CART_CHANGED` cause, and one that shows a refusal writes nothing
  (stock, logs and rows unchanged).
- Cooking: a failure on the second item rolls back the first.
- Mutation checks for each guard, as root `CLAUDE.md` requires.
- E2E: `location-scoped-writes.spec.ts` changes with the inputs. A new cloud spec, with two
  users in one household, adds the same item from both and checks out from a stale view.
  `cart-id-cross-user-leak.spec.ts` is re-checked: two households must still not share rows.
- Dexie: an upgrade test that starts at version 18 with duplicates and ends at 20 with one
  row, and a fresh-database test.

## Risks and known gaps

- **Live updates are not in H3b.** A second person's screen stays out of date until a refetch.
  The `CART_CHANGED` refusal is the only guard. H3c adds live updates.
- **The `@@unique` can raise `P2002` in a path the plan misses.** Every `cartItem.create` and
  `createMany` must be found and covered. `tsc` will not find them.
- **Old bundles.** See *Deploy*.
- **Bare-id carts (#361).** A cart id that does not start with a location id is not fixed here.
  The rehearsal counts them.
- **`InventoryLog.userId`** still means "author", and H3b does not change it.
- **The parent design said 15 filters.** There are 12 at `0dfd536f`. The plan finds them by
  name, not by line number.
