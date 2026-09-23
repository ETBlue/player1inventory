# Refill Threshold Marker — Implementation Plan

> **For agentic workers:** use `superpowers:subagent-driven-development` to run this
> plan task by task. Follow TDD. Run the Verification Gate in the root `CLAUDE.md`
> after each task.

**Goal:** Show the refill threshold as a tick on the item progress bar, on every
surface that shows an item's bar.

**Design:** [design doc](2026-09-23-refill-threshold-marker-design.md)

**Architecture:** `ItemProgressBar` gets an optional `refillThreshold` prop, in the
same unit as `target`. It draws an `aria-hidden` tick plus screen-reader-only text.
`StockProgressRow` forwards the prop. `ItemCard`, `QuickUpdateDialog` and `ItemForm`
pass the item's threshold. `GroupCard` passes nothing.

**Tech stack:** React 19, Tailwind v4, Vitest + React Testing Library, Storybook,
react-i18next.

---

## File map

| File | Change |
|---|---|
| `apps/web/src/components/item/ItemProgressBar/ItemProgressBar.tsx` | New prop, tick, sr-only text, position helper |
| `apps/web/src/components/item/ItemProgressBar/ItemProgressBar.test.tsx` | Tick tests |
| `apps/web/src/components/item/ItemProgressBar/ItemProgressBar.stories.tsx` (+ `.stories.test.tsx`) | New stories + smoke tests |
| `apps/web/src/i18n/locales/en.json`, `tw.json` | `common.refillAt` |
| `apps/web/src/components/item/StockProgressRow/StockProgressRow.tsx` (+ test, stories) | Forward prop |
| `apps/web/src/components/item/ItemCard/ItemCard.tsx` (+ test) | Pass `item.refillThreshold` |
| `apps/web/src/components/item/QuickUpdateDialog/QuickUpdateDialog.tsx` (+ test) | Pass `localRefill` |
| `apps/web/src/components/item/ItemForm/ItemForm.tsx` (+ test) | Pass `refillThreshold` state |
| `apps/web/src/components/CLAUDE.md` | Document the prop |
| `docs/INDEX.md` | Status row |

---

## Task 1: Tick in `ItemProgressBar`

### Position rules

Let `n` be the bar target *after* scaling (the value the bar already computes:
`packageTarget` for segmented, `target` for continuous). Let `x` be the threshold
after the same scaling (`refillThreshold / scale`). Clamp: `x = min(x, n)`.

- **No tick** when `refillThreshold` is `undefined`, `<= 0`, or `target === 0`
  (the early-return branch for inactive items must not render it).
- **Continuous bar:** `left = (x / n) * 100%`.
- **Segmented bar:** segments are `flex-1` with `gap-0.5` (2px). A segment has
  width `s = (W - (n-1)·2px) / n`. For `k = floor(x)` and `f = x - k`:
  - `x` is a whole number and `0 < x < n`: centre of the gap after segment `x`,
    `left = calc(x * (100% + 2px) / n - 1px)`.
  - otherwise (fractional): inside segment `k`,
    `left = calc(x * (100% - (n-1)*2px) / n + k * 2px)`.
  - `x === n`: right edge.
- Put the pure math in an exported helper, for example
  `getRefillMarkerLeft({ threshold, target, segmented })`, returning the CSS
  `left` string. Unit-test the helper directly; that is easier than reading
  computed layout, which jsdom does not do.
- Implementer: check the formulas above against the real flex layout in Storybook
  before trusting them. If a formula is wrong, fix it and say so in the report.

### Markup

- Wrap the bar in `relative`. The tick is an absolutely positioned element:
  `data-testid="refill-marker"`, `data-threshold={x}`, `aria-hidden="true"`,
  about `w-0.5 h-3`, vertically centred on the 8px bar (`-top-0.5`),
  `-translate-x-1/2`, class `bg-foreground-default`, `pointer-events-none`.
  At the right edge, keep the tick inside the bar (do not overflow the card).
