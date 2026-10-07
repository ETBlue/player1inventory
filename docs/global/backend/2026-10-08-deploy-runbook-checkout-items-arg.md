# Deploy runbook — `checkout` gains a required `items` argument (cloud parity PR A)

**Date written:** 2026-10-08
**Migration:** none. This PR changes no database schema.
**Branch:** `fix/checkout-log-quantity`
**Issue:** #336
**Design doc:** [`docs/global/cloud-parity/2026-10-08-parity-followup-design.md`](../cloud-parity/2026-10-08-parity-followup-design.md) — see the section *⚠️ PR A breaks checkout for clients that have not updated*
**Brainstorming log:** [`docs/global/cloud-parity/2026-10-08-brainstorming-parity-followup.md`](../cloud-parity/2026-10-08-brainstorming-parity-followup.md)
**Plan:** [`docs/global/cloud-parity/2026-10-08-parity-followup-plan-pr-a.md`](../cloud-parity/2026-10-08-parity-followup-plan-pr-a.md)
**Precedent:** [`2026-10-05-deploy-runbook-item-column-drop.md`](2026-10-05-deploy-runbook-item-column-drop.md)

> ## This is a BREAKING-CHANGE document, not a verification one
>
> The two runbooks before it were about a database migration, so their risk was data loss
> and their answer was a Neon branch. **This PR touches no database.** Nothing can be lost
> and there is nothing to reconcile.
>
> The risk here is different: **cloud checkout stops working for any browser still holding
> the old web bundle.** Both deploy orders break, so no deploy order avoids it. The fix is
> for each user to accept the app's update prompt.
>
> What a human has to do:
>
> | Step | Section |
> |---|---|
> | Know that both deploy orders break, and that this was chosen. | 1 |
> | After the deploy, open the app and accept the update prompt on **every** device signed into cloud mode. | 3 |
> | Tell a reported checkout failure apart from a real bug, using the exact error text. | 4 |
> | Understand that rollback has the same problem in reverse. | 5 |

---

## 1. What changes

The cloud `checkout` mutation gains a **required** argument.

```graphql
checkout(
  cartId: ID!
  items: [CheckoutItemInput!]!   # NEW, and required
  note: String
  logKey: String
  logParams: JSON
): Cart!

input CheckoutItemInput {
  itemId: ID!
  quantity: Float!
}
```

`quantity` is the item's on-hand total **after** the purchase, already converted to package
units. The client computes it, because the server cannot: `amountPerPackage` is a global
`Item` field and the `checkout` resolver holds only the per-location `ItemStock` row. Before
this PR the resolver wrote `packedQuantity + unpackedQuantity` raw — **6** where local mode
wrote **3.5** for an item sold in packs of 6, holding 2 packed and 3 unpacked, buying 1.
That is issue #336.

| | |
|---|---|
| Server | `apps/server/src/schema/cart.graphql`, `apps/server/src/resolvers/cart.resolver.ts` |
| Client rule | `apps/web/src/lib/checkoutQuantities.ts` (`buildCheckoutLogQuantities`) |
| Client wiring | `apps/web/src/apollo/operations/shopping.graphql`, `apps/web/src/hooks/useShoppingCart.ts`, `apps/web/src/routes/shopping/$vendorId.tsx` |

**There is no fallback on the server.** A bought cart item with no entry in `items` throws
`GraphQLError` with code `BAD_USER_INPUT`, naming the `itemId`. Falling back to the raw sum
would keep the wrong-number path alive, which is the thing being removed.

### 1.1 Both deploy orders break. This was chosen on purpose.

GraphQL rejects an operation that omits a required argument. It equally rejects one that
sends an argument the server does not declare. So there is no safe order:

| Combination | Result |
|---|---|
| old client, **new** server | `items` is missing → validation error → checkout fails |
| **new** client, old server | `items` is unknown → validation error → checkout fails |

The order is also not controllable. Railway (server) and Cloudflare Pages (web) both deploy
from the same merge to `main`, on two different services that finish at different times, and
nothing coordinates them.

**The safe alternative was offered and declined twice.** That alternative is
expand-then-contract: add `items` as optional with a fallback, deploy; make the client send
it, deploy; then tighten it to required in a third step. The user was told the consequence of
the one-PR version in these exact terms, twice, and chose it both times. The record is in the
brainstorming log (question 6) and in the design doc.

