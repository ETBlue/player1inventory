# Shopping Page: Package Unit Display Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** In shopping mode, always show quantities in package units and always treat cart quantity as packages purchased.

**Architecture:** Add `isPackageDisplay?: boolean` prop to `ItemCard`. When true, quantity display uses package units regardless of `item.targetUnit`. The shopping page passes `isPackageDisplay={true}` to all ItemCards. Note: checkout already adds cart quantity to `packedQuantity` — no checkout changes needed.

**Tech Stack:** React 19, TypeScript, Vitest, Storybook

---

### Task 1: Add `isPackageDisplay` prop to ItemCard

**Files:**
- Modify: `src/components/ItemCard.tsx:19-47` (props interface)
- Modify: `src/components/ItemCard.tsx:84-88` (display value computation)
- Modify: `src/components/ItemCard.tsx:163-168` (unit label)
- Modify: `src/components/ItemCard.tsx:171-175` (quantity text)
- Modify: `src/components/ItemCard.tsx:177-180` (progress bar)

**Step 1: Add prop to interface and destructuring**

In `ItemCard.tsx`, add `isPackageDisplay?: boolean` to `ItemCardProps` (after `showTagSummary?` at line 46):

```tsx
showTagSummary?: boolean
isPackageDisplay?: boolean
```

Add to the destructuring params (after `showTagSummary = true,`):

```tsx
showTagSummary = true,
isPackageDisplay = false,
```

**Step 2: Add package-display computed values (after line 88)**

After the existing `displayPacked` computation (lines 84–88), add:

```tsx
// Package-display values (used when isPackageDisplay=true)
const targetInPackages =
  isPackageDisplay &&
  item.targetUnit === 'measurement' &&
  item.amountPerPackage
    ? Math.ceil(item.targetQuantity / item.amountPerPackage)
    : item.targetQuantity

const packageProgressCurrent = isPackageDisplay
  ? item.packedQuantity +
    item.unpackedQuantity / (item.amountPerPackage ?? 1)
  : currentQuantity

const packageProgressTarget = isPackageDisplay
  ? targetInPackages
  : item.targetQuantity
```

**Step 3: Update unit label (lines 163–168)**

Replace:
```tsx
{item.targetUnit === 'measurement' && item.measurementUnit
  ? item.measurementUnit
  : (item.packageUnit ?? DEFAULT_PACKAGE_UNIT)}
```

With:
```tsx
{!isPackageDisplay &&
item.targetUnit === 'measurement' &&
item.measurementUnit
  ? item.measurementUnit
  : (item.packageUnit ?? DEFAULT_PACKAGE_UNIT)}
```

**Step 4: Update quantity text display (lines 171–175)**

Replace:
```tsx
{item.unpackedQuantity > 0
  ? `${displayPacked} (+${item.unpackedQuantity})/${item.targetQuantity}`
  : `${currentQuantity}/${item.targetQuantity}`}
```

With:
```tsx
{isPackageDisplay
  ? item.unpackedQuantity > 0
    ? `${item.packedQuantity} (+${item.unpackedQuantity}${item.measurementUnit ?? ''})/${targetInPackages}`
    : `${item.packedQuantity}/${targetInPackages}`
  : item.unpackedQuantity > 0
    ? `${displayPacked} (+${item.unpackedQuantity})/${item.targetQuantity}`
    : `${currentQuantity}/${item.targetQuantity}`}
```

**Step 5: Update progress bar props (lines 177–180)**

Replace:
```tsx
<ItemProgressBar
  current={currentQuantity}
  target={item.targetQuantity}
```

With:
```tsx
<ItemProgressBar
  current={packageProgressCurrent}
  target={packageProgressTarget}
```

**Step 6: Run tests to verify nothing breaks**

```bash
pnpm test src/components/ItemCard.test.tsx
```

Expected: all existing tests pass.

**Step 7: Commit**

```bash
git add src/components/ItemCard.tsx
git commit -m "feat(item-card): add isPackageDisplay prop for package-unit display mode"
```

---

### Task 2: Pass `isPackageDisplay` on the shopping page

**Files:**
- Modify: `src/routes/shopping.tsx:176-191` (ItemCard render)

**Step 1: Add `isPackageDisplay={true}` to ItemCard**

In `renderItemCard()` (around line 176), add `isPackageDisplay={true}` to the `<ItemCard>` props:

```tsx
<ItemCard
  item={item}
  tags={itemTags}
  tagTypes={tagTypes}
  mode="shopping"
  showTags={false}
  showExpiration={false}
  showTagSummary={false}
  isPackageDisplay={true}
  isChecked={!!ci}
  ...
```

**Step 2: Verify dev server renders correctly**

Run `pnpm dev` and open `/shopping`. For a dual-unit item (e.g. one tracking in measurement), verify:
- Unit label shows package unit (not measurement unit)
- Quantity shows `{packed}/{targetInPackages}` or `{packed} (+{unpacked}{unit})/{targetInPackages}`

**Step 3: Commit**

```bash
git add src/routes/shopping.tsx
git commit -m "feat(shopping): show quantities in package units for all items"
```

---

