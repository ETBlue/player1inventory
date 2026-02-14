# Pantry Item Improvements Design

**Date:** 2026-02-14

**Goal:** Enhance pantry item tracking with dual-unit system (package + measurement), packed/unpacked quantity tracking, flexible expiration modes, and inactive item management.

**Rationale:** Current single-unit tracking is insufficient for real-world pantry management where items come in packages (bottles, packs) but are consumed in measurements (ml, cups). Users need to track both whole packages and partial amounts for accurate inventory.

---

## Data Model Changes

### Updated Item Interface

```typescript
interface Item {
  // Existing fields
  id: string
  name: string
  tagIds: string[]
  targetQuantity: number
  refillThreshold: number
  dueDate?: Date
  estimatedDueDays?: number
  createdAt: Date
  updatedAt: Date

  // New fields for dual-unit tracking
  packageUnit?: string           // e.g., "bottle", "pack", "box"
  measurementUnit?: string        // e.g., "L", "ml", "cups", "根"
  amountPerPackage?: number       // e.g., 1 (for "1L per bottle")

  // Quantity tracking
  targetUnit: 'package' | 'measurement'  // What is target measured in?
  packedQuantity: number         // Number of full packages
  unpackedQuantity: number       // Partial amount in measurement units

  // Consumption settings
  consumeAmount: number          // Amount per consume click

  // Expiration (existing fields, usage changes)
  // dueDate - for explicit date mode
  // estimatedDueDays - for relative days mode (kept as config, not cleared on empty)
  // Both optional - can leave empty

  // REMOVED: old 'unit' field (replaced by packageUnit/measurementUnit)
}
```

### Key Behaviors

- When `packageUnit` is not set → silent fallback to simple tracking (no packed/unpacked)
- Current quantity = `packedQuantity * amountPerPackage + unpackedQuantity` (when both units defined)
- When quantity reaches 0 → clear `dueDate` but keep `estimatedDueDays` as configuration
- When quantity becomes > 0 → recalculate `dueDate` from last purchase + `estimatedDueDays`

---

## UI Components & Interactions

### Item Form (Create/Edit)

**Fields:**

1. **Package Unit** (optional text input)
   - Examples: "bottle", "pack", "box", "bag"
   - Label: "Package unit (optional)"

2. **Measurement Unit** (optional text input)
   - Examples: "L", "ml", "cups", "根", "條"
   - Label: "Measurement unit (optional)"

3. **Amount per Package** (optional number)
   - Shows only when both `packageUnit` AND `measurementUnit` are defined
   - Label: "Amount per package"
   - Placeholder: "e.g., 1 (for 1L per bottle)"

4. **Target Quantity** (number input)
   - Required
   - Label: "Target quantity"

5. **Target Unit Toggle** (radio buttons)
   - Shows only when both units are defined
   - Options: "○ Packages" / "○ Measurement"
   - Determines what `targetQuantity` represents

6. **Consume Amount** (number input)
   - Required
   - Unit matches `targetUnit` selection
   - Label: "Amount per consume"
   - Help text: "Amount removed with each consume click"

7. **Expiration Field** (smart field)
   - Default state: Shows `[📅 Date]` and `[🔢 Days]` buttons + empty input
   - Click calendar icon → date picker appears (explicit date mode)
   - Click days icon → number input appears (relative days mode)
   - Can leave empty (no expiration tracking)

### ItemProgressBar Updates

**Segmented Bar (target ≤ 15):**

When `packageUnit` is defined:
- Each segment represents 1 target unit
- Segments can show partial fills for unpacked portions
- Calculation: `segmentFill = Math.floor(packed) + (unpacked / amountPerPackage)`
- Example: Target = 2 bottles, Current = 1 bottle + 700ml (1L per bottle)
  - Segment 1: 100% filled (1 full bottle)
  - Segment 2: 70% filled (700ml of 1000ml)

When no `packageUnit`:
- Existing behavior (simple continuous/segmented based on total)

**Continuous Bar (target > 15):**
- Works with total quantity regardless of packed/unpacked

### Add/Consume Buttons

**Add Button:**
- Always adds 1 to `packedQuantity`
- Fixed behavior (not configurable)

**Consume Button:**
- Subtracts `consumeAmount` from total
- Prioritizes unpacked first, then breaks packages if needed
- See "Consume Logic" in Business Logic section

### Inactive Items Display

**Condition:**
- `targetQuantity === 0` AND `currentQuantity === 0`

**Display:**
- Items sorted to bottom of list
- Hidden by default
- "Show X inactive items" button at bottom
- Click to reveal/hide inactive item cards

