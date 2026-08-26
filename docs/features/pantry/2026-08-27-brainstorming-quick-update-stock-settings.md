# Brainstorming: Stock Settings in the Quick Update Dialog

**Date:** 2026-08-27
**Topic:** Add "target quantity" and "refill when below" to the pantry stock-status dialog
**Feature branch:** `feature/quick-update-stock-settings`

---

## Problem

`targetQuantity` and `refillThreshold` decide what the pantry shows — the progress
bar's scale and whether an item reads as low stock. Until now they were editable
only on the item form's Stock tab, so tuning a threshold meant leaving the pantry
list, opening the item, switching to a tab, saving, and navigating back. The
dialog that already shows the consequence of those two numbers could not change
them.

Both fields are per-location `ItemStock` state (not part of the v16 global stock
*configuration*), so editing them from the pantry means editing the active
location's row — which is exactly what a user looking at that location expects.

---

## Questions & Answers

**Q: Where do the two fields sit, given the dialog is meant to be a *quick* update?**
A: An always-visible row below the progress bar. Rejected: a collapsed
disclosure (an extra click on a dialog that exists to save clicks) and placing
them above the progress bar (pushes the quantity steppers and the bar apart).

**Q: Plain number inputs like the item form, or the +/− steppers the quantity rows use?**
A: Steppers — the same joined `[−] [input] [+]` group as Packed/Unpacked. The
dialog's whole premise is that adjusting a number should not require typing, and
a settings row that broke that pattern would read as a foreign control.

**Q: What should the +/− increments be?**
A: Mirror `ItemForm`'s `step` values for the same two fields. Target steps by 1
in `package` mode and by `consumeAmount` in `measurement` mode; Refill ≤ always
steps by `consumeAmount`. Both clamp at 0. The dialog's existing `consumeAmount
> 0 ? consumeAmount : 1` fallback applies — a stepper increment must be non-zero
to be usable, which is the deliberate difference from `ItemForm`'s `'any'`.

**Q: Does the preview react to the edited settings, or only to the edited quantities?**
A: Everything is live. The progress bar's `target`, the stock status colour, the
`x / y` label, the inactive state and Fill-to-Full's destination all read the
local values, so raising the threshold shows the low-stock colour *before*
Update is pressed. Reading `item.*` for any of them would make the dialog
disagree with itself mid-edit.

**Q: Setting target to 0 marks the item inactive at this location and can drop
the card out of the list you are looking at. Block it here?**
A: No — keep `ItemForm`'s behaviour and its wording ("Inactive when 0"). The
dialog is a second door onto the same field, not a stricter one; a rule that
exists in one place and not the other is worse than the surprise.

**Q: Full labels, or shortened?**
A: Shortened to **Target** and **Refill ≤** so the label column stays narrow
next to the steppers. `ItemForm` keeps "Target Quantity" / "Refill When Below" —
it has a two-column grid and room for them. The hints move into the third grid
column, where Unpack/Pack sit in the rows above.

---

## Decision

A two-row stock-settings block below the progress bar in `QuickUpdateDialog`,
built from the same row shape as Packed/Unpacked: label with the tracking unit,
joined +/− stepper, muted hint. `onSubmit` widens to
`{ packedQuantity, unpackedQuantity, targetQuantity, refillThreshold }` and all
four pantry views (list, shelf, vendor, recipe detail) forward the whole payload
to `useUpdateItem`, which already routes both halves in local and cloud mode.

No hook, Dexie or GraphQL change: `UpdateItemInput` has carried both fields all
along.

---

## Notes

- The unit shown on both rows is the item's **tracking** unit (the unpacked
  row's unit), not the package unit — that is the unit the two fields are
  stored in.
- `isUntouched` covers all four values, so **Update** stays disabled until
  something actually changed.
- Classified as a **bounded** change under the brainstorming skill: an existing
  dialog, existing fields, existing mutation path. No design doc or
  implementation plan — the design was agreed in chat and implemented directly.
