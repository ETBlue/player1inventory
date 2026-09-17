# Brainstorming — PR 3b: the cart re-key

**Date:** 2026-09-17
**Design:** `2026-08-30-cloud-locations-design.md` §4.6, §4.7, §5, §8 Amendment
**Status:** `cloud-locations-status.md`

## What PR 3b is

The destructive half of PR 3. It splits the shared `'no-vendor'` cart, re-keys
`Cart.id` to `${locationId}:${vendorId}`, and rewrites every cart resolver to
match. PR 3a added `Cart.locationId` for this to build on.

## Question 1 — how to handle the deploy window

**The re-key breaks the app in either deploy order.**

| Order | What happens |
|---|---|
| Migration first, old server live | `vendorCart` looks up a bare id, finds nothing, falls into `create`, makes a **duplicate cart** under the old shape. Silent. |
| New server first, migration not run | `vendorCart` looks up a composite id, finds nothing, creates one, while every existing cart and its items are orphaned. Silent. |

Three options were considered: accept a short window, dual-read both id shapes
during a transition, or add a maintenance mode.

**Answer: accept a short window.**

Production has one user and 19 `CartItem` rows. There is no CI, so both steps are
run by hand and the gap is controlled. The PR ships a **deploy runbook** naming
the exact order and the rollback.

Dual-read was rejected for a specific reason, not just cost: a fallback that
silently reads the wrong id shape is the same class of hazard as the nullable
`locationId` PR 3a had to remove one task after adding. A read that quietly
returns the wrong thing is worse than one that fails.

## Question 2 — when are vendor carts created? Not open after all

Local mode already decides this, and cloud parity is the requirement.

`createVendor` (`apps/web/src/db/operations.ts:968`) pre-creates the cart for the
**active location only**. Carts for other locations come from `bootstrapCarts`
(`operations.ts:864`), called from `ActiveLocationProvider` when the active
location changes.

The comment there is explicit that this is **not** done lazily from a read path.
Cloud must copy that shape. Nothing to decide.

## What the rehearsal can and cannot prove

Rehearsal 2's read-only half, run 2026-09-16, measured production:

| Metric | Value |
|---|---|
| Accounts with a `CartItem` on the shared `'no-vendor'` row | **0** |
| `Cart` rows with id exactly `'no-vendor'` | 1 |
| `Cart` rows containing `':'` | 0 |
| `Cart` total | 37 |
| `CartItem` total | 19 |

**So a production rehearsal cannot exercise the split step at all.** It will
re-key 37 carts and repoint 19 cart items, and the split loop will do nothing
because no second user has rows on the shared cart.

A green rehearsal proves the re-key works on real data. It says nothing about the
split. **The multi-user synthetic fixture is the only thing that tests the
split**, and PR 3b must not report a green rehearsal as covering both. PR 3a made
the same distinction for its cross-user assertions.

## The ordering constraint that is easy to get wrong

Design §5: the split must run **before** the §4.7 re-key. If the re-key runs
first, every user's cart items on the shared row get dragged into whichever user
happens to own that row.

And within the re-key, `CartItem` is updated **before** `Cart`, so it can still
join on the old id:

```sql
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_cartId_fkey";
UPDATE "CartItem" ci SET "cartId" = c."locationId" || ':' || c."id"
  FROM "Cart" c WHERE ci."cartId" = c."id";
UPDATE "Cart" SET "id" = "locationId" || ':' || "id";
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey"
  FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE;
```

## Scope

| In | Out |
|---|---|
| The `'no-vendor'` split and the composite re-key | `applyUnitSwitch` — PR 3c |
| Cart resolvers on `cartIdFor` / `parseCartId` | `removeItemFromLocation`'s cascade — PR 3c |
| `createVendor` and a cloud `bootstrapCarts` equivalent | Import / export — PR 4 |
| Real `locationId` for `checkout`, `consumeRecipes`, `mirrorItemStockToItem` | Dropping `Item`'s five columns — PR 5 |
| The two `!isCloud` partition bypasses | |
| A multi-user synthetic fixture for the split | |
| A rehearsal against a fresh production copy | |
| A deploy runbook | |
