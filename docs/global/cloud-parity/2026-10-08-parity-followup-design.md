# Design — resolving the four cloud-parity findings (#333–#336)

**Date:** 2026-10-08
**Status:** 🔄 In Progress — PR A ✅ built, PR B ✅ built, PR C 🔲 pending
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
| A | #336 | Self-contained. No migration, so nothing downstream depends on it. **✅ built 2026-10-08** |
| B | #335 | Adds a migration. **✅ built 2026-10-08** |
| C | #334 + #333 | #333 replays every committed migration, so it proves B's migration too |

#333 must not run before B. `verify:migration` opens with `migrate reset`, replays the whole
committed chain and asserts against the result. Run last, one execution covers both
migrations and one cloud E2E run covers both PRs.

### 3. What the user gets (UX)

| PR | What changes for the user |
|---|---|
| A | The inventory log shows the same number in both modes. Today a cloud checkout of an item with `amountPerPackage` set logs a higher number than the same checkout in local mode. **It also breaks checkout for cloud clients that have not updated — see the warning below.** |
| B | A cloud user can save a note or a Wikidata URL on an item's Info tab, **and clear one again**. Before B the save failed outright. **Built 2026-10-08, not yet deployed** — the user gets nothing until it is. |
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

**Status: ✅ built on 2026-10-08**, branch `fix/checkout-log-quantity`, five commits. The
sections below describe the design; *What was built* records where the result differs from it.

### What was built

| Commit | What it did |
|---|---|
| `e25a52f5` | this design doc, the brainstorming log and the PR A plan |
| `1a28bc4b` | `checkout` gained a **required** `items: [CheckoutItemInput!]!`. The resolver resolves every total in a `.map` **before** its write loop, so a missing entry cannot leave half a checkout behind, and throws `GraphQLError` / `BAD_USER_INPUT` naming the `itemId`. No raw-sum fallback |
| `946040dd` | the client rule moved into `apps/web/src/lib/checkoutQuantities.ts` (`buildCheckoutLogQuantities`), with 6 unit tests |
| `5ebf2908` | `useCheckout` is asserted to forward the computed `items` |
| `58854dcd` | `e2e/tests/location-scoped-writes.spec.ts` gained a real-SQL assertion on the logged quantity, and its broken `CHECKOUT` constant was repaired. `e2e/helpers/fixture.ts`'s `FixtureItem` gained `amountPerPackage`, threaded through `cloudSeed.ts` and `localSeed.ts` |

Counts measured after the last commit: server **351** tests / 25 files, web **2289** / 249
files, and `pnpm test:e2e --project=cloud e2e/tests/location-scoped-writes.spec.ts` gives
**5 passed**.

**One thing landed differently from the plan.** The plan put the list-building code at the one
call site in `apps/web/src/routes/shopping/$vendorId.tsx`. It ended up in its own module,
`apps/web/src/lib/checkoutQuantities.ts`, because the term order needs unit tests of its own
and a route component is a poor place to test arithmetic. The call site is now one line
(`$vendorId.tsx:323`).

**Deploy:** the required argument breaks cloud checkout in both deploy orders until each user
accepts the PWA update prompt. There is a runbook for the day:
[`docs/global/backend/2026-10-08-deploy-runbook-checkout-items-arg.md`](../backend/2026-10-08-deploy-runbook-checkout-items-arg.md).

### Three things the issue and this plan got wrong

The first two are written up in full in the brainstorming log, section *Two things the issue
text got wrong*. They are listed here only so a reader of this document knows they exist.

| # | What was wrong | Where the full version is |
|---|---|---|
| 1 | #336 sketched a scalar `finalQuantity` argument. It cannot work: `checkout` writes **one log row per cart item**, so one scalar cannot carry N numbers. A per-item list was needed | brainstorming log, item 1 |
| 2 | #336 said `packages/types` holds types only. It already exports runtime code — `cartIdFor`, `parseCartId`, `DEFAULT_PACKAGE_UNIT`, `DEFAULT_LOCATION_ID` | brainstorming log, item 2 |
| 3 | **The server schema and the web documents cannot be split into separate tasks or commits.** Found during task 1 | below |

