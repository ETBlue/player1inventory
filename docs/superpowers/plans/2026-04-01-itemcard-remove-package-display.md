# Remove `isPackageDisplay` from ItemCard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `isPackageDisplay` prop and all logic it drives from `ItemCard`, unifying quantity display across all pages.

**Architecture:** `isPackageDisplay` was only ever set to `true` in the shopping page. `ItemProgressBar` already converts measurement→package units internally via `amountPerPackage`, so the segmented bar gives users the "how many packages" signal without any prop. The removal simplifies `ItemCard` to a single quantity-display path used by all pages.

**Tech Stack:** React 19, TypeScript (strict), Vitest, Storybook

**Worktree:** `.worktrees/refactor-itemcard-package-display` (branch `refactor/itemcard-remove-package-display`)

---

## Files Modified

| File | Change |
|---|---|
| `apps/web/src/components/item/ItemCard/index.tsx` | Remove prop, interface entry, and all induced dead code |
| `apps/web/src/routes/shopping.tsx` | Remove `isPackageDisplay={true}` |
| `apps/web/src/components/item/ItemCard/ItemCard.shopping.stories.tsx` | Remove 3 `PackageDisplay*` stories |
| `apps/web/src/components/item/ItemCard/ItemCard.shopping.stories.test.tsx` | Remove 3 corresponding smoke tests |

---

## Task 1: Remove `isPackageDisplay` from ItemCard

**Files:**
- Modify: `apps/web/src/components/item/ItemCard/index.tsx`

This task removes the prop from the interface and destructuring, deletes the three variables that only existed for it (`targetInPackages`, `packageProgressCurrent`, `packageProgressTarget`), and simplifies the two places that branched on it (the `unitLabel` expression and the header quantity span). The `ItemProgressBar` call is updated to use `currentQuantity` and `item.targetQuantity` directly.

- [ ] **Step 1: Remove `isPackageDisplay` from the props interface**

In `apps/web/src/components/item/ItemCard/index.tsx`, delete line 49:

```ts
// DELETE this line:
isPackageDisplay?: boolean
```

- [ ] **Step 2: Remove `isPackageDisplay` from destructuring**

Delete line 75:

```ts
// DELETE this line:
isPackageDisplay = false,
```

- [ ] **Step 3: Remove the package-display variable block**

Delete lines 96–110 (the comment + three variables):

```ts
// DELETE this entire block:
// Package-display values (used when isPackageDisplay=true)
const targetInPackages =
  isPackageDisplay &&
  item.targetUnit === 'measurement' &&
  item.amountPerPackage
    ? Math.ceil(item.targetQuantity / item.amountPerPackage)
    : item.targetQuantity

const packageProgressCurrent = isPackageDisplay
  ? getPackedTotal(item)
  : currentQuantity

const packageProgressTarget = isPackageDisplay
  ? targetInPackages
  : item.targetQuantity
```

- [ ] **Step 4: Simplify `unitLabel`**

Replace lines 112–117:

```ts
// BEFORE:
const unitLabel =
  !isPackageDisplay &&
  item.targetUnit === 'measurement' &&
  item.measurementUnit
    ? item.measurementUnit
    : (item.packageUnit ?? DEFAULT_PACKAGE_UNIT)

// AFTER:
const unitLabel =
  item.targetUnit === 'measurement' && item.measurementUnit
    ? item.measurementUnit
    : (item.packageUnit ?? DEFAULT_PACKAGE_UNIT)
```

- [ ] **Step 5: Simplify the header quantity span**

Replace lines 201–207 (the `{isPackageDisplay ? ... : ...}` expression inside the quantity `<span>`):

