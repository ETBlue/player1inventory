---
date: 2026-08-23
area: items
status: fixed
---

# Bug: Stock tab — first keystroke is swallowed and edits cannot be saved

## Bug Description

Reported symptom, on the item detail **Stock** tab (`/items/$id/stock`):

1. User enters the tab
2. User tries to change the number in an input field (Packed / Unpacked / Target Quantity /
   Refill When Below)

**Current result:** the input field loses focus and the change doesn't apply.
**Expected result:** the input field value changes.

Clarified by the reporter: *"on the first keystroke the input field loses focus and the value
doesn't change and the save button keeps disabled (as the form values doesn't change); but on
the second keystroke the form works normally. The problem only exists on the first keystroke."*
The reporter also noted the bug **predates PR #249**, from when the Stock tab was not yet split
out — which ruled out the first cause below as the whole story.

## Root Cause

Two independent defects, both live, stacking into the reported experience.

### Cause 1 (the primary complaint) — number inputs coerce through `Number()` on every keystroke

Every numeric field in `apps/web/src/components/item/ItemForm/ItemForm.tsx` is a controlled
input whose state is a **number**, updated with a lossy coercion:

```tsx
onChange={(e) => setPackedQuantity(Number(e.target.value))}                            // packed
onChange={(e) => setUnpackedQuantity(roundToStep(Number(e.target.value), consumeAmount || 1))}
onChange={(e) => setTargetQuantity(Number(e.target.value))}
onChange={(e) => setRefillThreshold(Number(e.target.value))}
onChange={(e) => setConsumeAmount(Number(e.target.value))}                             // Info tab
```

`Number('') === 0`. `packedQuantity`, `targetQuantity`, `refillThreshold` and (since
`6302ee97`) `consumeAmount` all routinely **start at `0`**, so when the user clicks into a field
showing `0` and presses Backspace to clear it before typing:

- `e.target.value` is `''` → `Number('')` is `0` → **state does not change**
- React's controlled-input reconciliation has an explicit `value === 0 && node.value === ''`
  branch that force-writes `"0"` back into the DOM node, **dropping the caret at the end** —
  which the user perceives as the field losing focus
- the form never goes dirty, so **Save stays disabled**
- the *second* keystroke (the actual digit) appends to `"0"` → `"05"` → `5`, and from then on
  everything behaves — exactly "only the first keystroke is broken"

Reproduced in jsdom before fixing:

```
R4: packed value before   = "0"
R4: after Backspace       = "0"      <- 1st keystroke: value unchanged
R4: save disabled?        = true     <- Save stays disabled
R4: after typing 5        = "5"      <- 2nd keystroke: works normally
R4: save disabled after 5 = false
```

The same mechanism destroys a partially-typed decimal: Chrome reports `value === ''` for an
intermediate `"2."` on `type="number"`. And because Unpacked runs `roundToStep` inside
`onChange`, typing `2.5` there yields `3` outright:

```
R5: unpacked before  = "0"
R5: after typing 2.5 = "3"
```

**Age:** the `value={<number>}` + `onChange={Number(e.target.value)}` pattern dates to
`38c11d87` (2026-02-14); the `roundToStep`-on-change to `17afa6e2` (2026-03-17). Both precede
the Stock tab split (`557534fa`, 2026-06-11) and PRs #248/#249 — matching the reporter's
recollection.

### Cause 2 — `hasFieldError` gates Save on fields the active `sections` never render

```ts
const consumeAmountError = consumeAmount <= 0 ? 'Must be greater than 0.' : undefined
const hasFieldError = !!(nameError || measurementUnitError || amountPerPackageError || consumeAmountError)
const isSubmitDisabled = hasFieldError || (onDirtyChange !== undefined && !isDirty) || !!isPending
```

All four validated fields render **only** inside the `showInfo` branch. The Stock tab mounts
`sections={['stock']}` (`routes/items/$id/stock.tsx:156`), so on that page the offending field
and its error text are not in the DOM at all — the user can neither see the error nor fix it.

Since `6302ee97` (PR #249) every newly created item carries `consumeAmount: 0`. That default and
the Info-tab validation are **deliberate** (a "new item still needs setting up" signal, pinned
by a test); the defect is that the gate leaked onto a tab that no longer renders the field,
after PR #248 moved `consumeAmount` to Info. Result for any new item: Save on the Stock tab is
permanently disabled with no explanation, and clicking the dead button **blurs the focused
input** (`document.activeElement` becomes `BODY`) while nothing persists.

Reproduced before fixing:

```
SEEDED consumeAmount = 0
VALUE AFTER TYPING   = 34    <- typing itself is fine
SAVE DISABLED        = true
B: activeElement after Save click = BODY          <- "loses focus"
B: persisted packedQuantity = 0 (expected 7)      <- "change doesn't apply"
C: consumeAmount=1 control -> SAVE DISABLED = false
```

A latent third case of the same shape: `nameError` has gated the Stock tab's Save since
`1d7bd064` (2026-06-11) for any item with a blank name.

### Ruled out

Investigated and eliminated as causes: unstable `key` props (`Outlet key={pathname}`,
`StockFormPanel key={viewed.id}` — both stable), components declared inside a render body (none),
unstable query keys, the `withLocationStock` / `itemToFormValues` identity churn feeding
`ItemForm`'s prop-sync effect (its `isDirtyRef` bail and deep value comparison shipped together
with the effect in 2026-02 and still hold), focus theft from `LocationPager`, and any
keystroke-triggered remount. Verified in jsdom that navigating Info → Stock and typing, with
one location and with three, retains focus and applies both characters.

