# Deploy runbook — dropping `Item`'s five stock state columns (cloud locations PR 5)

**Date written:** 2026-10-05
**Migration:** `apps/server/prisma/migrations/20261004000000_drop_item_stock_state_columns/migration.sql`
**Branch:** `feature/cloud-locations-pr5`
**Feature status:** [`docs/features/locations/cloud-locations-status.md`](../../features/locations/cloud-locations-status.md)
**Plan:** [`docs/features/locations/2026-10-04-cloud-locations-plan-pr5.md`](../../features/locations/2026-10-04-cloud-locations-plan-pr5.md)
**Precedent:** [`2026-09-18-deploy-runbook-cart-rekey.md`](2026-09-18-deploy-runbook-cart-rekey.md)

> ## This is a VERIFICATION document, not a deploy-order one
>
> The cart re-key runbook closed with that advice, and this runbook follows it. Railway
> deploys `main` automatically and `railway.toml` runs `prisma migrate deploy` as the
> **release command** — after the build, before the new instance takes traffic. So the
> server is never running old code against the new schema, and there is no deploy order
> for a human to get right.
>
> What a human still has to do:
>
> | Step | Section |
> |---|---|
> | Take a Neon branch of production **before** merging. It is the only rollback. | 2 |
> | Re-run the reconciliation query if more than a few days pass before the merge. | 3 |
> | Tell anyone using the app to reload the page after the deploy. | 4 |
> | Run the four post-deploy assertions. | 5 |

---

## 1. What is being dropped, and why it cannot be undone

Five columns leave the `Item` table:

```
"targetQuantity", "refillThreshold", "packedQuantity", "unpackedQuantity", "dueDate"
```

They describe the state of an item **in one place**, so their home is `ItemStock` — one
row per item per location — not `Item`, which has one row per item. `ItemStock` has held
a copy of all five since PR 1's backfill
(`20260830000000_add_location_and_item_stock`), which **copied** rather than moved. PR 5
removes the duplicate.

**`Item` keeps `consumeAmount` and `targetUnit`.** `consumeAmount` sits between
`unpackedQuantity` and `dueDate` in the model and looks like one of the five. It is global
configuration — the step size for one item, the same in every location.

### It is irreversible

| | |
|---|---|
| `migrate down` | **Does not exist.** Prisma has no down step. |
| Dropping a column | destroys its data. |
| Rollback | **a restore from a Neon branch**, which loses every write made after the snapshot. |

**Take the Neon branch before you merge.** Section 2.

---

## 2. Before you merge

### 2.1 Take a Neon branch of production

1. Open the Neon console for the production project.
2. Create a branch from the production branch, at the **current** point in time.
3. Name it with the date and the reason, for example `prod-before-item-column-drop-2026-10-05`.
4. Write the branch name down.

Keep it for at least a few days after the deploy.

### 2.2 Rule for every command in this file

**Never paste a database connection string or a database hostname into a chat, a commit, a
document, or a screenshot.** Refer to the environment variable names — `DATABASE_URL`,
`DIRECT_URL`. A Neon endpoint label such as `ep-holy-breeze` is fine; a full URL is not.

---

## 3. The pre-deploy reconciliation — ALREADY RUN, and it passed

The question this migration has to answer is: **does any item's `Item` columns disagree
with its default location's `ItemStock` row?** If one does, the drop destroys a value that
has no copy anywhere.

### 3.1 The query

Read-only. Run it against a **branch** of production, never against production itself.

```sql
SELECT count(*)
FROM "Item" i
JOIN "Location" l ON l."userId" = i."userId" AND l."isDefault"
LEFT JOIN "ItemStock" s ON s."itemId" = i."id" AND s."locationId" = l."id"
WHERE s."id" IS NULL
   OR s."targetQuantity"   <> i."targetQuantity"
   OR s."refillThreshold"  <> i."refillThreshold"
   OR s."packedQuantity"   <> i."packedQuantity"
   OR s."unpackedQuantity" <> i."unpackedQuantity"
   OR s."dueDate" IS DISTINCT FROM i."dueDate";
```

**Expect 0. A non-zero answer is data this PR would destroy** — stop and reconcile first.

### 3.2 What it returned, measured 2026-10-05

Run against a Neon branch of production, read-only, before the merge.

| Measure | Value |
|---|---|
| **Items whose `Item` columns disagree with their default location's `ItemStock` row** | **0** |
| Items with no `ItemStock` row at all | **0** |
| `Item` rows | 181 |
| `ItemStock` rows | 184 |
| `Location` rows | **5**, across **2** distinct users |
| Default locations | 2 — exactly one per user, so `Location_one_default_per_user_key` holds |
| Distinct users owning items | 1, owning all 181 |

**So the drop is safe.** Every one of the 181 items has a default-location `ItemStock` row,
and every one of those rows already holds the same five values the `Item` row holds. The
drop removes a duplicate and nothing else.

The three extra `ItemStock` rows (184 against 181 items) are items stocked in more than one
location. They were never represented on `Item` at all, so the drop does not touch them.

### 3.3 This measurement also corrects a claim two docs still make