```tsx
// BEFORE:
{isPackageDisplay
  ? item.unpackedQuantity > 0
    ? `${item.packedQuantity} (+${item.unpackedQuantity}${item.measurementUnit ?? ''})/${targetInPackages}`
    : `${item.packedQuantity}/${targetInPackages}`
  : item.unpackedQuantity > 0
    ? `${displayPacked} (+${item.unpackedQuantity})/${item.targetQuantity}`
    : `${currentQuantity}/${item.targetQuantity}`}

// AFTER:
{item.unpackedQuantity > 0
  ? `${displayPacked} (+${item.unpackedQuantity})/${item.targetQuantity}`
  : `${currentQuantity}/${item.targetQuantity}`}
```

- [ ] **Step 6: Update `ItemProgressBar` props**

Replace lines 213–226 (`current` and `target` props only — everything else stays the same):

```tsx
// BEFORE:
<ItemProgressBar
  current={packageProgressCurrent}
  target={packageProgressTarget}
  status={progressStatus}
  targetUnit={item.targetUnit}
  packed={displayPacked}
  unpacked={item.unpackedQuantity}
  {...(item.measurementUnit
    ? { measurementUnit: item.measurementUnit }
    : {})}
  {...(item.amountPerPackage
    ? { amountPerPackage: item.amountPerPackage }
    : {})}
/>

// AFTER:
<ItemProgressBar
  current={currentQuantity}
  target={item.targetQuantity}
  status={progressStatus}
  targetUnit={item.targetUnit}
  packed={displayPacked}
  unpacked={item.unpackedQuantity}
  {...(item.measurementUnit
    ? { measurementUnit: item.measurementUnit }
    : {})}
  {...(item.amountPerPackage
    ? { amountPerPackage: item.amountPerPackage }
    : {})}
/>
```

- [ ] **Step 7: Verify `getPackedTotal` import is now unused**

Run:
```bash
grep -n "getPackedTotal" apps/web/src/components/item/ItemCard/index.tsx
```

If the grep returns no output, `getPackedTotal` is now unused. Remove it from the import on line 11:

```ts
// BEFORE:
import {
  getCurrentQuantity,
  getPackedTotal,
  getStockStatus,
  isInactive,
} from '@/lib/quantityUtils'

// AFTER:
import {
  getCurrentQuantity,
  getStockStatus,
  isInactive,
} from '@/lib/quantityUtils'
```

If `getPackedTotal` still appears somewhere in the file, leave the import alone.

- [ ] **Step 8: Verify TypeScript catches remaining usages**

Run:
```bash
(cd apps/web && pnpm build) 2>&1 | grep "isPackageDisplay"
```

Expected output: lines reporting errors in `shopping.tsx` and `ItemCard.shopping.stories.tsx` (because they still pass `isPackageDisplay={true}` / `isPackageDisplay: true`, which is now an unknown prop). This confirms the prop is gone from the interface and all remaining usages will be cleaned up in Task 2.

If the output is empty (no errors about `isPackageDisplay`), TypeScript may be treating the extra prop as a passthrough — in that case, manually verify that `isPackageDisplay` does not appear anywhere in `index.tsx`:

```bash
grep "isPackageDisplay" apps/web/src/components/item/ItemCard/index.tsx
```

Expected: no output.

---

## Task 2: Remove All Remaining Usages

**Files:**
- Modify: `apps/web/src/routes/shopping.tsx`
- Modify: `apps/web/src/components/item/ItemCard/ItemCard.shopping.stories.tsx`
- Modify: `apps/web/src/components/item/ItemCard/ItemCard.shopping.stories.test.tsx`

- [ ] **Step 1: Remove `isPackageDisplay={true}` from shopping.tsx**

In `apps/web/src/routes/shopping.tsx`, delete line 212:

```tsx
// DELETE this line:
isPackageDisplay={true}
```

The surrounding `ItemCard` call should now look like:

```tsx
<ItemCard
  item={item}
  tags={itemTags}
  tagTypes={tagTypes}
  mode="shopping"
  showTags={false}
  showExpiration={false}
  showTagSummary={false}
  isChecked={!!ci}
  {...(ci ? { controlAmount: ci.quantity } : {})}
  onCheckboxToggle={() => handleToggleCart(item)}
  onAmountChange={(delta) => {
    const newQty = (ci?.quantity ?? 0) + delta
    handleUpdateCartQuantity(item, newQty)
  }}
/>
```

