# Bug: some screens ignore a failed save

**Date:** 2026-11-19
**Branch:** `fix/screens-show-save-errors`
**Areas:** items, stock, recipes, pantry search. Several feature areas, so this doc lives in
`docs/global/bugs/`.

## Bug description

When a save really fails (a server refusal, a network error, a local IndexedDB error), some
screens show nothing. The dialog or form stays open and looks frozen. Some of these also
cause an unhandled promise rejection.

Found by the investigation for `2026-11-18-bug-failed-refetch-rejects-saved-write.md`
(PR #386). That PR stopped a failed REFRESH from counting as a failed save. A REAL failed save
still reaches these screens. Line numbers are at `938fa2aa` and may have moved.

| # | Screen | What happens on a failed save |
|---|---|---|
| 1 | `NewItemDialog.tsx` `handleCreate` (~169-193), called as `void handleCreate()` (~232) | try/finally with no catch. Dialog stays open, no message, unhandled rejection |
| 2 | `NewItemDialog.tsx` `handleSelectExisting` (~196-230) | no catch. Same as 1 |
| 3 | `routes/items/$id/stock.tsx` Save (~165-176), through `ItemForm.tsx` (~448), which calls `onSubmit` without awaiting | unhandled rejection, no `goBack`, form stays, no message |
| 4 | `routes/items/$id/index.tsx` `handleConfirmAdjustments` (~376-407), the unit-switch confirm | no catch. Confirm dialog stays open, unhandled rejection |
| 5 | `routes/settings/household/recipes/$id/index.tsx` (~61-63) | `.then(goBack)` with no catch. Unhandled rejection, no message |
| 6 | `routes/settings/household/recipes/$id/items.tsx` (~229-274) | try/finally with no catch |
| 7 | `routes/items/$id/relation/recipes.tsx` (~50) | `mutate` with the error ignored |
| 8 | `useItemSearchTailWiring.tsx` (~94-114), bucket-3 "Add to location" | catches and hides every error |
| 9 | `QuickUpdateDialog.tsx` (~221) | catches and keeps the dialog open, with no message |

**Corrections found while fixing:**

- #4: the confirm dialog does NOT stay open. `AlertDialogAction` closes it on click even when
  the write fails. The real problem was the unhandled rejection and the missing message.
- #3 is not only the Stock tab. The Info tab's save (`routes/items/$id/index.tsx`) uses the same
  `ItemForm` and had the same bug.
- #7: the other relation tabs were broken too (`relation/vendors.tsx` ignored the error,
  `relation/tags.tsx` had an unhandled rejection).
- #8 was wider than "Add to location": the same catch also hid failed group actions (Apply
  vendor, Add to recipe, Add to shelf).
- **7 more places had the same shape:** the item Info tab, `tags/$id/index.tsx`,
  `vendors/$id/index.tsx`, `tags/$id/items.tsx`, `vendors/$id/items.tsx`, `relation/tags.tsx`,
  `relation/vendors.tsx`.
- **A second bug:** `RecipeInfoForm` and `TagInfoForm` moved their saved baseline
  (`committedName`) when Save was pressed, before the save ended. After a failure, Save stayed
  disabled and the leave guard saw no unsaved change.

## Root cause

Each screen was written for the success path. The hooks reject on a failed save, as they
should, but the callers either do not catch the rejection or catch it and show nothing.

## Fix applied

- A shared helper, `showSaveError(err, message?)` in `apps/web/src/lib/saveError.ts`, shows a
  toast. It skips `OfflineWriteError`, so offline there is one toast, not two.
- Each place uses the pattern its screen or neighbours already use:
  - **inline `role="alert"`** in the two dialogs, `NewItemDialog` (create, pick existing) and
    `QuickUpdateDialog`, like `ShelfFilterPicksDialog`. The message clears on the next try;
  - **a toast** on the item Info and Stock tabs, the unit-switch confirm, the recipe, tag and
    vendor Info and Items tabs, the item Relation tabs (tags, vendors, recipes), and the
    pantry search tail.
- Each screen stays where it is, keeps the input, and enables its button again.
- `ItemForm` keeps its contract (it does not await `onSubmit`). Its two routes catch the error
  and do not mark the form saved. The `onSubmit` prop now documents that it must not reject.
- `RecipeInfoForm` and `TagInfoForm`: `onSave` may return a promise. If it rejects, the form
  puts the old baseline back. Their routes rethrow after the toast.