Two documents argue that divergence is near-impossible on production **because production
has one user and one location**, so every dual-write target reduces to the same row:

| Document | What it says |
|---|---|
| `docs/features/locations/2026-08-30-cloud-locations-design.md` §7 | "production has exactly one user", from the 2026-08-30 rehearsal |
| `docs/features/locations/cloud-locations-status.md` | "a stale bundle keeps working for a single-location user editing their default location's stock. Per the production rehearsal, that is every current production account." |

**That argument is now false.** Production has **5 locations across 2 users**. It was true
when measured on 2026-09-16 and it stopped being true some time after.

The reconciliation **still returns 0**. But it returns 0 because it was measured, not
because the "one user, one location" argument holds. Those are different claims, and only
the second one was ever written down.

This is the clearest example in the cloud-locations series of why re-measuring beats
inheriting a claim. The number that justified skipping a check was 25 days old and had
changed. Both documents are corrected in PR 5.

---

## 4. The accepted break: a stale browser bundle gets a blank pantry

**This is the part that makes PR 5 different from every earlier PR in the series.** PRs 1
through 4b were all designed so a browser holding an old bundle kept working. PR 5 ends
that, on purpose.

### 4.1 Why

**Eight web GraphQL operations selected the five fields on `Item`** until PR 5. PR 2
stopped the client *using* them; it never stopped it *asking* for them.

| Operation | File |
|---|---|
| `GetItem`, `GetItems`, `CreateItem`, `UpdateItem` | `apps/web/src/apollo/operations/items.graphql` |
| `PantryData`, `ApplyUnitSwitch` | `apps/web/src/apollo/operations/itemStocks.graphql` |
| `BulkCreateItems`, `BulkUpsertItems` | `apps/web/src/apollo/operations/import.graphql` |

Dropping a field that a document selects fails **GraphQL validation**, and validation
rejects the whole operation. So `GetItems` and `PantryData` failing means a **blank
pantry** — not missing numbers in an otherwise working page.

### 4.2 Who breaks, and what fixes it

| | |
|---|---|
| Who breaks | a browser holding a pre-PR-5 bundle |
| Symptom | `GetItems` / `PantryData` fail GraphQL validation → **blank pantry** |
| Fix | **reload the page** |
| **Not fixed by a reload** | **a Cloudflare Pages preview built before PR 5.** It keeps its old bundle for ever and points at the shared cloud API |

**Railway's release command protects the server, never the client.** The server and the web
bundle deploy on two different services and finish at different times, and nothing
coordinates them. The window is short — one Cloudflare Pages build — and a reload closes it.

**A pre-PR-5 Cloudflare Pages preview deployment is permanently broken against the
production API.** Its bundle is frozen at the commit that built it. There is no reload that
fixes this; the preview has to be rebuilt from a commit that includes PR 5, or left alone.
This is worth knowing before someone opens an old preview link to compare behaviour and
reports the blank pantry as a regression.

### 4.3 Tell the user to reload

Today that is one person for production, and two accounts exist. Say it out loud after both
services are live:

> The deploy is done. Hard reload the page (Cmd+Shift+R on macOS).

---

## 5. How to tell it worked — four read-only assertions

Run these against production after the release command has finished. Each one reads
`information_schema` rather than issuing a `SELECT` on the column, because
`SELECT "dueDate" FROM "Item"` throws Postgres `42703` before any check can report a
result, and a raw driver error is not a named pass or fail.

```sql
-- 1. The five are GONE from "Item". Expect 0 rows.
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'Item'
  AND column_name IN ('targetQuantity','refillThreshold',
                      'packedQuantity','unpackedQuantity','dueDate');

-- 2. The five are STILL on "ItemStock". Expect 5 rows.
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'ItemStock'
  AND column_name IN ('targetQuantity','refillThreshold',
                      'packedQuantity','unpackedQuantity','dueDate');

-- 3 and 4. "Item" keeps its global configuration. Expect 2 rows.
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'Item'
  AND column_name IN ('consumeAmount','targetUnit');
```

**Assertion 2 is not padding, and it is the one most easily left out.** `Item` and
`ItemStock` declare the **same five field names**. Checking `Item` alone passes just as
happily against `ALTER TABLE "ItemStock" DROP COLUMN "targetQuantity"` — the wrong table —
as against the real migration. Assertion 2 is the only one that can tell those apart.

Assertions 3 and 4 catch a drop that took one column too many. `consumeAmount` sits among
the five in the Prisma model and is global configuration, not per-location state.

### 5.1 These four already passed on two databases

Verified read-only on 2026-10-04, after the migration was applied by hand:

| Database | Endpoint | Migrations applied by this work | Four assertions |
|---|---|---|---|
| dev | `ep-holy-breeze` | 3 — the two it was behind, plus `20261004000000_drop_item_stock_state_columns` | **all pass** |
| cloud E2E | `ep-round-surf` | 1 — ours; it already had the other two | **all pass** |

The dev database was two migrations behind (`20260916000000_add_location_to_log_and_cart`
and `20260917000000_rekey_cart_to_location_vendor`), so the first `migrate dev` applied
three migrations, not one. That is expected — see ground rule 2 in the PR 5 plan.

