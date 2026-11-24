# Design: Save in the unsaved-changes dialog

Date: 2026-11-25. Branch `feature/unsaved-dialog-save`, from `develop` at `a38934f5`.
Brainstorming: `2026-11-25-brainstorming-unsaved-dialog-save.md`.

## Summary

1. **Where it sits.** Six pages ask "You have unsaved changes" when the user leaves a form
   with edits. The dialog offers only Cancel and Discard, so to keep the edits the user must
   cancel, press Save, and then leave again. Discard is also shown in the main `primary`
   color, which breaks the design guide's rule for an action you can't undo.
2. **Relations.** Web only. No server or schema change. Builds on #419 (Save in the item page
   top bar), which is in `develop`.
3. **What the user gets** once merged and deployed:
   - The dialog has **Cancel · Discard · Save**. Save keeps the edits and then goes where the
     user was going.
   - Discard is shown in the destructive color.
   - The same on the item page (tabs, Back, Stock location pages) and on the tag, vendor,
     recipe and shelf detail pages.
4. **What the developer gets:** one shared dialog component instead of six copies, and the
   design guide's Forms page has the form rules written down.

## The dialog

| Button | Variant | Does |
|---|---|---|
| Cancel | `neutral-outline` | closes the dialog; the user stays, edits kept (as today) |
| Discard | `destructive-outline` | leaves without saving (as today) |
| Save | `primary` (solid) | saves, then leaves; see below |

- Save is **disabled** while the form has a field error (the app's rule; the error already
  shows next to the field) and while a save runs.
- While the save runs, Save shows a spinner, and the dialog stays open.
- **Save succeeds:** the dialog closes, the page's usual "saved" feedback shows (the item
  tabs' "Saved" toast), and the navigation the user started happens.
- **Save fails:** the page's usual error toast shows, and the dialog stays open, so the user
  can try again, Discard or Cancel.
- The dialog's Save runs **the same save code** as the page's own Save button. It must not
  run the page's own "after save" navigation: the settings detail pages `goBack()` after a
  save today, and from the dialog the user must go where they pressed, not back.

## Info tab: the converted amounts dialog (owner's flow)

When the Info save needs the converted amounts confirm (unit or consume amount changed):

1. Save in the unsaved-changes dialog opens the converted amounts dialog ON TOP of it. The
   unsaved-changes dialog stays open underneath.
2. **Confirm:** the save runs. On success both dialogs close and the navigation happens.
3. **Cancel:** only the converted amounts dialog closes. The unsaved-changes dialog shows
   again.
4. **The save fails:** the converted amounts dialog closes, the error toast shows, and the
   unsaved-changes dialog stays.

Rule: the dialog's Save behaves as much as possible like the top bar Save.

## Where

| Page | File | Leaving by |
|---|---|---|
| item Info and Stock | `routes/items/$id.tsx` | a tab, Back |
| item Stock location pager | `routes/items/$id/stock.tsx` | another location's page |
| tag | `routes/settings/household/tags/$id.tsx` | a tab, Back |
| vendor | `routes/settings/household/vendors/$id.tsx` | a tab, Back |
| recipe | `routes/settings/household/recipes/$id.tsx` | a tab, Back |
| shelf | `routes/settings/household/shelves/$shelfId.tsx` | a tab, Back |

## How (outline; the implementer may improve it)

- One shared component for the dialog (`components/shared/…`), with a story and a smoke
  test. The six pages use it.
- The page that owns the form gives its layout a "save now" function that answers whether the
  save worked (for example `Promise<boolean>`), plus whether Save may be pressed (no field
  error, not saving). The layouts already share `isDirty` through `useItemLayout`,
  `useTagLayout`, `useShelfLayout` and the others; this sits beside it.
- The top bar Save and the dialog Save call the same save code.

## Design guide

Fill in `apps/design/src/content/docs/patterns/forms.mdx` (empty today):

- Submit is disabled while a field has an error, while nothing changed (edit forms), and
  while the save runs. The error shows next to the field.
- The unsaved-changes dialog: Cancel (`neutral-outline`) · Discard (`destructive-outline`) ·
  Save (`primary`). What each does, as in the table above.

## Tests

- Unit tests for each page: Save in the dialog saves and then navigates; a failed save keeps
  the dialog open and does not navigate; Save is disabled with a field error; Discard and
  Cancel work as before. Local and cloud where the page has a cloud test file.
- Info: the stacked flow (confirm → saves and leaves; cancel → unsaved-changes dialog shows
  again).
- Mutation checks: navigate before the save resolves → red; navigate after a failed save →
  red; remove the disabled rule → red.
- E2E: one test per kind of page (item Info, item Stock location pager, one settings page),
  and axe scans of the dialog in light and dark mode.

## Not in this design

- Guarding other ways out of a page (the sidebar, closing the browser tab).
- The Tags, Vendors, Recipes and Log tabs of the item page: they save on each click and have
  no dialog.

## As built (2026-11-25)

Built on `feature/unsaved-dialog-save`. It follows the design above. What the outline left
open, and the few places it differs:

| Part | As built |
|---|---|
| Shared dialog | `components/shared/UnsavedChangesDialog/` (`open`, `onCancel`, `onLeave`, `saveControl`). Save is a plain `Button`, not an `AlertDialogAction`: an action closes the dialog on click, and a failed save must keep it open |
| "Save now" and "can save" | one type, `SaveControl` = `{ canSave, save(): Promise<boolean> }`, in `hooks/useSaveControl.ts`. The five layout hooks expose `saveControl` and `registerSaveControl` beside `isDirty` |
| Who registers it | the FORM, not the page: `ItemForm`, `TagInfoForm`, `VendorInfoForm` and `RecipeInfoForm` take an `onSaveControlChange` prop; the shelf Info page has its form inline and registers itself. The form holds the field values, so only the form can run the same submit |
| No `goBack()` from the dialog | the settings forms take a new `onSaved` prop, called only after their OWN Save; the pages pass `goBack` there, and `onSave` no longer navigates. The shelf page's `saveShelf()` answers `true` or `false`; `handleSave` calls `goBack()` after `true` |
| While the save runs | every button is off and Escape does nothing (the design said only "Save shows a spinner"). Without it a Discard pressed during the save would navigate, and the save's own success would then navigate a second time |
| Info, the converted amounts dialog | as the owner's flow. `handleSubmit` returns a promise that waits for that dialog. The answer is taken out of its ref BEFORE the first `await` in Confirm, because Radix closes the dialog (and so calls Cancel) right after the click handler starts |
| Dialog text | `common.unsavedDescription` asked "Discard changes?", which did not fit three buttons. It is now "You have unsaved changes. Save them before you leave, or discard them?" / 「您還沒存檔喔。離開前要存檔，還是丟掉改到一半的東西？」. Not in the design; please check the wording |
| Vendor Info, a small fix on the way | `VendorInfoForm`'s submit had no guard: Enter with an empty or unchanged name sent a save. It now uses the same `canSave` rule as its button |

Tests: `routes/items/$id/unsavedDialogSave.test.tsx` (8, local), `…/unsavedDialogSave.cloud.test.tsx`
(5), `routes/settings/household/unsavedDialogSave.cloud.test.tsx` (24: 6 × 4 pages), the
story smoke test (4), and `e2e/tests/unsaved-dialog-save.spec.ts` (5, in `local` and `cloud`).
