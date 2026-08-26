# Plan: Stock Tab Steppers, Reorder and i18n

**Date:** 2026-08-27
**Branch:** `feature/quick-update-stock-settings`
**Area:** items (item detail Stock tab) + pantry (quick update dialog)
**Related:** [brainstorming — quick update stock settings](../pantry/2026-08-27-brainstorming-quick-update-stock-settings.md)

---

## Context

The pantry quick-update dialog (`QuickUpdateDialog`) now edits four stock
values through joined `[−] input [+]` steppers in one grid, ordered Target →
Refill below → Packed → Unpacked, followed by a progress row (Clear · bar ·
`x / y` label · Fill to Full).

The item detail **Stock tab** edits the same four per-location values through
`ItemForm`'s stock section, but with plain number inputs, no progress preview,
the opposite field order, and Target/Refill sharing one `grid-cols-2` row. It
is also entirely hardcoded English while its route (`routes/items/$id/stock.tsx`)
is already translated.

This plan brings the Stock tab to the same controls as the dialog, extracts the
shared pieces rather than duplicating them, and translates `ItemForm`.

## Global Constraints

1. **The dialog's rendered output must not change.** Its EN strings, DOM order,
   aria-labels and CSS classes are bound by `QuickUpdateDialog.test.tsx`,
   `QuickUpdateDialog.stories.test.tsx`, `e2e/pages/PantryPage.ts` and
   `e2e/tests/item-management.spec.ts`. The extraction in Task 1 is a pure
   refactor: same DOM, same strings, same behaviour.
2. **`ItemForm`'s input `id`s are preserved** — `#targetQuantity`,
   `#refillThreshold`, `#packedQuantity`, `#unpackedQuantity`. `e2e/pages/ItemPage.ts`,
   `e2e/pages/StockFormPage.ts` and `e2e/tests/item-stock-input.spec.ts` bind
   to them.
3. **`ItemForm` keeps its `numericDrafts` text-entry behaviour.** Typing "2.5"
   must not collapse to 3 mid-keystroke. The shared stepper takes the input's
   `value`/`onChange`/`onBlur` from the caller; it never owns them.
4. **Step semantics, identical on both surfaces:**
   - Packed: ±1 always.
   - Unpacked: ±`step` through `roundToStep`.
   - Target: ±1 when `targetUnit === 'package'`, else ±`step` through `roundToStep`.
   - Refill: ±`step` through `roundToStep`, both unit modes.
   - where `step = consumeAmount > 0 ? consumeAmount : 1`.
   - All clamp at 0; each `−` is disabled at 0 and while the form/dialog is pending.
5. **The button fallback does not change the text input.** `ItemForm`'s
   `quantityStep` (`consumeAmount > 0 ? consumeAmount : 'any'`) still governs
   the `<Input step>` attribute and its blur rounding. Only the +/− buttons take
   the fallback-to-1. The existing comment in `ItemForm.tsx` saying the two must
   not be unified is now half-wrong and must be rewritten to describe this split.
6. **EN strings stay byte-identical** through the i18n task, on both surfaces.
7. **Field order on the Stock tab:** Target Quantity, Refill When Below, Packed,
   Unpacked, then the progress row, then the existing per-location "Expires on"
   block.
