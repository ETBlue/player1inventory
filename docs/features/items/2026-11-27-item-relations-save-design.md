# Design: save item tags, vendors and recipes with one Save

Date: 2026-11-27. Brainstorming: `2026-11-27-brainstorming-item-relations-save.md`. Plan:
`2026-11-27-item-relations-save-plan.md`.

Line numbers are on `develop` at `20356e96`.

## Summary

1. **Where it sits.** On the item page, the Tags, Vendors and Recipes tabs write on every
   badge press. Each press sends one request and waits for it, so the tabs feel slow. This
   design makes a press change only the screen, and adds a **Save** in the top bar of each of
   the three tabs, the same Save the Info and Stock tabs have. A new tag, vendor or recipe
   made from a tab is still created at once, but it is assigned only by Save.
2. **Relations.** Two PRs, server first, because the web will send a new mutation:
   - **PR A, server** (`feature/item-relations-save-server`): one new mutation,
     `setItemRecipes`. No migration. Merged into `develop`, then released. PR A alone changes
     nothing on screen.
   - **PR B, web** (`feature/item-relations-save-web`): the three tabs, the local batch, the
     hook, the tests and E2E. Merged into `develop` only after Railway shows PR A deployed.
   - PR B is built next to the Active switch PR 2 (`feature/item-stock-active-web`). They do
     not share a code file today; they share docs and the i18n files. PR B merges after it and
     rebases. See *Release order*.
   - It builds on the flat tab row and the top bar Save (`2026-11-24-item-tabs-flat-design.md`),
     the unsaved-changes dialog (`docs/global/ui-polish/2026-11-25-unsaved-dialog-save-design.md`),
     issue #402 (a new badge selected at once) and the consumable-only recipe rule (#437 and
     `feature/recipes-consumable-only`). It blocks nothing.
3. **What the user gets** once both PRs are merged AND deployed:
   - A badge press on Tags, Vendors or Recipes shows the change at once. No spinner, no wait,
     no "other badges are blocked".
   - **Save** in the top bar sends all the edits of the tab in one request. It is off until
     something changed, shows a spinner while it saves, keeps the page, and shows "Saved".
   - Leaving the tab (another tab, or Back) with unsaved edits opens Cancel · Discard · Save,
     the same dialog as Info and Stock.
   - **New Tag / New Vendor / New Recipe** still create the row at once. The new badge shows
     as selected, and Save assigns it. Discard keeps the new row, not assigned.
   - A Recipes Save that touches several recipes changes all of them or none.
   - A household `member` sees the badges read only and no Save, as today.
   - After PR A alone: nothing visible.
4. **What the developer gets:**
   - **Fewer ways to get it wrong.** The issue #402 machinery (`assigningTagIds`,
     `assigningVendorIds`, `loadingTagId`, `togglingVendorId`, `togglingRecipeId`, the "no
     press while an assign runs" guard) is deleted. Two writes of the whole list can no longer
     race, because there is only one write.
   - **One rule for three tabs.** One small hook (`useRelationDraft`) holds "saved", "what the
     person pressed" and "what to show", with the live update rule written once and unit
     tested once.
   - **One write path for recipe links.** `setItemRecipes` (server) and `setItemRecipesBatch`
     (local) both compute `defaultAmount` themselves, so the web cannot send a wrong one.
   - **A cost.** One more mutation for the live guard list, one more GraphQL document, one more
     Dexie batch, and about 40 unit tests and 6 E2E tests rewritten, because they press a
     badge and expect a write.

## Today: how each tab writes

