# Item Page Polish - Design Document

**Date:** 2026-02-16
**Status:** Approved

## Overview

Four focused improvements to enhance item management UX:

1. **Refill threshold accepts decimals** - More flexible stock management
2. **+/- buttons for corrections** - Quick adjustments without polluting history
3. **Always-visible expiration info** - Better awareness with conditional styling
4. **Unified stock sorting** - Sort by progress percentage (current/target)

## Requirements

### 1. Refill Threshold Decimals

**Current:** When tracking in packages, refill threshold only accepts integers (step=1)

**New:** Accept decimal values for finer control

**Behavior:**
- Input step uses `consumeAmount` for consistency with other fields
- Users can manually type any decimal value (HTML number input allows this)
- No validation constraints on decimal precision

### 2. +/- Buttons as Corrections

**Current:** +/- buttons on item cards create inventory log entries

**New:** Quick corrections without audit trail

**Rationale:**
- Button clicks are for fixing mistakes/adjustments
- Inventory logs should track actual consumption/purchases
- Users can still use form fields for tracked changes

**Behavior:**
- Remove `db.inventoryLogs.add()` from button handlers
- Update only `packedQuantity`, `unpackedQuantity`, `dueDate` directly
- No change to button appearance or quantity adjustment logic

### 3. Always-Visible Expiration Message

**Current:** Expiration message only shows when within warning threshold

**New:** Always show expiration info, conditionally style

**Behavior:**
- Message always renders when `estimatedDueDate` exists
- Within threshold: red background + warning icon (`bg-status-error text-tint`)
- Outside threshold: muted text, no background, no icon (`text-foreground-muted`)
- Message format unchanged: "Expires in X days" or "Expires on YYYY-MM-DD"

**Reasoning:**
- Users always know when items expire
- Visual emphasis only when action needed
- Reduces cognitive load (no need to check form)

### 4. Unified Stock Sort

**Current:** Separate 'stock' (by status) and 'quantity' (by absolute value) options

**New:** Single 'stock' option sorting by progress percentage

**Behavior:**
- Remove 'quantity' from `SortField` type
- Change 'stock' sort to calculate: `(current / target) * 100`
- Lower percentage sorts first (ascending) - items needing attention
- Higher percentage sorts first (descending) - well-stocked items

**Rationale:**
- Progress percentage combines both current and target context
- Single intuitive "stock level" concept
- Aligns with visual progress bar representation

## Component Changes

### Item Form (`src/routes/items/$id/index.tsx`)

**Change:** Update refill threshold field step attribute

```tsx
<Input
  id="refillThreshold"
  type="number"
  min={0}
  step={consumeAmount || 1}  // Changed from: targetUnit === 'package' ? 1 : consumeAmount
  value={refillThreshold}
  onChange={(e) => setRefillThreshold(Number(e.target.value))}
/>
```

### Item List (`src/routes/index.tsx`)

**Change:** Remove inventory log creation from +/- button handlers

**Before:**
```tsx
onConsume={async () => {
  // ... quantity calculations
  await db.items.update(...)
  await db.inventoryLogs.add({...})  // ← Remove this
}}
```

**After:**
```tsx
onConsume={async () => {
  const updatedItem = { ...item }
  consumeItem(updatedItem, updatedItem.consumeAmount)

  await db.items.update(item.id, {
    packedQuantity: updatedItem.packedQuantity,
    unpackedQuantity: updatedItem.unpackedQuantity,
  })
  // No log creation
}}
```

Same pattern for `onAdd` handler.

### Item Card (`src/components/ItemCard.tsx`)

**Change:** Always render expiration message with conditional styling

**Before:**
```tsx
{currentQuantity > 0 && estimatedDueDate && (() => {
  // ... calculations
  return shouldShowWarning ? (
    <span className="bg-status-error text-tint">...</span>
  ) : null  // ← Message hidden when not warning
})()}
```

**After:**
```tsx
{currentQuantity > 0 && estimatedDueDate && (() => {
  const daysUntilExpiration = Math.ceil(
    (estimatedDueDate.getTime() - Date.now()) / 86400000
  )
  const threshold = item.expirationThreshold ?? Number.POSITIVE_INFINITY
  const isWarning = daysUntilExpiration <= threshold

  return (
    <span className={cn(
      "inline-flex gap-1 px-2 py-1 text-xs",
      isWarning
        ? "bg-status-error text-tint"
        : "text-foreground-muted"
    )}>
      {isWarning && <TriangleAlert className="w-4 h-4" />}
      {/* ... message content ... */}
    </span>
  )  // ← Always renders, conditionally styled
})()}
```

### Sort Utils (`src/lib/sortUtils.ts`)

**Change:** Remove 'quantity' option, update 'stock' to sort by progress

**Type Change:**
```tsx
// Before
export type SortField = 'name' | 'quantity' | 'stock' | 'updatedAt' | 'expiring'

// After
export type SortField = 'name' | 'stock' | 'updatedAt' | 'expiring'
```

**Sort Logic:**
```tsx
case 'stock': {
  // Before: Sort by status (error/warning/ok)
  const statusOrder = { error: 0, warning: 1, ok: 2 }
  comparison = statusOrder[statusA] - statusOrder[statusB]

  // After: Sort by progress percentage
  const progressA = (quantities.get(a.id) ?? 0) / a.targetQuantity
  const progressB = (quantities.get(b.id) ?? 0) / b.targetQuantity
  comparison = progressA - progressB
  break
}
```

## Testing Strategy

**Refill Threshold:**
- Verify step attribute uses `consumeAmount`
- Test manual decimal input (0.5, 1.25, 2.75)
- Verify form validation accepts decimals
- Test conversion when toggling tracking modes

**+/- Buttons:**
- Verify quantity updates work correctly
- Confirm NO inventory log entries created
- Test both consume and add operations
- Verify unpacked normalization still works

**Expiration Message:**
- Test message shows when far from expiration (neutral style)
- Test message shows when within threshold (warning style)
- Verify icon only shows in warning state
- Test with both relative and absolute expiration modes

**Stock Sort:**
- Verify 'quantity' option removed from UI
- Test 'stock' sorts by percentage (current/target)
- Verify ascending shows lowest percentage first
- Verify descending shows highest percentage first
- Test with items having different targets

## Migration Notes

**Breaking Changes:**
- 'quantity' sort option removed - users with this preference will fall back to default
- +/- buttons no longer create inventory logs - existing logs preserved, future clicks won't log

**Data Migration:**
- None required - purely behavioral changes
- User preferences may need reset if 'quantity' was selected

## Future Considerations

- Consider adding explicit "correction" feature in item form for logged corrections
- Could add setting to toggle +/- button logging behavior
- Progress-based sorting could be enhanced with weighted scoring (factoring in expiration, status, etc.)