8. **The Stock tab keeps its longer labels** ("Target Quantity", "Refill When
   Below") and its per-field helper texts. The dialog keeps its short ones
   ("Target", "Refill below"). They are deliberately different.
9. Every task runs the repo's verification gate for what it touched and reports
   the mutation checks it ran (root `CLAUDE.md`).

---

## Task 1: Extract `QuantityStepper` and `StockProgressRow`

Create two shared components under `apps/web/src/components/item/`, each in its
own directory with `ComponentName.tsx` + `index.ts` barrel (never `index.tsx`),
and refactor `QuickUpdateDialog` onto them with **no change to its rendered
output**.

### `QuantityStepper`

Renders the joined `[−] <Input/> [+]` group currently repeated four times in
`QuickUpdateDialog.tsx`. Carry the existing classes over verbatim:

- buttons: `variant="neutral-outline"`, `size="icon-sm"`,
  `className="flex-shrink-0 -mr-[1px] rounded-tr-none rounded-br-none"` (minus)
  and `"flex-shrink-0 -ml-[1px] rounded-tl-none rounded-bl-none"` (plus),
  icons `<Minus className="h-4 w-4" />` / `<Plus className="h-4 w-4" />`
- wrapper: `<div className="flex items-center gap-0">`
- input: `type="number"`, `min="0"`

Props:

- `value: number` — current value, used for the `−`-disabled-at-0 test and as
  the base the +/− handlers step from
- `onStep: (next: number) => void` — called with the already-stepped, already-
  clamped, already-rounded value
- `step: number` — the increment for both buttons (callers pass the Task-1
  Global Constraint 4 value)
- `round?: (n: number) => number` — optional normalizer applied to the stepped
  value before clamping (callers pass `(n) => roundToStep(n, step)` where the
  constraint calls for rounding; Packed and package-mode Target pass nothing)
- `decreaseLabel` / `increaseLabel`: string — the buttons' `aria-label`s
- `disabled?: boolean` — disables both buttons and is combined with the
  value-at-0 test for the `−` button
- `inputProps` — spread onto the `Input` **last**, so the caller owns
  `value`/`onChange`/`onBlur`/`aria-label`/`id`/`step`/`className`

The component owns: stepping by `step`, applying `round`, `Math.max(0, …)`,
and disabling `−` when `value === 0 || disabled`. It owns no state.

Default the input's `className` to `"h-7 rounded-none text-right"` (the
dialog's) so callers may override it; `ItemForm` will.

### `StockProgressRow`

Renders the dialog's Clear · label · `ItemProgressBar` · Fill-to-Full row —
the `grid grid-cols-[auto_1fr_auto] gap-2 items-center` block, verbatim,
including the `space-y-1` inner column, the `flex gap-1 items-baseline text-xs
text-right text-foreground-muted` label line, the `<span className="flex-1" />`
spacer and the `UnitBadge`.

Props: the display values it currently computes inline in the dialog —
`quantityLabel`, `unitLabel`, `current`, `target`, `status`, `targetUnit`,
`packed`, `unpacked`, optional `measurementUnit` / `amountPerPackage` (passed
through with the existing conditional-spread idiom so `exactOptionalPropertyTypes`
holds), `onClear`, `onFill`, `clearDisabled`, `fillDisabled`, and the two
aria-labels (`Clear`, `Fill to Full`) so callers keep control of the strings.

Leave the *computation* of `quantityLabel`, `localTotal`, `status`,
`isAtZero`/`isAtFull` in the caller — `StockProgressRow` is presentational.

### Refactor `QuickUpdateDialog`

Replace its four inline stepper groups and its progress row with the new
components. `QuickUpdateDialog.test.tsx` (25 tests) and
`QuickUpdateDialog.stories.test.tsx` (28 tests) must pass **unmodified** — if a
test needs editing, the refactor changed rendered output and is wrong.

### Tests

- `QuantityStepper.stories.tsx` + `.stories.test.tsx`, `QuantityStepper.test.tsx`:
  stepping up/down, `round` applied, clamp at 0, `−` disabled at 0 and when
  `disabled`, `inputProps` winning over the defaults, aria-labels.
- `StockProgressRow.stories.tsx` + `.stories.test.tsx`: at least an ok, a low
  and an inactive status, and one measurement-unit item.
- Mutation-check the new components' tests (delete the clamp, delete the
  `round` call, drop the `−`-disabled test) and report each going red.

---

## Task 2: Rebuild the Stock tab's fields

Rewrite the `{showStock && …}` block in
`apps/web/src/components/item/ItemForm/ItemForm.tsx` to the order and controls
in Global Constraints 4 and 7. Do not touch the info section in this task.

Each of the four fields is its own row (Target and Refill are no longer a
`grid-cols-2` pair), keeping the existing vertical shape:

```
<Label htmlFor="targetQuantity">Target Quantity <UnitInline unit={…} /></Label>
<QuantityStepper … />               ← plus the Unpack/Pack button for the
<p className="text-xs …">helper</p>    two quantity rows
```

- Keep every existing `Label`, `htmlFor`, input `id`, `UnitInline` unit
  expression and helper `<p>` text exactly as they are today.
- Keep the `grid grid-cols-[auto_8rem] gap-2` wrapper on the **Packed** and
  **Unpacked** rows so `Unpack` / `Pack` stay in their 8rem column with their
  existing `disabled` expressions and `computeUnpack` / `computePack` calls.
  Target and Refill have no action button; they need no grid.
- Pass `inputProps` through from the existing `numericInputProps(field, value,
  setValue, normalizeOnBlur?)` calls unchanged, together with the current
  `step` attribute values (`1` for packed, `quantityStep` for unpacked and
  refill, `targetUnit === 'package' ? 1 : quantityStep` for target). The
  stepper's own `step` prop takes the Constraint-4 value instead.
- The stepper's input needs `ItemForm`'s own input styling, not the dialog's
  `h-7` — pass `className` through `inputProps`.

Then add `StockProgressRow` below the four rows, above the "Expires on" block,
driven by the form's live state:

- `current` = `targetUnit === 'measurement' && amountPerPackage`
  ? `packedQuantity * amountPerPackage + unpackedQuantity`
  : `packedQuantity + unpackedQuantity`
- `target` = the form's `targetQuantity`
- `status` = `isInactive({ targetQuantity })` ? `'inactive'` :
  `getStockStatus(current, refillThreshold)`
- `packed` = the display-packed value (`packedQuantity * amountPerPackage` in
  measurement mode with a conversion rate, else `packedQuantity`)
- `quantityLabel` / `unitLabel` computed exactly as `QuickUpdateDialog` does
- `onClear` sets packed and unpacked to 0; `onFill` uses
  `computeFillToFull({ targetUnit, targetQuantity, consumeAmount, amountPerPackage })`
  with the form's **current** target — the same live-preview rule the dialog follows
