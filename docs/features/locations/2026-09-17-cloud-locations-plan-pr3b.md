# Plan — PR 3b: the cart re-key

**Date:** 2026-09-17
**Branch:** `feature/cloud-locations-pr3b`
**Worktree:** `.worktrees/feature-cloud-locations-pr3b`
**Design:** `2026-08-30-cloud-locations-design.md` §4.6, §4.7, §5, §8 Amendment
**Brainstorming:** `2026-09-17-brainstorming-pr3b.md`
**Status:** `cloud-locations-status.md`

Six tasks. Each ends with the full verification gate from root `CLAUDE.md`.

## What makes this PR different

It re-keys a **primary key**. Everything else follows from that.

**The migration and the cart resolvers cannot land in separate commits that each
pass their own gate.** `cart.resolver.ts` looks a cart up by the bare
`vendorId ?? 'no-vendor'`. After the re-key that lookup finds nothing, falls into
its `create` branch, and silently makes a duplicate cart under the old shape. The
TypeScript build stays green — `Cart.id` is a `String` either way — so nothing
catches it except tests. Task 1 therefore carries both.

**The deploy window is accepted, not engineered away** (decided 2026-09-17).
Production has one user and 13 `CartItem` rows. Task 6 writes the runbook.

## Standing rules

- **Never print a database connection string or a database hostname** into a
  report, a commit, a doc, or quoted output.
- `apps/server/.env` is gitignored and stays that way.
- **Never write `row.userId === ctx.userId` as an authorization check.** Route
  through `requireLocationRole` (`apps/server/src/lib/authz.ts`).
- `ItemStock` must never gain a `userId` column.
- **Never point `pnpm verify:migration` at a production copy.** It opens with
  `migrate reset`. It is written for `TEST_DATABASE_URL`.
- Read `apps/server/prisma/CLAUDE.md` before touching a migration.
- Before any Playwright run, check ports 5175, 5174 and 4001 are free and stay
  free for about 90 seconds. Never kill another session's server.
- **Do not narrow the E2E run with `--grep`.** It silently skips whole spec
  files. Pass positional spec paths, or run everything.
- **8 E2E tests are already red on `main`** — `item-list-state-restore.spec.ts`,
  4 local and 4 cloud, issue #280. That is the baseline. Any ninth failure is
  yours.

---

## Task 1 — The migration and the cart resolvers, together

### Step 1.1 — Make the id helpers usable from the server

`cartIdFor` and `parseCartId` already exist in `packages/types/src/index.ts:158-174`
and handle a vendor id containing `':'` by splitting on the first colon only.

Check whether `apps/server` can import from `@p1i/types` today. If it can, use
them. If it cannot, say so and decide — a second copy of this logic on the server
is a real risk, because the two would drift and the splitting rule is subtle.

### Step 1.2 — The migration

Two phases, in this order. **The order is the whole correctness argument.**

**Phase A — split the shared `'no-vendor'` cart (design §5).** For each distinct
`userId` among `CartItem`s pointing at `'no-vendor'`, create
`${theirDefaultLocationId}:no-vendor` and repoint their rows.

This must run **before** phase B. If the re-key runs first, every user's cart
items on the shared row are dragged into whichever user happens to own it.

**Phase B — the re-key.** `CartItem` first, so it can still join on the old id:

```sql
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_cartId_fkey";
UPDATE "CartItem" ci SET "cartId" = c."locationId" || ':' || c."id"
  FROM "Cart" c WHERE ci."cartId" = c."id";
UPDATE "Cart" SET "id" = "locationId" || ':' || "id";
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey"
  FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE;
```

**Add a guard**, as PR 3a's migration did. After phase B, no `Cart.id` may lack a
`':'`, and no `CartItem.cartId` may point at a missing `Cart`. Raise with a
readable message naming what was left behind. PR 3a proved the guard earns its
place: with it, `P0001` naming the affected users; without it, a bare `23502`.

**Add the migration to the `MIGRATIONS` list in
`apps/server/scripts/verify-migration.ts`**, and add assertions for it. The script
parks migrations by name; a missing name means `migrate reset` replays this
migration against a database that lacks what it needs. PR 3a hit this.

### Step 1.3 — The cart resolvers

`apps/server/src/resolvers/cart.resolver.ts`. Every cart id becomes
`cartIdFor(locationId, vendorId)`. `vendorCart` gains a `locationId`; so does
anything else that names a cart.

**Authorization.** A caller-supplied `locationId` goes through
`requireLocationRole`. Reads want `viewer`, writes want `member`.

Two of the four `PR 3b:` markers are here — `cart.resolver.ts:16` and the
`checkout` one. Remove a marker only when you have done what it names.

### Multi-user fixture — the only thing that tests the split

**A production rehearsal cannot exercise phase A.** Measured 2026-09-16:
production has **0 accounts** with a `CartItem` on the shared row. The split loop
will do nothing there.

So the synthetic fixture must have **at least two users with cart items on
`'no-vendor'`**, each with their own default location, plus a third user with
none. After the migration:

| Assertion |
|---|
| Each user's items point at **their own** `${locationId}:no-vendor` |
| No user's items moved to another user's cart |
| The original shared `'no-vendor'` row no longer exists under that id |
| Cart and cart-item **counts** are unchanged |

### Mutation checks (required)

| # | Mutation | What must go RED |
|---|---|---|
| 1 | Run phase B before phase A | the multi-user split assertions |
| 2 | Update `Cart` before `CartItem` in phase B | the FK / orphan assertion |
| 3 | Delete the guard | prove the message gets worse, as PR 3a did — report both texts |
| 4 | `vendorCart` looks up the bare id again | a resolver test |

