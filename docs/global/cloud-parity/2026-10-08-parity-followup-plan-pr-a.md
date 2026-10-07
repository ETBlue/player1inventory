# Plan — PR A, issue #336: the cloud checkout log quantity

**Date:** 2026-10-08
**Branch:** `fix/checkout-log-quantity` · worktree `.worktrees/fix-checkout-log-quantity`
**Base:** `main` at `d63bd81f`
**Design:** `2026-10-08-parity-followup-design.md` (same folder)
**Issue:** #336

## What this PR does

Cloud `checkout` logs `stock.packedQuantity + stock.unpackedQuantity`. Local logs
`getPackedTotal(stock) + cartItem.quantity`, which turns the unpacked remainder into packs.
The two disagree whenever an item has an `amountPerPackage` and a non-zero
`unpackedQuantity`.

The client will compute the number and send it, the way `consumeRecipes` already does. The
argument is **required**, which breaks checkout for cloud clients that have not accepted the
service-worker update prompt. That was chosen on purpose — see the warning section in the
design doc.

## Shape, decided in the design

```graphql
input CheckoutItemInput {
  itemId: ID!
  quantity: Float!
}

checkout(
  cartId: ID!
  items: [CheckoutItemInput!]!
  note: String
  logKey: String
  logParams: JSON
): Cart!
```

`delta` stays server-side; the resolver already has it as `ci.quantity`.

The number the client sends, matching local exactly — note the delta is added **after** the
conversion, because the delta is in packs:

```
quantity = getPackedTotal({ packedQuantity, unpackedQuantity, amountPerPackage }) + cartItem.quantity
```

## The fixture every test must use

Both implementations agree when `amountPerPackage` is unset or `unpackedQuantity` is 0, so a
test without both **cannot fail** and proves nothing.

| Field | Value |
|---|---|
| `amountPerPackage` | 6 |
| `packedQuantity` | 2 |
| `unpackedQuantity` | 3 |
| cart quantity (delta) | 1 |
| **expected logged quantity** | **3.5** |
| what the old code logged | 6 |

---

## Task 1 — server: schema, resolver, unit tests

**Files:** `apps/server/src/schema/cart.graphql`,
`apps/server/src/resolvers/cart.resolver.ts`,
`apps/server/src/resolvers/cart.resolver.test.ts`

1. Add `input CheckoutItemInput { itemId: ID!, quantity: Float! }` to `cart.graphql`, and add
   `items: [CheckoutItemInput!]!` to `checkout`. Document on the input why the client owns
   this number (`amountPerPackage` is on `Item`, the resolver holds only the stock row) and
   that `consumeRecipes` set the precedent.
2. Run `pnpm codegen` from the repo root so the server's generated types pick the argument up.
3. In the resolver, build a `Map<string, number>` from `items` **once**, before the loop.
   Replace `const finalQuantity = stock.packedQuantity + stock.unpackedQuantity` with a lookup
   by `ci.itemId`.
4. A buying item with no entry in `items` **throws** `GraphQLError` with
   `extensions.code = 'BAD_USER_INPUT'`, naming the `itemId`. Do **not** fall back to the raw
   sum — that path is the bug being removed. Leave a comment saying so, and recording the
   accepted race: the client computes from what it rendered, so if another device adds an item
   between render and checkout the checkout fails and the user retries.
5. The client's filter must match the server's `buyingItems` rule, `ci.quantity > 0`
   (`cart.resolver.ts:167`). State that in the comment so the two stay in step.

**Tests to add to `cart.resolver.test.ts`:**

- `user checking out an item sold in packs gets the converted total in the log` — the fixture
  above, expect `quantity` to be `3.5`.
- a second case with `amountPerPackage` unset, expecting the plain sum, so the conversion is
  not applied where it must not be.
- `checkout` throws `BAD_USER_INPUT` when a buying item is missing from `items`.

**Mutation check (required).** Put `stock.packedQuantity + stock.unpackedQuantity` back and
re-run. The first test must go red **with a value difference** (`expected 3.5, got 6`), not a
timeout. Report the exact text.

**Also check the fake.** `src/test/stockFake.ts` and the cart fakes must not silently ignore
the new argument. A fake that drops `items` would leave every test green against a resolver
that ignores it. Model it, or assert the resolver reads it.

---

## Task 2 — web: document, hook, call site, unit tests