- `clearDisabled` / `fillDisabled` mirror the dialog's `isAtZero` / `isAtFull`
- Clear and Fill mark the form dirty like any other field edit

Rewrite the `ItemForm.tsx` comment that currently says the dialog's
fallback-to-1 must not be unified with `quantityStep`, per Global Constraint 5.

### Tests

Extend `ItemForm.test.tsx` (and add stories coverage for the stock section if
the existing stories do not render it):

- each of the four steppers moves its field by the Constraint-4 increment, in
  both `package` and `measurement` mode
- all four clamp at 0 and their `−` buttons disable at 0
- typing "2.5" into a stepper's input still yields 2.5 (the draft behaviour is
  not regressed by the stepper wrapper)
- the four fields render in the Constraint-7 order
- the progress row previews from live form state: raising `refillThreshold`
  above the current total flips the status, and Fill to Full targets the
  form's edited `targetQuantity`

Mutation-check each new behavioural test.

---

## Task 3: Translate `ItemForm`

Migrate **every** user-visible string and `aria-label` in
`apps/web/src/components/item/ItemForm/ItemForm.tsx` — both the info and stock
sections — to `items.form.*` keys in `apps/web/src/i18n/locales/en.json` and
`tw.json`, following `apps/web/src/i18n/CLAUDE.md`.

- Reuse `common.*` where a key already exists; check before adding.
- EN values byte-identical to the current hardcoded strings (Global
  Constraint 6). `ItemForm.test.tsx`, the stock-tab route tests and
  `e2e/tests/item-stock-input.spec.ts` query many of them.
- TW must be real Traditional Chinese, consistent with the vocabulary already
  settled in `tw.json`: 未開封 (Packed), 已開封 (Unpacked), 開封 (Unpack),
  目標數量 (Target Quantity), 低於此數補貨 (Refill When Below), 補貨門檻
  (refill threshold). Do not leave English in `tw.json`.
- Entity names stay out of the translated string (the rule added to
  `i18n/CLAUDE.md` during the dialog migration).
- Validation messages already live under `validation.*` — reuse, do not
  duplicate.
- `NewItemDialog` renders the same info section; confirm it still reads
  correctly and its tests pass.

The locale parity test (`src/i18n/locales/locales.test.ts`) is the CI guard and
must stay green.

Mutation check: change one EN value, confirm a test goes red, restore.

---

## Task 4: E2E and documentation

1. Extend `e2e/tests/item-stock-input.spec.ts` with a Stock-tab case driving the
   new +/− buttons (and add the accessors to `e2e/pages/StockFormPage.ts` /
   `ItemPage.ts` with the usual aria-label citations). Assert a value that
   round-trips through save, so the steppers are proven to feed the form's
   submitted values — not merely to move the display.
   Mutation-check it against a deleted clamp or a dropped `onStep`.
2. Run `pnpm test:e2e --grep "item-management|items|shelves|vendors-group|recipes-group|a11y"`.
   The four `a11y.spec.ts` colour-contrast failures on the shelves / vendor
   group-by / recipe group-by pages are **pre-existing on `main`** and out of
   scope — leave them. Any other failure is a hard stop.
3. Documentation:
   - `apps/web/src/components/CLAUDE.md` — add `QuantityStepper` and
     `StockProgressRow` entries; update the `QuickUpdateDialog` entry to say it
     composes them.
   - `apps/web/src/routes/items/CLAUDE.md` — update the Stock-tab description
     for the new order, steppers and progress row.
   - `apps/web/src/i18n/CLAUDE.md` — add `ItemForm` to the migrated list.
   - `docs/INDEX.md` — update the items / quick-update-dialog rows.
   - This plan file — mark it done.

---

## Task 5: Share the progress-row derivation

*Added 2026-08-27 by controller ruling after Task 2's review — see the ledger.*

`ItemForm.tsx` and `QuickUpdateDialog.tsx` now compute the progress row's
display values with identical code: `current` (total, measurement-aware),
the display-packed value, `unitLabel`, `quantityLabel`, the status
(`isInactive` → `'inactive'`, else `getStockStatus`), and the
`isAtZero` / `isAtFull` disabled flags. Task 1 deliberately left these in the
callers to keep `StockProgressRow` presentational; the result is a duplicated
logic block in two files, which the repo's review rubric treats as a defect.

Extract them into **one pure function** in `apps/web/src/lib/quantityUtils.ts` —
no React, no hook — taking the stock configuration plus the four live values and
returning the derived display fields. Both callers use it; neither keeps a local
copy of any formula it returns.

Constraints:

- **Neither surface's rendered output may change.** `QuickUpdateDialog.test.tsx`,
  `QuickUpdateDialog.stories.test.tsx` and `ItemForm.test.tsx` must all pass
  unmodified. Editing an assertion means the extraction changed behaviour.
- `StockProgressRow` stays presentational — it does not call the new function.
- Unit-test the function directly in `quantityUtils.test.ts`, covering both
  `package` and `measurement` modes, the `unpacked > 0` label branch, the
  inactive status, and `isAtFull` against a measurement item with a conversion
  rate. Mutation-check each.
