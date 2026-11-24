# Bug: a new tag or vendor shows as not selected for about a second

Date: 2026-11-25. Issue #402, part 1. Branch `fix/new-tag-vendor-selected`.

## Bug

Seen by the owner in cloud mode, in production:

1. Open an item, then the Tags tab (or the Vendors tab).
2. Create a new tag (or vendor) from the tab.
3. The new pill shows right away, but NOT selected.
4. About 1 second later it changes to selected.

A new recipe from the Recipes tab shows as selected at once. The owner wants tags and
vendors to behave the same way.

Also found in the same tab: the **New tag type** dialog's submit button shows no loading
state while the tag type is created.

## Root cause

Two writes, and the pill shows between them:

| Tab | Writes | When the pill shows |
|---|---|---|
| Recipes | ONE: `createRecipe` with `items: [{ itemId }]` | already selected |
| Tags | `createTag`, then `updateItem` with the new `tagIds` (`routes/items/$id/tags.tsx`, `handleAddTag`) | after `createTag`, unselected until `updateItem` and its refetch finish |
| Vendors | `createVendor`, then `updateItem` (`routes/items/$id/vendors.tsx`) | the same |

The new tag or vendor is assigned correctly. Only the display is late. On Neon each write
and refetch takes a few hundred ms, so the gap is about 1 second.

The tag type dialog: the second `AddNameDialog` in `tags.tsx` gets no `isPending` prop.

## Fix applied

Web only. No server or schema change.

**The new badge (commit `2036a44a`).** `tags.tsx` and `vendors.tsx` keep the new id in
local state (`assigningTagIds` / `assigningVendorIds`) from the moment the create returns
until the assign is done.

| Part | What it does |
|---|---|
| shown as selected | a badge is selected when its id is on the item OR in that state (`shownTagIds` / `shownVendorIds`). The "no tags / vendors assigned" empty state reads the same list |
| `aria-busy="true"` | on the new badge while its assign is in flight. No spinner, so it looks like the Recipes tab |
| assign succeeds | the id is removed in `finally`. By then the item already has it: local `mutateAsync` waits for the refetch, and Apollo writes the `updateItem` answer to its cache before the promise resolves |
| assign fails | the id is removed, so the badge goes back to not selected, and `showSaveError` shows "Could not save the change. Please try again." as before |
| a press on a badge while an assign is in flight | does nothing. Each write sends the WHOLE `tagIds` / `vendorIds` list, so two writes at the same time could undo each other, depending on which one the server takes last |
| the assign's list | the item's ids plus every new id still being assigned, so a second new tag made during the first assign keeps the first |

The Vendors tab now awaits the assign with `mutateAsync` (it used `mutate` with `onError`),
so it knows when to clear the state.

**The tag type dialog (commit `cf45f739`).** `tags.tsx` calls `useCreateTagType` directly and
passes its `isPending` to the second `AddNameDialog`. The Add button is disabled and shows a
spinner while the tag type is created. `useAddTagType` was a thin wrapper with no `isPending`,
and this tab was its only caller, so it is deleted.

## Test added

In `apps/web/src/routes/items/$id/createAssign.cloud.test.tsx`, a new `describe`, "a new tag
or vendor shows as selected at once (cloud)", 7 tests. They hold the write with
`holdMutation` (new in `apps/web/src/test/cloudServerStub.ts`), so they look at the screen
while the assign is really in flight:

- the new tag / vendor is `aria-pressed="true"` and `aria-busy="true"` before the assign
  answers, and stays pressed after it (2 tests)
- the assign fails: the badge goes back to `aria-pressed="false"` and the toast shows (2 tests)
- a press on another badge during the assign sends no second write (2 tests)
- the New tag type dialog's Add button is disabled and shows a spinner while the create is
  held (1 test)

Each was checked by removing the behaviour in the source (8 mutations, every one turned at
least one of these tests red). Against the code before the fix, 6 of the first 6 failed.

E2E: `e2e/tests/item-management.spec.ts`, "user can assign a tag to an item" and "user can
assign a vendor to an item", now wait for `aria-busy` to end, then reload and check the badge
is still pressed. Before, a pressed badge meant the write had finished. Now it does not, so
the reload is what checks the saved state.

## PR / commit

*TBD*
