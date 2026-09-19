# Brainstorming — PR 3c: unit switch and the remove cascade

**Date:** 2026-09-20
**Design:** `2026-08-30-cloud-locations-design.md` §2, §8 Amendment
**Status:** `cloud-locations-status.md`

## What PR 3c is

The last piece of PR 3. Two items, neither blocked by 3a or 3b:

1. **`applyUnitSwitch` — never added to the cloud schema at all.** Design §2 lists
   it; PR 1 shipped `itemStock.graphql` without it. A cloud unit switch leaves
   every location's quantities in the old unit. **No test fails on this**, because
   `buildStockConversions` gates on `isLocal`, so the dialog never lists
   conversions the cloud branch could not write.
2. **A cloud cascade for `removeItemFromLocation`.** The resolver deletes the
   `ItemStock` row only. Local also deletes that (item, location)'s inventory logs
   and cart entries.

## Question 1 — `applyUnitSwitch` must be atomic, but nothing can prove rollback

A half-applied unit switch leaves some locations holding converted numbers and
some holding the originals, with no error anywhere. That is silent data
corruption, not a failure.

Local does it as one Dexie transaction over `items`, `itemStocks` and `recipes`
(`applyUnitSwitchBatch`, `apps/web/src/db/operations.ts`).

**The problem is proving our code rolls back.** `apps/server/src/test/stockFake.ts`
says it does **not** model `$transaction`. PR 2 recorded why: it was left absent
rather than faked as a pass-through, *so no test could make an atomicity claim it
had not earned*. That was the right call then. It means a test today passes
whether or not the resolver uses a transaction.

Postgres will roll back a real `$transaction` regardless. The question is only
whether we can show our implementation opens one and that a failure inside it
writes nothing.

**Answer: model rollback in the fake.** Snapshot state when `$transaction` opens,
restore it when the callback throws.

Why this over the alternatives:

- Cloud E2E against real Postgres would be real rollback, but forcing a
  mid-transaction failure from a browser is awkward and slow to iterate on.
- Documenting the gap is how the dual-write's atomicity gap has been handled
  since PR 2. Doing it again compounds the debt rather than paying it.
- **PR 5 needs this anyway.** It tears out the dual-write, and its correctness
  argument is that `ItemStock` becomes the single writer. A fake that cannot
  model a transaction cannot test that either.

## Question 2 — multi-location authorization

`applyUnitSwitch` converts quantities across **several locations at once** —
`stockConversions` carries a `locationId` per entry. What if the caller lacks a
role on one of them?

**This cannot fire today.** Every location belongs to one user under the current
flat `userId` scoping. It only matters once location RBAC lands.

**Answer: refuse the whole switch.** Check every location named in the
conversions before writing anything. One failure means `FORBIDDEN` and nothing
changes.

The reason is the same as question 1's. Converting only the locations the caller
can write leaves the item in **mixed units across locations** — the exact
corruption the transaction exists to prevent, just authorized rather than
accidental. Refusing whole makes that state unreachable.

It is raised now, rather than deferred, because `requireLocationRole` exists so
this is one function body later instead of N call sites.

## Not a question — the Stock tab confirmation line

`apps/web/src/routes/items/$id/stock.tsx:215` gates the *"Inventory logs: N ·
Cart entries: N"* line on `mode === 'local'`. Its comment says why: cloud had no
cascade to count, and printing the local numbers next to a cloud removal would
name rows it will not touch.

Item 2 gives cloud that cascade, so the guard goes. This is the visible half of
the same change and belongs in the same PR.

## Scope

| In | Out |
|---|---|
| `applyUnitSwitch` — schema, resolver, client | Import / export / purge — PR 4 |
| `$transaction` rollback in the Prisma fake | Dropping `Item`'s five columns — PR 5 |
| `removeItemFromLocation`'s cloud cascade | `useDeleteLocation`'s stale observers — recorded, unowned |
| The Stock tab confirmation line | |

## What this PR does not need

**No Prisma migration.** Both items are resolver and client work on tables that
already exist. If one appears to be needed, that is a signal something has been
misunderstood — stop and say so.