**On #3.** `codegen.ts` has one `generates` block with two outputs, and if a web document
fails to validate against the schema, **neither** output is written. Adding the required
argument to `cart.graphql` while `shopping.graphql` still omitted it failed codegen with:

```
Error 0: Field "checkout" argument "items" of type "[CheckoutItemInput!]!" is required, but it was not provided.
    at .../apps/web/src/apollo/operations/shopping.graphql:60:3
```

The log still printed `✔ Generate to apps/server/src/generated/graphql.ts` before the failure,
which reads like a success and is not one. So the server half could not be built or
type-checked on its own at that commit. Recorded in root `CLAUDE.md`'s *Verification Gate*
section, with the way to check (`grep -c CheckoutItemInput
apps/server/src/generated/graphql.ts`).

### A correction to this plan's own worked example

The plan listed three candidate answers for the fixture `amountPerPackage` 6, 2 packed, 3
unpacked, buying 1, and called the third "the delta added before converting = 2.667".

**That wording is not accurate, and it matters because it names a wrong implementation the
test is supposed to rule out.** 2.667 only comes out if the delta is folded into
`unpackedQuantity` before the conversion: `2 + (3+1)/6 = 2.667`. Adding it to
`packedQuantity` and then converting gives `(2+1) + 3/6 = 3.5` — the **same** answer as the
correct implementation, so the fixture cannot tell those two apart.

**The fixture is still sound.** The two implementations that matter here differ: the correct
one gives **3.5** and the shipped bug gave **6**. The 6 is measured, not predicted — putting
`stock.packedQuantity + stock.unpackedQuantity` back in `cart.resolver.ts` on 2026-10-08
failed the E2E test with `Expected: 3.5 / Received: 6`.

The accurate version of the table is written where it is needed, in a comment in
`e2e/tests/location-scoped-writes.spec.ts` (and again in
`apps/web/src/lib/checkoutQuantities.test.ts`).

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

> **The line numbers in this table are from before the work and are now stale.** The rule
> also moved into its own module — see *What was built* above. Re-check any position here
> rather than trusting it.

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

**Status: ✅ built on 2026-10-08**, branch `feature/cloud-item-note-wikidata`, six commits.
The *Scope* list below is the design as written; *What was built* records where the result
differs from it, and *What the issue and the plan got wrong* records five claims that were
wrong.

Both fields exist in `packages/types`, in `ItemForm`, and in the local Dexie `Item`. Neither
existed in `schema.prisma` or in `item.graphql`. So the client sent a field the schema does
not declare and GraphQL rejected the whole mutation — a cloud user typing a note got a failed
save.

Scope:

1. `note String?` and `wikidataUrl String?` on the Prisma `Item`, plus a migration. Both
   nullable, so it is additive and needs no backfill.
2. Both added to the GraphQL `Item`, `CreateItemInput` and `UpdateItemInput`.
3. Both added to `ItemInput` in `import.graphql` and to `toItemInput`
   (`apps/web/src/lib/importData.ts`), or a cloud backup loses them.
4. Both added to every selection set that lists `Item`'s fields. **Measure the count rather
   than trusting a number.**
5. `createItem` and `buildItemUpdateData` must actually persist them.
6. Remove the `test.skip` at `e2e/tests/item-management.spec.ts:125` and confirm
   `user can persist note and wikidata URL on the Info tab` passes in `cloud`.

**No deploy window.** Adding a field to a type is safe for an old bundle, unlike removing
one. This is the opposite direction from #332's hazard, and the opposite of PR A's.

### What was built

| Commit | What it did |
|---|---|
| `44b3572d` | `note String?` and `wikidataUrl String?` on the Prisma `Item`; migration `20261008000000_add_item_note_and_wikidata_url` (two nullable `ADD COLUMN`, no backfill, no `RAISE EXCEPTION` guard); both fields on the GraphQL `Item`, `CreateItemInput`, `UpdateItemInput` and `ItemInput`; `createItem` and `buildItemUpdateData` persist them |
| `ca80f67c` | `verify-migration.ts` assertions — four per field |
| `8a147c8b` | both fields added to the `GetItem`, `GetItems`, `UpdateItem`, `PantryData` and `ApplyUnitSwitch` selection sets, and to `toItemInput` |
| `b6d4f364` | **a second bug, found and fixed** — `toUpdateItemInput` had no `?? null` guard for these two fields, so a saved value could never be cleared. Plus two unit tests |
| `63f3b919` | an unrelated flaky test fixed — the `OfflineBanner` sync time |
| `eed5f19a` | the `test.skip` removed from `e2e/tests/item-management.spec.ts`, plus a new test `user can clear a saved note and wikidata URL` |