**So a broken checkout after this deploy is the stated cost of an approved decision. It is
not an unforeseen bug.** That is the main reason this file exists.

### 1.2 Who is affected, and for how long

| | |
|---|---|
| Who | a browser in **cloud mode** holding a pre-PR-A web bundle |
| Symptom | checkout fails. Everything else in the app keeps working |
| Fix | accept the app's update prompt, then reload |
| How long it lasts | **until that user accepts the prompt.** There is no time limit |
| Not affected | **local mode.** It never calls GraphQL. `checkout` in `apps/web/src/db/operations.ts` reads the stock rows itself and computes the same number |

The app is a PWA with `registerType: 'prompt'` (`apps/web/vite.config.ts:17`). A service
worker in prompt mode does **not** activate a new bundle on its own. The browser keeps
serving the cached one until the user accepts the update. A user who ignores the prompt for a
week cannot check out for a week.

**A Cloudflare Pages preview built before PR A is permanently broken against the production
API.** Its bundle is frozen at the commit that built it, and it points at the shared cloud
API. No reload fixes that. The preview has to be rebuilt from a commit that includes PR A, or
left alone. Worth knowing before someone opens an old preview link to compare behaviour and
reports the failure as a regression.

---

## 2. Before you merge

Nothing to take, nothing to reconcile. **No Neon branch is needed** — this PR changes no
database schema, writes no rows during deploy and destroys no column. The rollback path in
section 5 is a code revert, not a restore.

One thing is worth doing: **count the devices.** Write down every browser and every
home-screen PWA that is signed into cloud mode, because section 3 has to visit each one.
Today that is one person's devices.

---

## 3. On the day

1. **Merge to `main`.** Railway builds and deploys the server. Cloudflare Pages builds and
   deploys the web bundle. They finish at different times; that does not matter here, because
   both orders break anyway and the fix is the same.
2. **Wait for both services to report a successful deploy.** Do not start step 3 before the
   Cloudflare Pages build is live, or the device will just re-cache the old bundle.
3. **On every device signed into cloud mode:** open the app, wait for the update prompt, and
   **accept it**. Then reload.
4. **If no prompt appears**, the service worker has not yet seen the new bundle. Reload once
   and wait a few seconds. On macOS a hard reload is Cmd+Shift+R. As a last resort, open the
   DevTools console and run `window.__unregisterServiceWorkers()` (see root `CLAUDE.md`, *Service
   worker and offline*), then reload.
5. **Check it worked:** add one item to a cart and check out. Open that item's log and confirm
   the row was written. For an item with `amountPerPackage` set and a non-zero unpacked
   quantity, the logged number should now be the converted total, matching what local mode
   shows.

Say it out loud to anyone else using the app:

> The deploy is done. Open the app, accept the update prompt, and reload. Until you do,
> checkout will fail.

---

## 4. How to tell this apart from a real bug

**The failure has one exact signature.** A client on an old bundle sends no `items`, so the
server refuses the operation during GraphQL **validation**, before any resolver runs:

```
Field "checkout" argument "items" of type "[CheckoutItemInput!]!" is required, but it was not provided.
```

A client on a new bundle against an old server gives the mirror image — an unknown-argument
validation error naming `items`.

| What you see | What it means | What to do |
|---|---|---|
| validation error naming `items` as **required** but not provided | old client, new server. **Expected.** | accept the update prompt, reload |
| validation error naming `items` as an **unknown** argument | new client, old server. **Expected** during the deploy window. | wait for Railway to finish, reload |
| `BAD_USER_INPUT`, message `checkout: no quantity was supplied for item '<id>'` | **Not a stale bundle.** The client sent `items` but left one bought item out | see 4.1 |
| anything else | **Investigate as a real bug.** | — |

**The first two are validation errors, so no `InventoryLog` row and no stock change is
written.** A failed checkout leaves the cart exactly as it was. The user retries after
updating and loses nothing.

### 4.1 The `BAD_USER_INPUT` case — the accepted race

This one means the client **did** send `items`, and one bought cart item had no entry. Two
causes:

