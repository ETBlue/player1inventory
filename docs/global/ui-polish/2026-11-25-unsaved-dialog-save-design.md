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
