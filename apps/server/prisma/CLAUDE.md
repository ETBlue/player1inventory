# Prisma Migrations — Agent Rules

Guidance for editing the schema and creating migrations in `apps/server/prisma/`.

## Golden rule: a migration must be valid on a database built **only** from committed migration history

Every `migration.sql` is replayed, in order, against databases that have **only** seen the other committed migrations — never your local dev DB's hidden state. A statement that depends on a column/table/index/enum that no *committed* migration created will pass locally and fail on every clean database (dev reset, CI, production).

Before committing any migration, verify each `ALTER`/`DROP`/`CREATE` references only objects that an **earlier committed migration** created. Do not rely on what happens to exist in your dev database.

## The trap: squashing uncommitted `migrate dev` migrations

`prisma migrate dev` creates a migration **and applies it to your dev DB** immediately. If you then iterate — delete or rename those throwaway migrations, hand-edit, or squash several into one "clean" migration — your dev DB still carries the **applied** originals (and their schema changes) in `_prisma_migrations`. The squashed migration is now written against state that only your dev DB has.

This is exactly how the `vendorId` P3018 deploy failure happened (see `docs/global/backend/2026-04-13-deployment-troubleshooting.md` §10): a deleted `add_vendor_cart_fields` migration had added `Cart.vendorId` on dev; the squashed replacement dropped it; production never had the column.

## Required workflow when you squash, delete, or rewrite uncommitted migrations

1. Finalize the committed migration `.sql` files.
2. **Reset the dev DB so it replays only the committed history:**
   ```bash
   cd apps/server && pnpm prisma migrate reset
   ```
   This is destructive (wipes dev data) and Prisma's AI guardrail requires explicit user consent — ask the user first, then pass their exact confirming words via `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.
3. Confirm clean state:
   ```bash
   pnpm prisma migrate status   # expect "Database schema is up to date!" with no orphan/uncommitted migrations
   ```
   If `migrate status` reports migrations "from the database are not found locally," your dev DB has orphans — it has drifted and a hand-written migration may be unsafe.

## Transaction forms: array vs interactive (callback)

Prisma supports two `prisma.$transaction` forms. Every use before this branch
was the **array form** — `prisma.$transaction([...])`, a list of independent
queries Prisma batches into one transaction with no logic between them:
`apps/server/src/resolvers/import.resolver.ts:499`,
`apps/server/src/resolvers/purge.resolver.ts:22`, and
`apps/server/src/index.ts:29` (the E2E-only cleanup endpoint).

`apps/server/src/resolvers/shelf.resolver.ts:89`'s `applyShelfFilterPicks`
resolver introduces the first **interactive (callback) form** —
`prisma.$transaction(async (tx) => { ... })` — because it needs to read the
current `Item`/`Recipe` rows and branch on them (union ids, check for
already-having a recipe) before deciding what to write, which the array form
cannot express.

**Implication for pooled connections:** the interactive form holds one
database connection open for the duration of the callback (every query inside
it must run sequentially against the same `tx`), unlike the array form, which
Prisma can send as a single batched request. `schema.prisma:5-8` already
configures a `directUrl` alongside the pooled `DATABASE_URL` — an interactive
transaction is exactly the kind of pattern that benefits from a non-pooled
connection, since it ties up a connection from the pool for the whole
callback rather than for one statement. Keep interactive transactions short
and free of any `await` that isn't itself a `tx.*` call.

## Adding a `NOT NULL` column to a table that already has rows

Use four phases, in this order, in **one** migration file. This is the shape PR 1's
`20260830000000_add_location_and_item_stock` and PR 3a's
`20260916000000_add_location_to_log_and_cart` both use.

| Phase | Statement | Why |
|---|---|---|
| 1 | `ALTER TABLE ... ADD COLUMN "x" TEXT` — **nullable** | No existing row can satisfy `NOT NULL` yet |
| 2 | `UPDATE ... SET "x" = ...` — the backfill | Gives every existing row a value |
| 3 | A `DO $$ ... RAISE EXCEPTION` guard | Fails loudly and names the bad rows |
| 4 | `SET NOT NULL`, then the FK, then the index | Only now can the constraint hold |

