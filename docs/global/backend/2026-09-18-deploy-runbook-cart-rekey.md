# Deploy runbook — the cloud cart re-key (cloud locations PR 3b)

**Date written:** 2026-09-18
**Migration:** `apps/server/prisma/migrations/20260917000000_rekey_cart_to_location_vendor/migration.sql`
**Branch:** `feature/cloud-locations-pr3b`
**Feature status:** [`docs/features/locations/cloud-locations-status.md`](../../features/locations/cloud-locations-status.md)
**Plan:** [`docs/features/locations/2026-09-17-cloud-locations-plan-pr3b.md`](../../features/locations/2026-09-17-cloud-locations-plan-pr3b.md)

> ## THIS DEPLOY ALREADY HAPPENED, AND IT WAS CORRECT
>
> **Verified 2026-09-21 against a branch of production.** All five checks in section 4
> pass, plus four more. The re-key is applied and every `Cart.id` is well-formed.
>
> **It deployed automatically.** Railway is set to *"Auto deploys when pushed to GitHub"*
> on `main`, and `railway.toml` runs `prisma migrate deploy` as the release command. So
> merging PR #293 deployed it. Nobody followed sections 2 or 3.
>
> **That was safe, by Railway's design rather than by luck.** The release command runs
> **after the build and before the new instance takes traffic**, so the old-code-plus-new-
> schema state that sections 1.2 and 1.3 describe **cannot occur**. The duplicate-cart
> failure in section 5.2 needs exactly that state.
>
> **One step was genuinely skipped:** section 2.3's Neon branch, which exists only as a
> rollback point. There is nothing to roll back.
>
> **This document was written believing the deploy was manual.** That belief came from one
> observation — a Neon branch taken on 2026-09-18 that lacked the previous migration —
> which was simply taken before Railway finished deploying. The inference was never
> checked against the Railway dashboard.
>
> **What it is still good for:** section 4 is a verification checklist worth re-running
> after any future migration. Section 5.2's repair is still correct if a duplicate cart
> ever appears by another route. Section 6's manual smoke tests are still owed.
>
> **What the next migration author should take from it:** Railway removes the ordering
> hazard, so a future runbook should be a *verification* document, not a deploy-order one.

This runbook was written for **one** deploy: the one that re-keys `Cart.id` in the cloud
database. Read the box above first. Sections 2 and 3 are now history rather than
instructions.

**Rule for every command below: never paste a database connection string or a
database hostname into a chat, a commit, a document, or a screenshot.** Refer to
the environment variable names — `DATABASE_URL`, `DIRECT_URL`,
`PROD_COPY_DATABASE_URL`, `PROD_COPY_DIRECT_URL`.

---

## 1. What breaks if you get this wrong

### 1.1 The migration changes a primary key

Before: `Cart.id` is the bare vendor id, or the literal string `'no-vendor'`.
After: `Cart.id` is `${locationId}:${vendorId}`, or `${locationId}:no-vendor`.

The migration also splits the shared `'no-vendor'` cart, giving each user their
own row. That fixes a real cross-user leak: `'no-vendor'` is one literal string,
so every account shared one row and one `lastPurchasedAt`.

### 1.2 The migration and the new server code must go out together

| Combination | What happens |
|---|---|
| **Old server code, new (migrated) database** | The old code looks a cart up by the bare `vendorId ?? 'no-vendor'`. After the migration that id no longer exists, so `findUnique` returns nothing and the code falls into its `create` branch. See 1.3 — the result depends on which old code is running. |
| **New server code, old (un-migrated) database** | The new code looks a cart up by `${locationId}:${vendorId}`. No such row exists, so it creates one. Every existing cart, and every `CartItem` in it, is orphaned — still in the database, invisible in the app. |

Both orders are broken. That is why they ship as one deploy.

### 1.3 Two kinds of "old server code", and only one of them fails loudly

Which one you have depends on whether PR 3a has already been deployed to
production. **Check, do not assume** — see step 2.1.

