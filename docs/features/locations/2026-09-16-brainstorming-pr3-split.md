# Brainstorming — splitting PR 3 (cloud locations)

**Date:** 2026-09-16
**Design:** `2026-08-30-cloud-locations-design.md`
**Status doc:** `cloud-locations-status.md`

## Starting point

The design describes PR 3 as one PR: migration §4.5-4.7, composite cart ids,
location-scoped logs, `checkout` and `consumeRecipes` as transactions,
`applyUnitSwitch`, `removeItemFromLocation`'s cascade, and removing the two
surviving `!isCloud` partition bypasses.

For scale: PR 2 was 23 commits across 114 files, and it carried no migration.
PR 3 carries a **primary-key re-key**.

## Question 1 — one PR or several?

**Answer: split it. The migration goes first, on its own.**

The reason is review and revert. A primary-key re-key inside a 100-file diff
cannot be read line by line, and cannot be reverted without taking everything
else with it.

## Question 2 — the first split does not work, and here is why

The first plan was: PR 3a = the whole migration, PR 3b = the resolvers.

**That breaks the moment it merges.** `cart.resolver.ts:12`:

```ts
const cartId = vendorId ?? 'no-vendor'
let cart = await prisma.cart.findUnique({ where: { id: cartId } })
if (!cart) cart = await prisma.cart.create({ data: { id: cartId, userId } })
```

The migration re-keys `Cart.id` to `${locationId}:${vendorId}`. After that this
lookup finds nothing, falls into the `create`, and **silently makes a duplicate
cart under the old-style id**. No error is raised anywhere.

So the re-key and the cart resolver rewrite are coupled:

| Where | What breaks |
|---|---|
| The dev database | The first `migrate dev` after merge |
| Cloud E2E | Every cart spec |
| Production | Only if `migrate deploy` runs before the new server ships. There is no CI — migrations are run by hand — so that timing is under human control. Dev and E2E are not. |

**Answer: split the migration by additive versus destructive**, which is the
pattern PR 1 → PR 5 already uses. PR 1 added columns, PR 5 drops them.

## The agreed split

| PR | Contents | Why it can stand alone |
|---|---|---|
| **3a** | The **additive** migration only: add, backfill and constrain `InventoryLog.locationId` and `Cart.locationId`. No re-key. Plus location-scoped inventory logs, client and server. | Every existing query keeps working. `Cart.locationId` is written and read by nothing yet. |
| **3b** | The `'no-vendor'` split, the composite re-key, the cart resolvers, `checkout`, `consumeRecipes`, and the two `!isCloud` partition bypasses. | These are coupled by the re-key and cannot be separated. |
| **3c** | `applyUnitSwitch` and `removeItemFromLocation`'s cloud cascade. | Both are new features, not location-scoping changes. Neither is blocked by the other two. |

## What each PR owes the rehearsal

Rehearsal 2's read-only half already ran on 2026-09-16 and is recorded in the
status doc. The migration half splits with the PRs:

- **PR 3a** rehearses its own additive migration against a fresh production copy.
- **PR 3b** rehearses the re-key separately. That is the one where the
  `'no-vendor'` count matters, and today's measurement says **0 accounts** hold a
  `CartItem` on the shared row, so the split step will touch **1 `Cart` row and 0
  `CartItem` rows** on current production data.

**With 0 affected accounts, the production rehearsal cannot exercise the split
step at all.** A multi-user synthetic fixture is what tests it. Recording this
now so PR 3b does not read a green rehearsal as proof the split works.

## An open item for PR 3a's design

Location-scoped logs change the GraphQL surface. Local mode's `getItemLogs`
filters on `(log.locationId ?? DEFAULT_LOCATION_ID) === locationId`. Cloud must
match.

That means the logs query gains a `locationId` argument and the client starts
passing the active location. So PR 3a is additive in the **database** but not in
the **API**. That is fine, because the API change ships with its own client in
the same PR. It is written down here so nobody later reads "additive migration"
as "no client change".