Counts measured on the finished branch: server **359** tests / 25 files, web **2297** / 249
files, `scripts/spec` **70**. `item-management.spec.ts` in the `cloud` project went from
**10 passed / 1 skipped** to **12 passed / 0 skipped**.

### Two resolver decisions that differ from each other on purpose

Both live in `apps/server/src/resolvers/item.resolver.ts`, and getting either one backwards
reintroduces a bug.

| Function | What it does with the input | Why |
|---|---|---|
| `createItem` | uses the file's `strOr` helper, so an absent or null input becomes `undefined`, which Prisma writes as `NULL` | On a create there is no stored value to keep. `NULL` is what "no note" means, and it matches local mode, which stores that by leaving the optional field off the Dexie row. **Never `''`** — that would mean "the user typed a note and cleared it", a different fact |
| `buildItemUpdateData` | passes the value through **raw**, so an explicit `null` clears the column | `strOr` here would map `null` to `undefined`, which the function reads as "leave it alone", and a saved note could never be removed |

### Three selection sets were left without the fields on purpose

Eight web operations list `Item`'s configuration fields. Five got the two new fields; three
did not, and each `.graphql` file carries the reason:

| Operation | File | Decision |
|---|---|---|
| `GetItem` | `items.graphql` | **added** — this is what the Info tab reads back after a save |
| `GetItems` | `items.graphql` | **added** |
| `UpdateItem` | `items.graphql` | **added** — the save's own response |
| `PantryData` → `items` | `itemStocks.graphql` | **added** — its comment promises the set stays identical to `GetItems`, so both agree in the normalized cache |
| `ApplyUnitSwitch` | `itemStocks.graphql` | **added** — its comment promises the set matches `UpdateItem`'s, same reason |
| `CreateItem` | `items.graphql` | **not added.** `toCreateItemInput` never sends them, because no create call site supplies them — the two fields are only ever typed on the Info tab of an item that already exists. The response could only carry `null` for both, and the dialog then navigates to the Info tab, whose `GetItem` runs on `cache-and-network` and reads them anyway |
| `BulkCreateItems` | `import.graphql` | **not added.** What the import sends UP is `ItemInput`, which does carry both. What comes BACK is thrown away: both item calls in `lib/importData.ts` end `.then(() => undefined)`, and all three import strategies finish with `await client.resetStore()`, which empties the cache. Adding the fields would put two more strings per imported item on the wire for nothing. `expirationMode` is absent from this set for the same reason |
| `BulkUpsertItems` | `import.graphql` | **not added**, same reason as `BulkCreateItems` |

### What the issue and the plan got wrong

**1. The plan's table of 8 selection sets was wrong in two rows.** The plan used
`amountPerPackage` as the marker for "this operation lists `Item`'s configuration fields" and
got 8 matches. The real set is also 8, but a different 8.

| The plan said | The truth |
|---|---|
| `shopping.graphql` → `RemoveFromCart` | **`RemoveFromCart` has no `Item` selection set at all.** It is `mutation RemoveFromCart($id: ID!) { removeFromCart(id: $id) }` and returns `Boolean`. The `amountPerPackage` match at `shopping.graphql:60` is inside a **comment**, which PR A added about `CheckoutItemInput` (commit `1a28bc4b`) |
| `items.graphql` → `GetItems`, `GetItem`, `UpdateItem` | the file also carries `CreateItem`, which lists `Item` configuration fields but **not** `amountPerPackage`, so the marker missed it |

`amountPerPackage` was a bad marker: it is absent from one operation that qualifies and present
in one comment that does not. A grep for a field name finds comments as well as code.