- New texts: `common.saveFailed` ("Could not save the change. Please try again." /
  「無法儲存變更，請再試一次。」) and `items.addDialog.createFailed` ("Could not create
  {{name}}. Please try again." / 「無法建立「{{name}}」，請再試一次。」).
  `items.detail.locationPager.addFailed` is reused.
- Contracts are written in `components/CLAUDE.md` and `hooks/CLAUDE.md`.

Commits on `fix/screens-show-save-errors`: `22ae22ce` (helper), `a8c555ce` (#1, #2),
`6c6e6bd3` (#3, #4, Info tab), `ad90a7a5` (#5, tag and vendor Info), `9a99a089` (#6, tag and
vendor Items), `5d6f2a5c` (#7, relation tags and vendors), `b4901deb` (#8), `c6104f11` (#9).

### Second round: the places left out of the first round

The first round listed these as known gaps. The owner asked for them in the same PR. A sweep
for `.mutate(`, `mutateAsync(`, `void handle`, `.catch(() =>` and `catch {}` in
`apps/web/src/routes` and `apps/web/src/components` found more of the same shape; those are
fixed here too (marked *sweep*).

| Commit | Screen | What was wrong | Fix |
|---|---|---|---|
| `2614ed0f` | create-from-search on the Items tab of a tag, vendor, recipe and shelf | `catch {}` showed nothing | toast `common.saveFailed`; the typed name stays |
| `2614ed0f` | `ShelfDetailView` create-from-search | `catch {}`, and the shelf write after the create was a `mutate` nobody read | toast; the shelf write is awaited inside the same `try` |
| `2614ed0f` | shelf Items tab checkbox (*sweep*) | try/finally with no catch, the same bug the tag and vendor tabs had | toast |
| `b91c4534` | item Relation tabs: New Tag | create had no catch (unhandled rejection); the assign after it was a `mutate` with no `onError` | toast. A failed create keeps the dialog and name. A failed assign closes it, because the tag exists now |
| `b91c4534` | item Relation tabs: New Tag Type (*sweep*), New Recipe, New Vendor's assign (*sweep*) | no catch / no `onError` | toast |
| `ee0dd012` | shelves page: Add shelf, drag to reorder | `mutate` with no `onError`; `AddShelfDialog` closed and cleared the name before the write ended | toast. `AddShelfDialog.onSubmit` may return a promise; the dialog closes only when it resolves |
| `ee0dd012` | shelf Info tab Save (both branches), shelf Filters tab | `mutate` with no `onError` | toast |
| `ee0dd012` | tags page: New Tag Type, New Tag, Edit Tag Type | `mutate` with no `onError`; the Add Tag dialog closed before the write ended | toast. Add Tag awaits `mutateAsync` and rethrows, so `TagInfoForm` marks the edit unsaved again |
| `4da8317c` | every delete through `DeleteButton` | no catch: pages that passed `mutateAsync` left an unhandled rejection, pages that passed `mutate` never saw the failure | `DeleteButton` shows a new text, `common.deleteFailed`, in one place. Every caller now awaits `mutateAsync` |
| `4da8317c` | tag page "has child tags" dialog (*sweep*) | its own `AlertDialogAction`s, same unhandled rejection | toast `common.deleteFailed` |
| `cc1f9fee` | shopping cart page: create-from-search, check / uncheck / amount, abandon, checkout | `catch {}`, or an `onError` that only cleared the pending row, or a failure other than `CART_CHANGED` that showed nothing | toast; dialogs stay open |
| `d61d40e3` | locations page Add and Rename, `NoLocationsGate` Add, `NewRecipeDialog` (*sweep*) | `mutate` with no `onError`; `NewRecipeDialog` had no catch | toast; the dialog keeps the name |

New text: `common.deleteFailed` ("Could not delete. Please try again." /
「無法刪除，請再試一次。」).

Contracts written down: `DeleteButton` and `AddShelfDialog` in `components/CLAUDE.md`.

## Test added

- 21 new web tests (web 3159 / 327 files → 3180 / 328). A new test helper,
  `watchUnhandledRejections()` in `apps/web/src/test/unhandledRejections.ts`, lets a test
  assert that no unhandled rejection happened.
- Each test makes the write reject, and checks that the message shows, the screen does not
  move on, the input is kept, and the button is enabled again.
- Every new test was red before its fix. 22 mutation checks (message removed, catch rethrows,
  baseline revert removed, `onError` removed, and so on) all went red, then green after
  restore.

Second round: 42 new web tests and 1 new test file,
`routes/settings/household/deleteFailed.test.tsx` (web 3180 / 328 files → 3222 / 329). Every new
test was red before its fix, and 42 mutation checks (message removed, catch
rethrows, `mutateAsync` put back to `mutate`, `onError` removed, the dialog closing on a
failure) all went red, then green after restore. Four older tests pinned the old `mutate`
calls or "no toast at all"; they now check the new contract.

### Cloud mode

The tests above make the local Dexie write fail. The cloud tests below make the SERVER refuse:
the generated Apollo mutation rejects with a `CombinedGraphQLErrors` with the code `FORBIDDEN`,
and the cloud branch of the app hook (`useUpdateItem`, `useCreateTag`, ...) passes it on to the
screen. 61 new web tests (web 3222 / 329 files → 3283 / 335; server 2111 / 76 and spec 70
unchanged).

**How they run.** A new test helper, `apps/web/src/test/cloudServerStub.ts`, replaces only the
generated hooks in `@/generated/graphql`. The app hooks above them stay real, so their
`mode === 'cloud'` branch runs. A mutation named in `cloudServer.failing` rejects; every
mutation records its variables in `cloudServer.calls`, and every test checks that list, so a
test cannot pass when the write failed before it was sent. Its mutation hooks keep a real
`loading` flag, so `isPending` goes true and false again as it does with Apollo. One test goes
through real Apollo instead (`MockedProvider` answers with a GraphQL error), to prove the step
the stub skips: Apollo's `mutate` rejects on a GraphQL error.

| File | Places |
|---|---|
| `routes/items/$id/saveFailed.cloud.test.tsx` (11) | Info and Stock tab save, unit-switch confirm; Relation tabs: assign a tag, vendor or recipe; New Tag (create, and the assign after it), New Tag Type, New Recipe, assign a new vendor |
| `components/item/NewItemDialog/NewItemDialog.cloud.test.tsx` (+2) | create, pick an existing item |
| `components/pantry/saveFailed.cloud.test.tsx` (4) | quick update dialog; `ShelfDetailView` create from search and the shelf write after it; a search tail group action (Apply vendor) |
| `hooks/useItemSearchTailWiring.cloud.test.tsx` (+1) | Add to location, through real Apollo |
| `routes/settings/household/saveFailed.cloud.test.tsx` (22) | recipe, tag and vendor Info renames; the four Items tabs (check an item, create from search, the recipe default amount, the shelf write after a create); Add shelf; shelf Info save (selection and filter); shelf Filters tab; tags page New Tag Type, New Tag, Edit Tag Type; New Recipe; and one negative control: the write works and only the refresh after it fails, so NO message shows |
| `routes/settings/household/deleteFailed.cloud.test.tsx` (12) | every delete through `DeleteButton` (10 pages) and both buttons of the "has child tags" dialog |
| `routes/shopping/saveFailed.cloud.test.tsx` (6) | create from search, check, uncheck, amount, abandon, checkout (a refusal other than `CART_CHANGED`) |
| `routes/settings/household/locations/saveFailed.cloud.test.tsx` (3) | Add, Rename, and Add on the empty `NoLocationsGate` screen |

Every place was mutation checked: the message removed (`showSaveError` call or `onError`
emptied), the catch made to rethrow, a delete put back to `mutate`, or the shelf write not
awaited. 59 mutations, every one turned its cloud test red, and each file was restored from a
copy. The negative control went red when the `.catch` in `refetchAfterWrite` was removed.

No cloud branch was found that swallows an error: every cloud `mutateAsync` rejects, and every
cloud `mutate` hands the error to the caller's `onError`.

**Not covered:**

- The shelves page drag-to-reorder fix has no test, in either mode: jsdom has no layout, so a
  keyboard drag finds no drop target and never calls the reorder.
- After a successful checkout the cart page awaits `refetchItems()` with no catch. That is a
  failed refresh, not a failed save (the area of PR #386), so it is left as it is.
- The cloud tests use a stubbed Apollo hook, not real Apollo, except the one search tail test.
  So they do not prove the `refetchQueries` or cache options each hook passes to its mutation.
- The other three pantry views (`VendorDetailView`, `RecipeDetailView`, `ShelfDetailView`) pass
  the quick update dialog the same `try`/`finally` as `PantryListView`; only the last has a cloud
  test.

## PR / commit

PR #387, branch `fix/screens-show-save-errors`. Commits are listed above.
