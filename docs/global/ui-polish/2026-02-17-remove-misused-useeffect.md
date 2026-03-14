# Remove Misused `useEffect` Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove 6 `useEffect` calls that react to app-internal state changes, replacing them with event handlers, mutation callbacks, and inline computation.

**Architecture:** Each `useEffect` is replaced with the most direct alternative at the call site: event handlers for user-triggered state changes, `onSuccess` callbacks for mutation outcomes, and path-based logic for parent-child routing concerns. No new abstractions are introduced.

**Tech Stack:** React 19, TanStack Router, TanStack Query, Vitest + React Testing Library

---

### Task 1: Create branch and worktree

**Step 1: Create worktree**

```bash
git worktree add .worktrees/refactor-remove-useeffect -b refactor/remove-misused-useeffect
cd .worktrees/refactor-remove-useeffect
```

**Step 2: Verify clean state**

```bash
pnpm test
```

Expected: all tests pass before any changes.

---

### Task 2: Delete always-false `registerDirtyState` useEffects + make parent path-aware

**Files:**
- Modify: `src/routes/items/$id/tags.tsx`
- Modify: `src/routes/items/$id.log.tsx`
- Modify: `src/routes/items/$id.tsx`

**Context:** Tags and log tabs call `registerDirtyState(false)` on mount to signal "I am never dirty." Instead, the parent will check whether the current path is the stock tab and only apply the guard there.

**Step 1: Edit `src/routes/items/$id/tags.tsx`**

Remove these lines:
```ts
// Tags tab never has unsaved changes (saves immediately)
useEffect(() => {
  registerDirtyState(false)
}, [registerDirtyState])
```

Remove `registerDirtyState` from the `useItemLayout()` destructure:
```ts
// Before
const { registerDirtyState } = useItemLayout()

// After — delete this line entirely (useItemLayout is no longer used in this file)
```

Remove `useItemLayout` import and `useEffect` import. The imports line:
```ts
// Before
import { useEffect, useState } from 'react'
// ...
import { useItemLayout } from '@/hooks/useItemLayout'

// After
import { useState } from 'react'
// (remove the useItemLayout import line)
```

**Step 2: Edit `src/routes/items/$id.log.tsx`**

Remove these lines:
```ts
const { registerDirtyState } = useItemLayout()

// Logs tab never has unsaved changes
useEffect(() => {
  registerDirtyState(false)
}, [registerDirtyState])
```

Remove `useEffect` from the React import and remove the `useItemLayout` import:
```ts
// Before
import { useEffect } from 'react'
import { useItemLayout } from '@/hooks/useItemLayout'

// After — remove both import lines entirely
```

**Step 3: Edit `src/routes/items/$id.tsx` — add path-aware guard**

The `handleTabClick` function currently fires the guard whenever `isDirty` is true, regardless of which tab is active. Add a check so the guard only fires when the user is on the stock tab.

Find the `handleTabClick` function (around line 42) and add `isOnStockTab`:

```ts
// Add after the existing hook calls (useNavigate, useRouter, etc.)
const isOnStockTab = router.state.location.pathname === `/items/${id}`

// Modify handleTabClick:
const handleTabClick = (
  e: React.MouseEvent<HTMLAnchorElement>,
  path: string,
) => {
  if (isOnStockTab && isDirty && router.state.location.pathname !== path) {
    e.preventDefault()
    setPendingNavigation(path)
    setShowDiscardDialog(true)
  }
}
```

**Step 4: Run tests**

```bash
pnpm test
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add src/routes/items/$id/tags.tsx src/routes/items/$id.log.tsx src/routes/items/$id.tsx
git commit -m "refactor(item-layout): delete always-false registerDirtyState useEffects, make parent path-aware"
```

---

### Task 3: Replace form-reset `useEffect` with `onSuccess` callback

**Files:**
- Modify: `src/routes/items/$id/index.tsx`

**Context:** Lines 86–133 use a `prevSuccessRef` + `useEffect` to detect when `updateItem.isSuccess` flips from false to true and reset the form. TanStack Query's `mutate` accepts an `onSuccess` callback that fires at exactly that moment.