**2. `toItemInput`'s return-type guard does not do what #335 and the #332 PR description say
it does.** Both say the guard added in #332 means a key cannot silently go missing. **That is
false for an optional key.** Measured on this branch: with the `note` line deleted from
`toItemInput`, `npx tsc -p tsconfig.app.json --noEmit` exits **0 with zero errors**.

`ItemInputShape` is `{ [K in keyof ItemInput]: ItemInput[K] | undefined }`, and a mapped type
keeps an optional key optional. `note` and `wikidataUrl` are both optional on `ItemInput`, so
dropping either is still a valid value of the type.

| The guard catches | The guard does not catch |
|---|---|
| an **extra** key `ItemInput` does not declare | an **optional** key going missing |
| a missing **required** key | — |

**For an optional field, unit tests are the only guard.** The same mutation turns two of them
red — `user can restore a cloud backup that keeps an item's note and wikidata URL` and
`toItemInput leaves note and wikidataUrl undefined when the backup has neither`, both in
`apps/web/src/lib/importData.test.ts`. The correction is now written in the comment above
`ItemInputShape` and in `docs/features/locations/cloud-locations-status.md`.

**3. The issue's acceptance criterion was not sufficient.** #335 said removing the `test.skip`
**is** the acceptance criterion. The un-skipped test — `user can persist note and wikidata URL
on the Info tab` — fills both fields and reads them back, so it passes against the clearing bug
`b6d4f364` fixed. Measured in the `cloud` project with the two `?? null` guards removed:
**1 failed, 11 passed** — the new clearing test red, the filling test **green**. A criterion
that names a test is only as strong as what that test can fail on. The bug has its own record:
`docs/features/items/2026-10-08-bug-cloud-note-cannot-be-cleared.md`.

**4. The migration count.** There were **12** migrations before this PR, so the new one is the
**13th**. An earlier draft of the plan said 13 and 14th, because `ls apps/server/prisma/migrations | wc -l`
counts `migration_lock.toml` as an entry. Count directories:
`ls -d apps/server/prisma/migrations/*/ | wc -l`. The plan was corrected in `7fc41b1f` before
task 1 ran, so nothing was built on the wrong number.

**5. One prediction in a task brief was wrong about how skips are counted.** It expected
removing the `test.skip` to change the `cloud` project's collected test count. It cannot:
`test.skip(condition, reason)` inside a test body is a **runtime** skip, so Playwright has
already collected the test and `--list` counts it either way. What moves is the runtime
passed/skipped split. Recorded in `e2e/CLAUDE.md`.

### `verify-migration.ts` — four assertions per field, and why the second one matters

`ca80f67c` added them. They are **not** executed by any gate, and #333 in PR C is what will
run them.

| # | Assertion | What it catches |
|---|---|---|
| 1 | the column is present on `Item` | the migration did nothing |
| 2 | the column is **absent** from `ItemStock` | the migration hit the **wrong table** |
| 3 | `information_schema` reports `text` and `is_nullable = YES` | a `NOT NULL`, or the wrong type |
| 4 | a row inserted with neither column set reads back `NULL`, not `''` | a `DEFAULT ''` on the column |

**Half 2 is the one that is easy to skip and should not be.** `Item` and `ItemStock` share
field names, which is exactly why #332's drop migration needed the same two halves in the
other direction. A presence-only check on one table passes just as happily against a migration
aimed at the other. Both of these fields are global item configuration, never per-location
state, so `ItemStock` must not carry them.

A fifth assertion writes both columns and reads the exact strings back, so assertion 4 cannot
pass by the columns simply being unwritable.

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
| PR B's `verify-migration.ts` assertions have never been executed | Owed to #333, in PR C. Nothing in the gate runs that script |
| PR B's migration is applied to the dev and E2E databases, not to production | Railway runs `prisma migrate deploy` as its release command, so it reaches production on merge. Not yet verified there |
| No cloud E2E test covers `note` or `wikidataUrl` through the IMPORT path | `toItemInput` carries both and two unit tests guard it, but `settings/import-export-cloud.spec.ts` asserts neither field. Unit tests are the only guard for either one |
| `CreateItem`, `BulkCreateItems` and `BulkUpsertItems` do not select the two fields | On purpose, with the reason in each `.graphql` file. A future call site that needs the value in the create response must add it |
