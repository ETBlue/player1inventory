# Deploy runbook — households H3b (shared carts, one migration, two breaking inputs)

**Date written:** 2026-11-15
**Migration:** `apps/server/prisma/migrations/20261114000000_shared_carts/migration.sql`
**Branch:** `feature/households-h3b`
**Plan:** [`../permissions/2026-11-14-households-plan-h3b.md`](../permissions/2026-11-14-households-plan-h3b.md) (task B.10)
**Design:** [`../permissions/2026-11-14-households-h3b-design.md`](../permissions/2026-11-14-households-h3b-design.md), section *Deploy*
**Runs together with:** [`2026-11-11-deploy-runbook-households-h3a.md`](2026-11-11-deploy-runbook-households-h3a.md)

## Why this is a second file, run in the same release as H3a

H3a is merged into `develop` and **not deployed**. Nothing reaches `main` until a
checkpoint release (households plan, *How this plan is split*: "for example after H3b").
So the next checkpoint release carries **three** migrations, H3a's two and this one:

| Order | Migration | Runbook |
|---|---|---|
| 1 | `20261104000000_add_households` | H3a |
| 2 | `20261111000000_drop_user_scope` | H3a |
| 3 | `20261114000000_shared_carts` | this file |

This file is an **addendum** to the H3a runbook, not a replacement:

- The H3a runbook keeps its own rehearsal record from 2026-11-12. Rewriting it would mix two
  rehearsals of different code.
- The H3a runbook says (top, *When this runbook runs*): if the release carries more
  migrations, run its rehearsal again on a fresh branch with every new migration. This
  file says where H3b's steps go in that run.
- If the owner ever releases H3a alone (before H3b merges), the H3a runbook still works
  by itself.

**Follow the H3a runbook from top to bottom. At each step named below, also do the H3b
step.**

**Rule for every step: never paste a database connection string or a database hostname
into a chat, a commit, a document, or a screenshot.** Use the variable names only:
`DATABASE_URL`, `DIRECT_URL`, `PROD_COPY_DATABASE_URL`, `PROD_COPY_DIRECT_URL`.

**Who does what:** the same as the H3a runbook. "Owner" is ETBlue. "Main session" is the
Claude session in the worktree, and only with the owner's consent for each command that
touches a database.

Every `TBD after rehearsal` is filled in by the main session after the rehearsal. Every
`TBD on deploy day` is filled in on the day.

---

## 0. The order, on one page (H3a and H3b together)