**Step 1: Verify the existing test passes (baseline)**

```bash
pnpm test --reporter=verbose 2>&1 | grep "save button becomes disabled after successful save"
```

Expected: `✓ save button becomes disabled after successful save`

**Step 2: Delete `prevSuccessRef` and the form-reset `useEffect`**

Remove lines 86–133 in `src/routes/items/$id/index.tsx`:

```ts
// DELETE these lines:

// Track previous success state to detect when a save completes
const prevSuccessRef = useRef(updateItem.isSuccess)

// Reset form state after successful save (only once per save)
useEffect(() => {
  if (!item) return

  // Only reset when a save just completed (success changed from false to true)
  const justSaved = updateItem.isSuccess && !prevSuccessRef.current
  prevSuccessRef.current = updateItem.isSuccess

  if (!justSaved) return

  const newValues = {
    packedQuantity: item.packedQuantity,
    unpackedQuantity: item.unpackedQuantity,
    expirationMode: item.estimatedDueDays
      ? ('days' as const)
      : ('date' as const),
    dueDate: item.dueDate ? item.dueDate.toISOString().split('T')[0] : '',
    estimatedDueDays: item.estimatedDueDays ?? '',
    name: item.name,
    packageUnit: item.packageUnit ?? '',
    measurementUnit: item.measurementUnit ?? '',
    amountPerPackage: item.amountPerPackage ?? '',
    targetUnit: item.targetUnit,
    targetQuantity: item.targetQuantity,
    refillThreshold: item.refillThreshold,
    consumeAmount: item.consumeAmount,
    expirationThreshold: item.expirationThreshold ?? '',
  }

  setPackedQuantity(newValues.packedQuantity)
  setUnpackedQuantity(newValues.unpackedQuantity)
  setExpirationMode(newValues.expirationMode)
  setDueDate(newValues.dueDate)
  setEstimatedDueDays(newValues.estimatedDueDays)
  setName(newValues.name)
  setPackageUnit(newValues.packageUnit)
  setMeasurementUnit(newValues.measurementUnit)
  setAmountPerPackage(newValues.amountPerPackage)
  setTargetUnit(newValues.targetUnit)
  setTargetQuantity(newValues.targetQuantity)
  setRefillThreshold(newValues.refillThreshold)
  setConsumeAmount(newValues.consumeAmount)
  setExpirationThreshold(newValues.expirationThreshold)
  setInitialValues(newValues)
}, [updateItem.isSuccess, item])
```

**Step 3: Add `onSuccess` to `updateItem.mutate` in `handleSubmit`**

Find `updateItem.mutate({ id, updates })` at the end of `handleSubmit` and replace it:

```ts
// Before:
updateItem.mutate({ id, updates })

// After:
updateItem.mutate({ id, updates }, {
  onSuccess: () => {
    setInitialValues({
      packedQuantity,
      unpackedQuantity,
      expirationMode,
      dueDate,
      estimatedDueDays,
      name,
      packageUnit,
      measurementUnit,
      amountPerPackage,
      targetUnit,
      targetQuantity,
      refillThreshold,
      consumeAmount,
      expirationThreshold,
    })
  },
})
```

This makes `isDirty` compute to `false` after saving (initialValues now matches form state).

**Step 4: Run tests**

```bash
pnpm test --reporter=verbose 2>&1 | grep "save button becomes disabled after successful save"
```

Expected: `✓ save button becomes disabled after successful save`

**Step 5: Commit**

```bash
git add src/routes/items/$id/index.tsx
git commit -m "refactor(item-detail): replace form-reset useEffect with onSuccess callback"
```

---

### Task 4: Replace unit-conversion `useEffect` with event handler in `$id/index.tsx`

**Files:**
- Modify: `src/routes/items/$id/index.tsx`

**Context:** Lines 135–171 use a `prevTargetUnit` ref + `useEffect` to convert quantity fields when the user toggles `targetUnit`. The toggle switch's `onCheckedChange` is the only trigger — move the logic there.