## Fix Applied

Both in `apps/web/src/components/item/ItemForm/ItemForm.tsx`.

**Cause 1 — number inputs now hold the user's raw text while being edited.** A new
`numericDrafts` map plus a `numericInputProps(field, value, setValue, normalizeOnBlur?)` helper
supplies `value` / `onChange` / `onBlur` for the five number-typed fields (`packedQuantity`,
`unpackedQuantity`, `targetQuantity`, `refillThreshold`, `consumeAmount`):

- `onChange` keeps the raw text and moves the numeric state **only when that text parses**, so
  `''`, `'-'` and `'2.'` are representable and never collapse to `0`
- `onBlur` drops the draft, resolves an empty/unparsable field to `0`, and applies
  `normalizeOnBlur`
- a draft renders only while `draft.value === value`, so Pack/Unpack and the unit switch
  discard it automatically; the prop-sync effect clears the whole map so no in-progress text
  survives a form reset
- Unpacked's `roundToStep(…, consumeAmount || 1)` **moved from `onChange` to `onBlur`** — the
  rounding behaviour is unchanged, only deferred, so a decimal can be typed

`ItemFormValues`, the submit payload and the Pack/Unpack math are untouched — they still receive
real numbers. `amountPerPackage`, `estimatedDueDays` and `expirationThreshold` are typed
`string | number` and already stored raw text, so they never had the bug and were left alone.

**Cause 2 — `hasFieldError` is gated on the rendered sections.** `showStock` / `showInfo` moved
above the validation block, and:

```ts
const hasFieldError =
  showInfo && !!(nameError || measurementUnitError || amountPerPackageError || consumeAmountError)
```

A `sections={['stock']}` form renders none of those four fields, so its Save is now gated by
dirtiness and pending state alone. The Info tab keeps every validation, including the
deliberate `consumeAmount > 0` "new item needs setting up" signal.

`apps/web/src/routes/items/CLAUDE.md` gained a "raw text while editing" subsection under
**Manual Quantity Input** recording the blur-settles semantics and the numeric-payload guarantee.

## Test Added

`apps/web/src/components/item/ItemForm/ItemForm.test.tsx`
- `ItemForm — number inputs keep the raw text while being edited` (5): clear a field showing 0;
  a decimal finer than the consume step is not rounded mid-typing; `2.5` survives while focused
  and snaps on blur; an empty field resolves to numeric `0` in the payload; an `initialValues`
  swap leaves no stale draft
- `ItemForm — stock-only sections ignore info-only validation` (1): a stock-only form with
  `consumeAmount: 0` **and** a blank name renders neither error, stays submittable, and fires
  `onSubmit`

`apps/web/src/routes/items/$id/stock.test.tsx`
- `user can save stock for a brand-new item whose consume amount is still unset` — fixture is
  `createItem({ name: 'Milk', tagIds: [] })` with **no** `consumeAmount`, and asserts the seeded
  value is `0` up front so it cannot drift back to the vacuous `consumeAmount: 1` shape every
  other save test in the file uses
- `user can retype every stock number from scratch and have them all persist` — a submit-shape
  guard

**Mutation checks.** Reverting the `hasFieldError` gate turned both of its tests RED
(`expect(saveButton).not.toBeDisabled()` against a rendered `disabled=""`); restoring returned
51/51. Reverting the five input wirings to the lossy handlers turned all 5 raw-text tests RED
(`expected '0' to be ''`, `expected '0.3' to be '0.25'`, `expected '3' to be '2.5'`, …);
restoring returned 32/32.

**One test was found vacuous and re-labelled rather than left to look like coverage.** The stock
round-trip test stayed GREEN under the lossy-handler revert: `userEvent` keeps its own value
buffer independent of React's DOM write-back, so **jsdom cannot reproduce the caret jump at
all**. A second mutation (`setValue(raw)` / `setValue(String(settled))`) did turn it red
(`expected '7' to be 7`), so it is a genuine *submit-shape* guard and its comment now says so.
The focus behaviour itself is pinned in `ItemForm.test.tsx`, not there.

## Verification

`pnpm lint`, root `pnpm build` (codegen + web + server `tsc`), `pnpm build-storybook`,
`pnpm check`, no `TS6385`, and `pnpm test --run` (206 files / 1724 tests) all pass.
`pnpm test:server` fails exactly the 3 documented baseline tests (`purge.resolver` ×2,
`import.resolver` ×1) — this branch touches no `apps/server` file. E2E
(`item-management`, `item-stock-pager`, `item-logs`, `settings-global-pages`, `a11y`):
**92 passed, 4 failed**, those four being the documented a11y colour-contrast baseline on
shelves / vendor group-by / recipe group-by / mobile shelves — pages that render no `ItemForm`.

## PR / Commit

2fe372a1 — fix(items): stop the Stock tab swallowing the first keystroke
