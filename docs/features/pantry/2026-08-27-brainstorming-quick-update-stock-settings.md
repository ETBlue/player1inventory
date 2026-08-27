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

---

## Addendum — 2026-08-27 (after first review of the shipped dialog)

Three changes to what is recorded above, decided after seeing the rows in place.
The Q&A is left as written — it is the record of the original session, not of
the final layout.

- **Label:** "Refill ≤" became **"Refill below"** (TW: 補貨 ≤ → 補貨門檻). The
  maths symbol read as a filter operator rather than a setting. Only the visible
  row label changed; the control `aria-label`s ("Refill threshold ({{unit}})",
  "Increase/Decrease refill threshold") are unchanged, as E2E page objects and
  unit tests bind to those exact strings.
- **Position:** the Target / Refill below rows moved **above** the progress bar,
  directly under Packed/Unpacked, and were **merged into that same grid** rather
  than opening a second one. Two adjacent `grid-cols-[auto_auto_auto]` grids
  size their columns independently, so once the blocks touched their steppers no
  longer lined up. Document order is now pinned by a test in
  `QuickUpdateDialog.test.tsx`.
- **Order within the grid:** the pair then moved again, to the **top** — the
  grid now reads Target, Refill below, Packed, Unpacked, with the progress bar
  still last. The two settings are what the bar is measured against, so they are
  read before the quantities they judge. The third column swapped with them: it
  carries the muted hints on the first two rows and the Unpack/Pack buttons on
  the last two.

## Addendum — 2026-08-27 (progress row moved to lead both surfaces)

A fourth change, decided after the above was already shipped: the progress bar
no longer reads last — it reads **first**, on both `QuickUpdateDialog` and
`ItemForm`'s Stock tab.

- **Position:** `StockProgressRow` moved from the bottom of each surface to the
  top. `QuickUpdateDialog` now renders progress bar, then the four-row grid
  (Target, Refill below, Packed, Unpacked). The Stock tab now renders progress
  bar, then the four fields, then "Expires on" (unchanged as the last block).
- **Why:** the bar is the summary of the four values below it — reading it
  first tells the user what state the item is in before they see the individual
  numbers that produced it, rather than making them assemble the summary
  themselves after reading four rows.
- **What did not change:** the shared `grid-cols-[auto_auto_auto]` grid for the
  four stepper rows on `QuickUpdateDialog`, the shortened "Target" / "Refill
  below" labels, the steppers' step sizes and clamping, and every prop/handler
  on `StockProgressRow` itself — this was a pure move of existing JSX, not a
  redesign. The line above reading "with the progress bar still last" from the
  previous addendum is superseded by this one.
- Document order is re-pinned by tests in `QuickUpdateDialog.test.tsx` and
  `ItemForm.test.tsx`.

## Addendum — 2026-08-27 (Expires on added; the 2026-05-31 exclusion reversed)

A fifth change: the pantry dialog now also renders the per-location due date,
reversing the original decision recorded in
`2026-05-31-brainstorming-quick-update-dialog.md` that "manual updates from the
pantry quick-update dialog should NOT affect `dueDate`." A short forward-pointer
note was added at the end of that file rather than editing its Q&A — the same
convention this document already follows for its own history.

- **Gate:** the field renders only when `item.expirationMode === 'date'` — the
  same global gate `ItemForm`'s Stock tab uses. An item in `'days from purchase'`
  or `'disabled'` mode never sees it, exactly as before.
- **Position:** last, after the four-row stepper grid, at full width — the
  pantry-page mirror of the Stock tab's own last block (see the addendum
  immediately above: "the Stock tab now renders progress bar, then the four
  fields, then 'Expires on'").
- **Payload:** `onSubmit` widens again, to
  `{ packedQuantity, unpackedQuantity, targetQuantity, refillThreshold, dueDate? }`.
  The `dueDate` key is present only when the field is rendered (mode ===
  `'date'`) — `toUpdateItemInput()` (cloud) and `writeItemUpdate()` /
  `upsertItemStock()` (local) both read a key's *absence* as "leave alone" and
  its *presence*, even as `undefined`, as "clear it," so an unconditional key
  would have wiped the stored date on every Update press for an item in another
  mode. All four pantry views now forward the dialog's `onSubmit` object as-is
  (cast to `Partial<StockFields>`) rather than re-destructuring named fields, so
  this conditional presence survives the forward untouched.
- **i18n:** the label/hint strings already existed as
  `items.form.expirationDueDate.label` / `.hint` for `ItemForm`'s copy of this
  field. Rather than duplicate them under a second `pantry.quickUpdate.*` pair,
  both keys were promoted to `common.expiresOn` / `common.expiresOnHint` and
  both callers now point at the promoted pair — see `i18n/CLAUDE.md`.
- Covered by a new describe block in `QuickUpdateDialog.test.tsx` (render gate,
  stored value, edit, clear, `isUntouched`, and the no-`dueDate`-key case for a
  non-date-mode item) plus one new test per pantry view test file proving the
  forward survives the view layer, and a new `WithExpirationDate` story +
  smoke-test pair.

## Addendum — 2026-08-27 (Expires on joins the four-row grid)

A sixth change, superseding this addendum's own "Position" bullet above:
"Expires on" no longer sits in its own full-width block after the grid — it is
now the **fifth row of the same `grid-cols-[auto_auto_auto]` grid** as Target,
Refill below, Packed, and Unpacked, on `QuickUpdateDialog` only. `ItemForm`'s
Stock tab is unchanged — its "Expires on" field still renders as its own
full-width block after its four fields.

- **Why:** the field has its own label and hint, exactly like Target and
  Refill below — rendering it outside the grid left its label and input
  unaligned with the column the four rows above establish, for no reason
  other than it being added later.
- **Structure:** the conditional block is a fragment (`<>…</>`), not a
  wrapping `<div>` — inside a grid, a wrapper element becomes a single grid
  item and collapses the three cells into one column, which is exactly the
  misalignment this change removes. The label reuses `Label` (for the
  `htmlFor`/`id` association `common.expiresOn`/`quickUpdateDueDate` already
  had) styled with the same classes as the other rows' label spans; the hint
  reuses the same muted `text-xs` span class as the Target/Refill hints. The
  `Input`'s own `id`, `value`/`onChange`, `type="date"`, and the gate on
  `item.expirationMode === 'date'` are all unchanged.
- **What did not change:** the gate, the payload's conditional `dueDate` key,
  the i18n keys, and every other behaviour recorded in the addendum above —
  this was a pure layout move.
- The shared-grid test in `QuickUpdateDialog.test.tsx` was extended to also
  assert the due date input's grid ancestor is the same element as the
  steppers', rather than adding a second, disconnected test.