| Case | Production is running | What the old code does after the migration | Loud or silent |
|---|---|---|---|
| **A** | Code from **before** PR 3a (`20260916000000` not yet applied) | The old code does not write `Cart.locationId`. That column becomes `NOT NULL` with no default in `20260916000000`, so every cart `create` fails with Postgres error `23502`. | **Loud.** The user sees an error. No bad row is written. |
| **B** | Code **from** PR 3a (`origin/main`, PR [#291](https://github.com/ETBlue/player1inventory/pull/291)) | The old code writes `locationId`, so the `create` succeeds. It inserts a **duplicate cart under the old bare id**. `origin/main:apps/server/src/resolvers/cart.resolver.ts:11-25` is the code. | **Silent.** No error anywhere. One vendor now has two carts and the user's items split between them. |

Case B is the reason this runbook exists. Section 4 has the query that finds
those rows and section 5 has the repair.

As measured during the Task 5 rehearsal on 2026-09-18, production was still on
**Case A**: the copy of production did not carry `20260916000000`. That was true
on that day. Verify it again yourself in step 2.1.

### 1.4 A third window: the browser

The web client and the server deploy on two different services and finish at
different times.

| Window | What is live | Effect |
|---|---|---|
| New server, old browser tab | The old bundle calls `vendorCart(vendorId)` with no `locationId`. `locationId` is now `ID!`. | `GRAPHQL_VALIDATION_FAILED`. The shopping page errors until the user reloads. |
| New browser bundle, old server | The new bundle sends `locationId` to a server that does not accept it. | Same class of error, opposite direction. |

Neither writes bad data. Both are fixed by a hard reload once both services are
live. Tell any user of the app to reload after the deploy.

### 1.5 The accepted downtime

The decision on 2026-09-17 was to **accept a short window instead of building a
dual-read server**. Production has one user. Pick a moment when nobody is using
the app, and do not use the app yourself between step 3.2 and step 3.6.

There is no `migrate down` for a re-key. The rollback is a database restore, and
it loses every write made after the snapshot. See section 5.

---

## 2. Before you start

### 2.1 Find out what production is actually running

Do this first. Everything in section 1.3 depends on the answer.

1. Open the Railway dashboard for the server service. Read the currently deployed
   commit SHA.
2. Check whether that commit contains PR 3a's migration:

   ```bash
   git merge-base --is-ancestor 403981ea <deployed-sha> && echo "Case B — PR 3a is deployed" || echo "Case A — PR 3a is NOT deployed"
   ```

   `403981ea` is the merge commit of PR #291, which brought PR 3a to `main`.
3. Confirm it against the database itself. Connect to production and run:

   ```sql
   SELECT "migration_name", "finished_at", "rolled_back_at"
   FROM "_prisma_migrations"
   ORDER BY "started_at" DESC
   LIMIT 10;
   ```

   If `20260916000000_add_location_to_log_and_cart` is not in the list, you are
   in Case A.

**Expect one duplicate migration name and do not treat it as a problem.**
`_prisma_migrations` holds two rows named `20260609100000_permanent_vendor_carts`:
one `ROLLED BACK` (error `42703`) and one applied. That is the normal
`migrate resolve --rolled-back` recovery pattern. `migrate deploy` only refuses to
start when a row has **both** `finished_at` and `rolled_back_at` null. There is no
such row.

### 2.2 Record the before state

Run these against production and **write the numbers down**. You will compare
against them in section 4.

```sql
SELECT count(*) AS carts FROM "Cart";
SELECT count(*) AS cart_items FROM "CartItem";
SELECT count(*) AS carts_with_colon FROM "Cart" WHERE position(':' IN "id") > 0;
SELECT count(*) AS no_vendor_rows FROM "Cart" WHERE "id" = 'no-vendor';
SELECT count(*) AS items FROM "Item";
SELECT count(*) AS logs FROM "InventoryLog";
```

**Do not copy the rehearsal's numbers.** The 2026-09-18 rehearsal saw 37 carts and
13 cart items; the 2026-09-16 measurement of the same database saw 19 cart items.
Production keeps changing. Only your own before numbers are valid.

Also record the id sets as hashes, so "unchanged" is provable rather than
eyeballed:

```sql
SELECT md5(string_agg("id", ',' ORDER BY "id")) AS cart_id_hash FROM "Cart";
SELECT md5(string_agg("id", ',' ORDER BY "id")) AS cart_item_id_hash FROM "CartItem";
SELECT md5(string_agg("cartId", ',' ORDER BY "cartId")) AS cart_item_cartid_hash FROM "CartItem";
```

Expected after the migration:

| Hash | Expected |
|---|---|
| `cart_id_hash` | **changed** — every cart was re-keyed |
| `cart_item_cartid_hash` | **changed** — every cart item was repointed |
| `cart_item_id_hash` | **unchanged** — rows are updated, never deleted and recreated |

The third one matters most. A changed `CartItem.id` would mean the migration
deletes and recreates rows, which loses any column it did not copy by hand.

### 2.3 Take a Neon branch of production. This is the rollback.

**Do this before anything writes.** It is the only way back.

1. Open the Neon console for the production project.
2. Create a branch from the production branch, at the **current** point in time.
3. Name it with the date and the reason, for example `prod-before-cart-rekey-2026-09-18`.
4. Write the branch name down.

Do not skip this because the rehearsal passed. The rehearsal ran against a copy,
on a different day, on different rows.

**Do not run any migration against `PROD_COPY_DATABASE_URL`.** That variable is
for rehearsals. Task 5 is finished with it.

### 2.4 Confirm the code is ready

```bash
git log --oneline -1                     # the commit you are about to deploy
pnpm test                                # 226 server + 2061 web, all passing
```

The full E2E suite and the rest of the verification gate were run on the branch
before merge. You do not need to re-run them here.

---

## 3. The deploy

Railway runs the migration for you. `railway.toml` at the repo root:

```toml
[deploy]
releaseCommand = "pnpm --filter server exec prisma migrate deploy"
```

Railway runs that command after the build and before the new server starts
serving. So there is a window where the **database is already migrated and the new
server is not yet answering requests**. That is the window section 1.3 describes.
Do not use the app during it, and make sure nobody else does.

### Step 3.1 — Announce the window

Tell anyone using the app to stop, and to reload the page when you say it is done.
Today that is one person.

### Step 3.2 — Merge the PR to `main`

```bash
gh pr merge <number> --merge --delete-branch
```

This triggers both services from the same commit:

| Service | What it does |
|---|---|
| Railway (server) | build → `prisma migrate deploy` → start the new server → take traffic |
| Cloudflare Pages (web) | build → publish the new bundle |

### Step 3.3 — Watch the Railway release log

Open the Railway deploy log and read the release command's output. You are looking
for the two migrations applying:

```
Applying migration `20260916000000_add_location_to_log_and_cart`
Applying migration `20260917000000_rekey_cart_to_location_vendor`
```

The first line appears in Case A only. In Case B that migration is already
applied, and only the second line appears.

**If the release command raises, stop here and go to section 5.** Postgres runs
each migration file in one transaction, so a raised exception leaves the schema
untouched. The migration raises on purpose in four places — one check after phase
A, three after phase B — and each message names what it found:

| Message starts with | What it means |
|---|---|
| `Phase A left N CartItem row(s) of OTHER users...` | One or more users hold a cart item on the shared `'no-vendor'` row but have no default `Location`. The message lists their `userId`s. Create one default `Location` per listed user, then redeploy. |
| `The re-key left N Cart row(s) without a ':' in the id` | A cart the re-key missed. The message lists the ids. |
| `The re-key left N Cart row(s) whose id does not start with their own locationId` | A doubled prefix (`loc:loc:vendor`), or a cart whose location moved. |
| `The re-key left N CartItem row(s) pointing at a Cart that no longer exists` | An orphan. |

### Step 3.4 — Wait for the new server to take traffic

Watch the Railway deploy status until it reports the new deployment as active.

### Step 3.5 — Wait for Cloudflare Pages

Watch the Cloudflare Pages build until it publishes. Only when **both** services
are live is the window over.

### Step 3.6 — Hard reload the app

In the browser, hard reload (Cmd+Shift+R on macOS). Section 1.4 explains why a
stale tab errors.

---

## 4. How to tell it worked

Run every query below against production. Every one must return the stated
result. "The app looks fine" is not one of these checks — a duplicate cart looks
fine until the user notices half their items are gone.

### 4.1 The five assertions from the rehearsal

```sql
-- 1. Every Cart.id contains a colon. Expect 0.
SELECT count(*) AS carts_without_colon
FROM "Cart" WHERE position(':' IN "id") = 0;

-- 2. No row is still under the literal 'no-vendor'. Expect 0.
SELECT count(*) AS literal_no_vendor
FROM "Cart" WHERE "id" = 'no-vendor';

-- 3. No CartItem points at a missing Cart. Expect 0.
SELECT count(*) AS orphan_cart_items
FROM "CartItem" ci
WHERE NOT EXISTS (SELECT 1 FROM "Cart" c WHERE c."id" = ci."cartId");

-- 4. Every Cart.id starts with its own locationId. Expect 0.
--    This is what catches a doubled prefix (`loc:loc:vendor`).
SELECT count(*) AS wrong_prefix
FROM "Cart" WHERE left("id", length("locationId") + 1) <> "locationId" || ':';

-- 5. No cart sits under a location owned by another user. Expect 0.
SELECT count(*) AS cross_user_carts
FROM "Cart" c JOIN "Location" l ON l."id" = c."locationId"
WHERE l."userId" <> c."userId";
```

**Assertion 5 cannot fail while production has one user.** It is there for the
day a second account exists. Do not read it as evidence today.

### 4.2 Counts and hashes against your own before numbers

```sql
SELECT count(*) AS carts FROM "Cart";                -- must equal your before count,
                                                     -- plus one per user who had items
                                                     -- on the shared 'no-vendor' row
SELECT count(*) AS cart_items FROM "CartItem";       -- must equal your before count exactly
SELECT count(*) AS items FROM "Item";                -- unchanged
SELECT count(*) AS logs FROM "InventoryLog";         -- unchanged

SELECT md5(string_agg("id", ',' ORDER BY "id")) AS cart_id_hash FROM "Cart";
SELECT md5(string_agg("id", ',' ORDER BY "id")) AS cart_item_id_hash FROM "CartItem";
SELECT md5(string_agg("cartId", ',' ORDER BY "cartId")) AS cart_item_cartid_hash FROM "CartItem";
```

Compare against section 2.2: the first and third hashes must **change**, the
second must **not**.

### 4.3 The Case B check — run this even if you believe you are in Case A

```sql
-- Assertion 1 again, but returning the rows instead of a count, so you can see
-- what a stray cart actually is. Expect 0 rows.
-- Run it a second time a few minutes after the deploy: a request that started
-- before the new server took over can still land after your first check.
SELECT "id", "userId", "locationId", "lastPurchasedAt"
FROM "Cart" WHERE position(':' IN "id") = 0;
```

If this returns rows, go to section 5.2. Do not delete them without reading it.

---

## 5. If something is wrong

### 5.1 The release command raised — nothing was written

Postgres rolled the whole file back. The schema is untouched and the old server is
still serving. Nothing to restore.

1. Read the message. Section 3.3 maps each one to its cause.
2. Fix the cause. For the phase-A guard that means creating a default `Location`
   for each listed `userId`.
3. Redeploy.

If Prisma left the migration in a *failed* state and it now blocks later
migrations, resolve it as rolled back before redeploying:

```bash
pnpm --filter server exec prisma migrate resolve --rolled-back 20260917000000_rekey_cart_to_location_vendor
```

Use `--rolled-back`, not `--applied`. The failed migration left no partial
changes.

### 5.2 A duplicate cart appeared (Case B)

One or more carts have a bare id. The user's items for that vendor are split
between two carts. Repair them:

**Step 1 — look, and work out which case each stray is.**

```sql
SELECT stray."id", stray."userId", stray."locationId", stray."lastPurchasedAt",
       (SELECT count(*) FROM "CartItem" ci WHERE ci."cartId" = stray."id") AS item_count,
       EXISTS (SELECT 1 FROM "Cart" t
               WHERE t."id" = stray."locationId" || ':' || stray."id") AS correct_id_taken
FROM "Cart" stray
WHERE position(':' IN stray."id") = 0;
```

`correct_id_taken` decides the repair. `false` means the stray can simply be
re-keyed. `true` means a correct cart already exists and the two must be merged.

**Before you write anything, ask the user which location those items belong to.**
The old code set the stray's `locationId` from `ensureDefaultLocation`, which is
the account's **default** location — not necessarily the location the user was
looking at when they added the items. If they belong somewhere else, set
`stray."locationId"` to that location's id first, and only then run step 2.

**Step 2 — re-key the strays whose correct id is free.** The FK is
`ON UPDATE CASCADE`, so the `CartItem` rows follow on their own. One statement:

```sql
UPDATE "Cart" stray
SET "id" = stray."locationId" || ':' || stray."id"
WHERE position(':' IN stray."id") = 0
  AND NOT EXISTS (
    SELECT 1 FROM "Cart" t WHERE t."id" = stray."locationId" || ':' || stray."id"
  );
```

**Step 3 — merge the rest.** Anything with a bare id still left is a stray whose
correct id is taken. Move its items, then delete it. **Run these two in this
order.** `CartItem` cascades from `Cart`, so deleting first destroys the items.

```sql
UPDATE "CartItem" ci
SET "cartId" = stray."locationId" || ':' || stray."id"
FROM "Cart" stray
WHERE ci."cartId" = stray."id" AND position(':' IN stray."id") = 0;

DELETE FROM "Cart" WHERE position(':' IN "id") = 0;
```

**Step 4 — two things the SQL above does not do.**

- **`CartItem` has no unique constraint on `(cartId, itemId)`.** The step-3
  `UPDATE` cannot fail, but it can leave the same item twice in one cart:

  ```sql
  SELECT "cartId", "itemId", count(*)
  FROM "CartItem" GROUP BY "cartId", "itemId" HAVING count(*) > 1;
  ```

  Merge each duplicate by hand: add the quantities onto one row, delete the other.
- **`lastPurchasedAt` is not merged.** If the stray's value was newer than the
  surviving cart's, copy it across **before** step 3 deletes the stray.

Then re-run every check in section 4.

### 5.3 Full rollback — restore from the branch you took in step 2.3

Use this when the data is wrong in a way section 5.2 does not cover.

**Be honest about the cost: restoring loses every write made after the branch was
taken.** Items added, quantities changed, checkouts, cooking, inventory logs — all
of it, back to the moment of step 2.3. There is no way to merge the lost writes
back in. If the only damage is a duplicate cart, repair it with 5.2 instead.

1. In the Neon console, restore the production branch from
   `prod-before-cart-rekey-<date>`, or repoint the production `DATABASE_URL` /
   `DIRECT_URL` at that branch.
2. Redeploy the **previous** server commit on Railway, so the code matches the
   restored schema. New server code against an un-migrated database orphans every
   cart (section 1.2).
3. Redeploy the previous web bundle on Cloudflare Pages.
4. Tell the user what window of work was lost.

There is no `migrate down`. A re-key cannot be reversed by a script, because
after the fact there is no way to tell an id that the migration wrote from one a
user's data legitimately contains.

---

## 6. The manual smoke test — this is owed, do not skip it

### 6.1 Why automated tests do not cover this

The gap is narrow and specific. It is **not** that these resolvers are untested.

| Claim | True? |
|---|---|
| "No cloud E2E spec exercises `checkout`" | **False.** `shopping.spec.ts` runs 4 checkout cases in the cloud project, against real Postgres. |
| "No cloud E2E spec exercises `consumeRecipes`" | **False.** `cooking.spec.ts` and `item-logs.spec.ts` both cook a recipe in the cloud project. |
| "No cloud E2E spec exercises `bootstrapCarts`" | **False.** `ActiveLocationProvider` (`apps/web/src/hooks/useActiveLocation.tsx:240-257`) calls it on every active-location change, so every one of the 78 cloud tests runs it. |

**The real gap: no automated test has ever run the new server code against data
this migration produced.**

- Cloud E2E starts from an **empty** database each run. `/e2e/cleanup` deletes
  everything first, so every row it reads was written by the new code itself.
  It never sees a migrated row.
- The Task 5 rehearsal **migrated real data** but started no application code
  against the result. It ran SQL assertions and stopped.

So the combination "new resolvers + migrated production rows" has been executed
exactly zero times. That is what the smoke test covers.

Two smaller gaps sit behind it:

- **The `'no-vendor'` split has never run on real data.** Zero production accounts
  had a `CartItem` on the shared row, so the rehearsal's phase A did nothing at
  all. The only thing that tests the split is the 13-user synthetic fixture in
  `pnpm --filter server verify:migration`.
- **No server *unit* test runs against real SQL.** Every one uses a hand-written
  Prisma fake.

### 6.2 Do these, in this order, in the production app

Use a real browser, signed in as the production account, after a hard reload.

| # | Action | What must happen |
|---|---|---|
| 1 | Open `/shopping`. | Every vendor card renders. The vendor list and their "last purchased" dates match what you saw before the deploy. No error banner. |
| 2 | Open the browser's network tab and reload `/shopping`. | The `BootstrapCarts` mutation returns without an error. This is `createMany({ skipDuplicates: true })` running against production data for the first time. |
| 3 | Open one vendor's cart that already had items before the deploy. | **The items are still there.** This is the check that the `CartItem` repoint worked on real rows. |
| 4 | Open the no-vendor cart. | Its items are still there, and its "last purchased" date is unchanged. Production's single account **owns** the shared `'no-vendor'` row, so phase B renames that row and keeps its timestamp. |
| 5 | Add an item to a vendor cart, set a quantity, and check out. | The checkout succeeds. The item's stock goes up in the pantry. |
| 6 | Open that item's Logs tab. | The new purchase log is there, **against the location you were viewing** — not against the default location. This is what PR 3b Task 3 fixed. |
| 7 | Switch the active location to a second location (create one first if there is only one). | `/shopping` shows that location's carts. The carts from the first location are **not** shown. |
| 8 | At the second location, add an item to a vendor cart and check out. | It succeeds, and the log lands at the **second** location. |
| 9 | Go to `/cooking`, pick a recipe with available items, and cook it. | It succeeds. The stock goes down at the location you are viewing, and the cooking log lands there. |
| 10 | Go back to the first location and open `/shopping`. | Its carts are intact and unchanged by steps 7 to 9. |

Steps 7 to 10 are the ones that cannot be skipped. With a single location,
"the cart's location" and "the caller's default location" are the same string, so
every step above passes against code that ignores location entirely. **A
single-location smoke test proves nothing about location scoping.** This is the
same trap that kept all 218 pre-existing server tests green through PR 3b Task 3.

If you have to create a second location for step 7, you may delete it afterwards.
Be aware of the known gap in section 7.

### 6.3 After the smoke test

Re-run section 4.1 one more time. Step 5 and step 8 wrote carts; assertion 1 and
assertion 4 confirm the new code writes the right shape.

---

## 7. Known gaps to be aware of, not blockers

| Gap | Effect |
|---|---|
| `useDeleteLocation`'s cloud branch refetches only `GetLocations`. | The database does cascade `Cart`, `CartItem` and `InventoryLog` rows away, but the open page's `AllCarts`, `AllCartItems` and `ItemLogs` observers can still show them. A reload clears it. Recorded, not fixed. |
| `applyUnitSwitch` is not in the cloud schema at all. | A cloud unit switch leaves every location's quantities in the old unit. Owed by PR 3c. |
| `removeItemFromLocation` has no cloud cascade. | It deletes the `ItemStock` row only. Owed by PR 3c. |

---

## 8. Clean up

1. Keep the Neon branch from step 2.3 for at least a few days. Delete it only
   once you are sure the data is right.
2. Delete any Neon branch used for a rehearsal — the one behind
   `PROD_COPY_DATABASE_URL` — if it is still there.
3. Delete the merged feature branch and its worktree.

---

## Where this file lives, and why

It is in `docs/global/backend/` and not in `docs/features/locations/`.

`docs/global/backend/` already holds
[`2026-04-10-deployment-stack-design.md`](2026-04-10-deployment-stack-design.md)
and
[`2026-04-13-deployment-troubleshooting.md`](2026-04-13-deployment-troubleshooting.md)
— the two files a person opens when a deploy is going wrong. A runbook is read
under pressure, by someone who is looking for deploy documents, not for a feature
folder. Putting it beside the other deploy documents means they do not have to
know which feature caused the problem in order to find the fix.