### Expiration Badge

**Visibility:**
- Show only when `getCurrentQuantity(item) > 0`
- Don't show for out-of-stock items

**Text Format:**
- **Explicit date mode** (`dueDate` set): "Expires on 2026-02-13"
- **Relative mode** (`estimatedDueDays` set): "Expires in 5 days"
- Calculate days: `Math.ceil((lastPurchaseDate + estimatedDueDays - now) / millisecondsPerDay)`

---

## Business Logic & Calculations

### Current Quantity Calculation

```typescript
function getCurrentQuantity(item: Item): number {
  if (item.packageUnit && item.measurementUnit && item.amountPerPackage) {
    // Dual-unit mode: packed + unpacked
    const packedInMeasurement = item.packedQuantity * item.amountPerPackage
    return packedInMeasurement + item.unpackedQuantity
  }
  // Simple mode: just packed (acts as total)
  return item.packedQuantity
}
```

### Add Logic

```typescript
function add(item: Item) {
  item.packedQuantity += 1

  // If quantity was 0 and estimatedDueDays exists, recalculate dueDate
  if (item.estimatedDueDays && !item.dueDate) {
    item.dueDate = new Date(Date.now() + item.estimatedDueDays * 86400000)
  }
}
```

### Consume Logic

```typescript
function consume(item: Item, amount: number) {
  if (item.packageUnit && item.amountPerPackage) {
    // Consume from unpacked first
    if (item.unpackedQuantity >= amount) {
      item.unpackedQuantity -= amount
    } else {
      // Need to break into packed
      const remaining = amount - item.unpackedQuantity
      item.unpackedQuantity = 0

      const packagesToOpen = Math.ceil(remaining / item.amountPerPackage)
      item.packedQuantity -= packagesToOpen
      item.unpackedQuantity = (packagesToOpen * item.amountPerPackage) - remaining
    }
  } else {
    // Simple mode
    item.packedQuantity -= amount
  }

  // Clear expiration date when quantity reaches 0
  if (getCurrentQuantity(item) === 0) {
    item.dueDate = undefined
    // Keep estimatedDueDays as configuration
  }
}
```

### Expiration Date Display

**Badge Visibility:**
- Show only when `getCurrentQuantity(item) > 0`

**Date Calculation:**
- Use `dueDate` if set (explicit date mode)
- Use `lastPurchaseDate + estimatedDueDays` if `estimatedDueDays` is set (relative mode)
- Don't show badge if both are undefined

**Text Format:**
- Explicit: "Expires on YYYY-MM-DD"
- Relative: "Expires in X days"
- If negative days: "Expired X days ago" (in red/error state)

### Inactive Status

**Condition:**
```typescript
function isInactive(item: Item): boolean {
  return item.targetQuantity === 0 && getCurrentQuantity(item) === 0
}
```

**Sorting:**
- Inactive items always sorted to bottom of list
- Within inactive items, sort by name (or other criteria)

---

## Migration Strategy

### Handling Existing Items

Current items have single `unit` field. Migration approach:

```typescript
function migrateItem(oldItem: OldItem): Item {
  return {
    ...oldItem,
    // Map old unit to new structure
    packageUnit: oldItem.unit,        // Treat old unit as package
    measurementUnit: undefined,       // Not defined in old schema
    amountPerPackage: undefined,      // Not defined

    // Default target to packages (backwards compatible)
    targetUnit: 'package',

    // Old targetQuantity becomes packed quantity
    packedQuantity: oldItem.targetQuantity,
    unpackedQuantity: 0,

    // Default consume amount = 1 package
    consumeAmount: 1,

    // Remove old unit field
    unit: undefined,
  }
}
```

### Migration Steps

1. Add new fields to database schema with defaults
2. Run migration script:
   - Set `packedQuantity = currentQuantity` from inventory logs
   - Set `unpackedQuantity = 0`
   - Set `targetUnit = 'package'`
   - Set `consumeAmount = 1`
   - Map `unit → packageUnit`
3. Remove old `unit` column (or mark deprecated)

**Result:**
- Existing items work as before (simple package tracking)
- Users can gradually add measurement units if desired
- No breaking changes to existing functionality

---

## Validation & Edge Cases

### Validation Rules

**1. Package + Measurement Dependency:**
- If `amountPerPackage` is set → require both `packageUnit` AND `measurementUnit`
- If only one unit is set → `amountPerPackage` must be undefined

**2. Target Unit Validation:**
- `targetUnit` toggle only available when both units defined
- If only `packageUnit` set → force `targetUnit = 'package'`
- If only `measurementUnit` set → force `targetUnit = 'measurement'`
- If neither set → default to `'package'` (backwards compatibility)

