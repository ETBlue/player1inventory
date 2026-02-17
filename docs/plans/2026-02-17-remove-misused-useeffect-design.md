# Design: Remove Misused `useEffect` Calls

**Date:** 2026-02-17
**Branch:** `refactor/remove-misused-useeffect`

## Problem

Several `useEffect` calls in the codebase react to state changes that originate entirely within the app — user actions, derived state, or mutation callbacks. These are not genuine side effects (external world → app) and should not use `useEffect`.

## Scope

13 `useEffect` calls across 8 files were audited. 4 are genuine side effects and are left untouched:

| File | Purpose | Verdict |
|---|---|---|
| `useTheme.ts:62` | Apply `.dark` class to `document` | Keep — DOM manipulation |
| `useTheme.ts:71` | Listen to OS `prefers-color-scheme` | Keep — event subscription |
| `useTheme.ts:57` | Sync ref when preference changes | Keep — ref sync for event handler |
| `Colors.stories.tsx:78` | Read computed styles from DOM ref | Keep — DOM access |
| `index.tsx:68,73,77` | Save state to `sessionStorage` | Keep — external storage is a side effect |

6 `useEffect` calls are removed. 1 is intentionally retained.

## Changes

### 1. Delete always-false `registerDirtyState` calls

**Files:** `src/routes/items/$id/tags.tsx:33`, `src/routes/items/$id.log.tsx:21`

These call `registerDirtyState(false)` on mount to reset the parent's navigation guard after navigating away from the stock tab.

**Fix:** Make the parent (`$id.tsx`) path-aware instead. Only apply the navigation guard when the current path is the stock tab (`/items/${id}`):

```ts
const isOnStockTab = router.state.location.pathname === `/items/${id}`

const handleTabClick = (e, path) => {
  if (isOnStockTab && isDirty && router.state.location.pathname !== path) {
    e.preventDefault()
    setPendingNavigation(path)
    setShowDiscardDialog(true)
  }
}
```

The two `useEffect` calls are deleted. The stock tab's `useEffect(() => { registerDirtyState(isDirty) }, [isDirty, registerDirtyState])` is **retained** — it is the minimal necessary coupling across the router boundary.

### 2. Form reset after save

**File:** `src/routes/items/$id/index.tsx:90`

A `prevSuccessRef` + `useEffect` watches `updateItem.isSuccess` to detect when a save completes and reset form state. TanStack Query's `mutate` supports an `onSuccess` callback for exactly this purpose.

**Fix:** Move reset logic into the `onSuccess` callback in `handleSubmit`. Simplify the reset: only update `initialValues` to match the current form state (making `isDirty` compute to `false`). The individual field setters are not needed since form values haven't changed.

```ts
updateItem.mutate({ id, updates }, {
  onSuccess: () => {
    setInitialValues({
      packedQuantity, unpackedQuantity, expirationMode, dueDate,
      estimatedDueDays, name, packageUnit, measurementUnit,
      amountPerPackage, targetUnit, targetQuantity,
      refillThreshold, consumeAmount, expirationThreshold,
    })
  }
})
```

Remove: `prevSuccessRef`, the `useEffect` block, and the `useRef` import (if no longer needed).

### 3. Unit conversion on toggle

**Files:** `src/routes/items/$id/index.tsx:139`, `src/routes/items/new.tsx:39`

A `prevTargetUnit` ref + `useEffect` watches `targetUnit` changes and converts quantity fields. The toggle switch's `onCheckedChange` is the only trigger, so the logic belongs in the handler.

**Fix:** Replace the ref + `useEffect` with a `handleTargetUnitChange` function:

```ts
const handleTargetUnitChange = (checked: boolean) => {
  const amount = Number(amountPerPackage)
  if (amountPerPackage && measurementUnit && amount > 0) {
    const factor = checked ? amount : 1 / amount
    setUnpackedQuantity((prev) => prev * factor)  // $id/index.tsx only
    setTargetQuantity((prev) => prev * factor)
    setRefillThreshold((prev) => prev * factor)
    setConsumeAmount((prev) => prev * factor)
  }
  setTargetUnit(checked ? 'measurement' : 'package')
}
```

Wire to the switch: `onCheckedChange={handleTargetUnitChange}`.

Remove: `prevTargetUnit` ref and the `useEffect` block.

### 4. Remove `useEffect` that resets `targetUnit` when unit is cleared

**File:** `src/routes/items/new.tsx:71`

A `useEffect` resets `targetUnit` to `'package'` when `measurementUnit` is cleared. The new desired behavior: keep `targetUnit` as-is, show an error, and disable the save button.

**Fix:** Delete the `useEffect` entirely. Add validation (matching `$id/index.tsx`):

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

Also remove `disabled={!measurementUnit}` from the switch in `new.tsx` — the switch is always toggleable (matching `$id/index.tsx` behavior).

## Result

| # | File | Line | Change |
|---|---|---|---|
| 1 | `$id/tags.tsx` | 33 | Delete `useEffect` |
| 2 | `$id.log.tsx` | 21 | Delete `useEffect` |
| 3 | `$id.tsx` | 46 | Add `isOnStockTab` path check |
| 4 | `$id/index.tsx` | 90 | Replace with `onSuccess` callback |
| 5 | `$id/index.tsx` | 139 | Replace with `handleTargetUnitChange` |
| 6 | `new.tsx` | 39 | Replace with `handleTargetUnitChange` |
| 7 | `new.tsx` | 71 | Delete `useEffect`, add validation |
| 8 | `new.tsx` | switch | Remove `disabled={!measurementUnit}` |
| 10 | `$id/index.tsx` | 203 | **Kept** — router boundary coupling |

**6 `useEffect` calls removed. 7 genuine side effects retained.**