**Files:** `apps/web/src/apollo/operations/shopping.graphql`,
`apps/web/src/hooks/useShoppingCart.ts`,
`apps/web/src/routes/shopping/$vendorId.tsx`,
`apps/web/src/hooks/useShoppingCart.test.ts`, `apps/web/src/test/setup.ts`

1. `shopping.graphql:59` — the `Checkout` document gains `$items: [CheckoutItemInput!]!` and
   passes it. Run `pnpm codegen`.
2. `useShoppingCart.ts:254` — `useCheckout`'s **cloud** branch takes `items` in its argument
   object and forwards it, in **both** `mutate` and `mutateAsync` (they duplicate the variable
   block). The **local** branch is untouched: local mode never calls GraphQL and already
   computes correctly in `db/operations.ts`.
3. `$vendorId.tsx:599` — the one call site builds the list. The page already holds everything:
   `items` from `useItems()` is a `PantryItem`, so it carries the joined stock **and**
   `amountPerPackage`; `cartItems` comes from `useCartItems(cart?.id)`. Filter
   `ci.quantity > 0` to match the server.
4. `useShoppingCart.test.ts` has three `useCheckout()` tests — update them, and assert the
   cloud mutation was called **with** the computed `items`, not merely that it was called.
5. Check whether `test/setup.ts:251`'s `useCheckoutMutation` stub needs the new variable.

**Mutation check (required).** Change the call site to send the raw sum
(`packedQuantity + unpackedQuantity + ci.quantity`) and confirm a test goes red on the value.
If every test still passes, the assertion is only checking that the mutation fired — fix the
test.

---

## Task 3 — E2E assertion against real Postgres

**File:** `e2e/tests/location-scoped-writes.spec.ts`

This spec already drives `checkout` in the `cloud` project and already selects `quantity` in
its `ITEM_LOGS` query (`:90`), asserting only `delta` today (`:173`).

1. Give the checked-out item an `amountPerPackage` and a non-zero `unpackedQuantity` — the
   fixture table above. Check what the existing seed gives `MILK` before changing it, and do
   not break the location assertions the test already makes.
2. Assert the logged `quantity`. This is the only place the whole path runs against real SQL.
3. If the existing test cannot carry the fixture without weakening its location assertions,
   add a new test rather than bending that one.

**Mutation check (required).** Revert the resolver and confirm this test goes red with a value
difference.

---

## Task 4 — documentation

1. **`apps/web/src/hooks/CLAUDE.md`** — `useCheckout` now sends a computed number. Record that
   the caller computes it, that this follows `useConsumeRecipes`, and that the local branch
   does not.
2. **`apps/server/src/schema/` or the resolver comment** — already covered by task 1.
3. **`docs/INDEX.md`** — add a `cloud-parity` row under Global, 🔄 In Progress, naming the
   three PRs and linking the brainstorming log, design doc and this plan.
4. **The design doc** — move PR A to its final state once the gate is green.
5. **Root `CLAUDE.md`** — only if a pattern changed. The one candidate: cloud `checkout` now
   trusts a client-computed number, which is worth a line next to the existing note that no
   unit test runs resolvers against real SQL.

---

## Verification gate

Run from the repo root, with explicit paths, after every task:

```bash
(cd apps/web && pnpm lint)
pnpm build 2>&1 | tee /tmp/p1i-build-pr-a.log
grep 'TS6385' /tmp/p1i-build-pr-a.log && echo FAIL || echo OK
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
pnpm test
```

**Measure the baseline first.** `main` at `d63bd81f` is web **2283 / 248 files** and server
**348 / 25 files** — measured on this branch at task 0, but re-measure rather than subtract
from this line.

**Final phase only:** `pnpm test:e2e:all`. The machine has been short of memory; swap hit
24.8 GB of 25.6 GB during #338's gate and the OS killed the run. If `cloud` is killed again,
run it as three `--project=cloud` invocations over its 20 `testMatch` files, as #338 did, and
say so in the PR.

## Known gaps this PR will carry

| Gap | Note |
|---|---|
| Checkout breaks for cloud clients that have not accepted the update prompt | Chosen on purpose, twice. Unbounded in time, because `registerType: 'prompt'` waits for the user |
| The server can no longer check the number it stores | The accepted cost of the client-side option |
| A buying item missing from `items` fails the checkout | Accepted race. Rare with one account per user |
| At most 19 existing cloud purchase logs may read high | Measured 2026-10-08, deliberately not repaired. The exact set cannot be identified |
