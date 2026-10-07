# Design — resolving the four cloud-parity findings (#333–#336)

**Date:** 2026-10-08
**Status:** 🔄 In Progress — PR A in build
**Brainstorming:** `2026-10-08-brainstorming-parity-followup.md` (same folder)
**Base:** `main` at `d63bd81f` (the #338 merge)

## Summary

### 1. Where this sits

The cloud-locations series ended with PR 5 (#332). An audit after it asked one question —
what works in local mode but not in cloud? — and found eight things. Four were small and
shipped in #338. The other four became issues #333, #334, #335 and #336. This design covers
those four.

### 2. Relations

Follows #332 and #338. Three PRs, in this order:

| PR | Issue | Why this position |
|---|---|---|
| A | #336 | Self-contained. No migration, so nothing downstream depends on it |
| B | #335 | Adds a migration |
| C | #334 + #333 | #333 replays every committed migration, so it proves B's migration too |

#333 must not run before B. `verify:migration` opens with `migrate reset`, replays the whole
committed chain and asserts against the result. Run last, one execution covers both
migrations and one cloud E2E run covers both PRs.

### 3. What the user gets (UX)

| PR | What changes for the user |
|---|---|
| A | The inventory log shows the same number in both modes. Today a cloud checkout of an item with `amountPerPackage` set logs a higher number than the same checkout in local mode. **It also breaks checkout for cloud clients that have not updated — see the warning below.** |
| B | A cloud user can save a note or a Wikidata URL on an item's Info tab. Today that save fails. |
| C | Nothing. Tests and one safety guard. |

### 4. What the developer gets (DX)

| Gain | Specifics |
|---|---|
| A failure that now has a name | #333's guard refuses to drop the schema of a database that is not the test one, instead of doing it silently |
| Fewer ways to get it wrong | one shared formula for the logged total instead of two implementations that disagree |
| A destructive path finally executed | `clearAllData` and `migrate reset` have never run end to end. PR C runs both |
| A defect becomes reachable by a test | #330 lives only on the `replace` strategy, which no E2E run has ever driven |
| Honest documentation | `e2e/helpers/backupAssertions.ts` records the strategy gap but names only one of its two paths |

**DX cost, stated on purpose.** PR A moves a number the inventory log depends on from the
server to the client. The server can no longer compute it, so a wrong client writes a wrong
log and the server cannot tell. That cost was accepted when the client-side option was
chosen over the server-side one.

---

## ⚠️ PR A breaks checkout for clients that have not updated

This is a deliberate, approved choice and must not be read later as a bug.

`checkout` gains a **required** argument. GraphQL rejects an operation that omits a required
argument, and it equally rejects one that sends an argument the server does not declare. So:

| Combination | Result |
|---|---|
| old client, new server | `items` missing → validation error, checkout fails |
| new client, old server | `items` unknown → validation error, checkout fails |

There is no deploy order that avoids this, and Railway (server) and Cloudflare Pages (web)
both deploy from the same merge to `main`, so the order inside the PR is not controllable
either.

The app is a PWA with `registerType: 'prompt'` (`apps/web/vite.config.ts:17`), so a client
keeps its cached bundle until the user accepts the update toast. **A cloud user who does not
accept the prompt cannot check out, for as long as they do not accept it.** Local mode is
unaffected — it never calls GraphQL.

The safe alternative was offered and declined: add the argument as optional with a fallback,
deploy, make the client send it, deploy, then tighten it to required in a third step. The
user chose the one-PR version twice, with this consequence stated.

**What to do on the day:** deploy, then open the app and accept the update prompt on every
device signed into cloud mode.

---

## PR A — #336, the checkout log quantity

### The disagreement

Local, `apps/web/src/db/operations.ts`:

```ts
const finalQuantity =
  getPackedTotal({
    packedQuantity: base.packedQuantity,
    unpackedQuantity: base.unpackedQuantity,
    ...(item?.amountPerPackage !== undefined
      ? { amountPerPackage: item.amountPerPackage }
      : {}),
  }) + cartItem.quantity
```

Cloud, `apps/server/src/resolvers/cart.resolver.ts:212`:

```ts
const finalQuantity = stock.packedQuantity + stock.unpackedQuantity
```

`getPackedTotal` (`apps/web/src/lib/quantityUtils.ts:41`) turns the unpacked remainder into
packs. Cloud sums the two columns raw. With `amountPerPackage: 6`, stock `2` packed and `3`
unpacked, buying `1`: local logs **3.5**, cloud logs **6**.

They agree when `amountPerPackage` is unset or `unpackedQuantity` is 0, which is why this was
never noticed.

### Why cloud cannot fix it without help

`amountPerPackage` lives on `Item`, not on `ItemStock`. The `checkout` resolver holds the
stock row `writeStock` returned and never reads the item. So it cannot convert without an
extra read.

### The shape — a per-item list, not a scalar

#336 sketched `checkout(cartId: ID!, finalQuantity: Float!)`. **That cannot work.**
`checkout` is a per-cart mutation: it loops over every active cart item and writes one
`InventoryLog` row for each. One scalar cannot carry N numbers.

The repo already has the right shape. `consumeRecipes` takes a per-item list whose entries
carry the computed total:

```graphql
input ConsumeRecipesItemInput {
  itemId: ID!
  packedQuantity: Float!
  unpackedQuantity: Float!
  delta: Float!
  quantity: Float!   # the converted total, computed by the client
  ...
}
```

`checkout` mirrors it, carrying only what the server does not already have:

```graphql
input CheckoutItemInput {
  itemId: ID!
  "The post-purchase total for this item, already converted. getPackedTotal(pre-purchase stock) + the cart quantity."
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

`delta` stays server-side — the resolver already has it as `ci.quantity` from the cart row.
Only the converted total has to cross the wire.

### Server behaviour

For each active cart item the resolver looks its `quantity` up in `items` by `itemId`.

**A missing entry throws.** `GraphQLError` with code `BAD_USER_INPUT`, naming the item. The
alternative — falling back to the raw sum — would keep the wrong-number path alive, which is
the thing being removed.

**Known race, accepted:** the client computes from what it rendered. If the server is buying
an item the client did not send — another device added it between render and checkout — the
checkout fails and the user retries after the refetch. One account per user today makes this
rare. Recorded as a known gap rather than solved.

### Client

| File | Change |
|---|---|
| `apps/web/src/apollo/operations/shopping.graphql:59` | the `Checkout` document gains `$items: [CheckoutItemInput!]!` |
| `apps/web/src/hooks/useShoppingCart.ts:254` | `useCheckout`'s cloud branch passes `items` through; the local branch is untouched |
| `apps/web/src/routes/shopping/$vendorId.tsx:599` | the one call site builds the list |

There is exactly one call site. The page renders the cart, so it holds the stock each entry
needs.

The formula the client sends, matching local exactly:

```
quantity = getPackedTotal({ packedQuantity, unpackedQuantity, amountPerPackage }) + cartItem.quantity
```

Note the order: the delta is added **after** the conversion, because the delta is in packs.

### Tests

**Unit.** The server test must use a fixture with `amountPerPackage` set and a non-zero
`unpackedQuantity`, or both implementations give the same answer and the test cannot fail.
The worked example above is usable: `amountPerPackage: 6`, packed `2`, unpacked `3`, buy `1`
→ expect **3.5**, not 6.

**E2E.** `e2e/tests/location-scoped-writes.spec.ts` already drives `checkout` against real
Postgres in the `cloud` project. It asserts which `locationId` a row lands in, not the
number. It gains an assertion on the logged quantity, with the same fixture shape.

**Mutation check.** Reverting the resolver to `stock.packedQuantity + stock.unpackedQuantity`
must turn the new tests red with a value difference, not a timeout.

### Existing wrong rows — measured 2026-10-08, decision: leave them

Measured read-only against the production copy (`PROD_COPY_DATABASE_URL`). Purchase logs
(`delta > 0`) on items with `amountPerPackage > 1`:

| `logKey` | Quantity whole? | Count |
|---|---|---|
| `shopping.log.purchasedAt` | no — fractional | 19 |
| `shopping.log.purchasedAt` | **yes** | **19** |
| `shopping.log.purchased` | no — fractional | 1 |
| `(null)` | no — fractional | 45 |
| `(null)` | yes | 78 |

Wider scope, for context: 1441 `InventoryLog` rows in total, 24 items carry an
`amountPerPackage`, 451 logs sit on those items, and 13 of those items hold a non-zero
`unpackedQuantity` somewhere today.

**How to read this.** The raw-sum formula always gives a whole number when both stock columns
are whole. The converted formula gives a fraction unless the remainder divides evenly. So the
65 fractional rows were written by the **converted** formula and are already correct — by
local mode, by cooking (which already sends the number), or imported from a local backup. The
13 `cooking.log.consumedVia` rows are correct for the same reason.

**The upper bound on wrong checkout rows is 19, and the true number may be 0.** It cannot be
narrowed: `InventoryLog` does not store the packed/unpacked split as it stood when the row was
written, so a whole-number row is equally consistent with a correct conversion whose remainder
divided evenly, or with `unpackedQuantity` having been 0.

**Decision: no repair.** A migration could not identify its targets. Rewriting all 19 would
corrupt the rows that were already right, and it would use today's stock split to recompute a
value recorded months ago. The bound is recorded here and on #336.

---

## PR B — #335, `note` and `wikidataUrl` on the cloud side

Both fields exist in `packages/types`, in `ItemForm`, and in the local Dexie `Item`. Neither
exists in `schema.prisma` or in `item.graphql`. So the client sends a field the schema does
not declare and GraphQL rejects the whole mutation — a cloud user typing a note gets a failed
save.

Scope:

1. `note String?` and `wikidataUrl String?` on the Prisma `Item`, plus a migration. Both
   nullable, so it is additive and needs no backfill.
2. Both added to the GraphQL `Item`, `CreateItemInput` and `UpdateItemInput`.
3. Both added to `ItemInput` in `import.graphql` and to `toItemInput`
   (`apps/web/src/lib/importData.ts`), or a cloud backup loses them. `toItemInput` has a
   return-type guard from #332 that fails the build if a key is not declared, so the two
   halves cannot drift apart silently.
4. Both added to every selection set that lists `Item`'s fields. **Measure the count rather
   than trusting a number.** #335 says eight; counting `amountPerPackage` as the marker gives
   `items.graphql` 3, `itemStocks.graphql` 2, `import.graphql` 2. The pairs in
   `items.graphql` and `itemStocks.graphql` carry comments promising they stay in step with a
   sibling, so both halves of each pair move together.
5. `createItem` and `buildItemUpdateData` must actually persist them.
6. Remove the `test.skip` at `e2e/tests/item-management.spec.ts:125` and confirm
   `user can persist note and wikidata URL on the Info tab` passes in `cloud`.

**No deploy window.** Adding a field to a type is safe for an old bundle, unlike removing
one. This is the opposite direction from #332's hazard, and the opposite of PR A's.

---

## PR C — #334 and #333

### #334 — two E2E specs for the `clear` and `replace` strategies

Only `skip` is ever exercised today. Both import specs run `cleanupCloudData` in
`beforeEach`, so the account is empty, no conflict can arise, and `ImportCard` never reaches
its conflict dialog.

There are two paths to a strategy, and the existing note in
`e2e/helpers/backupAssertions.ts` names only the first.

**Spec 1 — `DataModeCard`, no conflict needed.** Local mode with at least one item →
Settings → "Switch…" → confirm → "Yes, copy data" → "Clear & import" → sign in, and
`usePostLoginMigration` runs the `clear` import. This is the cheap one, and it is the only
thing that will ever have run `clearAllData` end to end.

**Spec 2 — `ImportCard`'s conflict dialog, for `replace`.** Needs a fixture that collides
on purpose. `detectConflicts` matches by id or name for items, tags, tagTypes, vendors and
recipes, and by id only for inventoryLogs, cartItems and shelves. `shoppingCarts` is
hardcoded to `[]` and can never conflict; `locations` and `itemStocks` are not checked at
all. The fixture is the work here, not the clicks.

**"Clear & import" is the same string in two different dialogs**, so a spec matching on text
alone must scope to the dialog it means.

Both specs join the `cloud` project's `testMatch`, and `local`'s `testIgnore` if cloud-only.
`e2e/helpers/backupAssertions.ts` gets its note corrected to name both paths.

**#330 is not fixed here.** It is reachable only through `replace`, so spec 2 is what could
catch it, but the fix stays its own issue.

### #333 — run `verify:migration`, and widen its guard

`apps/server/scripts/verify-migration.ts` is the only check in the repo that runs a migration
against real SQL. #332 added three assertions to it and **none has ever been executed.**

The second of the three is the one that matters: `Item` and `ItemStock` declare the same five
field names, so checking `Item` alone passes just as well against a migration that dropped the
columns from the wrong table.

**The guard change.** Today the only protection is that `TEST_*` differs from the two dev
variables. A `PROD_COPY_DATABASE_URL` sits in the same `.env`. `assertDistinctFromDev`
becomes a deny-list: refuse to run if `TEST_DATABASE_URL` or `TEST_DIRECT_URL` resolves to
the same **host and database name** as any other `*_URL` in the environment. Comparing the
resolved host and database, not the raw string, so a re-pasted URL in a different format is
still caught.

**The run.** Needs no E2E suite running (ports and databases are shared across worktrees),
and needs the user's real-time consent via `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.
That consent covers `TEST_DATABASE_URL` only — never `DATABASE_URL`, never a production copy.
Afterwards the E2E database comes back empty at the latest schema, so the cloud project is
re-run to confirm it still passes.

---

## Known gaps

| Gap | Where it is answered |
|---|---|
| PR A breaks checkout for clients that have not accepted the update prompt | Chosen on purpose. See the warning section |
| PR A's client-computed number cannot be checked by the server | The accepted cost of the chosen option |
| PR A's race: the server buying an item the client did not send makes checkout fail | Recorded, not solved. Rare with one account per user |
| At most 19 existing cloud purchase logs may read high | Measured 2026-10-08. Deliberately not repaired — the exact set cannot be identified. See the section above |
| #330 — `replace` silently does not overwrite | Stays open. PR C's spec 2 makes it reachable by a test |
| How long PR A's required argument locks out a stale client | Unbounded, because `registerType: 'prompt'` waits for the user |