---

## Task 2 — Vendor carts, at the right time

Local mode decides this and cloud copies it. `createVendor`
(`apps/web/src/db/operations.ts:968`) pre-creates the cart for the **active
location only**. Other locations come from `bootstrapCarts` (`operations.ts:864`)
when the active location changes. The comment there says explicitly that this is
**not** done lazily from a read path.

`vendor.resolver.ts:19` is the third `PR 3b:` marker.

Cloud needs the same two halves: a cart at vendor-creation time for the caller's
active location, and something equivalent to `bootstrapCarts`. Decide where the
second half lives and say why.

### Mutation check

Delete the bootstrap half. A test that creates a vendor, switches location, and
expects that vendor's cart to exist there must go RED.

---

## Task 3 — Real `locationId` for the three write paths

| Site | Today |
|---|---|
| `checkout` (`cart.resolver.ts`) | the caller's default location |
| `consumeRecipes` (`recipe.resolver.ts`) | the caller's default location |
| `mirrorItemStockToItem` (`lib/stockDualWrite.ts`) | the caller's default location |

`checkout` can read the location from the cart it is checking out, once Task 1
lands. `consumeRecipes` cannot — `ConsumeRecipesInput` carries no location, so it
needs one, which means a schema change and a client change together.

This closes the limitation PR 3a shipped: a checkout made while viewing the
Garage is currently logged against the Kitchen.

`grep -rn "PR 3b:" apps/server/src` must return **0** when this task is done.

### Mutation check

Make `checkout` write the default location again. A test that checks out at a
non-default location and reads the log back there must go RED.

---

## Task 4 — Web client, and the two bypasses

**Step 4.1.** `apps/web/src/hooks/useShoppingCart.ts` — 537 lines, 16 `isCloud`
branches. Cloud cart ids become composite.

**Step 4.2. Writes resolve the location at call time.** Use
`useCloudLocationId()`. On a fresh cloud session the active id is the `'local'`
sentinel until `GetLocations` resolves; a read self-corrects, a write gets
`FORBIDDEN` and is lost. This cost PR 2 thirteen E2E specs.

**Step 4.3. Reads need the gate.** `useCloudLocationKnown()`
(`apps/web/src/hooks/useCloudLocationKnown.ts`) — PR 3a needed this the moment it
made `locationId` required, or a read in the fresh-session window gets
`FORBIDDEN` and Apollo parks it as a live observer.

**Step 4.4. Cache keys.** Any cloud query scoped by location needs `locationId`
in its `keyArgs`, or switching location serves another location's cart from
cache. PR 3a added three entries in `apps/web/src/apollo/client.ts`.

**Step 4.5. Remove the two `!isCloud` partition bypasses:**

| Site | Code |
|---|---|
| `apps/web/src/routes/shopping/index.tsx:166` | `!isCloud && (vendorCartCounts.get(vendorId)?.count ?? 0) === 0` |
| `apps/web/src/routes/cooking.tsx:180` | `!isCloud && getAvailableRecipeItems(recipe).length === 0` |

**Step 4.6.** Remove the two `test.skip` guards in
`e2e/tests/location-not-stocked-here.spec.ts` that those bypasses forced, and add
the spec's remaining cases to the cloud run. Their skip reason names PR 3b.

### Mutation check

Restore one bypass. The cloud E2E case that Step 4.6 unskipped must go RED.

---

## Task 5 — Rehearsal against a production copy

The copy is already in place and checked (2026-09-17). Confirm again before
writing — `prisma migrate status` with and without the override must report
**different hosts**. A silent fallback applies the migration to the dev database
and still prints success.

**This copy does not have PR 3a's migration**, because production has not been
deployed yet. So `migrate deploy` applies **both** `20260916000000` and this PR's.
That is realistic — it is what the real deploy will do — but record the before
state accordingly.

**Before state:** counts, and a **sha256 of each sorted id set** — `Cart.id`,
`CartItem.id`, `CartItem.cartId`. PR 3a used hashes so "unchanged" was provable.
Here the cart hashes **must change**, which is the opposite of PR 3a. Record both
values.

**Assertions after:**

| Assertion |
|---|
| Every `Cart.id` contains `':'` |
| Every `CartItem.cartId` names an existing `Cart` |
| Cart and cart-item counts unchanged |
| Every cart's `locationId` prefix matches its own id |
| No cart belongs to a location owned by another user |

**Name which assertions cannot fail on this data.** Production has one user, so
the cross-user ones are trivially satisfied, and **phase A will do nothing** —
zero accounts have items on the shared row. Say that plainly. The multi-user
fixture from Task 1 is what tests the split.

Tell the user to delete the Neon branch afterwards.

---

## Task 6 — Docs, runbook, gate, full E2E

**Step 6.1. The deploy runbook.** A new doc, or a section in the status doc.
It must name: the exact order, the expected downtime, how to tell it worked, and
the rollback. The rollback is the hard part — a re-key has no `migrate down`, so
say honestly what recovery looks like (restore from a Neon branch taken
immediately before).

**Step 6.2.** Update `cloud-locations-status.md`, `docs/INDEX.md`, and any
`CLAUDE.md` whose content this changes.

**Step 6.3.** Full verification gate.

**Step 6.4.** `pnpm test:e2e` — everything, no `--grep`. Expected: the 8 known
issue #280 failures and **nothing else**, minus any cases Step 4.6 unskipped,
which must now pass.

### Report

- gate results command by command
- E2E counts, with the failures named individually
- what PR 3c and PR 4 still owe
