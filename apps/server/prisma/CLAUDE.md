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