- [ ] **Step 2: Remove the three `PackageDisplay*` stories**

Replace the entire content of `apps/web/src/components/item/ItemCard/ItemCard.shopping.stories.tsx` with:

```tsx
// src/components/ItemCard.shopping.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ItemCard } from '.'
import {
  mockItem,
  mockTags,
  mockTagTypes,
  sharedDecorator,
} from './ItemCard.stories.fixtures'

const meta: Meta<typeof ItemCard> = {
  title: 'Components/Item/ItemCard/Shopping',
  component: ItemCard,
  decorators: [sharedDecorator],
}

export default meta
type Story = StoryObj<typeof ItemCard>

export const NotInCart: Story = {
  name: 'Not in cart',
  args: {
    item: { ...mockItem, packedQuantity: 1, unpackedQuantity: 0 },
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'shopping',
    showTags: false,
    showExpiration: false,
    showTagSummary: false,
    isChecked: false,
    onCheckboxToggle: () => console.log('Toggle cart'),
  },
}

export const InCart: Story = {
  name: 'In cart (with amount controls)',
  args: {
    item: { ...mockItem, packedQuantity: 1, unpackedQuantity: 0 },
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'shopping',
    showTags: false,
    showExpiration: false,
    showTagSummary: false,
    isChecked: true,
    controlAmount: 3,
    onCheckboxToggle: () => console.log('Toggle cart'),
    onAmountChange: (delta) => console.log('Amount change:', delta),
  },
}
```

Note: `mockDualUnitItem` is removed from the import because it was only used by the deleted stories. Leave `mockItem`, `mockTags`, `mockTagTypes`, and `sharedDecorator` — they are still used.

- [ ] **Step 3: Remove the three corresponding smoke tests**

Replace the entire content of `apps/web/src/components/item/ItemCard/ItemCard.shopping.stories.test.tsx` with:

```tsx
import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemCard.shopping.stories'

const { NotInCart, InCart } = composeStories(stories)

describe('ItemCard shopping stories smoke tests', () => {
  it('NotInCart renders without error', async () => {
    render(<NotInCart />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('InCart renders without error', async () => {
    render(<InCart />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })
})
```

- [ ] **Step 4: Confirm no remaining usages**

```bash
grep -rn "isPackageDisplay" apps/web/src/
```

Expected: no output. If any remain, remove them.

- [ ] **Step 5: Run tests to confirm the 2 smoke tests pass**

```bash
(cd apps/web && pnpm test -- --reporter=verbose 2>&1 | grep -A2 "shopping stories")
```

Expected output includes:
```
✓ NotInCart renders without error
✓ InCart renders without error
```

- [ ] **Step 6: Commit**

```bash
git add \
  apps/web/src/components/item/ItemCard/index.tsx \
  apps/web/src/routes/shopping.tsx \
  apps/web/src/components/item/ItemCard/ItemCard.shopping.stories.tsx \
  apps/web/src/components/item/ItemCard/ItemCard.shopping.stories.test.tsx
git commit -m "refactor(items): remove isPackageDisplay from ItemCard

Shopping page now renders the same count/unit/progress bar as all
other pages. The segmented progress bar already communicates package
count visually via amountPerPackage, making the prop redundant."
```

---

## Task 3: Verification Gate

- [ ] **Step 1: Lint**

```bash
(cd apps/web && pnpm lint)
```

Expected: no errors.

- [ ] **Step 2: Build**

```bash
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
```

Expected: exits 0.

- [ ] **Step 3: Check for deprecated imports**

```bash
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

Expected: `OK: no deprecated imports`

- [ ] **Step 4: Storybook build**

```bash
(cd apps/web && pnpm build-storybook)
```

Expected: exits 0.

- [ ] **Step 5: Biome check**

```bash
(cd apps/web && pnpm check)
```

Expected: no errors.