**Step 1: Verify the existing conversion test passes (baseline)**

```bash
pnpm test --reporter=verbose 2>&1 | grep "unpacked quantity converts when toggling"
```

Expected: `✓ unpacked quantity converts when toggling track in measurement`

**Step 2: Delete `prevTargetUnit` and the unit-conversion `useEffect`**

Remove lines 135–171:
```ts
// DELETE these lines:

// Track previous targetUnit for conversion
const prevTargetUnit = useRef<'package' | 'measurement'>(targetUnit)

// Convert values when switching between package and measurement tracking
useEffect(() => {
  if (
    !amountPerPackage ||
    !measurementUnit ||
    prevTargetUnit.current === targetUnit
  ) {
    prevTargetUnit.current = targetUnit
    return
  }

  const amount = Number(amountPerPackage)
  if (amount <= 0) {
    prevTargetUnit.current = targetUnit
    return
  }

  if (prevTargetUnit.current === 'package' && targetUnit === 'measurement') {
    setUnpackedQuantity((prev) => prev * amount)
    setTargetQuantity((prev) => prev * amount)
    setRefillThreshold((prev) => prev * amount)
    setConsumeAmount((prev) => prev * amount)
  } else if (
    prevTargetUnit.current === 'measurement' &&
    targetUnit === 'package'
  ) {
    setUnpackedQuantity((prev) => prev / amount)
    setTargetQuantity((prev) => prev / amount)
    setRefillThreshold((prev) => prev / amount)
    setConsumeAmount((prev) => prev / amount)
  }

  prevTargetUnit.current = targetUnit
}, [targetUnit, amountPerPackage, measurementUnit])
```

**Step 3: Add `handleTargetUnitChange` before `isDirty`**

Insert after the state declarations (before the `// Compute dirty state` comment):

```ts
const handleTargetUnitChange = (checked: boolean) => {
  const amount = Number(amountPerPackage)
  if (amountPerPackage && measurementUnit && amount > 0) {
    const factor = checked ? amount : 1 / amount
    setUnpackedQuantity((prev) => prev * factor)
    setTargetQuantity((prev) => prev * factor)
    setRefillThreshold((prev) => prev * factor)
    setConsumeAmount((prev) => prev * factor)
  }
  setTargetUnit(checked ? 'measurement' : 'package')
}
```

**Step 4: Wire handler to the Switch**

Find the Switch for `targetUnit` (around line 494) and update its `onCheckedChange`:

```tsx
// Before:
onCheckedChange={(checked) =>
  setTargetUnit(checked ? 'measurement' : 'package')
}

// After:
onCheckedChange={handleTargetUnitChange}
```

**Step 5: Remove `useRef` from import**

`useRef` is no longer used. Update the React import:

```ts
// Before:
import { useEffect, useRef, useState } from 'react'

// After:
import { useEffect, useState } from 'react'
```

(`useEffect` stays — line 203 `registerDirtyState` effect is retained.)

**Step 6: Run tests**

```bash
pnpm test --reporter=verbose 2>&1 | grep -E "unpacked quantity converts|save button"
```

Expected: both tests pass.

**Step 7: Commit**

```bash
git add src/routes/items/$id/index.tsx
git commit -m "refactor(item-detail): replace unit-conversion useEffect with event handler"
```

---

### Task 5: Write failing tests for `new.tsx` behavior changes

**Files:**
- Create: `src/routes/items/new.test.tsx`

**Context:** `new.tsx` has no test file. Two behaviors are changing: (1) the measurement switch will no longer be disabled, and (2) validation will block submission instead of auto-resetting the toggle.

**Step 1: Create `src/routes/items/new.test.tsx`**