| Tab | File:line | A press | New … |
|---|---|---|---|
| Tags | `apps/web/src/routes/items/$id/tags.tsx:199-224` (`toggleTag`) | `useUpdateItem().mutateAsync({ tagIds })` with the whole list; `loadingTagId` shows a spinner and blocks every other press (`:206`) | `:158-197` (`handleAddTag`): `createTag`, then `updateItem` with the shown list plus the new id. `assigningTagIds` (`:148`) keeps the new id shown as selected and `aria-busy` until the assign is done (issue #402) |
| Vendors | `vendors.tsx:52-70` (`toggleVendor`) | `useUpdateItem().mutate({ vendorIds })`; `togglingVendorId` spinner (`:32`, `:48-50`) | `:72-109`: `createVendor`, then `updateItem`; `assigningVendorIds` (`:39`) |
| Recipes | `recipes.tsx:43-61` (`toggleRecipe`) | `useUpdateRecipe().mutate({ items })` for that one recipe, adding `{ itemId, defaultAmount: 0 }` (`:52`); `togglingRecipeId` spinner | `:63-78`: `createRecipe({ name, items: [{ itemId, defaultAmount: 0 }] })`, one request |

**What replaces the #402 machinery.** `assigningTagIds` and `assigningVendorIds` existed
because the new badge waited for a second write. With answer 1A there is no second write: the
new id goes into the tab's draft (`added`, see *The draft*) the moment the create returns, so
it shows as selected through the same rule as any pressed badge. `aria-busy` on the badge is
gone. The spinner moves to the Save button. The "no press while an assign runs" guard
(`tags.tsx:200-209`, `vendors.tsx:53-56`) is gone, because presses send nothing.

## The draft

Each tab keeps a draft with two sets: `added` and `removed`. Both hold only the person's OWN
presses on this page. The saved list comes from the server (or Dexie) every render.

| Name | Meaning |
|---|---|
| `saved` | the ids the server (or Dexie) says the item has now: `item.tagIds`, `item.vendorIds`, or the ids of recipes whose `items` hold this item |
| `added` | ids the person pressed ON that were off when they pressed, and new rows created from the tab |
| `removed` | ids the person pressed OFF |
| `shown` | `(saved ∪ added) − removed`, in the order of the page |
| dirty | `added` or `removed` is not empty, after the clean-up below |

**A press** on id `x`: if `x` is shown, take it out of `added` if it is there, else put it in
`removed`. If `x` is not shown, take it out of `removed` if it is there, else put it in
`added`. So pressing a badge twice leaves no trace.

**Clean-up on every new `saved` (live updates, the outline's rule).** After the list is read
again (another tab's change, or a refetch):

| Case | Result |
|---|---|
| an id in `added` is now in `saved` | taken out of `added` (it no longer differs) |
| an id in `removed` is no longer in `saved` | taken out of `removed` |
| an id another tab added, that this person did not press | in `saved`, so shown as selected |
| an id another tab removed, that this person had pressed on | still in `added`, so still shown as selected and dirty |
| an id in `added` whose row was in the previous list and is not in the new one (a tag, vendor or recipe deleted in another tab) | taken out of `added` (open question 10) |
| an id in `added` that was never in the list yet (a row just created from the tab, before the list refetch lands) | KEPT. The badge shows when the row arrives |
| Recipes: the item became non-consumable in another tab | `added` is emptied (the server would refuse it); `removed` stays |

So "unsaved" always means "differs from the latest server answer", and the person's own
choices win until they Save or Discard. The clean-up is a pure function of
`(saved, previous existing ids, existing ids, added, removed)`, tested on its own.

**Trap: "the row does not exist" is not "the row was deleted".** A new row created from the
tab enters `added` when the create returns. The list of rows is read again AFTER that (cloud
`useCreateRecipe` uses `refetchQueries` without waiting, `hooks/useRecipes.ts:128-131`). A rule
"drop an `added` id that is not in the list" would drop the new id at once, and the new badge
would show as not selected when it arrives: issue #402 again. So the rule drops only an id
that WAS in the list and is gone now.

**Save** sends `shown`. On success the draft takes out the ids that were sent
(`reset(sent)`; as built, see *As built: PR B*: not "the draft is emptied"),
`toast.success(t('items.detail.saved'))` shows, and the page stays. Local `mutateAsync` waits for the refetch, and the cloud hooks wait
too (Apollo writes the mutation's answer to the cache, and `setItemRecipes` uses
`refetchAfterWrite`), so `saved` already equals `shown` when the draft is reset: the badges do
not flicker back. On failure `showSaveError(err, { catalog: true })` shows, and the draft is
kept.

**Presses during a Save are ignored** (open question 9, recommended A). The badges get
`aria-disabled` while `isPending`, so the list sent is the list on screen.

**Discard** (from the unsaved-changes dialog) leaves the tab; the tab unmounts, so the draft is
gone. Nothing is written. A row created from the tab stays, not assigned (answer 1A).

## The Save button and the layout

The three tabs are not `ItemForm`s. They need the same three things `ItemForm` gives Info and
Stock:

| Need | Info / Stock today | Tags / Vendors / Recipes |
|---|---|---|
| a Save in the top bar | `ItemForm`'s `createPortal` into `submitSlot` (`components/item/ItemForm/ItemForm.tsx:1174-1186`), slot from `useItemLayout().saveSlot` (`hooks/useItemLayout.tsx:25`) | a new small component, `TopBarSaveButton` (`components/item/TopBarSaveButton/`), that renders the same `Button` (`className="shrink-0"`, `isLoading`, `disabled`, label `common.save`) with `createPortal(…, saveSlot)`. `type="button"` and `onClick={save}`: there is no form, so no `form` attribute and no Enter-to-submit |
| the dirty guard | `onDirtyChange={registerDirtyState}` | the tab calls `registerDirtyState(dirty)` in an effect, and `registerDirtyState(false)` on unmount |
| the unsaved dialog's Save | `useRegisterSaveControl(onSaveControlChange, canSave, save)` (`hooks/useSaveControl.ts:39-56`) | the same hook, with `registerSaveControl` from `useItemLayout()`. `canSave` = dirty, not pending, `canEditCatalog`. `save()` returns `true` on success and `false` on failure, never rejects |

One hook ties them together: `useRelationTabSave({ dirty, isPending, canEdit, save })` in
`hooks/useRelationTabSave.ts`. It does the dirty registration and the `SaveControl`, and returns
`saveSlot` for `TopBarSaveButton`. `ItemForm` is not changed. Factoring `ItemForm`'s portal into
`TopBarSaveButton` as well is possible but not needed; leave `ItemForm` alone in this PR so the
Active switch PR 2 (which changes `ItemForm`) does not conflict.

**`isOnEditableTab`** (`routes/items/$id.tsx:37-38`) becomes "every tab but Log": the Info
path, `/stock`, `/tags`, `/vendors`, `/recipes`. Write it as a list of the five paths, so a new
tab must be added on purpose. The comment at `:33-35` and the one at `:145-147` change.
`useItemLayout.tsx`'s comments (`:11-15`, `:19-24`) say "the Info form" and "the Info and Stock
tabs"; they change to "the current tab".

**Read only.** When `canEditCatalog` is `false` (a household `member`, or the role not known
yet), the tab renders no `TopBarSaveButton`, registers no `SaveControl`, keeps no draft and
reports `dirty: false`. The badges stay `aria-disabled` and a press does nothing, as today
(`usePermissions`, `apps/web/src/hooks/usePermissions.ts:29`, `:223`). **If the role is lost
while the draft is not empty** (an owner demotes this manager in another tab; the `LOCATION`
event refetches `GetHousehold`), the draft is dropped and the tab turns read only (open question
5, recommended A).

**Keyboard.** The Save is a real `<button>`, so Tab reaches it and Enter or Space presses it.
The badges are `role="button"` with no `tabIndex` and no key handler today, a known gap
(`apps/web/src/routes/items/CLAUDE.md`, *What a household member sees*). Open question 8 asked
whether PR B fixes it while the three tabs are rewritten. **Answered A and built in PR B:** a
pressable badge has `tabIndex={0}`, and Enter or Space press it (`pressOnEnterOrSpace`,
`apps/web/src/lib/pressKeys.ts`; a held key presses once).

## Tags tab (PR B)

- Delete `loadingTagId`, `assigningTagIds`, `shownTagIds`'s merge, and the `Loader2` spinner on
  the badge. `TagTypeSection` takes `shownTagIds` and `onToggle`, and `disabled` while saving.
- `onToggle` → `draft.press(tagId)`.
- `handleAddTag`: `createTag.mutateAsync`; on success `draft.add(newTag.id)`, close the dialog;
  on failure `showSaveError(err)`, dialog stays (as today, `:166-171`). No `updateItem`.
- **New Tag Type** (`:236-243`, shown only when there are no tag types) is unchanged: it creates
  a type, which assigns nothing.
- Save: `useUpdateItem().mutateAsync({ id, updates: { tagIds: draft.shown } })`. Cloud: a tag
  list is configuration, so `touchesStock` is false and no location is resolved
  (`hooks/useItems.ts`, `runCloudUpdate`): the Save works in a household with no location.
- The "No tags assigned" empty state reads `shown`.

## Vendors tab (PR B)

- Delete `togglingVendorId`, its effect, `assigningVendorIds` and the spinner.
- `handleAddVendor`: `createVendor.mutateAsync(name)`; on success `draft.add(newVendor.id)`; on
  failure `showVendorCreateError(err, name)` (as today, `:81`). No `updateItem`.
- Save: `useUpdateItem().mutateAsync({ id, updates: { vendorIds: draft.shown } })`.

## Recipes tab (PR B)

- Delete `togglingRecipeId`, its effect and the spinner.
- `saved` = ids of recipes whose `items` hold this item. `shown` as above.
- A press on a recipe not shown, for a non-consumable item, does nothing (today's rule,
  `recipes.tsx:49`). A press that removes is always allowed, and so is the press that undoes
  it (as built: a recipe in `draft.removed` stays pressable, by keyboard too).
- `handleAddRecipe`: `await createRecipe.mutateAsync({ name, items: [] })` (answer 1A: NO
  items); on success `draft.add(recipe.id)`, close the dialog; on failure `showSaveError`,
  dialog stays. `mutateAsync`, not `mutate`: the cloud `mutate` calls `onSuccess()` with no
  argument (`hooks/useRecipes.ts:145-152`), so the tab would not learn the new id. The two
  tests of `recipes.test.tsx:230-320` guard the old `mutate` + `onSuccess` path; they are
  rewritten for `mutateAsync` (the dialog closes after the create resolves, and stays open
  when it rejects).
- Save: `useSetItemRecipes().mutateAsync({ itemId: id, recipeIds: draft.shown })`.
- The amount of a NEW link is decided by the server (and by the local batch), not by the tab:
  `consumeAmount || 1` (open question 4). A recipe that already held the item keeps its amount.

## Server: `setItemRecipes` (PR A)

### Schema (`apps/server/src/schema/recipe.graphql`)

```graphql
extend type Mutation {
  """
  Make `recipeIds` the exact set of recipes that hold this item. Recipes not
  in the list lose the item; recipes in the list that do not hold it get it,
  with `defaultAmount` = the item's `consumeAmount`, or 1 when that is 0. A
  recipe that already holds the item keeps its amount. One transaction.
  Returns the recipes that changed (empty when nothing changed).
  """
  setItemRecipes(itemId: ID!, recipeIds: [ID!]!): [Recipe!]!
}
```

Additive only: today's web documents stay valid, and `pnpm codegen` writes both files.

### Resolver (`apps/server/src/resolvers/recipe.resolver.ts`)

In this order. Every refusal comes before the first write.

| Step | What | Refusal |
|---|---|---|
| 1 | `const householdId = await requireCatalogRole(ctx, 'manager')` | `FORBIDDEN` for a `member`; `NO_HOUSEHOLD`; `HOUSEHOLD_CHANGED` from the `x-household-id` check |
| 2 | `prisma.item.findFirst({ where: { id: itemId, householdId } })` | `NOT_FOUND` "Item not found", the same answer for an unknown item and another household's (as `updateItem`, `item.resolver.ts:229-234`) |
| 3 | `ids = [...new Set(recipeIds)]`; `requireCatalogIds(ctx, householdId, 'recipe', ids)` (`lib/authz.ts:852-879`) | another household's recipe: `FORBIDDEN`; an id no row holds: `BAD_USER_INPUT` |
| 4 | `prisma.$transaction(async (tx) => …)`: read the item's `consumable` and `consumeAmount` through `tx`; read the current links `tx.recipeItem.findMany({ where: { itemId, recipe: { householdId } }, select: { recipeId: true } })` | |
| 5 | `toAdd = ids − current`, `toRemove = current − ids` | |
| 6 | `toAdd` not empty and `consumable === false` | `notConsumableError([itemId])` (`lib/consumable.ts:24-29`): `BAD_USER_INPUT`, reason `NOT_CONSUMABLE`. Removing is never refused, so a non-consumable item can still leave an old recipe |
| 7 | `tx.recipeItem.deleteMany({ where: { itemId, recipeId: { in: toRemove } } })` when `toRemove` is not empty | |
| 8 | `tx.recipeItem.createMany({ data: toAdd.map(…), skipDuplicates: true })` with `defaultAmount: item.consumeAmount > 0 ? item.consumeAmount : 1` | |
| 9 | after the commit, when `toAdd` or `toRemove` was not empty: `publishHouseholdChange(ctx, ['CATALOG'], householdId)` | |
| 10 | return `prisma.recipe.findMany({ where: { id: { in: [...toAdd, ...toRemove] }, householdId }, include: { items: true } })` | |

Notes:

- **Why `recipe: { householdId }` in step 4.** `RecipeItem` has no `householdId`
  (`apps/server/prisma/schema.prisma:149-158`). Before issue #273 a recipe of another household
  could be made to hold this item. Without the filter, `toRemove` would hold that recipe and the
  write would change another household's recipe.
- **Why `skipDuplicates`.** `RecipeItem`'s primary key is `(recipeId, itemId)`. Two Saves of
  the same item at the same moment both read "not linked" for a recipe and both create it; the
  second must not fail with `P2002`. No row lock is needed: the last Save wins per recipe, and
  both are the person's real choice. (No other catalog write takes the household lock either.)
- **Idempotent.** The same list again: no write, no event, returns `[]`.
- **Duplicate ids** in `recipeIds` are folded (step 3), not refused: the argument is a set.
- **Not logged** in `HouseholdActivity`: catalog writes are not (decision T51).
- **No model change**, so `emptyHouseholdWhere` (`lib/invite.ts`), `/e2e/cleanup`,
  `importCheck` and the fakes' `householdWorld` rules are not touched. **No migration**: the
  `RecipeItem` table exists. `verify-migration.ts` is not run.
- **Live guard.** `setItemRecipes: { kinds: ['CATALOG'] }` in `publishes`
  (`apps/server/src/resolvers/live-publish.guard.test.ts`, next to `updateRecipe` at `:163`).
  The guard fails until it is there. The web refetches `GetRecipes`, `GetRecipe`,
  `ItemCountByRecipe` and the other catalog queries on `CATALOG` (`apps/web/src/apollo/liveUpdates.ts:57-62`).
- **`lib/consumable.ts`'s table** (`:9-14`) gets a row: `setItemRecipes` refuses an ADD of a
  non-consumable item; a remove is allowed.
- `forgetRolesAroundEach` wraps every `Mutation` field, and `mutationRoleCache.test.ts` walks
  the executable schema, so the new field is covered with no extra code.

### Old web against the new server

`setItemRecipes` is new; nothing of today's web sends it. Nothing changes.

### New web against the old server

**Must not happen.** The Recipes Save would fail GraphQL validation (`GRAPHQL_VALIDATION_FAILED`)
and show "Could not save the change." Tags and Vendors would still work. That is why PR B
merges into `develop` only after Railway shows PR A deployed.

## As built: PR A (2026-11-27)

Branch `feature/item-relations-save-server`, three commits on top of the docs (`c94b20c0`,
`fcbb565e`). Merged into `develop` as #448 (merge `1626aae7`) and released to `main` in #449
(`0bc5b87a`). (This said "Not merged yet." until PR B's last task.)

| Commit | What |
|---|---|
| `e6e5b91e` | `setItemRecipes(itemId, recipeIds): [Recipe!]!` in `schema/recipe.graphql` and `resolvers/recipe.resolver.ts`, its row in `lib/consumable.ts`, 14 tests in the new `recipe-set-item.resolver.test.ts`, and its entry in the live guard's `publishes` list |
| `4ec4262a` | the `CATALOG` publish tests in `catalog-live-publish.resolver.test.ts`, and the live guard count in the root `CLAUDE.md` |
| `3309692d` | `updateItem` writes the item, its tag list and its vendor list in ONE `prisma.$transaction` (owner answer 7A) |

What differs from this design and the plan:

- **The amount rule is written `consumeAmount > 0 ? consumeAmount : 1`**, as the plan says.
  This design wrote `consumeAmount || 1`. The two differ only for a negative amount.
- **The item is checked with one scoped read, not `requireCatalogIds`.** An unknown item and
  another household's item both get `NOT_FOUND` "Item not found", the same as `updateItem`.
  `requireCatalogIds` would answer the two differently and so tell a stranger which item ids
  exist. The recipe ids still go through `requireCatalogIds`.
- **The guard entry is in the first commit, not in A.2.** The live guard fails as soon as the
  field exists in the schema, so the first commit could not pass `pnpm test` without it.
- **`updateItem` publishes only after the transaction has committed** (a `committed` flag in
  its `finally`). Before A.3, a save whose tag write failed left the item renamed with NO tags
  and still published `CATALOG`. The new test was red on the old code.
- Line references to `item.resolver.ts` above (`:264-283`) are from before A.3.

Tests: server **3026 / 94 → 3048 / 95** (14 new for the mutation, 6 publish tests, 2 for
`updateItem`). Ten mutation checks, each red; the list is in the PR description. The
`recipeItem` fake models the `(recipeId, itemId)` key, the `recipe: { householdId }` filter,
and throws on any other `where` key (checked once per call, so an empty store cannot hide an
unknown key). One negative control: "a repeated recipe id is folded" passes with or without
the fold, because `skipDuplicates` also stops the second row.

Known gaps of PR A: no real-SQL run of `setItemRecipes` until PR B's cloud E2E; two Saves at
the same moment are tested only by forcing a link between the read and the write (the fake has
no row lock); the vendor half of the `updateItem` transaction has no test of its own (the tag
half does, and the code is the same shape).

## Local mode (PR B)

`setItemRecipesBatch(itemId, recipeIds)` in `apps/web/src/db/operations.ts`, one
`db.transaction('rw', [db.items, db.recipes], …)`:

1. `db.items.get(itemId)`; missing: throw `Error('Item not found')`.
2. Fold the ids. Read every recipe with `db.recipes.bulkGet(ids)`; a missing id throws (the
   server's `BAD_USER_INPUT`). Local mode has one household, so there is no `FORBIDDEN`.
3. The current links: `db.recipes.filter(r => r.items.some(ri => ri.itemId === itemId))`, the
   same read as `removeItemFromRecipes` (`db/operations.ts:81`).
4. `toAdd` not empty and `!isConsumable(item)`: `throw new NotConsumableError([itemId])`
   (`showSaveError` shows `common.notConsumable` for it, `lib/saveError.ts:24-26`).
5. Each recipe in `toRemove`: its `items` without this item; each in `toAdd`: its `items` plus
   `{ itemId, defaultAmount: item.consumeAmount > 0 ? item.consumeAmount : 1 }`; `updatedAt: now`.
   (This said `consumeAmount || 1` until 2026-11-28. As built, task B.1 uses the server's
   rule, `consumeAmount > 0 ? consumeAmount : 1`, so the two modes give the same answer. The
   two forms differ only for a negative amount, which `|| 1` would keep.)
6. Return the changed recipes.

Every await inside is a Dexie promise, so the zone rule of *Transactional batches*
(`apps/web/src/db/CLAUDE.md`) holds. It re-reads the rows inside the transaction, like
`applyShelfFilterPicksBatch`, so a stale render cannot double-append. It gets an entry in that
section.

## The hook (PR B)

`useSetItemRecipes()` in `apps/web/src/hooks/useRecipes.ts`, dual mode, the same shape as
`useUpdateRecipe` (`:166-256`):

- local: `useMutation` with `setItemRecipesBatch`; `onSuccess` RETURNS
  `queryClient.invalidateQueries({ queryKey: ['recipes'] })` (the prefix covers
  `['recipes', 'itemCount']`), so `mutateAsync` waits for the refetch.
- cloud: `SetItemRecipes` document in `apps/web/src/apollo/operations/recipes.graphql`
  (select `id name lastCookedAt items { itemId defaultAmount }`, the same fields as
  `GetRecipes`); then `refetchAfterWrite([{ query: GetRecipesDocument }, 'ItemCountByRecipe'])`.
  The answer's `Recipe` rows are normalised by `id`, so the cache is right even before the
  refetch. `isPending` = mutation loading or `isRefetching`.
- `mutate` / `mutateAsync` / `isPending`, like the other hooks.

The live event never reaches the tab that wrote (`ctx.clientId`), so the refetch is what
updates this tab.

## RBAC: creating and saving from these tabs (the owner's request)

| Action | Web shows it when | Server check | Location role? | A refusal on screen |
|---|---|---|---|---|
| **New Tag Type** (Tags tab, only when the household has no tag type, `tags.tsx:230-244`) | `canEditCatalog` (`:236`) | `createTagType`: `requireCatalogRole(ctx, 'manager')` (`apps/server/src/resolvers/tag.resolver.ts:57-59`) | none | `showSaveError` (`tags.tsx:293-298`): "Could not save the change." Dialog stays |
| **New Tag** | `canEditCatalog` (`tags.tsx:259`) | `createTag`: `manager` (`tag.resolver.ts:114-116`), and `requireCatalogIds` on `typeId` / `parentId` | none | `showSaveError` (`tags.tsx:166-171`): generic. Dialog stays |
| **New Vendor** | `canEditCatalog` (`vendors.tsx:145`) | `createVendor`: `manager` (`vendor.resolver.ts:75`); with a `locationId`: `requireLocationRole(…, 'viewer')` and `requireLocationInHousehold` (`:76-80`); the cart only for `participant` or higher (`:94-105`) | the web sends the active location, resolved at call time; none in a household with no location (`hooks/useVendors.ts:92-101`, `hooks/useCloudLocationId.ts`) | `showVendorCreateError` (`lib/vendorCreateError.ts`): `FORBIDDEN` → "Only a household owner or manager can add a vendor."; otherwise a message with the name. Dialog stays |
| **New Recipe** | `canEditCatalog && consumable` (`recipes.tsx:118`) | `createRecipe`: `manager` (`recipe.resolver.ts:52-54`); `requireCatalogIds` and `requireConsumableAttachments` on its items (`:57-64`). After this change the tab sends `items: []`, so both get nothing to check | none | `showSaveError` (`recipes.tsx:75`): generic, or `common.notConsumable`. Dialog stays |
| **Save, Tags / Vendors** | `canEditCatalog` (new) | `updateItem`: `manager` (`item.resolver.ts:227`); `requireCatalogIds` on `tagIds` / `vendorIds` (`:240-241`) | none (no stock field) | `showSaveError`: generic. Draft kept |
| **Save, Recipes** | `canEditCatalog` (new) | `setItemRecipes`: `manager`, see above | none | `showSaveError`: generic, or `common.notConsumable`. Draft kept |

Findings:

- **Every create is an awaited call with a `catch`.** None is an unhandled rejection: the
  three were fixed in households H5 (review of task F.6) and in
  `docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md`.
- **A household manager who is only a `viewer` of the active location** gets the vendor and NO
  cart (`vendor.resolver.ts:46-50`, `:94-95`). The cart appears when a participant opens that
  location (`bootstrapCarts`). Not a gap; this design does not change it.
- **A household manager with no role on any location.** `GetLocations` lists only locations
  with a role, so `useCloudLocationId` resolves `undefined` and no `locationId` is sent: the
  vendor is written with no cart. Not a gap. (Read from the code, not run.)
- **Tag, tag type and recipe creates need no location role**, and the two Saves need none
  either. The Tags and Vendors Saves send no stock field, so `useUpdateItem` resolves no
  location and works in a household with no location.
- **Local mode has no roles** (`usePermissions`' `LOCAL`, `:110-131`): every control shows.
- **Gap 1: a refused tag, tag type or recipe create says only "Could not save the change."**
  The control is hidden for a `member`, so `FORBIDDEN` is reached only when the role was taken
  away after the page loaded. The vendor create says why. Open question 6.
- **Gap 2: a role lost while a draft is not empty.** See *Read only* above. Open question 5.
- **Gap 3 (older): `updateItem` replaces the tag and vendor lists in two writes outside a
  transaction** (`item.resolver.ts:264-283`): `deleteMany`, then `createMany`. If the second
  fails, the item has NO tags until the next Save. This is true today on every press; with one
  Save it is true once per Save. Open question 7.

## Interactions

| With | Result |
|---|---|
| the Info tab's Consumable switch | turning it off removes the item from every recipe (server `updateItem`, local `updateItem`). The Recipes tab's draft drops its `added` on the refetch (see *The draft*) |
| the Info tab's unit switch | rewrites `defaultAmount`s of existing links only; not affected |
| issue #402 | its fix is replaced, not kept: there is no second write to wait for. Its bug doc stays as history; this design is named in it as the follow-up |
| the cooking page, the pantry recipe views, Settings › Recipes › Items | read the recipes; refetched on `CATALOG` in other tabs, and by `refetchAfterWrite` / the local invalidation in this tab |
| the Active switch PR 2 | no shared code file; see *Release order* |

## Tests and E2E

### PR A (server)

New file `apps/server/src/resolvers/recipe-set-item.resolver.test.ts`, through `ApolloServer`
like `recipe-consumable.resolver.test.ts`, with `ownedRowFake` for `item` and `recipe`, a
`recipeItem` store that models the composite key and the `recipe: { householdId }` relation
filter (and THROWS on a `where` key it does not know; see *Write test doubles to model the
constraint* in the root `CLAUDE.md`), and `runInTransaction` from `src/test/stockFake.ts`:

- adds to two recipes and removes from one in one call; the other household's recipe that
  holds the item (a pre-#273 row) is not touched;
- a new link gets `consumeAmount`; with `consumeAmount: 0` it gets `1` (the fixture MUST use 0,
  or `||` and `??` give the same answer);
- an existing link keeps its amount (fixture amount different from `consumeAmount`);
- the same list twice: the second call writes nothing, returns `[]`, publishes nothing;
- `member` → `FORBIDDEN`, nothing written; unknown item and another household's item →
  `NOT_FOUND`; another household's recipe → `FORBIDDEN`; an unknown recipe → `BAD_USER_INPUT`;
- non-consumable item: an add → `NOT_CONSUMABLE`, nothing written (the remove in the same call
  is rolled back too); a remove only → allowed;
- a failure in `createMany` rolls back the `deleteMany` (a fake that throws once);
- duplicate ids are folded.

`catalog-live-publish.resolver.test.ts`: `setItemRecipes` publishes ONE household `CATALOG`
when something changed and nothing when nothing changed.

Mutation checks, each must go red: drop `recipe: { householdId }` from step 4 (the other
household test); `?? 1` instead of `|| 1` (the `consumeAmount: 0` test); drop the `toAdd`
condition of step 6 so a remove is refused too (the remove-only test); move the
`publishHouseholdChange` above the "changed" check (the publish test); remove the entry from
the live guard list (the guard test).

### PR B (web)

Unit tests that press a badge and expect a write today, and what each becomes:

| File | Tests (line) | After |
|---|---|---|
| `routes/items/$id/tags.test.tsx` | `:24` create is assigned; `:82` add from page; `:181` spinner while toggling; `:219` `aria-pressed`; `:268` assign fails; `:380` assign of a new tag fails | create sends no `updateItem`, the badge is pressed, Save sends it; spinner test → Save spinner test; assign-fail → Save-fail keeps the draft; `:380` is deleted (no second write) |
| `vendors.test.tsx` | `:149` assign; `:179` create; `:262` unassign; `:298` spinner; `:382` assign fails; `:427` new vendor assign fails | the same changes |
| `recipes.test.tsx` | `:162` assign; `:195` unassign; `:230-320` cloud `onSuccess` regression; `:321` create; `:366` spinner; `:407` assign fails; `:515` / `:542` non-consumable | Save sends ONE `setItemRecipes`; create sends `items: []`; the `:230-320` pair is rewritten for `mutateAsync` (see *Recipes tab*); the non-consumable tests keep their meaning, pressed through the draft |
| `createAssign.cloud.test.tsx` | `:126`, `:159` create and assign; the second describe `:270-458` (#402: selected while assigning, back to not selected, no toggle while assigning) | `:126` / `:159`: the create sends `createTag` / `createVendor` and NO `UpdateItem`; Save sends `UpdateItem` with the old ids kept and the new one added. `:270-458` are deleted, replaced by "a new tag shows selected and Save is on". `:460` (New tag type loading) stays |
| `saveFailed.cloud.test.tsx` | `:221` tag assignment; `:263` assign of a new tag; `:313` vendor; `:332` new vendor; `:358` recipe; `:240`, `:290`, `:379` create refusals | the assignment ones become Save refusals with the draft kept; `:263` and `:332` are deleted; the create ones stay |
| `readOnly.test.tsx` | `:111` member | add: a member sees no Save on the three tabs, and a press does not turn Save on |
| `$id.tabs.test.tsx` | — | add: leaving Tags with a pressed badge opens the dialog |
| `unsavedDialogSave.test.tsx`, `unsavedDialogSave.cloud.test.tsx` | — | add: the dialog's Save on the Recipes tab saves and then moves; a failed Save keeps the dialog open |
| `saveTopBar.test.tsx` | — | add: the Save sits in the top bar on the three tabs, and not on Log |

New tests: `hooks/useRelationDraft.test.ts` (the press rule and every row of the clean-up
table), `hooks/useSetItemRecipes` cases in `hooks/useRecipes.test.ts` (local and a
`MockedProvider` cloud case), `db/operations.test.ts` for `setItemRecipesBatch` (the same cases
as the server, and a rollback), `components/item/TopBarSaveButton` with a story and smoke test.

Stories: `tags.stories.tsx`, `vendors.stories.tsx`, `recipes.stories.tsx` render the real route
tree (`createRouter({ routeTree })`), so the top bar is there. Add one story per tab with a
pressed, unsaved badge (a `play` function, or the smoke test presses it) so Save is on. Their
`.stories.test.tsx` assert the Save button.

E2E (`e2e/`):

| File | Change |
|---|---|
| `e2e/pages/ItemPage.ts` | `createAndAssignTag` (`:126`), `createAndAssignVendor` (`:185`), `assignVendor` (`:196`), the recipe helpers (`:206-230`): press, then a new `saveRelations()` that presses the top bar Save and waits for the "Saved" toast. Drop the `aria-busy` wait |
| `item-management.spec.ts` (`:241`, `:269`; local and cloud) | Save, then reload, as today |
| `settings/tags.spec.ts` (`:479`), `settings/recipes.spec.ts` (`:366`) | Save before the reload or the readback |
| `a11y.spec.ts` (`:921`, `:937`, `:953`, `:1449`, `:1465`, `:1481`; local and pwa) | press one badge first, so the scan sees the Save on and a pressed badge |
| new `item-relations-save.spec.ts` (local and `CLOUD_SPECS`) | two presses and one Save, read back after a reload; tab change with an unsaved press → dialog → Save; Discard keeps a created tag unassigned; Recipes Save on two recipes, read back with `expect.poll` including `defaultAmount` (in cloud: the first real-SQL run of `setItemRecipes`); a member sees no Save (cloud, `newUserContext`); axe scans of the three tabs with Save on, light and dark (cloud scans do not run in `a11y.spec.ts`) |

Mutation checks, each must go red: Save sends the saved list instead of `shown` (the two-press
test); drop the clean-up rule "an id in `added` now in `saved`" (Save stays on after another
tab adds the same tag); drop an `added` id whenever it is not in the list (the "new tag shows
selected while the list refetch is held" test, cloud, `holdMutation` or a held `GetTags`);
remove `/tags` from `isOnEditableTab` (the dialog test); register
`canSave` without the `canEditCatalog` check (the member test); `|| 1` → `?? 1` in the local
batch (the `consumeAmount: 0` test); drop the `toAdd`-only condition from the local
non-consumable check (the remove-only test).

## As built: PR B (2026-11-28)

Branch `feature/item-relations-save-web`, based on `develop` at `0bc5b87a` (after PR A #448,
its release #449 and the Active switch PR 2 #447). Not merged; not deployed.

| Commit | Task | What |
|---|---|---|
| `2c3a0643`, `43b3aa36` | B.1 | `setItemRecipesBatch` (`db/operations.ts`) and the `SetItemRecipes` document; 8 tests |
| `d70334b0` | B.2 | `useSetItemRecipes()` (`hooks/useRecipes.ts`) |
| `1fcc440f` | B.3 | `showSaveError(err, { catalog: true })` (opt-in, see owner answer 6) |
| `058bf275`, `a63451dc`, `1d9add8b`, `aff41f40`, `cbc43d56` | B.3 | `useRelationDraft`, `useRelationTabSave`, `TopBarSaveButton`, `isOnEditableTab` as a list of five paths, the layout's dirty reset, and two review fixes |
| `0d2e65cb`, `58aab4d0`, `46a51627` | B.4–B.6 | the Tags, Vendors and Recipes tabs on the draft and one Save; keyboard (8A); `aria-disabled` while saving (9A) |
| `919255b6`, `b1e49baa` | review | a row created during a Save stays in the draft (`reset(sent)`); a held Enter or Space presses once |
| `5baa9b07` | B.7 | the guard, the dialog and the read-only view, as tests |
| `3ba44475`, `31ad8fdc`, `d34f3569` | B.8 | E2E: `saveRelations()`, the six a11y scans with a pressed badge, the new `item-relations-save.spec.ts` |
| `cbfbc8a0`, `7fad441d`, `958c2532`, `af914b01`, `62c6626a` | B.9 | three review fixes (below), then these docs |

What differs from this design and the plan:

- **`reset(sent)`, not "the draft is emptied".** "New …" stays on while a Save runs. A row
  created then went into the draft, and emptying the whole draft at the end of the Save
  dropped it: the new badge showed as not selected and was never saved. Each tab now keeps
  the list it sends, and `reset(sent)` takes out of the draft only the ids in that list
  (`919255b6`; the cloud tests "… created during a Save stay selected" were red before it).
- **`showSaveError`'s catalog text is opt-in**, `{ catalog: true }`, not the default (owner
  answer 6, as-built note). Location writes also get `FORBIDDEN`, where the catalog text
  would be wrong.
- **`canEdit` and `canAdd` are options of `useRelationDraft`**, not tab code. `canEdit: false`
  empties the draft (5A). `canAdd: false` is the Recipes rule for a non-consumable item: a
  press that adds does nothing, and the adds are dropped when the item turns
  non-consumable. The design described these as tab behaviour.
- **The layout resets the dirty state on every path change** (`routes/items/$id.tsx`). Not
  in the design. `ItemForm` does not report `false` on unmount, so a discarded Info edit
  could keep the guard armed on Tags. The first two tests passed without the effect (a new
  `ItemForm` mount reported `false` first), so `1d9add8b` added a tab that registers dirty
  and never resets; removing the effect turns it red.
- **The trap tests needed a live change.** On the Recipes tab the saved list and the recipe
  list are ONE query (`GetRecipes`), so "the list arrives late" alone does not run the
  clean-up while the new recipe is missing. The Recipes trap test changes the saved list
  live to make the clean-up run at that moment (`relationSave.cloud.test.tsx`).
- **`test/setup.ts` stubs `useSetItemRecipesMutation`**, like the other mutation hooks, so
  every page test that mounts the Recipes tab renders without its own mock.
- **The draft loop.** When the row list went from loaded back to `undefined`,
  `useRelationDraft` set state on every render ("Too many re-renders"). The check now
  compares with the value the update stores (`a63451dc`).
- **The a11y findings (B.8).** `a11y.spec.ts`'s `seedTag` wrote `tagTypeId`, a field nothing
  reads, so no scan had ever seen a tag badge on the item Tags tab. With it fixed, two
  failures showed on tag badges:

  | Rule | Theme | Cause | State |
  |---|---|---|---|
  | `color-contrast` | light | the tag palette, 3.11 to 4.48:1, older than this branch | **known defect, waiting for an owner decision**; tag badges are left out of this rule only (`KNOWN_TAG_BADGE_DEFECTS`, `e2e/helpers/axe.ts`) |
  | `target-size` | light, dark | the last tag above "New Tag": 20px high, 20px of clear space. The "New Tag" button's `-my-1` pulled it against the badge, and the badges became focusable in this branch (8A), so axe started to check them | **fixed** in `958c2532`: `-mb-1` instead of `-my-1` on the Tags tab only, and the exclusion removed |

  That `target-size` is new on this branch is read from axe's matcher (it checks only
  focusable targets) and from `develop`'s badges having no `tabIndex`. It was not measured
  on `develop`, because no scan there showed a tag badge.
- **Three review fixes in B.9.** (1) On a non-consumable item a recipe pressed off was
  `aria-disabled`, dim and out of the Tab order, so only a mouse could undo the remove; now a
  badge in `draft.removed` is pressable (`cbfbc8a0`, a test that was red first). (2)
  `test/rolePermissions.ts`'s header said to use `roleOverride()`; a test that changes the
  role during the test must use `useRoleOverride()` (`7fad441d`). (3) The `target-size` fix
  above.
- **`settings/vendors.spec.ts` also needed a Save** (B.8). The plan's list did not name it.
- **Not recorded here: the plan's E2E mutation "the Recipes Save sends one `updateRecipe`
  per recipe".** The B.8 commits do not say whether it was run. Treat it as not proven.

Measured numbers (2026-11-28):

| What | `develop` `0bc5b87a` | this branch |
|---|---|---|
| web tests | 4403 / 407 files | **4504 / 415 files** |
| server tests | 3048 / 95 files | 3048 / 95 files (PR B changes no server code) |
| `scripts/spec` | — | 80 |
| `--list` `local` | 226 in 27 files | 233 in 28 files |
| `--list` `cloud` | 252 in 44 files | 259 in 45 files |
| `--list` `pwa` | 77 in 2 files | 77 in 2 files |
| `CLOUD_SPECS` | 44 of 48 spec files | **45 of 49** |

The gate (`pnpm lint`, root `pnpm build` with no `TS6385`, `build-storybook`, `pnpm check`,
`pnpm test`) was green at the end of B.9.

The E2E gate, `pnpm test:e2e:all` at `62c6626a` (the docs commit; the code is the same as
`af914b01`), 2026-11-28, first try, no retry, no flaky test, **all green**, about 23 minutes:

| Row | Database | Time | Result |
|---|---|---|---|
| `local` | — | 4m44s | 220 passed / 13 skipped |
| `cloud` | the local E2E database (23 migrations applied, 23 folders) | 4m44s | 251 passed / 8 skipped |
| `cloud-neon` | the Neon test branch (the 8 `NEON_SPECS` files) | 11m46s | 40 passed |
| `pwa` | — | 1m45s | 77 passed |

Load average 4.88 (1 min) at the start, 2.39 at the end.
`item-relations-save.spec.ts` is not in `NEON_SPECS`, so it has run on Neon only if a
checkpoint gate (`pnpm test:e2e:all:neon`) runs it.

## Release order

1. PR A (server) merges into `develop`.
2. Release `develop` → `main` (a merge commit). There is no migration.
3. Wait until Railway shows that commit's deployment active. Check that a deploy really
   started (release #403 needed a manual start).
4. PR B (web) merges into `develop`, after the Active switch PR 2 if that one is still open,
   and rebased on it. Then the next release. (As of PR B's last task: steps 1 and 2 are done,
   #448 and #449; the Active switch PR 2 merged as #447 and PR B is based on `develop` at
   `0bc5b87a`, after it. Step 3, the Railway check, is still owed before PR B merges.)

**The overlap with the Active switch PR 2.** The brief for this design said the two overlap in
`routes/items/$id.tsx` (`isOnEditableTab`). They do not today: `feature/item-stock-active-web`
at `bc72878f` does not touch that file, and its plan (tasks W.1 to W.7) does not name it. The
shared files are `apps/web/src/routes/items/CLAUDE.md`, `apps/web/src/hooks/CLAUDE.md`,
`apps/web/src/components/CLAUDE.md`, the two i18n files (only if open question 6 adds a key),
`e2e/playwright.config.ts` (`CLOUD_SPECS`, both add a spec) and maybe `e2e/tests/a11y.spec.ts`.
All are small text merges. Rebase PR B on `develop` after PR 2 merges.

## Not changing

The Info, Stock and Log tabs; `ItemForm`; the settings pages that assign tags, vendors and
recipes (`/settings/household/{tags,vendors,recipes}/$id/items`), which keep writing on each
press; the pantry group views' "add to" buttons; `createTag`, `createTagType`, `createVendor`,
`createRecipe`, `updateRecipe` on the server.

## Known gaps

- The settings assignment pages still write on every press. Owners may expect the same Save
  there later. Out of scope.
- Two people saving the same item's recipes at the same moment: the last Save wins per recipe.
  No lock. Stated, not fixed.
- Gap 3 above (`updateItem`'s two writes): closed in PR A (open question 7 was A, `3309692d`).
- The badges' keyboard gap: closed in PR B (open question 8 was A).

## Owner questions

1. **Create from a tab: at once or at Save?** **Answered 2026-11-27: A.** The create is sent at
   once; the new badge is selected but not saved; Save assigns it; Discard keeps the row,
   unassigned. A new recipe is created with no items.
2. **One Save per tab or one for all three?** **Answered 2026-11-27: one per tab.**
3. **Recipes: one new mutation, or one `updateRecipe` per recipe?** **Answered 2026-11-27: one
   new mutation** (`setItemRecipes`), server first.
4. **What `defaultAmount` does an item get when Save adds it to a recipe from this tab?**
   Today this tab adds `0` (`recipes.tsx:52`, `:67`), which cooking reads as "optional, start
   unchecked". The three other places that add an item to a recipe use `consumeAmount || 1`
   (`components/pantry/RecipeDetailView.tsx:206`,
   `routes/settings/household/recipes/$id/items.tsx:244`, `db/operations.ts:639`). The approved
   outline said `consumeAmount || 1` and called it today's rule; for this tab it is a change.
   - **A — chosen by the owner, 2026-11-27.** (recommended): `consumeAmount || 1`, the same as the other three. A new ingredient is
     then used by default when cooking.
   - B: keep `0` for this tab.
5. **A manager loses the role (demoted in another tab) while the tab has unsaved presses.**
   - **A — chosen by the owner, 2026-11-27.** (recommended): drop the presses; the tab shows the saved state, read only, with no Save.
     They could not be saved anyway.
   - B: keep the presses on screen, disabled, with no Save, until the person leaves.
6. **A refused tag, tag type or recipe create (or a refused Save) shows only "Could not save the
   change."** Reached only after the role was taken away while the page was open.
   - **A — chosen by the owner, 2026-11-27.** (recommended): in `showSaveError`, a `FORBIDDEN` error shows "Only a household owner or
     manager can change this." (`settings.catalogReadOnlyItem`, an existing key). One change
     covers every caller.
   - **As built (task B.1, 2026-11-28): opt-in, not every caller.** `showSaveError(err, {
     catalog: true })` (`apps/web/src/lib/saveError.ts`) shows the text; without the option a
     `FORBIDDEN` still shows "Could not save the change.". The reason: many callers send
     LOCATION writes (stock, carts, the location pages), where `FORBIDDEN` means the person is
     only a viewer of the location, and the catalog text would be wrong there. So tasks B.4 to
     B.6 must pass `{ catalog: true }` at these calls, all catalog writes:

     | Call | Tab | Pass `{ catalog: true }` |
     |---|---|---|
     | `createTagType` | Tags | yes |
     | `createTag` | Tags | yes |
     | `createRecipe` | Recipes | yes |
     | Save (`updateItem` with `tagIds`) | Tags | yes |
     | Save (`updateItem` with `vendorIds`) | Vendors | yes |
     | Save (`setItemRecipes`) | Recipes | yes |
     | `createVendor` | Vendors | no: it keeps `showVendorCreateError`, which already shows its own `FORBIDDEN` text ("Only a household owner or manager can add a vendor."). `createVendor` also writes a cart, so its `FORBIDDEN` is not only a catalog refusal |
   - B: leave the generic message.
7. **`updateItem` replaces the tag and vendor lists in two writes outside a transaction.** If
   the second fails, the item has no tags until the next Save.
   - **A — chosen by the owner, 2026-11-27.** (recommended): in PR A, put the two `deleteMany` / `createMany` pairs and the item update
     in one `prisma.$transaction`. Server only, no schema change.
   - B: leave it for a separate fix.
8. **The badges cannot be reached by keyboard** (no `tabIndex`, no key handler).
   - **A — chosen by the owner, 2026-11-27.** (recommended): fix it in PR B, while the three tabs are rewritten: `tabIndex={0}` when
     pressable, Enter and Space press it.
   - B: a separate PR.
9. **Presses while a Save runs.**
   - **A — chosen by the owner, 2026-11-27.** (recommended): ignored; the badges are `aria-disabled` until the Save answers. The list
     sent is the list on screen.
   - B: allowed, kept as a new draft after the Save.
10. **A tag, vendor or recipe in the draft is deleted in another tab before Save.**
    - **A — chosen by the owner, 2026-11-27.** (recommended): it leaves the draft quietly when the list is read again (its badge is
      gone from the page anyway).
    - B: the same, plus a toast that says one change was dropped.
