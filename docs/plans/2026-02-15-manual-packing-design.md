# Manual Packing Control Design

## Overview

Allow users to manually control when unpacked quantities are converted to packed quantities, removing automatic normalization and making +/- buttons always operate on unpacked quantities.

## Current Behavior (Problems)

1. **+/- buttons behave differently by mode:**
   - Package mode: + adds to packed, - consumes from unpacked
   - Measurement mode: + adds to unpacked, - consumes from unpacked
   - Inconsistent and confusing

2. **Automatic normalization after adding:**
   - When clicking +, excess unpacked auto-converts to packed
   - User has no control over when packing happens
   - Doesn't match real-world workflow (user packs items manually)

3. **Partial package opening:**
   - When consuming with insufficient unpacked, opens exact amount needed
   - Creates "virtual" partial packages that don't exist physically

## New Behavior (Solution)

1. **+/- buttons always operate on unpacked:**
   - Both modes: + adds to unpacked, - consumes from unpacked
   - Consistent behavior across all tracking modes

2. **No automatic normalization:**
   - Clicking + only adds to unpacked
   - Unpacked can grow beyond amountPerPackage
   - User controls when to pack

3. **Manual "Pack unpacked" button:**
   - Added to item detail form
   - Converts unpacked → packed based on complete units
   - Always visible, disabled when not applicable

4. **Full package opening:**
   - When consuming with insufficient unpacked, open entire package
   - Matches physical reality (you open the whole package)

## Architecture

### Core Changes

**1. Quantity operations always target unpacked**
- `addItem()`: Remove mode branching, always add to unpacked
- `consumeItem()`: Always consume from unpacked, open full package when insufficient
- Button handlers: Call these functions directly, no normalization

**2. Manual packing control**
- New `packUnpacked()` function: Converts unpacked → packed based on amountPerPackage
- New "Pack unpacked" button in ItemForm: Calls packUnpacked() and saves

**3. Files affected:**
- `src/lib/quantityUtils.ts` - Update addItem, consumeItem, add packUnpacked
- `src/lib/quantityUtils.test.ts` - Update tests for new behavior
- `src/routes/index.tsx` - Remove normalizeUnpacked calls from handlers
- `src/components/ItemForm.tsx` - Add "Pack unpacked" button
- `src/routes/items/$id.test.tsx` - Add tests for pack button

**No database schema changes** - still using `packedQuantity` and `unpackedQuantity` fields.

## Component Changes

### ItemForm (item detail page)

**Add "Pack unpacked" button:**
- Always visible (consistent UI)
- Positioned after unpacked quantity input field
- Button text: "Pack unpacked"

**Disabled state:**
- When `targetUnit === 'measurement' && !amountPerPackage` (no package size defined)

**Enabled state:**
- When `targetUnit === 'package' && unpackedQuantity >= 1` (have at least 1 full unit)
- When `targetUnit === 'measurement' && amountPerPackage && unpackedQuantity >= amountPerPackage` (have at least 1 package worth)

**Button logic:**
```tsx
const canPack = item.targetUnit === 'package'
  ? item.unpackedQuantity >= 1
  : (item.amountPerPackage && item.unpackedQuantity >= item.amountPerPackage)

<Button disabled={!canPack} onClick={handlePackUnpacked}>
  Pack unpacked
</Button>
```

### Button handlers in index.tsx (pantry page)

**Current flow:**
```
Click + → addItem() → normalizeUnpacked() → save
Click - → consumeItem() → save
```

**New flow:**
```
Click + → addItem() → save (no normalization)
Click - → consumeItem() → save
```

## Data Flow

### addItem(item, amount)

**Old behavior:**
```ts
if (item.targetUnit === 'measurement') {
  item.unpackedQuantity += amount
} else {
  item.packedQuantity += amount
}
```

**New behavior:**
```ts
// Always add to unpacked
item.unpackedQuantity += amount
```

### consumeItem(item, amount)