```ts
// src/routes/items/new.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { routeTree } from '@/routeTree.gen'

describe('New item page', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.tags.clear()
    await db.tagTypes.clear()
    await db.inventoryLogs.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderNewItemPage = () => {
    const history = createMemoryHistory({ initialEntries: ['/items/new'] })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can toggle measurement switch even without measurement unit', async () => {
    const user = userEvent.setup()

    // Given the new item page with no fields filled
    renderNewItemPage()

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /track target in measurement/i })).toBeInTheDocument()
    })

    // When measurement unit is empty (default)
    const measurementUnitInput = screen.getByLabelText(/measurement unit/i) as HTMLInputElement
    expect(measurementUnitInput.value).toBe('')

    // Then the switch is enabled (not disabled)
    const trackSwitch = screen.getByRole('switch', { name: /track target in measurement/i })
    expect(trackSwitch).not.toBeDisabled()

    // And user can toggle it on
    await user.click(trackSwitch)
    expect(trackSwitch).toHaveAttribute('data-state', 'checked')
  })

  it('save button is disabled and validation message shown when measurement mode requires missing fields', async () => {
    const user = userEvent.setup()

    // Given the new item page
    renderNewItemPage()

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /track target in measurement/i })).toBeInTheDocument()
    })

    // Fill in the required name
    await user.type(screen.getByLabelText(/name/i), 'Test Item')

    // When user enables measurement tracking without filling measurement fields
    const trackSwitch = screen.getByRole('switch', { name: /track target in measurement/i })
    await user.click(trackSwitch)

    // Then save button is disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    })

    // And validation message shows both fields required
    expect(
      screen.getByText(/measurement unit and amount per package are required/i),
    ).toBeInTheDocument()

    // When user fills in measurement unit only
    await user.type(screen.getByLabelText(/measurement unit/i), 'g')

    // Then validation message changes to amount per package only
    await waitFor(() => {
      expect(screen.getByText(/amount per package is required/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()

    // When user fills in amount per package too
    await user.type(screen.getByLabelText(/amount per package/i), '500')

    // Then save button becomes enabled and no validation message
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
    })
    expect(screen.queryByText(/required/i)).not.toBeInTheDocument()
  })
})
```

**Step 2: Run new tests to confirm they fail**

```bash
pnpm test src/routes/items/new.test.tsx --reporter=verbose
```

Expected: both tests FAIL. The first fails because the switch is currently `disabled` when no measurement unit. The second fails because there is no validation on the new item form.

**Step 3: Commit test file**

```bash
git add src/routes/items/new.test.tsx
git commit -m "test(new-item): add failing tests for always-enabled switch and measurement validation"
```

---

### Task 6: Implement `new.tsx` changes to make tests pass

**Files:**
- Modify: `src/routes/items/new.tsx`

**Step 1: Delete `prevTargetUnit` ref and both `useEffect` blocks**

Remove line 36:
```ts
// DELETE:
const prevTargetUnit = useRef<'package' | 'measurement'>(targetUnit)
```

Remove lines 38–75 (both `useEffect` blocks):
```ts
// DELETE the unit-conversion useEffect (lines 39–69):
useEffect(() => {
  if (
    !amountPerPackage ||
    !measurementUnit ||
    prevTargetUnit.current === targetUnit
  ) {
    prevTargetUnit.current = targetUnit
    return
  }
  // ... rest of block
}, [targetUnit, amountPerPackage, measurementUnit])

// DELETE the targetUnit-reset useEffect (lines 71–75):
useEffect(() => {
  if (!measurementUnit && targetUnit === 'measurement') {
    setTargetUnit('package')
  }
}, [measurementUnit, targetUnit])
```

**Step 2: Add `handleTargetUnitChange` function**

Insert before `const _clearForm`:

```ts
const handleTargetUnitChange = (checked: boolean) => {
  const amount = Number(amountPerPackage)
  if (amountPerPackage && measurementUnit && amount > 0) {
    const factor = checked ? amount : 1 / amount
    setTargetQuantity((prev) => prev * factor)
    setRefillThreshold((prev) => prev * factor)
    setConsumeAmount((prev) => prev * factor)
  }
  setTargetUnit(checked ? 'measurement' : 'package')
}
```

Note: `new.tsx` does not have `setUnpackedQuantity` — the new item form has no stock quantity fields.

