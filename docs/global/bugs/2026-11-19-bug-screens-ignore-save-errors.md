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

## Test added

- 21 new web tests (web 3159 / 327 files → 3180 / 328). A new test helper,
  `watchUnhandledRejections()` in `apps/web/src/test/unhandledRejections.ts`, lets a test
  assert that no unhandled rejection happened.
- Each test makes the write reject, and checks that the message shows, the screen does not
  move on, the input is kept, and the button is enabled again.
- Every new test was red before its fix. 22 mutation checks (message removed, catch rethrows,
  baseline revert removed, `onError` removed, and so on) all went red, then green after
  restore.

**Not covered:**

- No cloud-mode test. All new tests make the local Dexie write fail. The cloud branches reject
  the same way, but no test drives them.
- **Left out, the same kind of bug:** the create-from-search catches that show nothing
  (`recipes/$id/items.tsx`, `tags/$id/items.tsx`, `vendors/$id/items.tsx`,
  `shelves/$shelfId/items.tsx`, `ShelfDetailView.handleCreateFromSearch`);
  `relation/tags.tsx` `handleAddTag`; `relation/recipes.tsx` `createRecipe.mutate`; the
  shelves settings pages and `tags/index.tsx` (`mutate` with no `onError`); every delete
  through `DeleteButton`; the `mutate` calls on the shopping page.

## PR / commit

*TBD*
