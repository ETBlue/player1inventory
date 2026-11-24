# Brainstorming: Save in the unsaved-changes dialog

Date: 2026-11-25. Owner and main session.

## The request (owner)

On the item page, leaving a form with unsaved edits opens the "unsaved changes" dialog. It
has only **Cancel** and **Discard**. Add **Save**.

## What the code does today (checked)

| Dialog | File | Opens when |
|---|---|---|
| item tabs and Back | `routes/items/$id.tsx` | leaving Info or Stock with unsaved edits, by a tab or Back |
| Stock location pager | `routes/items/$id/stock.tsx` | moving to another location's page with unsaved edits |
| tag, vendor, recipe, shelf detail | `routes/settings/household/{tags,vendors,recipes}/$id.tsx`, `shelves/$shelfId.tsx` | leaving the Info tab with unsaved edits, by a tab or Back |

- All six use `AlertDialogAction` with no `variant`, so **Discard** is `primary` (the
  `buttonVariants` default).
- On Info, a save that changes the unit or the consume amount opens a second dialog that
  confirms the converted amounts before anything is written.
- The settings detail pages save and then `goBack()`. The item Info and Stock tabs save and
  stay (since 2026-11-24).

## What the design guide and the code say (checked)

- **Forms:** the design guide's Forms page (`apps/design/.../patterns/forms.mdx`) is empty
  ("TODO"). The code has one rule in 13 forms: **Submit is disabled while a field has an
  error**, and the error shows next to the field (`ItemForm`'s `isSubmitDisabled`,
  `disabled={!!nameError || !isDirty || isPending}` in the info forms, and the same without
  `isDirty` in the create dialogs).
- **Buttons** (`components/button.mdx`): `primary` for the main action, `destructive` for an
  action you can't undo, `neutral` for cancel. Solid for high emphasis, outline for medium
  emphasis next to a solid button. `DeleteButton`'s confirm uses `variant="destructive"`.

## Decisions

| # | Question | Answer |
|---|---|---|
| Q1 | Which dialogs get Save: both item page dialogs, or tabs and Back only? | **Both** |
| Q2 | Info, when the save needs the converted amounts dialog | **Owner's own idea:** Save opens the converted amounts dialog ON TOP of the unsaved-changes dialog. Confirm saves, then goes where the user was going. Cancel closes only the conversion dialog, so the unsaved-changes dialog shows again. Rule: the dialog's Save behaves as much as possible like the top bar Save |
| Q3 | Button look | **Save is the one solid main button**, on the right |
| Q4 | A form with a field error | Follow the app's rule: the dialog's **Save is disabled** (owner asked to check the design guide and other forms; see above) |
| Q5 | Discard's color | **`destructive`** (owner: "should have the destructive color"). With Save solid, the guide gives `destructive-outline` for Discard and `neutral-outline` for Cancel |
| Q6 | The same dialog on the four settings detail pages | **A: all six dialogs** get Save and the new colors, in one branch |
| Q7 | The empty Forms page | **Fill it in** with the two rules: Submit disabled on a field error, and Cancel · Discard · Save |

See `2026-11-25-unsaved-dialog-save-design.md`.
