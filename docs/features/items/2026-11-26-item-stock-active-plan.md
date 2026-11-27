# Plan: an "Active here" switch for each item at each location

Date: 2026-11-26. Design: `2026-11-26-item-stock-active-design.md`. Brainstorming:
`2026-11-26-brainstorming-item-stock-active.md`.

Two PRs. **Read the design doc first**, especially *The rule* and *New rows*. Answer the
owner questions at the end of the design doc before task S.1; the tasks below follow the
recommended answers (1A, 2A, 3A, 4A, 5A). If an answer differs, the tasks that name it
change.

**Every task:** TDD (write the failing test, see it red, then the code, see it green). Run
the gate from the root `CLAUDE.md`, *Verification Gate*, at the end of each task. Commit per
task with scope, plain English, by path. Report what the plan got wrong.

## PR 1: server — `feature/item-stock-active-server`

Branch from `origin/develop` (owner question 5A). PR into `develop`.

### S.1 The shared rule

- `packages/types/src/index.ts`: `isStockActive` as written in the design. It takes a
  structural parameter (`{ isActive?, targetQuantity }`), so it needs no change to the
  `ItemStock` interface. The server uses it in S.4.
- **Do NOT add `isActive` to the `ItemStock` interface in PR 1.** That interface feeds the
  web's `StockFields`, and `STOCK_FIELD_KEYS`' type check (`apps/web/src/lib/itemStock.ts`)
  would fail the web build. The interface change is task W.1, in PR 2. The server does not
  need it: it reads Prisma's own `ItemStock` type.
- Tests: `isStockActive` for `{ true, 0 }`, `{ false, 5 }`, `{ missing, 0 }`,
  `{ missing, 5 }`, `{ null, 0 }`. `packages/types` has no `test` script, so `pnpm test`
  would skip a test file there. Put them in `apps/server/src/lib/isStockActive.test.ts`
  (importing from `@p1i/types`), the same way the web suite tests the shared quantity code
  from `apps/web/src/lib/quantityUtils.test.ts`.

### S.2 Migration and Prisma

- `schema.prisma`: `isActive Boolean @default(true)` on `ItemStock`, with a comment.
- `prisma/migrations/20261126000000_add_item_stock_is_active/migration.sql`: the two
  statements from the design, with a SQL comment that says why the `UPDATE` exists (every row
  that showed as inactive must stay inactive) and why there is no guard (`NOT NULL DEFAULT
  true` leaves no `NULL`). Write it by hand or with `prisma migrate dev --create-only`; follow
  `apps/server/prisma/CLAUDE.md` (never apply it to a shared database).
- `apps/server/prisma/CLAUDE.md`: add the named exception (constant default plus one backfill
  `UPDATE` from another column), with this migration as the model.
- `scripts/migrationDeploys.ts`: add the folder to the `last` group.
- `scripts/verify-migration.ts`: a raw-SQL seed before the last deploy (three stock rows:
  target 0, 5, 0.5, with ids you read back), and `assertItemStockIsActive` after it, as listed
  in the design. Raw SQL for the seed, because the Prisma client knows `isActive` and the
  column is not there yet.
- Gate: root `pnpm build` (it runs `prisma generate`).
- Mutation check: delete the `UPDATE` line, run `verify:migration` on the Neon test branch,
  see the target 0 assertion fail. **Only the main session runs `verify:migration`, with the
  owner's consent.** The implementer writes the script and type-checks it; they do not run it
  against any database.

### S.3 GraphQL and the stock writes

- `schema/itemStock.graphql`: `isActive: Boolean!` on `ItemStock`; `isActive: Boolean` on
  `ItemStockInput`, with a comment (`null` and missing mean "leave it").
- `resolvers/itemStock.resolver.ts`: `StockInput`, `StockData` and `toData` carry `isActive`
  (only a boolean is copied).
- `lib/itemStockWrite.ts`: `StockWrite.isActive?: boolean`; `writeStock`'s `create` writes
  `isActive: data.isActive ?? true`; `ensureStockAtLocation` creates with `isActive: true`
  (owner question 1A). Update the comment at line 187.
