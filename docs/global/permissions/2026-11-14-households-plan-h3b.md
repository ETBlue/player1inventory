# Plan — households H3b, shared carts

Design: [2026-11-14-households-h3b-design.md](2026-11-14-households-h3b-design.md) (decisions
D1–D10). Brainstorming: [2026-11-14-brainstorming-households-h3b.md](2026-11-14-brainstorming-households-h3b.md).
Phase plan: [2026-10-31-households-plan.md](2026-10-31-households-plan.md).

Branch `feature/households-h3b`, from `develop` at `0dfd536f`. The PR goes into `develop`.
Nothing deploys until a checkpoint release.

Task numbers are `B.n`, so they are not confused with H3a's `3.n` or the decision numbers.

## What the user gets (once merged AND deployed)

See the design's *What the user gets*. Before H5 almost nothing is visible: one row per item per
cart, a refused checkout from an out-of-date screen, and correct stock when cooking from two
devices.

## What the developer gets

See the design's *What the developer gets*. In short: no `CartItem.userId` scope filter left,
`Cart.userId` gone, unique rules in Postgres and Dexie, and one copy of the quantity rules in
`@p1i/types`. Costs: two breaking GraphQL inputs, two Dexie versions, stateful cart fakes.

## Rules every task brief must pass down

The eight rules in the phase plan (*Rules every task brief must pass down*) apply: plain
English, the report structure with "what did this plan get wrong", Node 22.17.1, this worktree
only, measure your own baseline, mutation-check every new test, check commits with `git show`,
and run the verification gate. H3a's rules 9, 10 and 12 apply too
([H3a plan](2026-11-04-households-plan-h3a.md), *Rules every task brief must pass down*). Copy
all of them into every brief.

Three more for H3b:

13. **`CartItem.userId` means "added by" and is never a scope.** No `where` on a cart read or
    write names `userId`. The only writer is the `create` half of an add or an import.
14. **A cart scope test needs two members with rows in one cart, and a location the caller has
    no role on.** Use `src/test/householdWorld.ts`. With one member, "rows I added" and "rows in
    this cart" are the same, so the test cannot fail.
15. **A server schema change and the web documents that use it go in one commit.** `pnpm
    codegen` writes neither generated file when one document fails (root `CLAUDE.md`, *Verification
    Gate*).

Rule 11 of H3a ("do not touch `apps/web/src/db/`") does **not** apply to task B.8, which is the
local-mode task. It applies to every other task.

## Decisions made while writing this plan

| # | Decision | Why |
|---|---|---|
| P1 | The moved functions' tests stay in `apps/web`. `apps/web/src/lib/quantityUtils.ts` and `checkoutQuantities.ts` re-export the moved functions from `@p1i/types` | `packages/types` has no test runner. The web tests then run against the shared code with no import changes. The server gets its own tests for the checkout and cooking paths |
| P2 | The migration drops `CartItem`'s `@@index([cartId])` | the new unique index starts with `cartId`, so Postgres can use it for every `cartId` lookup |
| P3 | Import modes, exactly. `bulkCreateCartItems` (skip and clear strategies): a new id whose `(cartId, itemId)` already has a row **adds** its amount to that row. `bulkUpsertCartItems` (replace strategy): an existing id updates only `quantity`; a new id whose `(cartId, itemId)` already has a row **sets** that row's amount. Inside one payload, rows with the same `(cartId, itemId)` are summed first | the design's D5, written as code paths |
| P4 | The `CART_CHANGED` refusal is a `GraphQLError` with `extensions.code: 'CART_CHANGED'` | the web reads the code, not the message |
| P5 | `verify:migration` is run by the **main session**, with the owner's consent after Prisma's warning, not by a subagent | a subagent cannot get consent |

## File map