**Phase 3 is the one people skip.** Without it, a backfill that missed rows fails at phase 4
with Postgres error `23502` (`column "x" of relation "y" contains null values`). That message
names the column but not which rows, not which users, and not why. A `RAISE EXCEPTION` that
counts the leftover rows and lists the owning `userId`s turns a guessing job into a fix.
Postgres runs the whole file in one transaction, so raising leaves the schema untouched.

Write into the SQL comment **what the guard protects against**, not just that it guards. The
message describes a real-world cause, so read it as a diagnosis and not as a claim that the
migration file was edited.

Order inside phase 4 matters: `SET NOT NULL` first, then the FK, then the index. A FK on a
nullable column is legal but says less, and building the index last means it is built once,
over final data.

## Adding a NULLABLE column — the simplest case, and it needs none of the four phases

`20261008000000_add_item_note_and_wikidata_url` (cloud-parity PR B, issue #335) is the model.
It is two statements and nothing else:

```sql
ALTER TABLE "Item" ADD COLUMN     "wikidataUrl" TEXT,
ADD COLUMN     "note" TEXT;
```

**No `UPDATE` backfill and no `RAISE EXCEPTION` guard.** Those two belong only to the
`NOT NULL` shape above. Every existing row simply gets `NULL`, which no constraint rejects, so
there is nothing to backfill and nothing for a guard to count. Adding either one here would be
noise a later reader has to work out the purpose of.

**Write into the SQL comment why the column is nullable, in data terms.** For these two fields
the local Dexie `Item` declares both optional (`wikidataUrl?: string`, `note?: string`), so
"absent" is how local mode already stores "no note", and SQL `NULL` is the same thing. That is
why the resolvers map an absent input to `NULL` and never to `''` — see
`apps/server/src/resolvers/item.resolver.ts`, where `createItem` uses the `strOr` helper and
`buildItemUpdateData` on purpose does **not**, so an explicit `null` can clear the column.

**It still needs its own `verify-migration.ts` assertions**, and "the column is present" alone
is a weak claim. See the *ADD COLUMN needs the same two halves* bullet below.

## Re-keying a primary key

`20260917000000_rekey_cart_to_location_vendor` rewrote `Cart.id` from the bare vendor id to
`${locationId}:${vendorId | 'no-vendor'}`. Four rules came out of it.

**1. Update the child table first, while it can still join on the OLD id.** The FK is
`ON UPDATE CASCADE`, so it must be dropped first or the child update sets a value that does
not exist yet and fails immediately. The order is: drop the FK, `UPDATE "CartItem"`,
`UPDATE "Cart"`, guard, add the FK back with **exactly** the clauses the original migration
declared, or `prisma migrate diff` reports drift against `schema.prisma`.

**2. Any row the migration itself creates must be excluded from the re-key.** That file's
phase A inserts carts whose ids are already in the new shape. Without a clause skipping them
the re-key ran twice over them and produced `loc:loc:no-vendor`. Write the exclusion as an
**exact** predicate (`"id" = "locationId" || ':no-vendor'`), never as a guess about the shape
(`"id" NOT LIKE '%:%'`) — a vendor id containing `':'` would be skipped by the guess and left
un-re-keyed.

**3. Guard on three things, not one.** Every id has the separator; every id starts with its
**own** `locationId`; every child row still names a parent. The second check is the one that
catches a doubled prefix, which a `startsWith` test cannot see. The third catches the parent
being updated before the child — without it that mistake surfaces as Postgres `23503`, which
names the constraint and nothing else.

**4. A re-key cannot be deployed independently of the code that reads it.** Old server code
looks the row up by the old id, finds nothing, and falls into its `create` branch. Whether
that fails loudly or silently inserts a duplicate depends on which old code is running.
**Write a deploy runbook before you deploy**, and take a database branch first, because a
re-key has no `migrate down` — the rollback is a restore, and it loses every write made
after the snapshot. The one for this migration is
`docs/global/backend/2026-09-18-deploy-runbook-cart-rekey.md`.

## Defensive SQL

For destructive operations whose target may not exist on every database, prefer the idempotent forms — `DROP COLUMN IF EXISTS`, `DROP INDEX IF EXISTS`, `DROP TABLE IF EXISTS`. They make a migration safe to replay across drifted databases without changing the end-state.

## Dev and prod are different Neon databases

Local `apps/server/.env` points at the **dev** Neon endpoint; production is a **different** endpoint (visible in the Railway deploy log). A column present on dev says nothing about prod. Never assume prod's schema from your local DB — check `migrate status` against the actual target.

## Recovering a failed production migration

A migration that fails mid-deploy is left in a *failed* state and blocks all later migrations. Postgres runs each migration file in one transaction, so a failed migration rolled back atomically — the schema is untouched. After fixing the SQL:
```bash
pnpm prisma migrate resolve --rolled-back <migration_name>   # against the prod DB, then redeploy
```
Use `--rolled-back` (not `--applied`) because the failed migration left no partial changes.

## Verifying a migration against real SQL

**Nothing in the automated gate executes a migration.** Every server test runs against a
hand-written Prisma fake, so a fake cannot exercise SQL at all, and `pnpm test` / `pnpm check`
/ `build-storybook` never touch a database. A migration that is wrong in a way `tsc` cannot
see ships unnoticed.

`pnpm --filter server verify:migration` (`scripts/verify-migration.ts`) closes that gap:

1. Parks the migration under test outside `prisma/migrations/`,
2. `migrate reset` — rebuilding from **committed history only**, which is also how it enforces
   the golden rule above,
3. seeds a deliberately **multi-user** fixture (one user owning only a `TagType`, so a union
   that reads just `Item` fails),
4. restores the migration, `migrate deploy`, asserts.

**It is not reachable from any gate** — it needs a live database — so it will bit-rot between
manual runs. Run it whenever you touch a migration, and treat a stale failure as a real signal
rather than assuming the script rotted.

These things about it are easy to get wrong. The list grows; count the bullets rather
than trusting a number here — it said **four** when there were seven.

- **It parks migrations by NAME.** `scripts/verify-migration.ts` holds a `MIGRATIONS` list —
  **five** entries today:
  `20260830000000_add_location_and_item_stock`,
  `20260916000000_add_location_to_log_and_cart`,
  `20260917000000_rekey_cart_to_location_vendor`,
  `20261004000000_drop_item_stock_state_columns` (cloud locations PR 5, three assertions) and
  `20261008000000_add_item_note_and_wikidata_url` (cloud-parity PR B, issue #335, four
  assertions — see the additive section below).
  **Count the array rather than trusting this line.** It said **four** until 2026-10-08:
  ```bash
  grep -c "^  '2026" apps/server/scripts/verify-migration.ts
  ```
  **Add your new migration to that list.** A
  migration missing from it is not parked, so `migrate reset` replays it against a database
  that has not yet seen the migrations it depends on. Add assertions for it too: without new
  assertions the script re-proves the old migration and says nothing about yours.
- **A column DROP inverts the usual assertion shape, and one assertion is not enough.** For
  an additive migration you assert the new column is **present**. For a drop you need two
  halves:
  1. the columns are **absent** from the table that lost them, and
  2. they are still **present** on the table that keeps them.

  `Item` and `ItemStock` declare the **same five field names**
  (`targetQuantity`, `refillThreshold`, `packedQuantity`, `unpackedQuantity`, `dueDate`), so
  checking one table alone passes just as happily against a migration that dropped them from
  the **wrong** table. Half 2 is the only assertion that can tell those two apart. PR 5 adds
  a third for the same reason in the other direction: `Item`.`consumeAmount` must **survive**,
  because it sits among the five in the model and is global configuration, not per-location
  state — that assertion catches a drop that took one column too many.

  Read the columns from `information_schema`, not with a `SELECT`. `SELECT "dueDate" FROM
  "Item"` throws Postgres `42703` before `assert` is reached, and a raw driver error is not
  the named `FAIL` the script exists to print. Cast both identifier columns with `::text` —
  `information_schema` uses the `sql_identifier` domain, which Prisma's raw mapper does not
  know.
- **An ADD COLUMN needs the same two halves, for the same reason.** "Assert the new column is
  present" is not enough when two tables share field names. The second half is: assert the
  column is **absent** from the table that must not have it.

  `20261008000000_add_item_note_and_wikidata_url` (issue #335) adds `note` and `wikidataUrl`
  to `Item`. `Item` and `ItemStock` are the pair that shares field names here, so checking
  `Item` alone would pass just as happily against a migration that wrote
  `ALTER TABLE "ItemStock" ADD COLUMN` by mistake. Both fields are global item configuration,
  never per-location state, so `ItemStock` must not carry them.

  That migration's block in `verify-migration.ts` has **four** assertions per field, and the
  last two are worth copying for any nullable text column:

  | # | Assertion | What it catches |
  |---|---|---|
  | 1 | the column is on `Item` | the migration did nothing |
  | 2 | the column is **not** on `ItemStock` | the migration hit the wrong table |
  | 3 | `information_schema` reports `text` and `is_nullable = YES` | a `NOT NULL`, or the wrong type |
  | 4 | a row inserted with neither column set reads back `NULL`, not `''` | a `DEFAULT ''` on the column |

  Assertion 4 matters because `NULL` and `''` are **different stored values**. `NULL` means
  "no note was ever set", which is what local mode stores by leaving the optional field off
  the Dexie row. `''` would mean "the user typed a note and then cleared it". A `DEFAULT ''`
  would make every pre-existing row look like the second one. One more write-then-read
  assertion follows it, so assertion 4 cannot pass by the columns simply being unwritable.
- **An existing assertion can be killed by a later migration joining the list.** PR 5 had to
  delete `assert(items[0]?.targetQuantity === 3, …)`: once PR 5 is in `MIGRATIONS`, that
  `SELECT` throws `42703`. Following "add yours, and write assertions for it" literally would
  have left the script broken. When you add a migration, re-read every assertion already
  there.
- **The root `pnpm build` type-checks this script** — since 2026-10-07. `apps/server`'s
  `build` is `tsc && tsc -p tsconfig.scripts.json && cp …`, and the second pass covers
  `scripts/`. Before that nothing ran it, so a type error here passed the whole gate.
  Proved by mutation: a deliberate `const x: number = "s"` gives
  `scripts/verify-migration.ts(698,7): error TS2322` and pnpm exits 2.
- **It is destructive**, and Prisma's own AI guardrail requires the user's real-time consent
  passed via `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. Ask first.
- **It refuses to run** unless `TEST_DATABASE_URL` *and* `TEST_DIRECT_URL` both resolve — by
  parsed host + path, not string equality — to a different database from **every other
  environment variable whose name ends in `_URL`**. Guarding only the pooled URL is
  insufficient: **Prisma Migrate issues DDL through `directUrl`**, so that is the connection
  that actually drops the schema.

  The check lives in `scripts/databaseIsolation.ts` (issue #333) and is unit-tested in
  `scripts/databaseIsolation.test.ts` — 15 tests, all against fabricated URLs. The script
  itself calls it at module top level, before any DDL.

  **It used to compare `DATABASE_URL` and `DIRECT_URL` only**, a hardcoded pair. The same
  `apps/server/.env` also holds `PROD_COPY_DATABASE_URL` and `PROD_COPY_DIRECT_URL`, so
  pasting one of those into `TEST_DATABASE_URL` dropped the schema of a copy of production
  without complaint. Measured 2026-10-08 with fabricated URLs: the old guard printed
  `OLD GUARD: allowed the run`; the new one throws
  `TEST_DATABASE_URL resolves to the same database (fake-host-prodcopy/dbProdCopy) as
  PROD_COPY_DATABASE_URL — refusing to run, this script drops the schema`.

  Two names are excluded from the comparison: `TEST_DATABASE_URL` and `TEST_DIRECT_URL`
  themselves. On Neon the pooled host and the direct host are often different names for the
  same database, so those two sharing an identity is a correct setup, not a mistake. Both are
  still checked as targets.

  A value that does not parse as a URL is skipped rather than crashing the run — an unrelated
  variable ending in `_URL` may hold anything, and `new URL()` throws on a malformed value.
- **Never point it at a copy of production.** For that, use an additive-only rehearsal:
  `migrate deploy` plus read-only assertions. See the *Production-data rehearsals* section of
  `docs/features/locations/2026-08-30-cloud-locations-design.md` §7. Since #333 the guard
  enforces this for the `PROD_COPY_*` variables, so it is no longer a written rule only.

### Prove the env override before you write to any copy

A rehearsal against a production copy redirects `DATABASE_URL` / `DIRECT_URL` at the copy for
one command. **Prove that redirect is real before the first write.** Run
`prisma migrate status` twice, once with the override and once without, and confirm the two
runs report **different hosts**.

If the override silently falls back, the migration is applied to the dev database and the
command still prints success. The rehearsal then reports green while having tested nothing,
which is worse than a failure. PR 3a's rehearsal (2026-09-17) did this check first; the
result is recorded in `docs/features/locations/cloud-locations-status.md`.

Two more rules from that run:

- **Use a fresh copy for every rehearsal.** A rehearsal writes to its target, so a copy that
  has already had a migration applied cannot rehearse the next one.
- **Check the assertion script as carefully as the migration.** One assertion there matched
  foreign keys with `LIKE '%locationId%'`, which also caught an unrelated FK from an earlier
  migration and reported a false FAIL. A green rehearsal with a broken assertion is worse
  than a red one.

## Deferred data repair: cloud items with `consumeAmount = 0`

**Status: deliberately not done (2026-08-24). Do this before cloud has real users.**

For roughly 24 hours (`6302ee97` → `9e323fa6`) `createItem` in
`src/resolvers/item.resolver.ts` defaulted `consumeAmount` to **0**, meaning
"unconfigured". The resolver always sends an explicit value, so Prisma's
`consumeAmount Float @default(1)` never applied — any cloud `Item` created in
that window holds a genuine `0` in Postgres.

Those rows are **broken, not merely unusual**: `ItemForm` refuses to save
`consumeAmount <= 0`, so a user cannot save that item's Info tab at all until
they fix the field by hand. Local mode repairs the equivalent rows in Dexie
**v17** (`apps/web/src/db/index.ts`); cloud has no counterpart, so the two data
modes currently diverge.

The repair, when it is time:

```sql
-- Count first. If this is 0, write no migration at all.
SELECT count(*) FROM "Item" WHERE "consumeAmount" = 0;

UPDATE "Item" SET "consumeAmount" = 1 WHERE "consumeAmount" = 0;
```

It is naturally idempotent and depends on no schema object a later migration
created, so it satisfies the golden rule above trivially. Run it against the
**dev** Neon endpoint first — dev and prod are different databases (see above),
and the cloud E2E suite shares dev.

Three things to get right:

- **No `createdAt` scoping.** Tempting, but worse: it would require
  reconstructing real deploy timestamps (not commit timestamps). Unnecessary
  anyway — no UI path can produce a `0`, because the form rejects it, so every
  `0` came from that window or from a direct API call.
- **Do NOT add a `CHECK` constraint forbidding 0.** The resolver deliberately
  uses `??`, not `||`, so an explicit `0` from a client is stored on purpose. A
  constraint would turn that into a 500 rather than a stored value. Keep the
  repair a one-off `UPDATE`.
- **This is safe only while `ItemForm` keeps its `consumeAmount > 0`
  validation.** The two decisions are coupled. Since 2026-08-24 the frontend
  treats `0` as a *meaningful* "no step size" value — it renders `step="any"`
  and suppresses rounding (`quantityStep` in `ItemForm.tsx`). `0` is therefore
  representable but not saveable. If that validation is ever dropped so users
  can genuinely choose "no step", a blanket `WHERE "consumeAmount" = 0` would
  be destroying real intent, and this repair must be reconsidered rather than
  run as written.

Unlike Dexie — one user's browser — this rewrites rows in a **shared,
multi-user** database. That is the reason it is cheap now (no real users) and
expensive later.
