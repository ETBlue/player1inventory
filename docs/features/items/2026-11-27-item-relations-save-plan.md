# Plan: save item tags, vendors and recipes with one Save

Date: 2026-11-27. Design: `2026-11-27-item-relations-save-design.md`. Brainstorming:
`2026-11-27-brainstorming-item-relations-save.md`.

Two PRs. **Read the design doc first**, especially *The draft*, *Server: `setItemRecipes`* and
*RBAC*. Answer the open owner questions (4 to 10) before task A.1. The tasks below follow the
recommended answers (4A, 5A, 6A, 7A, 8A, 9A, 10A). If an answer differs, the tasks that name
it change.

**Every task:** TDD (write the failing test, see it red, then the code, see it green). Run the
gate from the root `CLAUDE.md`, *Verification Gate*, at the end of each task. Commit per task,
with a scope, plain English, by path. Check each commit with `git show` (lint-staged can change
a staged file). Report the mutation checks you ran and that each went red. Report what the plan
got wrong.

**Measure, do not quote.** Take your own baseline of the test counts and the live guard counts
before the first task. The numbers in docs go stale.

## PR A: server — `feature/item-relations-save-server`

Branch from `origin/develop`. PR into `develop`. No migration, no `prisma migrate`, no
`verify-migration.ts` run.

### A.1 The mutation

- `apps/server/src/schema/recipe.graphql`: `setItemRecipes(itemId: ID!, recipeIds: [ID!]!): [Recipe!]!`
  with the doc comment from the design.
- `apps/server/src/resolvers/recipe.resolver.ts`: the resolver, steps 1 to 10 of the design, in
  that order. `defaultAmount` is `consumeAmount > 0 ? consumeAmount : 1` (question 4A). Read the
  item and the current links through `tx`.
- `apps/server/src/lib/consumable.ts`: a row for `setItemRecipes` in the table at the top.
- `pnpm codegen` from the root, then check the output, not the log:
  `grep -c setItemRecipes apps/server/src/generated/graphql.ts` (at least 1).