### 5.2 A row-count check worth running too

```sql
SELECT count(*) AS items FROM "Item";          -- must equal your before count
SELECT count(*) AS stocks FROM "ItemStock";    -- must equal your before count
```

A column drop cannot change a row count. If either moved, something else wrote to the
database during the deploy.

---

## 6. If something is wrong

### 6.1 The release command raised — nothing was written

Postgres runs each migration file in one transaction, so a raised exception leaves the
schema untouched and the old server is still serving. Read the error, fix the cause,
redeploy.

If Prisma left the migration in a *failed* state and it now blocks later migrations,
resolve it as rolled back before redeploying:

```bash
pnpm --filter server exec prisma migrate resolve --rolled-back 20261004000000_drop_item_stock_state_columns
```

Use `--rolled-back`, not `--applied`. The failed migration left no partial changes.

### 6.2 The columns are gone and a value is missing

**There is no repair.** The data is gone. Restore from the Neon branch taken in step 2.1.

**Be honest about the cost:** restoring loses every write made after the branch was taken —
items added, quantities changed, checkouts, cooking, inventory logs. There is no way to
merge the lost writes back in.

1. In the Neon console, restore the production branch from
   `prod-before-item-column-drop-<date>`, or repoint the production `DATABASE_URL` /
   `DIRECT_URL` at that branch.
2. Redeploy the **previous** server commit on Railway, so the code matches the restored
   schema. PR 5's server code reads no `Item` stock column, so it would also run against
   the restored schema — but its GraphQL type no longer declares the five fields, and a
   pre-PR-5 web bundle selects them. Match both services to the same commit.
3. Redeploy the previous web bundle on Cloudflare Pages.
4. Tell the user what window of work was lost.

Section 3's reconciliation is what makes this path unlikely rather than impossible: with 0
disagreeing rows and 0 items missing a stock row, there is no value on `Item` that is not
already on `ItemStock`.

---

## 7. What this runbook does NOT cover

### 7.1 `verify-migration.ts`'s three new PR 5 assertions have never run

`apps/server/scripts/verify-migration.ts` gained
`20261004000000_drop_item_stock_state_columns` in its `MIGRATIONS` list, plus three
assertions — the five absent from `Item`, the five present on `ItemStock`, and
`consumeAmount` surviving on `Item`.

**Nothing has executed them.** The script opens with `migrate reset`, which destroys the
database it points at, so it cannot be run against the dev database while the dev database
holds work in progress, and it must **never** be pointed at a copy of production. It needs
`TEST_DATABASE_URL` and `TEST_DIRECT_URL` resolving to a database that may be destroyed,
and the user's real-time consent via `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.

**This is owed.** The three assertions are written and type-checked
(`(cd apps/server && pnpm typecheck)` is clean) and have never been executed. Until someone
runs `pnpm --filter server verify:migration` against a throwaway database, their only proof
is that they compile.

The four assertions in section 5 are **not** a substitute. They ran against a database the
migration was applied to **in order**, by `migrate dev`. `verify:migration` proves something
different: that the migration is valid on a database built from **committed history only**,
with a deliberately multi-user fixture.

### 7.2 Nothing in the gate regenerates the Prisma client

Recorded in root `CLAUDE.md`'s *Verification Gate* section, measured during PR 5 task 5.
Neither `pnpm codegen` nor the root `pnpm build` runs `prisma generate` — it is wired only
to `apps/server`'s `postinstall` and `predev`. So after a `schema.prisma` change, `tsc`
compares your code against whatever client was generated last.

**Run `(cd apps/server && pnpm prisma generate)` by hand before you trust a type-check on
any future migration.**

### 7.3 No manual smoke test is specified here, and one reason is good

The cart re-key runbook owed a 10-step manual smoke test because **no automated test had
ever run the new server code against rows that migration produced**. PR 5 is different:
the migration produces no rows and converts no values. It removes a duplicate copy that
PR 4 had already stopped every code path from reading or writing.

What does cover it: `e2e/tests/location-scoped-writes.spec.ts` exercises `checkout`,
`consumeRecipes`, `removeItemFromLocation` and `applyUnitSwitch` against real Postgres in
the `cloud` project, and PR 5 task 2 changed `checkout` and `consumeRecipes` to write
`ItemStock` as the primary write. Those four resolvers therefore get real-SQL coverage from
the gate.

A reload-and-look pass on production after the deploy is still worth five minutes: open the
pantry, open one item's Stock tab, change a quantity, and check out one cart item.

---

## Where this file lives, and why

`docs/global/backend/`, beside
[`2026-09-18-deploy-runbook-cart-rekey.md`](2026-09-18-deploy-runbook-cart-rekey.md),
[`2026-04-10-deployment-stack-design.md`](2026-04-10-deployment-stack-design.md) and
[`2026-04-13-deployment-troubleshooting.md`](2026-04-13-deployment-troubleshooting.md) — the
files a person opens when a deploy is going wrong. A runbook is read under pressure, by
someone looking for deploy documents, not for a feature folder.