| Area | Files |
|---|---|
| shared rules | `packages/types/src/index.ts` (or a new module it re-exports), `apps/web/src/lib/quantityUtils.ts`, `apps/web/src/lib/checkoutQuantities.ts` |
| schema | `apps/server/prisma/schema.prisma`, a new migration, `apps/server/scripts/verify-migration.ts` |
| resolvers | `apps/server/src/resolvers/cart.resolver.ts`, `itemStock.resolver.ts`, `recipe.resolver.ts`, `vendor.resolver.ts`, `import.resolver.ts`, `apps/server/src/lib/authz.ts` |
| GraphQL | `apps/server/src/schema/cart.graphql`, `recipe.graphql`, `apps/web/src/apollo/operations/shopping.graphql`, the cooking operation |
| fakes | `apps/server/src/test/cartItemFake.ts`, `shoppingFake.ts`, `stockFake.ts`, `householdWorld.ts` |
| web cloud | `apps/web/src/hooks/useShoppingCart.ts`, `useRecipes.ts`, `apps/web/src/routes/shopping/$vendorId.tsx`, `apps/web/src/routes/cooking.tsx`, i18n files |
| local | `apps/web/src/db/index.ts`, `apps/web/src/db/operations.ts`, `apps/web/src/lib/importData.ts`, `apps/web/src/db/CLAUDE.md` |
| E2E | `e2e/tests/location-scoped-writes.spec.ts`, `e2e/tests/cart-id-cross-user-leak.spec.ts`, a new shared-cart spec, `e2e/playwright.config.ts` |

Line numbers in this plan were read at `0dfd536f` and will drift. Find code by name.

---

## Task B.1 — Move the quantity rules to `@p1i/types`

No behaviour change.

- Move `getPackedTotal`, `consumeItem`, `roundToStep`, `decimalPlaces` (from
  `apps/web/src/lib/quantityUtils.ts`) and `buildCheckoutLogQuantities` (from
  `apps/web/src/lib/checkoutQuantities.ts`) to `packages/types`. Bring any type or helper they
  need. Check that nothing moved imports from `apps/web`.
- The two web modules re-export them (P1), so every web import keeps working.
- Measure the web test count before and after. It must not change.
- Prove the web tests run against the shared code: break `consumeItem` in `packages/types`,
  see web tests go red, restore from a saved copy.
- `pnpm --filter server build` must still pass its start check.

## Task B.2 — Stateful cart fakes with the unique rule

Tests only; no resolver change.

- `cart` and `cartItem` in the server test fakes become stateful stores, built on
  `createOwnedRowFake` (`src/test/ownedRowFake.ts`) where it fits, and registered with
  `runInTransaction` (`src/test/stockFake.ts`) so a rollback restores them.
- `cartItem` raises `P2002` on a second row with the same `(cartId, itemId)`, in `create`,
  `createMany` and `upsert`. It models `upsert` on `cartId_itemId` with
  `quantity: { increment }`.
- The `cart` relation filter keeps working through `cartItemMatches` (`src/test/cartItemFake.ts`).
- Fake tests for each new behaviour, in the style of `ownedRowFake.test.ts`.
- Move the existing `cart.resolver.test.ts` tests onto the fakes only where needed for later
  tasks; do not change what they assert.

## Task B.3 — Schema and the one migration

- `schema.prisma`:
  - `CartItem`: add `@@unique([cartId, itemId])`; drop `@@index([cartId])` (P2).
  - `Cart`: drop `userId` and `@@index([userId])`.
- One migration, in this order: merge duplicates (keep the lowest `id`, sum `quantity`), add
  the unique index, drop the index, drop the column. Write it by hand; check what
  `prisma migrate dev --create-only` generates against it.
- Fix every `tsc` error from the dropped `Cart.userId`, with the **smallest** change that
  keeps today's behaviour: `vendorCart` and `bootstrapCarts` creates, `allCarts`,
  `abandonCart`'s lookup, `createVendor` and `deleteVendor`, the three `import.resolver.ts`
  reads, `authz.ts`'s `cart` delegate, `scripts/verify-migration.ts`. Each read that used
  `Cart.userId` as scope now scopes by location role (`locationIdsWithRole` or
  `requireCartLocation`). Tasks B.4 and B.7 finish these resolvers.
- `scripts/verify-migration.ts`: cases for a duplicate pair with different amounts and
  different `userId`s (the lowest id survives, with the sum, and its own `userId`), a cart
  with no duplicates (unchanged), and `Cart.userId` gone.
- **The main session runs `pnpm --filter server verify:migration`** against `TEST_*` only,
  with the owner's consent after Prisma's warning (P5). The subagent stops before it and
  reports.
- Follow `apps/server/prisma/CLAUDE.md`.

## Task B.4 — Cart reads and writes, scoped by location

Design section 2. Every `CartItem.userId` scope filter goes.