| # | Step | Who | Where |
|---|---|---|---|
| 1 | Check the live web build (#359) | owner | H3a 2.1 |
| 2 | Count the devices, **local-mode devices too** | owner | H3a 2.2, and 2.1 below |
| 3 | Rehearse all three migrations on ONE fresh branch of production | main session, owner's consent | H3a 3, and 3 below |
| 4 | Take a Neon branch of production on deploy day (the rollback) | owner | H3a 4.1 |
| 5 | Turn off Railway's automatic deploy | owner | H3a 4.2 |
| 6 | Merge `develop` into `main`. Wait for Cloudflare. Update every device | owner | H3a 4.3, and 4.1 below |
| 7 | **At once:** deploy the server on Railway. Watch the release log | owner | H3a 4.4, and 4.2 below |
| 8 | Check the database (read-only) | owner or main session | H3a 5, and 5 below |
| 9 | The manual smoke test | owner | H3a 6, and 6 below |
| 10 | Turn Railway's automatic deploy back on | owner | H3a 4.5 |

> **Changed on 2026-11-17 (owner decision, option 4): for the households release the
> SERVER goes first.** The server now keeps, for one release, every field `main`'s old web
> bundle sends (`Location.isDefault`, the old checkout and cooking inputs), so an old bundle
> works on the new server. Follow section 8.3 of
> [`2026-11-17-deploy-runbook-households-h4.md`](2026-11-17-deploy-runbook-households-h4.md)
> for the order. The text below is the reasoning before that decision.

**The web still goes first** (H3a 1.3: an old bundle against the new server breaks every
location query). **But with H3b the gap between step 6 and step 7 must be short.** During
that gap, checkout and cooking do not work (section 1.2).

---

## 1. What changes, and what breaks if it goes wrong

### 1.1 The data

`20261114000000_shared_carts` runs as one transaction:

| Step | What it does |
|---|---|
| lock | `LOCK TABLE "CartItem" IN EXCLUSIVE MODE` (reads still work, writes wait) |
| 1 | Merges `CartItem` rows with the same `("cartId", "itemId")`. The row with the lowest `id` (text order) stays. Its `quantity` becomes the sum of the group. Its own `userId` ("added by") stays. The other rows of the group are deleted |
| 2 | `CREATE UNIQUE INDEX "CartItem_cartId_itemId_key"` |
| 3 | `DROP INDEX "CartItem_cartId_idx"` (plan decision P2: the unique index starts with `cartId`) |
| 4 | `DROP INDEX "Cart_userId_idx"` and `ALTER TABLE "Cart" DROP COLUMN "userId"` |

`CartItem.userId` stays. It now means "added by" and is never a scope.

If any statement fails, nothing of this file is applied. **But it is a third transaction**:
if it fails, H3a's two migrations stay applied (see section 7).

Proved against real SQL by `verify:migration` on the TEST database on 2026-11-15, with the
owner's consent (commit `e9ba830f`): a duplicate pair with different amounts and
`userId`s, a group of three, a cart with no duplicates, the same item in another cart, the
unique index refusing a second row, the old indexes gone, and `Cart.userId` gone while
`CartItem.userId` stays. **Never point `verify:migration` at a copy of production.** It
drops the schema.

### 1.2 The GraphQL schema: two inputs change shape. Old bundles break

Two input types change. The owner accepted the break on 2026-11-15: "it's ok for old app
versions to break since I'm the only one user for now". No server accepts both shapes.

| Input | Before | After |
|---|---|---|
| `CheckoutItemInput` (`checkout`) | `{ itemId, packedQuantity, unpackedQuantity, quantity }`, the client's stock total per item | `{ cartItemId, quantity }`, the rows the screen showed and their amounts |
| `ConsumeRecipesItemInput` (`consumeRecipes`) | `itemId`, `packedQuantity`, `unpackedQuantity`, `delta`, `quantity`, `note`, `logKey`, `logParams` | `itemId`, `delta`, `note`, `logKey`, `logParams` |

Only the variables change, so the document text of `Checkout` hardly moves and
`ConsumeRecipes` does not move at all. GraphQL still refuses the request, because the
variable values no longer match the input type.

| Bundle | Server | Checkout and cooking |
|---|---|---|
| old | old | work |
| **new** | **old** (the gap between 4.1 and 4.2) | **fail.** The new bundle sends fields the old input type does not have |
| **old** | **new** (a device that did not update) | **fail.** The old bundle sends fields the new input type does not have |
| new | new | work |

So there is no order that keeps checkout and cooking working the whole time. The web goes
first anyway (H3a 1.3), and the server follows **at once**. **Do not check out or cook
until the server deploy is active and the device has reloaded.** Nothing else in H3b
changes a document the old server cannot answer.

The new server can also refuse a checkout with the error code `CART_CHANGED` (the screen
was out of date). The new bundle shows the toast "This cart changed. Please check and try
again." An old bundle has no such text. It would show a plain error, but it already fails
on the input shape first.

### 1.3 The `Cart.userId` drop window

From the moment `shared_carts` commits until Railway switches to the new server, the OLD
server still serves. The old server writes `Cart.userId` whenever it creates a cart
(`vendorCart`, `bootstrapCarts`, `createVendor`). Those writes fail in that window, because
the column is gone. Changing the active location or opening a new vendor's cart then
shows an error.

This is the same kind of window H3a has for its own column drops. It is why the owner turns
off auto-deploy, merges when nobody uses the app, and watches the release. Nothing needs
to be repaired after it: a failed cart create writes nothing, and the new server creates
the cart on the next request.

The migration also holds an `EXCLUSIVE` lock on `CartItem` while it runs. An old-server
`addToCart` at that moment waits for it. With nobody using the app, that does not happen.

### 1.4 Local mode: Dexie versions 19 and 20

Local mode does not call the server, so the release order does not matter to it. But the
new bundle carries two new Dexie versions. They run **on each local-mode device the first
time it opens the new bundle**:

| Version | What it does |
|---|---|
| 19 | Merges `cartItems` rows with the same `(cartId, itemId)`: the lowest id stays, with the sum. Same stores as 18 |
| 20 | Adds the unique compound index `&[cartId+itemId]` on `cartItems` |

They are two versions on purpose: Dexie builds a version's new indexes before it runs that
version's upgrade, so one version would build the unique index over duplicates and the
open would fail (`AbortError`, measured in task B.8). A fresh database opens straight at
version 20.

Covered by `apps/web/src/db/upgradeV19V20.test.ts` (a version-18 database with duplicates,
a fresh database, two adds at once). Never run on a real device yet. **Nothing can be
rolled back on a device**: Dexie never goes down a version. A device that opens the new
bundle keeps version 20 even if the web is rolled back, and an old bundle then cannot open
the database (Dexie refuses a version lower than the stored one).

---

## 2. Before the deploy day

### 2.1 Count the local-mode devices too

**Owner**, with H3a 2.2. H3a only needs the cloud devices. H3b also changes local mode
(1.4), so also write down every browser and PWA that uses **local** mode. Section 4.1
checks each one.

Result: `TBD on deploy day`.

---

## 3. The rehearsal (one fresh branch, all three migrations)

**Main session, with the owner's consent.** Use the H3a runbook's section 3 with these
changes. **Use a fresh branch made for this release.** The H3a rehearsal branch of
2026-11-12 had migrations applied and was deleted; it cannot rehearse anything again.

### 3.1 Changes to H3a 3.1 (the branch and the pending list)

- Name the branch `prod-rehearsal-checkpoint-<date>`.
**If the release also carries H5b, the count here is one more** (a fourth migration, `20261118000000_add_household_invites`). See section 9.2 of the [H4 runbook](2026-11-17-deploy-runbook-households-h4.md).

- The run with the override must list **exactly three** pending migrations:
  `20261104000000_add_households`, `20261111000000_drop_user_scope` and
  `20261114000000_shared_carts`. If it lists more, stop and find out why.

Result: `TBD after rehearsal` (hosts different or same; the pending list).

### 3.2 NEW, before any migration: the cart counts

Run on the rehearsal branch **before H3a 3.3**. All four are read-only. Keep the output:
3.5 compares against it.

```sql
-- H3b-A. Duplicate (cartId, itemId) groups, and the rows step 1 will delete.
--        rows_to_delete = rows_in_groups - groups.
SELECT count(*)                AS groups,
       coalesce(sum(n), 0)     AS rows_in_groups,
       coalesce(sum(n - 1), 0) AS rows_to_delete
FROM (
  SELECT count(*) AS n
  FROM "CartItem"
  GROUP BY "cartId", "itemId"
  HAVING count(*) > 1
) d;

-- H3b-B. The groups themselves, to check by hand after the merge.
--        The row with keep_id must have quantity = total afterwards.
SELECT "cartId", "itemId", count(*) AS n, min("id") AS keep_id,
       sum("quantity") AS total
FROM "CartItem"
GROUP BY "cartId", "itemId"
HAVING count(*) > 1
ORDER BY "cartId", "itemId";

-- H3b-C. Bare-id carts (#361): carts whose id does not start with
--        "<their own locationId>:". H3b does not fix them; this only counts them.
SELECT count(*) AS carts_not_keyed_by_their_location
FROM "Cart" c
WHERE left(c."id", length(c."locationId") + 1) <> c."locationId" || ':';

-- H3b-D. Totals that the merge must keep.
SELECT (SELECT count(*) FROM "Cart")                     AS carts,
       (SELECT count(*) FROM "CartItem")                 AS cart_items,
       (SELECT coalesce(sum("quantity"), 0) FROM "CartItem") AS cart_item_quantity_sum;
```

What to do with the answers:

| Query | Expected | If not |
|---|---|---|
| H3b-A | any number. Write it down | — |
| H3b-B | one line per group in H3b-A | — |
| H3b-C | any number. Write it down. These carts stay as they are until H4 | if more than 0, list them with `SELECT "id", "locationId" FROM "Cart" WHERE left("id", length("locationId") + 1) <> "locationId" \|\| ':'` and keep the list for #361 |
| H3b-D | write it down | — |

Results: `TBD after rehearsal`.

### 3.3 Changes to H3a 3.3 and 3.6 (park `shared_carts` too)

`prisma migrate deploy` applies every pending migration. H3a 3.3 parks
`drop_user_scope` so only `add_households` runs. **Park `shared_carts` with it**, and keep it
parked through H3a 3.6:

```bash
cd apps/server
mkdir -p .migration-under-test
mv prisma/migrations/20261114000000_shared_carts .migration-under-test/
# … H3a 3.3 (which also parks and restores drop_user_scope), 3.4, 3.5 and 3.6 …
```

During H3a 3.6, `migrate status` lists nothing pending and `migrate diff` against
`schema.prisma` **shows a difference**: the schema already has the unique index and no
`Cart.userId`. That is expected while `shared_carts` is parked. The H3a "exit 0, no drift"
check moves to 3.4 below.

**Put the folder back even if a step fails**, and check `git status --short prisma/`
prints nothing.

### 3.4 NEW: apply `shared_carts`, then check

After H3a 3.6:

```bash
cd apps/server
mv .migration-under-test/20261114000000_shared_carts prisma/migrations/
git status --short prisma/        # must print nothing
DATABASE_URL="$PROD_COPY_DATABASE_URL" DIRECT_URL="$PROD_COPY_DIRECT_URL" pnpm exec prisma migrate deploy
DATABASE_URL="$PROD_COPY_DATABASE_URL" DIRECT_URL="$PROD_COPY_DIRECT_URL" pnpm exec prisma migrate status
pnpm exec prisma migrate diff --from-url "$PROD_COPY_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

| Check | Expected | Result |
|---|---|---|
| `migrate deploy` | exit 0, applies only `20261114000000_shared_carts` | `TBD after rehearsal` |
| `migrate status` | "Database schema is up to date!" | `TBD after rehearsal` |
| `migrate diff … --exit-code` | exit 0, "No difference detected." | `TBD after rehearsal` |

### 3.5 NEW: after `shared_carts`, the record queries

```sql
-- 1. No duplicate pair is left. Expect 0.
SELECT count(*) AS duplicate_groups
FROM (SELECT 1 FROM "CartItem" GROUP BY "cartId", "itemId" HAVING count(*) > 1) d;

-- 2. The totals. Expect: carts unchanged, cart_items = before - rows_to_delete,
--    cart_item_quantity_sum unchanged.
SELECT (SELECT count(*) FROM "Cart")                     AS carts,
       (SELECT count(*) FROM "CartItem")                 AS cart_items,
       (SELECT coalesce(sum("quantity"), 0) FROM "CartItem") AS cart_item_quantity_sum;

-- 3. The unique index exists, and the two old indexes are gone.
--    Expect exactly one row: CartItem_cartId_itemId_key.
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('CartItem_cartId_itemId_key', 'CartItem_cartId_idx', 'Cart_userId_idx');

-- 4. Cart.userId is gone, CartItem.userId stays.
--    Expect exactly one row: CartItem, userId.
SELECT table_name::text, column_name::text
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'userId'
  AND table_name IN ('Cart', 'CartItem');
```

For each group of H3b-B, also check by hand: the row `keep_id` exists and its `quantity`
equals `total`.

| Check | Expected | Result |
|---|---|---|
| 1 | 0 | `TBD after rehearsal` |
| 2 | see the comment | `TBD after rehearsal` |
| 3 | one row, `CartItem_cartId_itemId_key` | `TBD after rehearsal` |
| 4 | one row, `CartItem`, `userId` | `TBD after rehearsal` |
| H3b-B by hand | every kept row has the sum | `TBD after rehearsal` |
| H3b-C again | the same number as before | `TBD after rehearsal` |

Then do H3a 3.8 (delete the branch, clear the `PROD_COPY_*` variables).

---

## 4. The deploy

### 4.1 Addition to H3a 4.3 (merge, Cloudflare, every device)

After step 5 of H3a 4.3:

- **Cloud devices:** do not check out or cook yet (1.2).
- **Local-mode devices** (2.1): open the app, accept the update prompt, reload. Open the
  shopping page and one cart. It must load with no error. That open ran Dexie versions 19
  and 20. To check the version: DevTools, Application, IndexedDB, `Player1Inventory`. The
  browser shows **200**, because Dexie stores its version times 10.

Result: `TBD on deploy day` (each local device opened; version seen).

### 4.2 Addition to H3a 4.4 (the server deploy)

Start this **as soon as** the cloud devices have the new bundle. The gap breaks checkout and
cooking (1.2), and nothing else needs it to be long.

**If the release also carries H5b, the count here is one more** (a fourth migration, `20261118000000_add_household_invites`). See section 9.2 of the [H4 runbook](2026-11-17-deploy-runbook-households-h4.md).

The release log must show three lines, in this order:

```
Applying migration `20261104000000_add_households`
Applying migration `20261111000000_drop_user_scope`
Applying migration `20261114000000_shared_carts`
```

If the release seems stuck on `shared_carts`, it is waiting for its `CartItem` lock. Use
the `pg_stat_activity` query in H3a 4.4.

Result: `TBD on deploy day` (three lines seen; time taken).

---

## 5. How to tell it worked (read-only)

**Owner or main session**, in the Neon SQL Editor on the production branch, after H3a 5:

**If the release also carries H5b, the count here is one more** (a fourth migration, `20261118000000_add_household_invites`). See section 9.2 of the [H4 runbook](2026-11-17-deploy-runbook-households-h4.md).

1. H3a 5 query 1, with `LIMIT 4`: all three new migrations have `finished_at` and no
   `rolled_back_at`.
2. Queries 1, 3 and 4 of section 3.5 above, on production.
3. Query 2 of 3.5 on production. `cart_item_quantity_sum` cannot be compared exactly,
   because production had writes after the rehearsal. Write it down.
4. Query H3b-C on production. Write it down for #361.

| Check | Expected | Result |
|---|---|---|
| migrations | all three finished, none rolled back | `TBD on deploy day` |
| 3.5 query 1 | 0 | `TBD on deploy day` |
| 3.5 query 3 | one row, `CartItem_cartId_itemId_key` | `TBD on deploy day` |
| 3.5 query 4 | one row, `CartItem`, `userId` | `TBD on deploy day` |
| 3.5 query 2 | written down | `TBD on deploy day` |
| H3b-C | written down | `TBD on deploy day` |

---

## 6. The manual smoke test (add to H3a 6)

**Owner**, in cloud mode, after a hard reload on every device.

| # | Action | What must happen |
|---|---|---|
| H3b-1 | Add one item to a cart from two devices, at about the same time | One row, with the sum of both amounts |
| H3b-2 | Check out a cart | It succeeds. Stock goes up. The log shows the purchase at the cart's location |
| H3b-3 | Open the same cart in two tabs. In tab B change an amount. In tab A press Done and confirm | Tab A shows "This cart changed. Please check and try again." and the cart reloads. Stock does not change. Then check out again from tab A: it succeeds |
| H3b-4 | Cook a recipe | It succeeds. Stock goes down by the amount used. The log shows it |
| H3b-5 | In **local** mode, add an item to a cart twice, then check out | One row with the sum; the checkout works |

Results: `TBD on deploy day`.

---

## 7. If something is wrong

### 7.1 `shared_carts` failed in the release command

Railway did not switch traffic, so the old server keeps serving.

| Which failed | State of the database | Is the app OK meanwhile? |
|---|---|---|
| `add_households` or `drop_user_scope` | see H3a 7.1. `shared_carts` did not run | see H3a 7.1 |
| `shared_carts` | H3a's two are applied; `shared_carts` is not | yes, for the old server: `Cart.userId` still exists. The new bundle cannot check out or cook (1.2) until the server deploys |

1. Read the error. The likely causes are a lock wait cancelled by Railway, or (not expected)
   a duplicate the merge did not remove, which would fail `CREATE UNIQUE INDEX`.
2. Mark it rolled back, against production:

   ```bash
   pnpm --filter server exec prisma migrate resolve --rolled-back 20261114000000_shared_carts
   ```

   Postgres rolled the file back, so it left no partial merge.
3. Fix the cause and deploy again. A re-run is safe: the merge finds no group it already
   merged.

### 7.2 Full rollback

H3a 7.2 restores the Neon branch of H3a 4.1, which is from before all three migrations.
Two additions:

- **The web must go back too.** After a rollback the server takes the OLD inputs, so the new
  bundle cannot check out or cook (1.2). Redeploy the previous web commit on Cloudflare
  Pages, and update every cloud device again.
- **Local-mode devices cannot go back.** Their Dexie database stays at version 20 (1.4).
  The previous web bundle knows only version 18 and cannot open it. Those devices must stay
  on the new bundle. Their merged cart rows are correct data, so nothing is lost.

---

## 8. Left open on purpose

| Item | Why it is open |
|---|---|
| Bare-id carts (#361) | Counted in H3b-C. Fixed in H4 |
| Live updates | H3c. Until then a second person's screen stays out of date, and `CART_CHANGED` is the only guard |
| The two new Traditional Chinese texts (`shopping.cartChanged`, `cooking.consumeFailed`) | Written by the agents, not yet confirmed by the owner |
| Two real checkouts at the same moment on production | Proved against real Postgres by `e2e/tests/shared-cart.spec.ts` on the TEST database (5 rounds, one wins, the other gets `CART_CHANGED`), not on production |

---

## Where this file lives, and why

In `docs/global/backend/`, beside the H3a runbook it extends. A person who opens a runbook
during a deploy looks for deploy documents, not for a feature folder.