**Old behavior:**
```ts
// Consume from unpacked, open partial package if needed
if (item.unpackedQuantity < amount && item.packedQuantity > 0) {
  const needed = amount - item.unpackedQuantity
  item.packedQuantity -= 1
  item.unpackedQuantity += needed  // Partial package
}
item.unpackedQuantity -= amount
```

**New behavior:**
```ts
// Consume from unpacked, open FULL package if needed
if (item.unpackedQuantity < amount && item.packedQuantity > 0) {
  item.packedQuantity -= 1
  item.unpackedQuantity += item.amountPerPackage  // Full package
}
item.unpackedQuantity -= amount
```

### packUnpacked(item) - NEW FUNCTION

**Package mode:**
```ts
const packages = Math.floor(item.unpackedQuantity)
item.packedQuantity += packages
item.unpackedQuantity -= packages
```

**Measurement mode:**
```ts
if (!item.amountPerPackage) return
const packages = Math.floor(item.unpackedQuantity / item.amountPerPackage)
item.packedQuantity += packages
item.unpackedQuantity -= packages * item.amountPerPackage
```

## Error Handling

### Edge Cases

1. **Consuming more than available total**
   - Current behavior: Clamp to 0 (prevent negative)
   - Keep this behavior

2. **Pack button with insufficient unpacked**
   - Prevented by disabled state
   - `packUnpacked()` validates: if insufficient, return early

3. **Opening package when packedQuantity = 0**
   - Current `consumeItem()` checks `item.packedQuantity > 0` before opening
   - Keep this check

4. **Fractional packages in package mode**
   - Already supported (unpacked can be 0.5 packs)
   - `packUnpacked()` uses `Math.floor()` to pack only complete units

**No new error states needed** - existing validations cover the new behavior.

## Testing Strategy

### Unit tests (quantityUtils.test.ts)

**1. addItem() - always adds to unpacked**
- Package mode: verify adds to unpacked (not packed)
- Measurement mode: verify adds to unpacked (existing behavior)

**2. consumeItem() - opens full package**
- Insufficient unpacked: verify opens full package, not partial
- Example: unpacked=0.2, consume=0.5, package=1.0 → packed-1, unpacked=0.7

**3. packUnpacked() - new function**
- Package mode: `Math.floor(unpacked)` → packed
- Measurement mode: `Math.floor(unpacked / amountPerPackage)` → packed
- Leaves remainder in unpacked
- No-op when insufficient to pack

### Component tests (items/$id.test.tsx)

**4. Pack button state**
- Disabled when tracking measurement + no amountPerPackage
- Enabled when package mode + unpacked >= 1
- Enabled when measurement mode + unpacked >= amountPerPackage

**5. Pack button functionality**
- Click packs quantities correctly
- Updates database
- Button becomes disabled after packing (if unpacked < threshold)

### Integration tests (index.tsx or ItemCard.test.tsx)

**6. +/- buttons no longer normalize**
- Click +: unpacked increases (no auto-packing)
- Verify packed stays same

## Implementation Approach

**Approach:** Minimal changes to existing functions

**Rationale:**
- Reuses existing logic structure
- Minimal code changes
- Button handlers remain simple
- New behavior is actually simpler than old behavior

**Changes:**
1. Modify `addItem()`: Always add to unpacked (remove mode branching)
2. Modify `consumeItem()`: When unpacked insufficient, open full package
3. Add `packUnpacked()`: New function for manual normalization
4. Remove `normalizeUnpacked()` calls from button handlers in index.tsx
5. Add "Pack unpacked" button to ItemForm

## User Experience

**Before (confusing):**
- Click + on milk (package mode) → packed increases
- Click + on olive oil (measurement mode) → unpacked increases, then auto-packs
- Opening packages gives partial amounts

**After (consistent):**
- Click + on any item → unpacked increases
- Click "Pack unpacked" when ready → converts to packed
- Opening packages gives full package amount
- User controls when packing happens