| Resolver | Change |
|---|---|
| `cartItems` | `{ cartId }`, `viewer` |
| `cartItemCountByItem` | carts at `locationIdsWithRole(ctx)`; with `locationId`, `requireLocationRole` first |
| `allCarts`, `allCartItems` | carts at `locationIdsWithRole(ctx)` |
| `addToCart` | `upsert` on `cartId_itemId` with `increment`; `userId` only in `create` |
| `updateCartItem`, `removeFromCart` | find `{ id }`, then `requireCartLocation(…, 'participant')` |
| `abandonCart` | delete `{ cartId }` |
| `removeItemFromLocation` (`itemStock.resolver.ts`) | delete `{ itemId, cart: { locationId } }` |

- Tests: two members, rows from both, and a location the caller has no role on (rule 14). A
  test for two adds of the same item: one row, the sum, the first adder kept.
- An unknown or foreign cart-item id on update or remove gives the same refusal, so it does not
  tell a stranger which ids exist. Check what the code does today and keep it.
- Correct the web hook comments that say "member" where the code needs `participant`
  (`useShoppingCart.ts`). Comments only.
- After this task, `grep -n "userId" apps/server/src/resolvers/cart.resolver.ts` shows only
  the `create` writes and comments. Rewrite the issue #358 header comment to say what is true
  now.

## Task B.5 — Checkout in one transaction (D1)

Design section 3. Server and web in one commit where the schema changes (rule 15).

- `CheckoutItemInput` becomes `{ cartItemId: ID!, quantity: Float! }`. Rewrite the long comment
  above it in `cart.graphql`: the client no longer sends a total.
- `checkout` runs in `prisma.$transaction(async (tx) => …)`:
  1. `requireCartLocation(ctx, cartId, 'participant')`;
  2. read the cart's rows with `quantity > 0`;
  3. refuse with `CART_CHANGED` (P4) if an input id is not a bought row of this cart, if an
     amount differs, or if a bought row is missing from the input;
  4. per row: read `Item` and the `ItemStock` at the cart's location with `tx`, add the amount
     with `writeStock(tx, …)`, compute the log total with `buildCheckoutLogQuantities` from
     `@p1i/types`, write the log;
  5. delete the bought rows. Pinned rows stay.
- Keep `note`, `logKey` and `logParams`.
- Tests (stateful fakes, B.2): one per `CART_CHANGED` cause; a refusal writes nothing (stock,
  logs and rows unchanged); two checkouts of the same rows, the second refused; pinned rows
  kept; the log total matches the old client result for the 6 `buildCheckoutLogQuantities`
  cases; a stock write that throws rolls back the logs.
- Web: `useCheckout` and `CheckoutArgs` send `{ cartItemId, quantity }`; the shopping page
  (`routes/shopping/$vendorId.tsx`) stops calling `buildCheckoutLogQuantities`. On
  `CART_CHANGED` it refetches the cart and shows a new message (i18n key in both languages):
  "This cart changed. Please check and try again."
- Grep the web test files for the old `items` shape. `tsc` does not catch an extra key in an
  untyped mock (root `CLAUDE.md`).
- Local checkout does not change.

## Task B.6 — Cooking in one transaction (D4)

Design section 4. Server and web in one commit (rule 15).

- `ConsumeRecipesItemInput` drops `packedQuantity`, `unpackedQuantity` and `quantity`. `delta`
  keeps its meaning: the signed log change, `-amount used`.
- `consumeRecipes` runs in one interactive transaction. Per item: read `Item` and the
  `ItemStock` at the input location with `tx`, apply `consumeItem` from `@p1i/types` with
  `-delta`, write the stock with `writeStock(tx, …)`, write the log with `getPackedTotal` of
  the result. Any error rolls back everything. Remove the per-item `try/catch`.
- Tests: two cooks of the same item in a row, each from the same starting screen, end with
  both uses subtracted; a failure on the second item rolls back the first item and its log;
  stock that runs out stops at zero and the log keeps the full `delta`.
- Web: `cooking.tsx` (`handleConfirmDone`) stops computing final numbers and sends `delta`;
  `useConsumeRecipes` matches. One error message for a failure.
- Local cooking does not change.

## Task B.7 — Import, ownership and vendors (D5, D7, D8)

Design section 5.

- `requireOwnRowOrUnclaimed` for `cart` and `cartItem`: `'own'` when the caller has
  `participant` or higher on the cart's location (for a cart item, the location of its cart);
  `FORBIDDEN` for a row at any other location; `'unclaimed'` for an unused id. Do not change
  the catalog models or `inventoryLog` (H4). Update the comment and root `CLAUDE.md`'s
  paragraph on this helper.