**3. Consume Amount Validation:**
- Must be > 0
- Should match `targetUnit` (in packages or measurement)
- Warning if `consumeAmount > amountPerPackage` (unusual but allowed)

**4. Quantity Constraints:**
- `packedQuantity` cannot be negative
- `unpackedQuantity` cannot be negative
- `unpackedQuantity` should be < `amountPerPackage`
- Auto-convert excess unpacked to packed

### Edge Cases

**1. Consuming More Than Available:**
- If `consumeAmount > currentQuantity` → set all quantities to 0, show warning toast

**2. Partial Package in Unpacked:**
- Auto-convert: if `unpackedQuantity >= amountPerPackage`:
  ```typescript
  while (item.unpackedQuantity >= item.amountPerPackage) {
    item.packedQuantity += 1
    item.unpackedQuantity -= item.amountPerPackage
  }
  ```

**3. Changing Units After Tracking Started:**
- Show warning: "Changing units may affect existing quantity data"
- Options:
  - Try to convert quantities (if conversion is possible)
  - Reset quantities to 0 with confirmation
- Preserve history in inventory logs (logs use old units)

**4. Expiration Badge Edge Cases:**
- If `estimatedDueDays` set but no purchase history → don't show badge
- If calculated "expires in X days" is negative → show "Expired X days ago" in red
- If quantity is 0 → never show badge (even if date exists)

**5. No Units Defined:**
- Both `packageUnit` and `measurementUnit` are undefined
- Fall back to simple quantity tracking
- `packedQuantity` acts as total quantity
- Progress bar works normally
- No special handling needed (silent fallback)

---

## Testing Strategy

### Unit Tests

**Quantity Calculations:**
- `getCurrentQuantity()` with dual units vs simple mode
- Consume logic: unpacked first, then breaking packages
- Auto-conversion when `unpackedQuantity >= amountPerPackage`
- Edge case: consuming more than available

**Expiration Logic:**
- Badge visibility based on `quantity > 0`
- Text format: explicit date vs "expires in X days"
- Clearing `dueDate` when quantity hits 0
- Keeping `estimatedDueDays` as configuration
- Recalculating `dueDate` when quantity becomes > 0

**Inactive Status:**
- Correctly identifies when `target = 0` and `current = 0`
- Items sort to bottom of list
- Show/hide inactive items button

**Validation:**
- Package + measurement dependency checks
- Target unit constraints
- Negative quantity prevention
- Unit change warnings

### Integration Tests

**Add/Consume Workflow:**
- Add increases `packedQuantity` by 1
- Consume decreases unpacked first, then packed
- Progress bar updates correctly with partial fills
- Quantity display shows "X packages + Y measurement"

**Expiration Tracking:**
- Badge appears/disappears based on quantity
- Date vs days modes display correctly
- Relative days countdown updates
- "Expired X days ago" shows in red

**Unit Configuration:**
- Dual-unit tracking vs simple mode
- Target unit toggle behavior
- Fallback to simple mode when package unit missing
- Form validation messages

**Inactive Items:**
- Items become inactive when both target and current = 0
- Inactive items appear at bottom
- "Show X inactive items" button works
- Clicking reveals/hides inactive cards

### Visual/Manual Testing

**Progress Bar:**
- Partial segment fills render correctly (70% fill for 700ml of 1L)
- Segments align properly
- Color coding for status (ok/warning/error)

**Expiration Badge:**
- Styling differs for date vs countdown
- Red background for expired items
- Badge hidden when quantity = 0

**Form Interactions:**
- Smart expiration field switches between date picker and number input
- Target unit toggle appears/disappears based on unit configuration
- Amount per package field appears when both units defined

**Inactive Items:**
- Collapse/expand animation smooth
- Count updates correctly
- Items remain sorted at bottom

---

## Summary

This design introduces a flexible dual-unit tracking system that:
- Supports both package (bottle, pack) and measurement (L, ml) units
- Tracks packed (whole packages) and unpacked (partial amounts) separately
- Provides configurable consume amounts for realistic usage tracking
- Enhances expiration tracking with explicit date and relative days modes
- Manages inactive items (target=0, current=0) with collapsible display
- Maintains backwards compatibility with existing single-unit items
- Falls back gracefully when advanced features aren't needed

**Key Design Principles:**
- YAGNI: Optional units allow simple tracking when complexity isn't needed
- Progressive enhancement: Users can add features as they need them
- Silent fallback: Missing features don't break or confuse the UI
- Data preservation: Configuration (like `estimatedDueDays`) persists even when not actively used
