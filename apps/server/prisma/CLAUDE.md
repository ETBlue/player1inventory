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
