# Bug: Cart Migration Fails on Production — Phantom `vendorId` Drop

**Date:** 2026-06-13
**Branch:** fix/cart-migration-vendorid-drift

## Bug Description

Railway deploy fails during `prisma migrate deploy`. The migration
`20260609100000_permanent_vendor_carts` aborts with:

```
Error: P3018
Database error code: 42703
ERROR: column "vendorId" of relation "Cart" does not exist
Migration name: 20260609100000_permanent_vendor_carts
```

Because the migration is left in a failed state, no subsequent migrations
(e.g. `20260612000000_remove_family_group`) can apply, and the container
exits, blocking the deploy.

## Root Cause

The `20260609100000_permanent_vendor_carts` migration runs
`ALTER TABLE "Cart" DROP COLUMN "vendorId"`, but **no committed migration
ever added `vendorId` to `Cart`**.

- `20260411094542_init` creates `Cart` with `id`, `status`, `userId`,
  `familyId`, `completedAt`, `createdAt`, `updatedAt` — **no `vendorId`**.
- No migration between `init` and `permanent_vendor_carts` adds it.
  (The only tracked `vendorId` belongs to the `ItemVendor` table.)

The column existed only on the **local dev database** — added out-of-band
(via `prisma db push` or a since-deleted migration) — so the migration ran
clean locally but is impossible on a Neon database built purely from the
tracked migration history. Classic migration drift between dev and prod.

The migration's other four `DROP COLUMN`s (`status`, `completedAt`,
`createdAt`, `updatedAt`) and the `DROP INDEX Cart_userId_status_idx` all
correspond to real `init` columns/indexes and apply fine. Only the
`vendorId` drop is phantom.

The intended end-state is correct: `schema.prisma` `Cart` is
`id`, `userId`, `lastPurchasedAt` — which the migration otherwise produces.

## Fix Applied

Changed `DROP COLUMN "vendorId"` to `DROP COLUMN IF EXISTS "vendorId"` in
`apps/server/prisma/migrations/20260609100000_permanent_vendor_carts/migration.sql`.
This is a no-op on a clean (Neon) database that never had the column, and
still drops it on any database (local dev) that does. The end-state is
identical on both.

Production recovery (run against Neon, after deploying the edited SQL):

```bash
pnpm prisma migrate resolve --rolled-back 20260609100000_permanent_vendor_carts
# then redeploy → migrate deploy re-runs the corrected migration
```

## Test Added

*TBD*

> Note: raw Prisma migration SQL has no natural automated unit test in this
> stack. The regression guard is the `IF EXISTS` guard itself plus this doc.

## PR / Commit

- Fix: `2856b8e1` — `fix(server): guard phantom vendorId drop in cart migration`
- Doc: this commit
- PR: *TBD*