- Tests (new file `src/resolvers/itemStock-active.resolver.test.ts`, against `stockFake`):
  the five `upsertItemStock` cases in the design; copy-on-add from an inactive source opens
  active; an existing inactive row is returned untouched; checkout and `consumeRecipes` of an
  inactive item succeed and leave it inactive; `applyUnitSwitch` leaves an inactive row
  inactive.
- Check `src/test/stockFake.ts`: it must store `isActive` and must not add a default the real
  resolver forgot. Add a `stockFake.test.ts` case if it needs a change.
- Mutation checks: drop `isActive` from `writeStock`'s `create`; set it from the source in
  copy-on-add; let `toData` pass `null`. Each must turn a test red.

### S.4 Import and export

- `schema/import.graphql`: `isActive: Boolean` on `ItemStockImportInput`.
- `resolvers/import.resolver.ts`, `bulkCreateItemStocks` and `bulkUpsertItemStocks`: take
  `isActive` out of the `...quantities` spread, and write
  `isActive: isActive ?? quantities.targetQuantity !== 0` in `create` and in `update`
  (a replace takes the file's value; an old file gets the old meaning).
- Tests in `import-itemStock.resolver.test.ts`: `true`, `false`, missing with target 0,
  missing with target 5, `null` with target 0, for both mutations.
- Mutation check: replace the fallback with `?? true`; the "missing, target 0" test goes red.

### S.5 Docs and gate

- Root `CLAUDE.md`: no change. No authorization rule changes, and there is no new mutation
  for *Live updates*.
- `apps/server/prisma/CLAUDE.md` (done in S.2).
- Design doc: an *As built: PR 1* section, like the consumable design.
- `docs/INDEX.md`: PR 1 status.
- Gate: lint, root build, build-storybook, check, the TS6385 grep, `pnpm test`. Count the
  tests before and after (measure the baseline first; do not quote this file).
- E2E: `pnpm test:e2e:all`. First run `pnpm --filter server e2e:db:migrate` for the local E2E
  database. No new spec in PR 1: the web does not use the field yet. The cloud specs prove
  that nothing that exists broke.

### Deploy PR 1

1. Merge PR 1 into `develop`.
2. Open the release PR `develop` → `main`, merge with "Create a merge commit".
3. Check that Railway started a deploy of that commit, and wait until it is active. Read the
   build log for the start check and `prisma migrate deploy`.
4. Bring `develop` level with `main` (`git push origin origin/main:develop`, when nothing
   merged into `develop` since the release).
5. On this machine: `pnpm --filter server e2e:db:migrate`.

## PR 2: web — `feature/item-stock-active-web`

Branch from `origin/develop` AFTER step 4 above. PR into `develop`. **Do not merge before
Railway shows PR 1 active.**

### W.1 The predicate and the GraphQL documents

- `packages/types/src/index.ts`: `ItemStock.isActive?: boolean`, with a comment (the
  switch; a missing value is old data, read through `isStockActive`). Replace the old comment
  at line 71. Add `'isActive'` to `STOCK_FIELD_KEYS` (`lib/itemStock.ts`); `tsc` fails until
  you do.
- `lib/quantityUtils.ts`: `isInactive` reads `!isStockActive(item)`; widen its type;
  `StockPreviewValues` gains `isActive`; `getStockPreview` passes it. Update the comments
  listed in the design (*Comments and docs*).
- `apollo/operations/itemStocks.graphql` and `export.graphql`: select `isActive` in
  `PantryData`, `ItemStocksForItem`, `UpsertItemStock`, `AddItemToLocation`,
  `AllItemStocks`. Run `pnpm codegen` and check the generated file has the field
  (`grep -c isActive apps/web/src/generated/graphql.ts`), not only the log.
- `hooks/useItems.ts`: `toStockInput` emits `isActive` when present;
  `toCreateStockInput` sends `isActive: fields.isActive ?? true`.
- `lib/deserialization.ts`: check `isActive` passes through.
- Tests: `quantityUtils.test.ts` (the four cases, `isInactiveHere` on `ZERO_STOCK`,
  `isEmptyStock` / `isLowStock` for an inactive item with target 5, `getStockPreview`);
  `useItems` tests for the two input builders.
- Mutation check: `isInactive` back to `targetQuantity === 0`; the "inactive with target 5"
  and "active with target 0" tests go red.

### W.2 Group cards

- `RecipeGroupView`, `ShelfGroupView`, `VendorGroupView`: an inactive item adds its packed
  amount and 0 to target and refill.
- `GroupCard`: `inactive` status when `activeCount === 0`.
- `ItemProgressBar.tsx:334`: comment "no target" (no behaviour change).
- Tests with an inactive item WITH a target, and a group of active no-target items. Update
  the stories if a story shows a group status.
- Mutation check: sum the inactive item's target again; the group test goes red.

### W.3 Local database

- `db/index.ts`: version 22 with the upgrade from the design, and its comment block.
- `db/operations.ts`: the four new-row writers write `isActive: true` (design, *New rows*);
  copy-on-add overrides the copied value with `true`.
- `apps/web/src/db/CLAUDE.md`: a v22 section; correct the v16 sentence that says
  `targetQuantity === 0` is the inactive marker; current version 22; the file list.
- Tests: `db/upgradeV22.test.ts`; `upgradeV21.test.ts` `verno` at least 21;
  `operations.test.ts` (each new-row writer, copy-on-add from an inactive source, a
  switch-only `updateItem` writes no `stockCount` log).
- Mutation checks: drop the derive in the upgrade; drop `isActive: true` from
  `upsertItemStock`'s create branch.

### W.4 Import and export

- `lib/importData.ts`: `deserializeItemStock` writes `isStockActive(raw)`; `toItemStockInput`
  sends it.
- Tests: an old payload (no field) with target 0 and target 5, local and cloud; a new payload
  keeps `false` with target 5.
- Mutation check: drop the derive in `deserializeItemStock`.

### W.5 The switch

- i18n `en.json` and `tw.json`: the three keys from the design (one changed hint, two new).
- `QuickUpdateDialog`: `localActive` state, the switch row above the target, the "nothing
  changed" check, the save payloads, the preview.
- `ItemForm` stock section: the `isActive` form value (type, default, dirty check, reset), the
  switch row above the target, `readOnly` handling. `routes/items/$id/stock.tsx`
  `buildStockUpdates` sends it. `routes/items/$id/index.tsx` pager values and compare
  include it.
- Stories: `QuickUpdateDialog` and the Stock tab with an inactive item that has a target;
  their `.stories.test.tsx` smoke tests assert the switch is off.
- Tests (name them `user can …`): turn off and on in each place; target and refill stay;
  the bar is grey before Save; a viewer sees the switch disabled.
- Mutation checks: leave `isActive` out of the save payload; leave it out of the dirty check
  (Save stays disabled, so the test that saves goes red).

### W.6 E2E

- `e2e/helpers/fixture.ts`, `e2e/helpers/locationSeed.ts`: an optional `isActive` on seeded
  stock rows. Leave existing seeds alone (they rely on the fallback, on purpose).
- `e2e/helpers/stockReadback.ts`: read `isActive` back.
- New `e2e/tests/item-stock-active.spec.ts`, in `local` and in `CLOUD_SPECS`
  (`e2e/playwright.config.ts`); the tests listed in the design, including the axe scans,
  light and dark. Use `expect.poll` for a backend readback after a click.
- Check the cloud spec count with the two commands in the root `CLAUDE.md`.

### W.7 Docs, gate, E2E

- `apps/web/src/components/CLAUDE.md` (line 179, the predicates; the group card status);
  `apps/web/src/routes/CLAUDE.md` (line 429 and the shopping sections);
  `apps/web/src/routes/items/CLAUDE.md` (the Stock tab switch); `e2e/CLAUDE.md` (the new
  spec).
- Design doc: *As built: PR 2*. `docs/INDEX.md`: PR 2 status.
- Gate, then `pnpm test:e2e:all`. Copy `test-results/` aside before any re-run.

### Deploy PR 2

1. Check Railway shows PR 1's commit active (again, before the merge).
2. Merge PR 2 into `develop`; release `develop` → `main` when the owner chooses.
3. After the web deploy, open the pantry in cloud and in local mode and check that items that
   were inactive before are still in the inactive section.
