# Brainstorming — resolving the four cloud-parity findings (#333–#336)

**Date:** 2026-10-08
**Branch:** work starts on `fix/checkout-log-quantity`
**Input:** issues #333, #334, #335, #336 — the four findings from the cloud-locations
parity audit that followed PR 5 (#332). The other four findings from that audit were
small and were fixed in #338.

## Why these four were brainstormed together

They came from one audit, they all sit in the same milestone, and two of them touch the
same database. #333 wipes the cloud E2E database with `migrate reset`, and #335 adds a
migration. So the order they are done in changes what #333 actually proves.

They are four different kinds of work, which is the main thing the grouping had to respect:

| Issue | Kind of work |
|---|---|
| #333 | An operational run, plus a small guard change |
| #334 | Two new E2E specs |
| #335 | A feature, including a Prisma migration |
| #336 | A bug fix that changes what a stored number means |

## Questions asked, and the answers

### 1. For #336, which implementation becomes the correct one?

Three options were offered: the server reads `Item.amountPerPackage` and converts; the
client computes the number and sends it; or local mode is changed to log the raw sum.

**Answer: the client computes it and sends it.**

The recommendation had been the server-side one, because it keeps the server authoritative
and a stale client cannot write a wrong number. The user chose the client-side option, which
matches what `consumeRecipes` already does.

### 2. What happens to cloud log rows already written with the raw sum?

**Answer: measure first, then decide.** Run a read-only count against production of logs
whose item has an `amountPerPackage`. If the count is zero the question closes itself. If it
is not zero, come back with the number before writing any data migration.

### 3. How should the four be grouped and ordered?

**Answer: three PRs.**

| PR | Contents |
|---|---|
| A | #336 — the checkout log quantity |
| B | #335 — `note` and `wikidataUrl` on the cloud side, with its migration |
| C | #334 — the two import-strategy specs — and #333 — the verify run and the guard |

#333 goes last on purpose. `verify:migration` replays every committed migration, so running
it after PR B means it also proves PR B's new migration, and one cloud E2E run covers both.

### 4. How much of #334 should this cover?

**Answer: both specs** — the cheap `clear` path through `DataModeCard`, and the
`ImportCard` conflict dialog for `replace`. Not the #330 fix; that stays its own issue.

`replace` is the only path that reaches #330, so covering only the cheap spec would leave
that defect guarded by unit tests alone.

### 5. Should #333's guard be widened?

**Answer: yes — deny-list every non-test database URL.** `verify-migration.ts` drops and
recreates a schema, and its only check today is that `TEST_DATABASE_URL` differs from the two
dev variables. A `PROD_COPY_DATABASE_URL` sits in the same `.env` file. The script will now
refuse to run if `TEST_*` resolves to the same host and database as any other `*_URL` in the
environment, comparing host and database name rather than the raw string.

### 6. For #336, should the new argument be optional or required?

This question was asked because the app is a PWA with `registerType: 'prompt'`, so a client
keeps its cached bundle until the user accepts an update. A required argument therefore
breaks checkout for a client that has not updated.

**First answer: required, with a deploy window.**

That answer could not be carried out as stated, for a reason that had to be checked and
reported back:

| Combination | Result with a required argument |
|---|---|
| old client, new server | the argument is missing — validation error |
| new client, old server | the argument is **unknown** — validation error |

Both orders fail, so no deploy order avoids the break. Railway and Cloudflare Pages also both
deploy from the same merge to `main`, so the order inside one PR is not controllable.

The question was asked again with that fact stated, offering an expand-then-contract rollout
that reaches a required argument safely in three steps.

**Final answer: required now, and the breakage is accepted.**

## Decision

**#336 ships a required argument in one PR. Checkout will fail for any cloud client that has
not accepted the service-worker update prompt, until it does.** The user was told this twice,
in those terms, and chose it both times. It is recorded here and in the design doc so that
nobody later reads the broken checkout as an unforeseen bug.

## Two things the issue text got wrong, found while brainstorming

**1. `checkout(cartId: ID!, finalQuantity: Float!)` cannot work.** #336 sketched a single
scalar argument. `checkout` is a per-**cart** mutation: it loops over every active cart item
and writes one `InventoryLog` row for each, each with its own quantity. One scalar cannot
carry N numbers.

The shape it needs already exists in this repo. `consumeRecipes` takes
`ConsumeRecipesItemInput`, a per-item list carrying `itemId`, the two quantities, `delta` and
`quantity` — the converted total — all computed by the client. #336 mirrors that. This does
not change the decision in question 1; it is the correct form of it.

**2. `packages/types` already holds runtime code.** #336 said the shared home for
`getPackedTotal` would be `packages/types` "if it moves", as though that package held types
only. It already exports `cartIdFor`, `parseCartId`, `DEFAULT_PACKAGE_UNIT` and
`DEFAULT_LOCATION_ID`. This mattered for the server-side option, which was not chosen, so it
is recorded rather than used.

**3. #335's count of selection sets looks wrong.** The issue says eight, "`items.graphql`'s
four and `itemStocks.graphql`'s two". Counting `amountPerPackage` as the marker gives
`items.graphql` **3**, `itemStocks.graphql` **2** and `import.graphql` **2**. PR B measures
this itself rather than trusting either number.

## What the user gets

Nothing from this document. It records decisions.

## What the developer gets

- The order of the three PRs, and the reason #333 is last rather than first.
- A written record that #336's broken checkout was chosen, not overlooked.
- Two errors in the issue text corrected before any code was written against them.

## Related

- #332 — cloud-locations PR 5, after which the audit ran
- #338 — the four small findings from the same audit, already merged
- #330 — reachable only through the `replace` strategy, so only #334's second spec can catch it
