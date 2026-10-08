# Plan — PR B, issue #335: `note` and `wikidataUrl` on the cloud side

**Date:** 2026-10-08
**Branch:** `feature/cloud-item-note-wikidata` · worktree `.worktrees/feature-item-note-wikidata`
**Base:** `main` at `7aef02f3` (the #339 merge)
**Design:** `2026-10-08-parity-followup-design.md` (same folder)
**Issue:** #335

## The problem

In cloud mode, typing a note or a Wikidata URL on an item's Info tab makes the save **fail**.
Both fields exist in `packages/types`, in `ItemForm`, and in the local Dexie `Item`. Neither
exists on the cloud side, so the client sends a field the schema does not declare and GraphQL
rejects the whole mutation.

Verified on this branch, not copied from the issue:

| Where | `note` | `wikidataUrl` |
|---|---|---|
| Prisma `Item` model | **absent** | **absent** |
| `apps/server/src/schema/item.graphql` | **absent** | **absent** |

The `note` matches elsewhere in those files are different fields — `InventoryLog.note`
(`schema.prisma:201`) and `InventoryLogInput.note` (`import.graphql:56`). Do not confuse them.

`toConfigInput` in `apps/web/src/hooks/useItems.ts` strips the five stock state fields and on
purpose does **not** strip these two. Its comment records why: a failed save is better than a
note that vanishes with no error. That choice stays correct and becomes unnecessary once the
fields exist.

## No deploy window — the opposite of PR A

Adding a field to a GraphQL type is safe for an old bundle: an old client simply does not ask
for it. This is the reverse of PR A, where a **required argument** broke both deploy orders.
So PR B needs no coordination and no update prompt.

The one ordering fact: Railway runs `prisma migrate deploy` as its release command, so the
migration reaches production on merge without a manual step.

## Measured scope — 8 selection sets, not the breakdown the issue gives

The issue's total of **8** is right. Its breakdown is wrong, so use this table. Measured with
`amountPerPackage` as the marker for "this operation lists `Item`'s configuration fields":

| File | Operations |
|---|---|
| `apps/web/src/apollo/operations/items.graphql` | `GetItems`, `GetItem`, `UpdateItem` |
| `apps/web/src/apollo/operations/itemStocks.graphql` | `PantryData`, `ApplyUnitSwitch` |
| `apps/web/src/apollo/operations/import.graphql` | `BulkCreateItems`, `BulkUpsertItems` |
| `apps/web/src/apollo/operations/shopping.graphql` | `RemoveFromCart` |

`shopping.graphql` is the one most likely to be missed — the issue does not mention it, and
nor did my own first count.

**Decide per operation whether it needs the two fields, and say why.** They are not all the
same: `GetItem` feeds the Info tab that edits them, while `RemoveFromCart` returns item fields
for cache normalisation. The pairs in `items.graphql` and `itemStocks.graphql` carry comments
promising they stay in step with a sibling, so both halves of such a pair move together.

---

## Task 1 — server: Prisma, migration, GraphQL, resolvers

**Files:** `apps/server/prisma/schema.prisma`, a new migration directory,
`apps/server/src/schema/item.graphql`, `apps/server/src/schema/import.graphql`,
`apps/server/src/resolvers/item.resolver.ts`, `apps/server/src/resolvers/import.resolver.ts`,
`apps/server/scripts/verify-migration.ts`, plus server tests.

1. Add `note String?` and `wikidataUrl String?` to the Prisma `Item` model.
2. **Hand-write the migration.** Two nullable `ALTER TABLE "Item" ADD COLUMN` statements. This
   is the simplest case in `apps/server/prisma/CLAUDE.md`: no backfill, so **no** `UPDATE`, and
   **no** `RAISE EXCEPTION` guard — those are only for a `NOT NULL` column on a table with rows.
   Name it `apps/server/prisma/migrations/20261008000000_add_item_note_and_wikidata_url/migration.sql`.
   There were **12** migrations before this one, so it is the **13th**. (An earlier draft of
   this plan said 13 and 14th. That came from `ls apps/server/prisma/migrations | wc -l`, which
   counts `migration_lock.toml` as an entry. Count directories: `ls -d .../migrations/*/ | wc -l`.)
3. **Do NOT run `prisma migrate dev` and NEVER `prisma migrate reset`.** `migrate dev` can
   decide to reset, and `reset` drops the schema. Hand-write the SQL, then apply with
   `prisma migrate deploy`, which is additive and cannot drop anything.
4. Apply to the **dev** database: `(cd apps/server && pnpm prisma migrate deploy)`.
5. Apply to the **E2E** database, or task 3's cloud run fails. Override the two variables for
   one command only. **Before writing, prove the override is real:** run
   `prisma migrate status` with and without it and confirm the two report **different hosts**
   (`apps/server/prisma/CLAUDE.md`, *Prove the env override before you write to any copy*).
   **Never print a connection string** into output, a commit or your report.
6. `item.graphql` — add both fields to the `Item` type, `CreateItemInput` and
   `UpdateItemInput`.
7. `import.graphql` — add both to `ItemInput`, or a cloud backup loses them.
8. Make `createItem` and `buildItemUpdateData` actually persist them, and the bulk import
   resolvers too. Check each one rather than assuming a spread covers it.
9. **Add `verify-migration.ts` assertions for the new migration.** For an additive migration
   the assertion is that the columns are **present** on `Item`
   (`apps/server/prisma/CLAUDE.md:165`). Read the columns from `information_schema`, not with a
   `SELECT` — a `SELECT` of a missing column throws Postgres `42703` before the assertion runs.
   Both identifier columns need a `::text` cast. Issue #333, in PR C, is what will execute these.

**Tests.** Cover that `createItem` persists both, that `updateItem` persists both, that a
cloud backup round trip keeps both, and that an absent value stays null rather than becoming
an empty string.

**Mutation check (required).** Remove `wikidataUrl` from `buildItemUpdateData`'s output and
confirm a test goes red naming that field. Then remove it from `CreateItemInput` and confirm
the build fails. Report the exact text of both.

---

## Task 2 — web: the 8 selection sets, import plumbing, tests

**Files:** the four `.graphql` files in the table above, `apps/web/src/lib/importData.ts`,
`apps/web/src/hooks/useItems.ts`, plus tests.

1. Add both fields to each selection set you judge needs them, and say why for each.
2. `toItemInput` in `importData.ts` — add both. It has a **return-type guard** added in #332
   that fails the build if a key is not declared on the input, so the two halves cannot drift
   apart silently. Check that guard still does its job after your change.
3. `toConfigInput` in `useItems.ts` — the two fields are no longer a problem. **Do not start
   stripping them**; they must now reach the server. Update the comment that explains the old
   failure so it describes the current state and says when it changed.
4. Run `pnpm codegen`. Remember from PR A: codegen writes **neither** output when any document
   fails, while still printing a `✔` line for the server. Check the symbol actually landed, for
   example `grep -c wikidataUrl apps/web/src/generated/graphql.ts`.

**Mutation check (required).** Remove `note` from `GetItem`'s selection set and confirm a test
goes red. If nothing goes red, the field is not read by any test — say so plainly rather than
inventing a test that passes either way.

---

## Task 3 — E2E: remove the skip

**File:** `e2e/tests/item-management.spec.ts`

Line 125 is:

```ts
test.skip(baseURL === CLOUD_WEB_URL, 'wikidataUrl/note not yet in cloud GraphQL schema')
```

inside `test('user can persist note and wikidata URL on the Info tab', …)` at line 122.
Removing that one line is the acceptance criterion for #335.

Run it narrowed, `cloud` project only:

```bash
pnpm test:e2e --project=cloud e2e/tests/item-management.spec.ts
```

The `cloud` count should go from 97 to **98**. Check all four ports are free first and that no
other E2E suite is running — only one per machine.

**This test is the real proof of #335.** No server unit test runs a resolver against real SQL.

---

## Task 4 — documentation

1. `apps/server/prisma/CLAUDE.md` — a line for the new migration, following how the others are
   recorded.
2. `apps/web/src/routes/items/CLAUDE.md` — the Info tab's two fields now work in cloud mode.
3. `docs/INDEX.md` — update the `cloud-parity` row: PR B done, PR C remaining.
4. The design doc — move PR B to its finished state, including anything the issue or this plan
   got wrong.
5. Root `CLAUDE.md` — only if a pattern changed.

---

## Verification gate

```bash
(cd apps/web && pnpm lint)
pnpm build 2>&1 | tee /tmp/p1i-build-pr-b.log
grep 'TS6385' /tmp/p1i-build-pr-b.log && echo FAIL || echo OK
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
pnpm test
```

**Baseline measured on this branch before any change:** fill this in yourself. `main` at
`7aef02f3` should be server **351** / 25 files and web **2289** / 249 files, but **re-measure
rather than subtract from this line.**

The root `pnpm build` runs `prisma generate` and type-checks `apps/server/scripts/`, both since
2026-10-07, so a dangling Prisma field reference and a broken `verify-migration.ts` both fail
here.

**Final phase:** `pnpm test:e2e:all`. Swap has been near its limit — run the three projects as
separate invocations, and `cloud` in three chunks over its `testMatch` files, as PRs #338 and
#339 both needed.

## Known gaps this PR will carry

| Gap | Note |
|---|---|
| The new `verify-migration.ts` assertions will not have run | That is #333, in PR C |
| Production gets the columns on merge, via Railway's `migrate deploy` release command | Not verified by this PR |