### Task 3: Add Storybook stories for `isPackageDisplay`

**Files:**
- Modify: `src/components/ItemCard.shopping.stories.tsx`

**Step 1: Add dual-unit story with `isPackageDisplay={true}` (no unpacked)**

The fixtures file (`src/components/ItemCard.stories.fixtures.tsx`) already exports `mockDualUnitItem` — a measurement-tracked item: 1 bottle + 0.7L unpacked, 2L target, 1L/bottle.

Add to `ItemCard.shopping.stories.tsx`:

```tsx
export const PackageDisplayDualUnit: Story = {
  name: 'Package display — dual-unit (no unpacked)',
  args: {
    item: {
      ...mockDualUnitItem,
      packedQuantity: 1,
      unpackedQuantity: 0,
    },
    tags: [],
    tagTypes: mockTagTypes,
    mode: 'shopping',
    showTags: false,
    showExpiration: false,
    showTagSummary: false,
    isPackageDisplay: true,
    isChecked: false,
    onCheckboxToggle: () => console.log('Toggle cart'),
  },
}

export const PackageDisplayDualUnitWithUnpacked: Story = {
  name: 'Package display — dual-unit (with unpacked)',
  args: {
    item: {
      ...mockDualUnitItem,
      packedQuantity: 1,
      unpackedQuantity: 0.7,
    },
    tags: [],
    tagTypes: mockTagTypes,
    mode: 'shopping',
    showTags: false,
    showExpiration: false,
    showTagSummary: false,
    isPackageDisplay: true,
    isChecked: true,
    controlAmount: 2,
    onCheckboxToggle: () => console.log('Toggle cart'),
    onAmountChange: (delta) => console.log('Amount change:', delta),
  },
}

export const PackageDisplaySingleUnit: Story = {
  name: 'Package display — single-unit',
  args: {
    item: { ...mockItem, packedQuantity: 1, unpackedQuantity: 0 },
    tags: [],
    tagTypes: mockTagTypes,
    mode: 'shopping',
    showTags: false,
    showExpiration: false,
    showTagSummary: false,
    isPackageDisplay: true,
    isChecked: false,
    onCheckboxToggle: () => console.log('Toggle cart'),
  },
}
```

**Step 2: Verify in Storybook**

```bash
pnpm storybook
```

Open `Components/ItemCard/Shopping` and check the three new stories:
- `PackageDisplayDualUnit`: shows `1/2 (bottle)`, not `1L/2L`
- `PackageDisplayDualUnitWithUnpacked`: shows `1 (+0.7L)/2 (bottle)`
- `PackageDisplaySingleUnit`: shows `1/2 (gallon)`

**Step 3: Commit**

```bash
git add src/components/ItemCard.shopping.stories.tsx
git commit -m "feat(storybook): add isPackageDisplay stories for ItemCard shopping mode"
```

---

### Task 4: Add shopping page tests for package display

**Files:**
- Modify: `src/routes/shopping.test.tsx`

**Step 1: Add a `makeDualUnitItem` helper**

Near the existing `makeItem` helper (around line 52), add:

```ts
const makeDualUnitItem = (name: string, packedQuantity = 0, unpackedQuantity = 0) =>
  createItem({
    name,
    targetUnit: 'measurement',
    measurementUnit: 'g',
    packageUnit: 'bag',
    amountPerPackage: 500,
    targetQuantity: 2000,
    refillThreshold: 500,
    packedQuantity,
    unpackedQuantity,
    consumeAmount: 100,
    tagIds: [],
  })
```

**Step 2: Write the failing test**

Add this test inside the `describe('Shopping page', ...)` block:

```ts
it('user can see dual-unit item quantity in package units', async () => {
  // Given a dual-unit item tracking in measurement (3 packs, 250g unpacked, 4-pack target)
  await makeDualUnitItem('Flour', 3, 250)

  // When the shopping page renders
  renderShoppingPage()

  // Then the quantity display shows packages, not grams
  // Target: 2000g / 500g per pack = 4 packs
  await waitFor(() => {
    expect(screen.getByText(/3 \(\+250g\)\/4/)).toBeInTheDocument()
  })

  // And the unit label shows the package unit (bag), not measurement unit (g)
  expect(screen.getByText('(bag)')).toBeInTheDocument()
})
```

**Step 3: Run to verify it fails**

```bash
pnpm test src/routes/shopping.test.tsx --reporter=verbose
```

Expected: FAIL — the text `3 (+250g)/4` is not found (currently shows measurement units like `1750g/2000g`).

**Step 4: Run tests after Task 2 is complete to verify they pass**

After Task 2 is done:

```bash
pnpm test src/routes/shopping.test.tsx --reporter=verbose
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add src/routes/shopping.test.tsx
git commit -m "test(shopping): verify dual-unit items display in package units"
```

---

### Task 5: Final verification

**Step 1: Run all tests**

```bash
pnpm test
```

Expected: all tests pass with no failures.

**Step 2: Run lint**

```bash
pnpm lint
```

Expected: no lint errors.

**Step 3: Verify Storybook**

```bash
pnpm storybook
```

Spot-check the three new shopping stories under `Components/ItemCard/Shopping`.