1. **The accepted race.** The client computes `items` from the cart it rendered. If another
   device adds a cart item between that render and the checkout, the new item has no entry and
   the whole checkout fails. The user refetches and retries. Rare with one account per user,
   so it was recorded rather than solved.
2. **The two filters drifted apart.** The client filters cart items on `ci.quantity > 0`
   (`apps/web/src/lib/checkoutQuantities.ts`) and the resolver's `buyingItems` applies the
   same rule (`apps/server/src/resolvers/cart.resolver.ts:167`, verified 2026-10-08 — it has
   moved before, so check the current line). If either side's filter changes and the other
   does not, legitimate checkouts start failing on this error. **That is a real bug.** Compare
   the two filters first.

Cause 1 clears on a retry. Cause 2 repeats every time.

---

## 5. If something is wrong

### 5.1 Rollback has the same problem in reverse

**Reverting the server alone breaks a client that already updated.** An updated client sends
`items`; an old server does not declare it; GraphQL rejects the operation. So a server-only
revert moves the breakage from the users who have not updated to the users who have.

| What you revert | Who breaks after it |
|---|---|
| server only | every client that already accepted the update prompt |
| web only | every client that gets the reverted bundle, against the new server |
| **both, to the same commit** | nobody, once each device has reloaded onto the reverted bundle |

**So revert both services to the same commit, or revert neither.** And after reverting, every
device has to accept a prompt again — this time to go back. Section 3's steps apply unchanged.

There is no database state to undo. The revert is pure code.

### 5.2 The log rows already written with the wrong number stay wrong

**Decision: no repair.** Measured read-only against a production copy on 2026-10-08: the upper
bound on wrong cloud checkout log rows is **19**, and the true number may be **0**. It cannot
be narrowed, because `InventoryLog` does not store the packed/unpacked split as it stood when
the row was written. A whole-number row is equally consistent with a correct conversion whose
remainder divided evenly and with `unpackedQuantity` having been 0.

A migration could not identify its targets. Rewriting all 19 would corrupt the rows that were
already right, and it would use today's stock split to recompute a value recorded months ago.
Full numbers are in the design doc, section *Existing wrong rows*.

**So do not treat an old odd-looking log row as evidence that the deploy failed.** Check a row
written **after** the deploy.

---

## 6. What this runbook does NOT cover

### 6.1 No migration, so `verify:migration` is not owed

This PR adds no migration file, so `apps/server/scripts/verify-migration.ts` is untouched and
its `MIGRATIONS` list does not grow. Compare with the PR 5 runbook, which owed three
unexecuted assertions.

### 6.2 What does cover the change

| Test | What it proves |
|---|---|
| `apps/web/src/lib/checkoutQuantities.test.ts` | 6 unit tests on the client rule, including the term order |
| `apps/web/src/hooks/useShoppingCart.test.ts` | `useCheckout` forwards the computed `items` |
| `apps/server` resolver tests | a missing entry throws `BAD_USER_INPUT`; the supplied number is what gets logged |
| `e2e/tests/location-scoped-writes.spec.ts`, `cloud` project | real Postgres. The logged quantity is **3.5**, not 6, for `amountPerPackage` 6 with 2 packed and 3 unpacked, buying 1 |

The E2E test is the one that matters most here, because it is the only check that runs the
resolver against real SQL. Its fixture sets `amountPerPackage: 6` **and** a non-zero
`unpackedQuantity` on purpose. Without both, the correct code and the old buggy code give the
same number and the assertion cannot fail.

**No automated test covers the deploy window itself.** No test runs an old bundle against a
new server, and none could. Section 4's table is the only guide for that, and it is written
from the GraphQL specification's behaviour, not from a measurement.

---

## Where this file lives, and why

`docs/global/backend/`, beside
[`2026-10-05-deploy-runbook-item-column-drop.md`](2026-10-05-deploy-runbook-item-column-drop.md),
[`2026-09-18-deploy-runbook-cart-rekey.md`](2026-09-18-deploy-runbook-cart-rekey.md),
[`2026-04-10-deployment-stack-design.md`](2026-04-10-deployment-stack-design.md) and
[`2026-04-13-deployment-troubleshooting.md`](2026-04-13-deployment-troubleshooting.md) — the
files a person opens when a deploy is going wrong. A runbook is read under pressure, by
someone looking for deploy documents, not for a feature folder.