- `resolveCartItemParents`: the cart is usable when the caller has `participant` or higher on
  its location.
- `bulkCreateCartItems` and `bulkUpsertCartItems` follow P3. An update writes only `quantity`.
- `deleteVendor`: the vendor's carts at every location of the caller's household, found with
  `parseCartId`, deleted with their rows, after the ownership check as today.
- Tests: a co-member importing a backup that names the shared cart is not refused; a stranger
  is; the four P3 paths, each with a cart row already in the cloud; a payload with two rows for
  one item; `deleteVendor` removes a co-member's cart for that vendor and keeps another
  vendor's cart and another household's cart.
- Check every `cartItem.create`, `createMany` and `upsert` in `apps/server/src` for a path that
  can now raise `P2002`. List them in the report.

## Task B.8 — Local mode (D6)

The only task that changes `apps/web/src/db/`. Read `apps/web/src/db/CLAUDE.md` first.

- `addToCart` (`db/operations.ts`) runs in one `rw` transaction on `cartItems`.
- The local import (`lib/importData.ts`) merges rows with the same `(cartId, itemId)` by summing,
  with the same rule as P3 for its strategies. Today it uses `bulkAdd`, which will throw once
  the unique index exists.
- `db.version(19)`: same stores as 18, plus an upgrade that merges duplicates (keep the lowest
  id, sum the amounts).
- `db.version(20)`: `cartItems` gets the unique compound index `&[cartId+itemId]`.
- Fresh databases: check that `on('populate')` and the version chain give version 20 with no
  upgrade needed.
- Tests: open a version-18 database that holds duplicates and upgrade to 20; a fresh database;
  two concurrent `addToCart` calls give one row with the sum; a local import with duplicates.
- Update `apps/web/src/db/CLAUDE.md` with versions 19 and 20.

## Task B.9 — E2E

- `location-scoped-writes.spec.ts`: the new `checkout` and `consumeRecipes` inputs.
- A new cloud spec, no browser, in the `cloud` project's `testMatch` and the `local` project's
  `testIgnore`. Two users in one household, with the E2E second-member route from H3a task
  3.11:
  - both add the same item to one cart: one row, the sum;
  - one sees the other's rows;
  - one checks out from a stale list: `CART_CHANGED`, nothing written;
  - a `viewer` can read the cart and cannot add.
- `cart-id-cross-user-leak.spec.ts`: two **households** must still not share rows. Re-read what
  it asserts after the change and fix its comments.
- Mutation-check the new spec against real Postgres: drop the `CART_CHANGED` check and see it
  go red.

## Task B.10 — Runbook, docs and the final gate

- Deploy runbook for the next checkpoint release (a new file next to
  `docs/global/backend/2026-11-11-deploy-runbook-households-h3a.md`, or a section in it):
  the rehearsal counts (duplicate groups, carts whose id does not start with their location
  id), the old-bundle break the owner accepted, the `Cart.userId` window, auto-deploy off.
- `docs/global/permissions/2026-10-04-households-design.md`, *Checkout with a shared cart*:
  12 filters, the stricter checkout rule, `deleteVendor`, and a link to the H3b design.
- Root `CLAUDE.md`: the authorization paragraph (`Cart` and `CartItem` leave the "account
  ownership" list of `requireOwnRowOrUnclaimed`), and test counts only if re-measured.
- `docs/INDEX.md`, the phase plan's H3 table, and this plan's *Status*.
- The whole Verification Gate, then `pnpm test:e2e:all`.

---

## Execution

Run with `superpowers:subagent-driven-development`: one fresh subagent per task, a review
between tasks, and the main session reports each result to the owner. Order: B.1, B.2, B.3
(stops for `verify:migration`), B.4, B.5, B.6, B.7, B.8, B.9, B.10. B.8 touches only
`apps/web/src/db/` and `lib/importData.ts`, so it may run beside B.5–B.7 if the machine is not
loaded; nothing else runs in parallel.

## Known gaps

- Live updates (H3c).
- Bare-id carts (#361) stay until H4.
- `InventoryLog.userId` still means "author"; no change.
- The `READ COMMITTED` behaviour of two real concurrent checkouts is proved only by fakes and a
  serial E2E run, because E2E runs one worker.