**Step 3: Add validation computed values**

Insert before `const handleSubmit`:

```ts
const isValidationFailed =
  targetUnit === 'measurement' && (!measurementUnit || !amountPerPackage)

const validationMessage = isValidationFailed
  ? !measurementUnit && !amountPerPackage
    ? 'Measurement unit and amount per package are required'
    : !measurementUnit
      ? 'Measurement unit is required'
      : 'Amount per package is required'
  : null
```

**Step 4: Update the Switch — remove `disabled` prop, wire handler**

Find the Switch (around line 193):

```tsx
// Before:
<Switch
  id="targetUnit"
  checked={targetUnit === 'measurement'}
  onCheckedChange={(checked) =>
    setTargetUnit(checked ? 'measurement' : 'package')
  }
  disabled={!measurementUnit}
/>

// After:
<Switch
  id="targetUnit"
  checked={targetUnit === 'measurement'}
  onCheckedChange={handleTargetUnitChange}
/>
```

**Step 5: Update the save button and add validation message**

Find `<Button type="submit">Save</Button>` (around line 312):

```tsx
// Before:
<Button type="submit">Save</Button>

// After:
<Button type="submit" disabled={isValidationFailed}>Save</Button>
{isValidationFailed && validationMessage && (
  <p className="text-sm text-destructive">{validationMessage}</p>
)}
```

**Step 6: Clean up imports**

`useEffect` and `useRef` are no longer used in `new.tsx`. Update the import:

```ts
// Before:
import { useEffect, useRef, useState } from 'react'

// After:
import { useState } from 'react'
```

**Step 7: Run new tests**

```bash
pnpm test src/routes/items/new.test.tsx --reporter=verbose
```

Expected: both tests PASS.

**Step 8: Run all tests**

```bash
pnpm test
```

Expected: all tests pass.

**Step 9: Commit**

```bash
git add src/routes/items/new.tsx
git commit -m "refactor(new-item): replace useEffects with handler, add measurement validation, always-enable switch"
```

---

### Task 7: Final verification and PR

**Step 1: Confirm no `useEffect` imports remain in refactored files**

```bash
grep -n "useEffect" src/routes/items/new.tsx src/routes/items/$id/tags.tsx src/routes/items/$id.log.tsx
```

Expected: no output (none of these files should import or use `useEffect` anymore).

**Step 2: Confirm `$id/index.tsx` has exactly one `useEffect` (the retained one)**

```bash
grep -n "useEffect" "src/routes/items/\$id/index.tsx"
```

Expected: exactly one match at line ~203 (`registerDirtyState` effect).

**Step 3: Run full test suite one final time**

```bash
pnpm test
```

Expected: all tests pass.

**Step 4: Create PR**

```bash
gh pr create \
  --title "refactor: replace misused useEffect calls with event handlers and callbacks" \
  --body "$(cat <<'EOF'
## Summary
- Delete always-false \`registerDirtyState(false)\` useEffects from tags and log tabs
- Make parent \`$id.tsx\` path-aware so navigation guard only fires on stock tab
- Replace form-reset useEffect in stock tab with TanStack Query \`onSuccess\` callback
- Replace unit-conversion useEffect in stock tab with \`handleTargetUnitChange\` event handler
- Replace unit-conversion useEffect in new item form with event handler
- Delete targetUnit-reset useEffect from new item form
- Add measurement validation to new item form (was previously silently auto-reset)
- Remove \`disabled={!measurementUnit}\` from switch in new item form (always-enabled, matching stock tab behavior)

## Test Plan
- [ ] All existing tests pass
- [ ] New item page: switch is enabled without measurement unit
- [ ] New item page: validation message and disabled save when measurement mode active but fields empty
- [ ] Stock tab: unit conversion still works when toggling switch
- [ ] Stock tab: save button becomes disabled after successful save
- [ ] Navigation guard: still fires when leaving stock tab with unsaved changes
- [ ] Navigation guard: does not fire when leaving tags or log tab
EOF
)"
```