- Tests: new `apps/server/src/resolvers/recipe-set-item.resolver.test.ts`, every case listed in
  the design under *PR A*. Model `recipeItem` in the test file the way
  `recipe-consumable.resolver.test.ts` does, with three additions: the `(recipeId, itemId)` key
  (`P2002` on a duplicate unless `skipDuplicates`), the `recipe: { householdId }` relation filter
  (follow `recipeId` to the `recipe` store), and a THROW on any other `where` key. Register the
  store with `runInTransaction`. Seed the fixtures so they can tell implementations apart:
  - a recipe of ANOTHER household that holds the item (pre-#273 row);
  - an item with `consumeAmount: 0`;
  - an existing link whose amount differs from `consumeAmount`.
- Mutation checks, each must go red, then restore from a copy (never `git checkout --` with
  uncommitted work):
  1. drop `recipe: { householdId }` from the links read;
  2. `?? 1` instead of `> 0 ? … : 1`;
  3. refuse a non-consumable item for a remove too;
  4. take the write out of the transaction (the rollback test);
  5. skip `requireCatalogIds` (the other household's recipe test).

### A.2 Live events

- `apps/server/src/resolvers/live-publish.guard.test.ts`: `setItemRecipes: { kinds: ['CATALOG'] }`
  in `publishes`, next to `updateRecipe`.
- `apps/server/src/resolvers/catalog-live-publish.resolver.test.ts`: one household `CATALOG`
  when something changed; nothing for the same list again; nothing for a refusal.
- Mutation check: publish before the "changed" check (the "same list" test goes red).
- Count both lists again with the two commands in the root `CLAUDE.md` (H6b *Counts* table).
  Expect `publishes` + 1. Update the sentence "Today: 84 fields, 77 in `publishes` and 7 in
  `publishesNothing`" in *Live updates (cloud)* with the numbers YOU measure.

### A.3 `updateItem`'s tag and vendor lists in one transaction (question 7A)

Skip this task if the owner answered 7B.

- `apps/server/src/resolvers/item.resolver.ts` (`updateItem`, `:226-292`): the item update, the
  two `deleteMany` / `createMany` pairs and (when `consumable === false`) the `recipeItem`
  delete in ONE `prisma.$transaction(async (tx) => …)`. The `findUniqueOrThrow` and the
  `publishHouseholdChange` stay after it. Keep the `finally`, so a failure still publishes only
  when something may have changed; say in a comment what you chose and why.
- Test: a `createMany` on `itemTag` that throws once; after the error the item still has its old
  tags. The item test fakes must register the junction stores with `runInTransaction`; check
  that they do, and add it if not.
- Mutation check: move the `itemTag.createMany` outside the transaction (the test goes red).

### A.4 Docs and gate

- Design doc: *As built: PR A* (commits, what differs from the plan).
- Root `CLAUDE.md`: the live guard counts (A.2). `docs/INDEX.md`: PR A status.
- The gate. Server tests run in `pnpm test`; the cloud E2E of PR A is in PR B (the web is what
  sends it). Run `pnpm test:e2e:all` anyway at the end, to show nothing else broke.

### Deploy PR A

1. Merge into `develop`; release `develop` → `main` with a merge commit, when the owner says.
2. Check that Railway started a deploy of that commit, and wait until it is active.
3. No `e2e:db:migrate` is needed: there is no migration.

## PR B: web — `feature/item-relations-save-web`

Branch from `origin/develop` after PR A is merged. It may be built before PR A is deployed, but
**it merges into `develop` only after Railway shows PR A active**. If the Active switch PR 2
(`feature/item-stock-active-web`) is still open, merge it first and rebase this branch on
`develop` (design, *Release order*).

### B.1 The local batch and the GraphQL document

- `apps/web/src/apollo/operations/recipes.graphql`: `mutation SetItemRecipes($itemId: ID!, $recipeIds: [ID!]!)`
  selecting `id name lastCookedAt items { itemId defaultAmount }`. Root `pnpm codegen`.
- `apps/web/src/db/operations.ts`: `setItemRecipesBatch(itemId, recipeIds)`, steps 1 to 6 of the
  design's *Local mode*. One `db.transaction('rw', [db.items, db.recipes], …)`; only Dexie awaits
  inside.
- `apps/web/src/db/CLAUDE.md`, *Transactional batches*: an entry for it, and the count of
  operations in that section's first sentence.
- Tests in `db/operations.test.ts`: the server's cases that apply to one household (add and
  remove in one call, `consumeAmount: 0` → 1, an existing amount kept, the same list twice
  changes no `updatedAt`, a missing recipe throws and writes nothing, non-consumable add throws
  `NotConsumableError`, remove only is allowed, rollback when a write throws).
- Mutation checks: `?? 1`; refuse a remove of a non-consumable item; write each recipe outside
  the transaction (the rollback test).

### B.2 The hook

- `apps/web/src/hooks/useRecipes.ts`: `useSetItemRecipes()`, as the design's *The hook*.
- `apps/web/src/hooks/CLAUDE.md`: a line for it.
- Tests in `hooks/useRecipes.test.ts` (local: `mutateAsync` resolves after the invalidation) and
  a cloud case with `MockedProvider` (one `SetItemRecipes` request; `GetRecipes` read again).
- Mutation check: drop the `refetchAfterWrite` call (the cloud test that waits for the second
  `GetRecipes` goes red).

### B.3 The draft, the Save button and the guard

- `apps/web/src/hooks/useRelationDraft.ts`: the draft of the design (`added`, `removed`,
  `shown`, `dirty`, `press`, `add`, `reset`), with the clean-up as an exported pure function.
  It keeps the previous list of existing ids, for the "was in the list, gone now" rule.
- `apps/web/src/hooks/useRelationTabSave.ts`: `registerDirtyState` (and `false` on unmount),
  `useRegisterSaveControl` with `canSave = dirty && !isPending && canEdit`, and `saveSlot`.
- `apps/web/src/components/item/TopBarSaveButton/` (`TopBarSaveButton.tsx`, `index.ts`, a story,
  a smoke test): the portal button, `type="button"`, `isLoading`, `disabled`,
  `className="shrink-0"`, label `common.save`. Nothing when `saveSlot` is `null`.
- `apps/web/src/routes/items/$id.tsx`: `isOnEditableTab` as a list of the five paths; the
  comments at `:33-35` and `:145-147`. `hooks/useItemLayout.tsx`: the comments at `:11-15` and
  `:19-24` ("the current tab").
- `apps/web/src/lib/saveError.ts` (question 6A): a `FORBIDDEN` branch that shows
  `settings.catalogReadOnlyItem`, after the offline and `NOT_CONSUMABLE` branches. Check every
  caller of `showSaveError` (`git grep -n showSaveError apps/web/src`) and say in the report
  which other screens now show this text for a `FORBIDDEN`; if one would be wrong (for example a
  LOCATION write, where the right text is `common.locationViewOnly`), limit the branch with a
  second argument instead, and say so.
- Tests: `hooks/useRelationDraft.test.ts` (every row of the press rule and of the clean-up
  table, including the trap row); `lib/saveError.test.ts` for the new branch.
- Mutation checks: drop the "was in the list" condition (the trap row goes red); drop the
  "`added` id now in `saved`" rule.

### B.4 Tags tab

- `apps/web/src/routes/items/$id/tags.tsx`, as the design's *Tags tab*. Delete
  `loadingTagId`, `assigningTagIds` and the badge spinner. Badges `aria-disabled` while saving
  (question 9A). With 8A: `tabIndex={0}` on a pressable badge, Enter and Space press it.
- Tests: rewrite `tags.test.tsx`, `createAssign.cloud.test.tsx` (tag half) and
  `saveFailed.cloud.test.tsx` (tag rows) as the design's table says. New: two presses and one
  Save send ONE `updateItem` with both; a press twice leaves Save off; a new tag is pressed and
  Save is on, and with `GetTags` held it stays pressed when the list lands (the trap); a failed
  Save keeps the draft and shows the toast; a member sees no Save; with 8A, Enter on a badge
  presses it.
- Stories: a story with a pressed, unsaved badge; its smoke test asserts the Save button is on.
- Mutation checks: Save sends `saved` instead of `shown`; remove the `aria-disabled` while
  saving (the "press during Save" test).

### B.5 Vendors tab

- `vendors.tsx`, as the design's *Vendors tab*; the same deletions; `showVendorCreateError`
  stays for the create.
- Tests: rewrite `vendors.test.tsx`, the vendor half of `createAssign.cloud.test.tsx` and of
  `saveFailed.cloud.test.tsx`. Same new cases as B.4.
- Story and smoke test as B.4.
- Mutation check: the create also sends `updateItem` again (the "create sends no `UpdateItem`"
  test goes red).

### B.6 Recipes tab

- `recipes.tsx`, as the design's *Recipes tab*. Create with `mutateAsync` and `items: []`.
  Save with `useSetItemRecipes`. The non-consumable rules stay. The draft drops `added` when the
  item turns non-consumable (design, *The draft*).
- Tests: rewrite `recipes.test.tsx` (including the `:230-320` pair for `mutateAsync`) and the
  recipe rows of `saveFailed.cloud.test.tsx`. New: a Save that adds one recipe and removes
  another sends ONE `setItemRecipes` with the full list; a new recipe is created with NO items
  and Save adds the item; `NOT_CONSUMABLE` on Save shows `common.notConsumable` and keeps the
  draft.
- Story and smoke test as B.4 (plus the existing `NonConsumableItem` story).
- Mutation checks: create with this item in `items` (the "created with no items" test); send
  only the changed recipes instead of the full list.

### B.7 The guard, the dialog and the read-only view

- Tests: `$id.tabs.test.tsx` (leaving Tags, Vendors and Recipes with a press opens the dialog;
  Log does not); `unsavedDialogSave.test.tsx` and `unsavedDialogSave.cloud.test.tsx` (Save in
  the dialog on the Recipes tab saves, then moves; a failed Save keeps the dialog open; Discard
  writes nothing and keeps a created tag); `saveTopBar.test.tsx` (the Save is in the top bar on
  the three tabs); `readOnly.test.tsx` (a member: no Save on the three tabs; question 5A: a
  manager demoted while a press is unsaved sees the saved state and no Save).
- Mutation checks: remove `/recipes` from `isOnEditableTab`; `canSave` without `canEdit`.

### B.8 E2E

- `e2e/pages/ItemPage.ts`: `saveRelations()` (press the top bar Save, wait for the "Saved"
  toast); the tag, vendor and recipe helpers press and then save. Drop the `aria-busy` wait.
  Update the comments that name line numbers in `tags.tsx`, `vendors.tsx` and `recipes.tsx`.
- `item-management.spec.ts`, `settings/tags.spec.ts`, `settings/recipes.spec.ts`: as the design
  says. Grep for any other spec that presses a badge on an item tab:
  `git grep -n "aria-pressed\|createAndAssign\|assignVendor\|NewRecipe" e2e/`.
- `a11y.spec.ts`: the six item tab scans press one badge before the scan.
- New `e2e/tests/item-relations-save.spec.ts`, in `local` and in `CLOUD_SPECS`
  (`e2e/playwright.config.ts`), the cases in the design. Backend readback with `expect.poll`
  after a click. The member test is cloud only (`newUserContext`, `addHouseholdMember` BEFORE
  the member opens a page). Axe scans with `checkA11y` / the helpers in `e2e/helpers/axe.ts`,
  light and dark.
- Count the cloud spec files again with the two commands in the root `CLAUDE.md`.
- Mutation checks (one run each, the new spec only, `--project=local` and `--project=cloud`):
  Save sends the saved list; the Recipes Save sends one `updateRecipe` per recipe instead (the
  readback of the second recipe goes red when the second write is made to fail, or say which
  check you used instead).

### B.9 Docs, gate, E2E

- `apps/web/src/routes/items/CLAUDE.md`: the Save line at the top (Save is on five tabs, not
  two), *3. Tags*, *4. Vendors*, *5. Recipes* ("Changes apply immediately" is no longer true),
  the two #402 paragraphs (replace them with the draft rule; keep one line of history), *Dirty
  State Tracking*, the member table row, and the keyboard known gap (8A).
- `apps/web/src/components/CLAUDE.md`: `TopBarSaveButton`. `apps/web/src/hooks/CLAUDE.md`:
  `useRelationDraft`, `useRelationTabSave`, `useSetItemRecipes`. `e2e/CLAUDE.md`: the new spec.
- `docs/features/items/2026-11-25-bug-new-tag-vendor-not-selected-at-once.md`: one line at the
  top that this design replaces its fix.
- Design doc: *As built: PR B*. `docs/INDEX.md`: status.
- The gate, then `pnpm test:e2e:all`. Copy `test-results/` aside before any re-run.

### Deploy PR B

1. Check Railway shows PR A's commit active (again, before the merge).
2. Merge PR B into `develop`; release when the owner chooses.
3. After the web deploy, in cloud and in local mode: press two tags, Save, reload, and see both;
   add the item to a recipe from the Recipes tab and open Cooking to see it there.