- Screen-reader text: `<span className="sr-only">{t('common.refillAt', { value: refillThreshold })}</span>`.
  Show the **unscaled** threshold here (the value the user typed).
- Add `common.refillAt` to `en.json` ("Refill at {{value}}") and `tw.json`
  ("低於 {{value}} 時補貨" or match the existing TW wording for "Refill When Below"
  — look it up in `tw.json`). `locales.test.ts` checks key parity.

### Steps (TDD)

1. Write failing tests in `ItemProgressBar.test.tsx`:
   - segmented, `target=5`, `refillThreshold=2`: one `refill-marker`, `data-threshold="2"`
   - continuous, `target=40`, `refillThreshold=10`: marker `left` is `25%`
   - measurement with `amountPerPackage=500`, `target=2000`, `refillThreshold=750`:
     `data-threshold="1.5"` (scaled), sr-only text says `Refill at 750`
   - `refillThreshold=0` → no marker; prop missing → no marker; `target=0` → no marker
   - `refillThreshold=9`, `target=5` → `data-threshold="5"` (clamped)
   - helper tests for each branch of `getRefillMarkerLeft`
   - Fixture rule: use thresholds that differ from `current`, `target` and each
     other, so a test cannot pass by reading the wrong number.
2. Run them; confirm red.
3. Implement.
4. Run them; confirm green.
5. **Mutation checks** (report each and that it went red): remove the `<= 0`
   guard; remove the clamp; skip the `/ scale`; render the marker in the
   `target === 0` branch.
6. Stories: `WithRefillThreshold` (segmented), `WithRefillThresholdContinuous`,
   `RefillThresholdAtTarget`, `RefillThresholdFractional`. Add smoke tests that
   assert the sr-only text (`getByText('Refill at 2')`). Fixtures stay
   module-local (no `export`).
7. Commit: `feat(items): show refill threshold tick on ItemProgressBar`.

---

## Task 2: Pass the threshold from every item surface

1. `StockProgressRow`: add `refillThreshold?: number`, forward it with the same
   conditional-spread style as `measurementUnit`. Test that it reaches the bar.
2. `ItemCard`: pass `refillThreshold={item.refillThreshold}` to `ItemProgressBar`.
   Test: a card with `refillThreshold` different from current and target renders
   the marker with the right `data-threshold`. Location note: `item` here is the
   joined per-location row, so the threshold is already the active location's.
3. `QuickUpdateDialog`: pass `localRefill`. Test that editing the "Refill When
   Below" stepper moves the marker (`data-threshold` changes). This proves the
   live value is passed, not `item.refillThreshold`.
4. `ItemForm` Stock tab: pass the `refillThreshold` form state. Same live-edit test.
5. `GroupCard`: no change. Add one negative-control test that a group bar has no
   marker (name it as a negative control; it is not coverage).
6. Mutation checks: for each of the four callers, drop the prop and confirm its
   test goes red. For 3 and 4, pass the saved `item.refillThreshold` instead of
   the live state and confirm the live-edit test goes red.
7. Update stories if any existing story should show the tick (e.g. an `ItemCard`
   warning/error story).
8. Commit: `feat(items): pass refill threshold to progress bars`.

---

## Task 3: Docs

1. `apps/web/src/components/CLAUDE.md`: document `refillThreshold` on
   `ItemProgressBar` and `StockProgressRow`.
2. `docs/INDEX.md`: add to the `items` row: "refill threshold tick on the item
   progress bar ✅ — [design](features/items/2026-09-23-refill-threshold-marker-design.md)".
3. If the implementation changed a formula or a decision, update the design doc.
4. Commit: `docs(items): document refill threshold marker`.

---

## Final phase

- Full Verification Gate (root `CLAUDE.md`).
- Full `pnpm test:e2e` with no `--grep`. Some E2E specs may count elements inside
  the bar; a new sr-only text could change a text match (`getByText('Refill …')`
  collisions with the "Refill When Below" label in the dialog / Stock tab). Check
  for this first if something fails.
