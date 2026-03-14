# Item Details Layout Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure item details page with fixed top bar and horizontal field groupings for improved usability.

**Architecture:** Keep route component responsible for layout/navigation, ItemForm focused on form logic. Add fixed position top bar at route level, group form fields into horizontal rows using CSS Grid.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, TanStack Router, shadcn/ui, Vitest, React Testing Library, Storybook

---

## Pre-Implementation

### Task 0: Verify baseline

**Step 1: Run existing tests**

```bash
pnpm test src/components/ItemForm.test.tsx
pnpm test src/routes/items/\$id.test.tsx
```

Expected: All tests PASS

**Step 2: Start Storybook**

```bash
pnpm storybook
```

Expected: ItemForm stories render correctly

**Step 3: Create feature branch**

```bash
git checkout -b feature/item-details-layout
```

---

## Task 1: Add fixed top bar to route component

**Files:**
- Modify: `src/routes/items/$id.tsx`

**Step 1: Add top bar structure above form**

In `src/routes/items/$id.tsx`, replace the existing header section (lines 27-59) with:

```tsx
return (
  <div className="min-h-screen">
    {/* Fixed Top Bar */}
    <div className="fixed top-0 left-0 right-0 z-50 bg-background-elevated border-b">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Button
            variant="neutral-ghost"
            size="icon"
            onClick={() => navigate({ to: '/' })}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold truncate max-w-[300px]">
            {item.name}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link to="/items/$id/log" params={{ id }}>
            <Button variant="neutral-ghost" size="icon">
              <History className="h-5 w-5" />
            </Button>
          </Link>
          <Button
            variant="destructive"
            size="icon"
            onClick={() => {
              if (confirm('Delete this item?')) {
                deleteItem.mutate(id, {
                  onSuccess: () => navigate({ to: '/' }),
                })
              }
            }}
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>

    {/* Main Content with padding to clear fixed bar */}
    <div className="pt-20 p-4">
      <ItemForm
        initialData={item}
        submitLabel="Save Changes"
        onSubmit={(data) => {
          updateItem.mutate(
            { id, updates: data },
            { onSuccess: () => navigate({ to: '/' }) },
          )
        }}
      />
    </div>
  </div>
)
```

**Step 2: Verify in browser**

Run: `pnpm dev`
Navigate to any item details page
Expected: Fixed top bar visible at top, form below with proper spacing

**Step 3: Commit**

```bash
git add src/routes/items/\$id.tsx
git commit -m "feat(items): add fixed top bar to item details page"
```

---

## Task 2: Group package info fields in row

**Files:**
- Modify: `src/components/ItemForm.tsx:231-275`

**Step 1: Replace package unit, measurement unit, and amount per package with row layout**

In `ItemForm.tsx`, replace lines 231-275 (package unit through amount per package sections) with:

```tsx
<div className="grid grid-cols-3 gap-4">
  <div className="space-y-2">
    <Label htmlFor="packageUnit">Package Unit</Label>
    <Input
      id="packageUnit"
      value={packageUnit}
      onChange={(e) => setPackageUnit(e.target.value)}
      placeholder="e.g., bottle, pack, box"
    />
  </div>

  <div className="space-y-2">
    <Label htmlFor="measurementUnit">Measurement Unit</Label>
    <Input
      id="measurementUnit"
      value={measurementUnit}
      onChange={(e) => setMeasurementUnit(e.target.value)}
      placeholder="e.g., L, ml, cups, 根"
    />
  </div>

  <div className="space-y-2">
    <Label htmlFor="amountPerPackage">Amount per Package</Label>
    <Input
      id="amountPerPackage"
      type="number"
      step="1"
      min={1}
      value={amountPerPackage}
      onChange={(e) => setAmountPerPackage(e.target.value)}
      placeholder="e.g., 1"
      disabled={!measurementUnit}
    />
  </div>
</div>

{/* Helper text row */}
<div className="grid grid-cols-3 gap-4 -mt-4">
  <p className="text-xs text-foreground-muted">
    Unit for whole packages
  </p>
  <p className="text-xs text-foreground-muted">
    For tracking partial packages
  </p>
  <p className="text-xs text-foreground-muted">
    {measurementUnit && packageUnit
      ? `${measurementUnit} per ${packageUnit}`
      : measurementUnit
        ? `${measurementUnit} per package`
        : 'Optional'}
  </p>
</div>
```

**Step 2: Verify in browser**

Navigate to item details page
Expected: Three fields in one row with equal widths

**Step 3: Commit**

```bash
git add src/components/ItemForm.tsx
git commit -m "feat(items): group package info fields in row"
```

---

## Task 3: Group target/consumption fields in row

**Files:**
- Modify: `src/components/ItemForm.tsx:299-362`

**Step 1: Replace target quantity, refill threshold, and consume amount sections with row layout**

In `ItemForm.tsx`, replace lines 299-362 with:

```tsx
<div className="grid grid-cols-3 gap-4">
  <div className="space-y-2">
    <Label htmlFor="targetQuantity">
      Target Quantity
      {targetUnit === 'measurement' && measurementUnit
        ? ` (${measurementUnit})`
        : packageUnit
          ? ` (${packageUnit})`
          : ''}
    </Label>
    <Input
      id="targetQuantity"
      type="number"
      min={0}
      step={targetUnit === 'package' ? 1 : consumeAmount || 1}
      value={targetQuantity}
      onChange={(e) => setTargetQuantity(Number(e.target.value))}
    />
  </div>

  <div className="space-y-2">
    <Label htmlFor="refillThreshold">
      Refill When Below
      {targetUnit === 'measurement' && measurementUnit
        ? ` (${measurementUnit})`
        : packageUnit
          ? ` (${packageUnit})`
          : ''}
    </Label>
    <Input
      id="refillThreshold"
      type="number"
      min={0}
      step={targetUnit === 'package' ? 1 : consumeAmount || 1}
      value={refillThreshold}
      onChange={(e) => setRefillThreshold(Number(e.target.value))}
    />
  </div>

  <div className="space-y-2">
    <Label htmlFor="consumeAmount">
      Amount per Consume
      {targetUnit === 'measurement' && measurementUnit
        ? ` (${measurementUnit})`
        : packageUnit
          ? ` (${packageUnit})`
          : ''}
    </Label>
    <Input
      id="consumeAmount"
      type="number"
      step="0.001"
      min={0.001}
      value={consumeAmount}
      onChange={(e) => setConsumeAmount(Number(e.target.value))}
      required
    />
  </div>
</div>

{/* Helper text row */}
<div className="grid grid-cols-3 gap-4 -mt-4">
  <p className="text-xs text-foreground-muted">
    Set to 0 to mark as inactive
  </p>
  <p className="text-xs text-foreground-muted">
    Trigger low stock warning
  </p>
  <p className="text-xs text-foreground-muted">
    Amount removed per consume click
  </p>
</div>
```

**Step 2: Verify in browser**

Expected: Three target/consumption fields in one row

**Step 3: Commit**

```bash
git add src/components/ItemForm.tsx
git commit -m "feat(items): group target/consumption fields in row"
```

---

## Task 4: Group inventory fields in row and remove heading

**Files:**
- Modify: `src/components/ItemForm.tsx:364-408`

**Step 1: Replace inventory section with row layout, remove heading**

In `ItemForm.tsx`, replace lines 364-408 (border-t section with "Current Inventory" heading) with:

```tsx
<div className="border-t pt-6 space-y-4">
  <div className="grid grid-cols-2 gap-4">
    <div className="space-y-2">
      <Label htmlFor="packedQuantity">Packed Quantity</Label>
      <Input
        id="packedQuantity"
        type="number"
        min={0}
        step={1}
        value={packedQuantity}
        onChange={(e) => setPackedQuantity(Number(e.target.value))}
        placeholder="0"
      />
      {errors.packedQuantity && (
        <p className="text-xs text-status-error">{errors.packedQuantity}</p>
      )}
    </div>

    <div className="space-y-2">
      <Label htmlFor="unpackedQuantity">Unpacked Quantity</Label>
      <Input
        id="unpackedQuantity"
        type="number"
        min={0}
        step={consumeAmount || 1}
        value={unpackedQuantity}
        onChange={(e) => setUnpackedQuantity(Number(e.target.value))}
        placeholder="0"
      />
      {errors.unpackedQuantity && (
        <p className="text-xs text-status-error">
          {errors.unpackedQuantity}
        </p>
      )}
    </div>
  </div>

  {/* Helper text row */}
  <div className="grid grid-cols-2 gap-4 -mt-2">
    <p className="text-xs text-foreground-muted">
      Number of whole packages in stock
    </p>
    <p className="text-xs text-foreground-muted">
      Loose amount{measurementUnit ? ` (${measurementUnit})` : ''} from opened package
    </p>
  </div>
</div>
```

**Step 2: Verify in browser**

Expected: Two inventory fields in one row, no "Current Inventory" heading

**Step 3: Commit**

```bash
git add src/components/ItemForm.tsx
git commit -m "feat(items): group inventory fields in row, remove section heading"
```

---

## Task 5: Replace expiration mode buttons with dropdown

**Files:**
- Modify: `src/components/ItemForm.tsx` (imports and expiration section)

**Step 1: Add Select component imports**

Add to imports at top of `ItemForm.tsx`:

```tsx
import { Calendar, Clock, X } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
```

**Step 2: Replace expiration mode buttons with Select**

Find the expiration section (around line 410-460) and replace the mode selection buttons with:

```tsx
<div className="space-y-2">
  <Label htmlFor="expirationMode">Expiration Mode</Label>
  <Select
    value={expirationMode}
    onValueChange={(value: 'date' | 'days') => setExpirationMode(value)}
  >
    <SelectTrigger id="expirationMode">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="date">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          <span>Specific Date</span>
        </div>
      </SelectItem>
      <SelectItem value="days">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          <span>Days from Purchase</span>
        </div>
      </SelectItem>
    </SelectContent>
  </Select>
</div>
```

**Step 3: Verify in browser**

Expected: Dropdown shows with Calendar/Clock icons, mode switching works

**Step 4: Commit**

```bash
git add src/components/ItemForm.tsx
git commit -m "feat(items): replace expiration mode buttons with dropdown"
```

---

## Task 6: Group expiration fields in row

**Files:**
- Modify: `src/components/ItemForm.tsx:410-478`

**Step 1: Restructure expiration section into row layout**

Replace the entire expiration section (around lines 410-478) with:

```tsx
<div className="space-y-4">
  <div className="grid grid-cols-3 gap-4">
    <div className="space-y-2">
      <Label htmlFor="expirationMode">Expiration Mode</Label>
      <Select
        value={expirationMode}
        onValueChange={(value: 'date' | 'days') => setExpirationMode(value)}
      >
        <SelectTrigger id="expirationMode">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>Specific Date</span>
            </div>
          </SelectItem>
          <SelectItem value="days">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>Days from Purchase</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div className="space-y-2">
      <Label htmlFor="expirationValue">
        {expirationMode === 'date' ? 'Expiration Date' : 'Days Until Expiration'}
      </Label>
      {expirationMode === 'date' ? (
        <Input
          id="expirationValue"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      ) : (
        <Input
          id="expirationValue"
          type="number"
          min={1}
          value={estimatedDueDays}
          onChange={(e) => setEstimatedDueDays(e.target.value)}
          placeholder="Leave empty if no expiration"
        />
      )}
    </div>

    <div className="space-y-2">
      <Label htmlFor="expirationThreshold">
        Warning Threshold (days)
      </Label>
      <Input
        id="expirationThreshold"
        type="number"
        min={0}
        value={expirationThreshold}
        onChange={(e) => setExpirationThreshold(e.target.value)}
        placeholder="e.g., 3"
      />
    </div>
  </div>

  {/* Helper text row */}
  <div className="grid grid-cols-3 gap-4 -mt-2">
    <p className="text-xs text-foreground-muted">
      Choose tracking mode
    </p>
    <p className="text-xs text-foreground-muted">
      {expirationMode === 'date'
        ? 'Set specific expiration date'
        : 'Auto-calculate from purchase date'}
    </p>
    <p className="text-xs text-foreground-muted">
      Show warning N days before expiration
    </p>
  </div>
</div>
```

**Step 2: Verify in browser**

Expected: Three expiration fields in one row, conditional rendering works

**Step 3: Commit**

```bash
git add src/components/ItemForm.tsx
git commit -m "feat(items): group expiration fields in row"
```

---

## Task 7: Update ItemForm tests

**Files:**
- Modify: `src/components/ItemForm.test.tsx`

**Step 1: Update test queries for new Select component**

Find tests that interact with expiration mode (search for "Specific Date" or "Days from Purchase") and update them to work with Select:

Replace button clicks with Select interactions:

```tsx
// Old button click approach:
await user.click(screen.getByRole('button', { name: /specific date/i }))

// New Select approach:
const select = screen.getByRole('combobox', { name: /expiration mode/i })
await user.click(select)
await user.click(screen.getByRole('option', { name: /specific date/i }))
```

**Step 2: Run tests**

```bash
pnpm test src/components/ItemForm.test.tsx
```

Expected: All tests PASS (update tests until they do)

**Step 3: Commit**

```bash
git add src/components/ItemForm.test.tsx
git commit -m "test(items): update ItemForm tests for new layout"
```

---

## Task 8: Update route tests

**Files:**
- Modify: `src/routes/items/$id.test.tsx`

**Step 1: Update tests to account for fixed top bar**

Review tests in `/items/$id.test.tsx` and update any that:
- Look for item name in wrong location (now in fixed bar AND form)
- Test navigation buttons (now in fixed bar)
- Test page layout/structure

**Step 2: Run tests**

```bash
pnpm test src/routes/items/\$id.test.tsx
```

Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/routes/items/\$id.test.tsx
git commit -m "test(items): update route tests for fixed top bar"
```

---

## Task 9: Update Storybook stories

**Files:**
- Modify: `src/components/ItemForm.stories.tsx`

**Step 1: Verify stories render with new layout**

```bash
pnpm storybook
```

Navigate to ItemForm stories
Expected: Stories show new row layouts correctly

**Step 2: Update story descriptions if needed**

Add notes about new layout to story descriptions if helpful.

**Step 3: Commit**

```bash
git add src/components/ItemForm.stories.tsx
git commit -m "docs(stories): update ItemForm stories for new layout"
```

---

## Task 10: Manual verification and polish

**Step 1: Test all item detail interactions**

- Create new item
- Edit existing item with all field combinations
- Test form validation
- Test save functionality
- Test delete functionality
- Test navigation (back, history)

**Step 2: Verify responsive behavior**

- Check layout on different viewport sizes
- Confirm rows stay as rows on mobile

**Step 3: Run full test suite**

```bash
pnpm test
pnpm lint
```

Expected: All tests PASS, no lint errors

**Step 4: Final commit if any polish changes**

```bash
git add .
git commit -m "polish(items): final layout adjustments"
```

---

## Completion

**Verification checklist:**
- [ ] Fixed top bar renders with all navigation/action buttons
- [ ] Top bar displays current item name (read-only)
- [ ] Main content has proper padding-top to avoid overlap
- [ ] All field rows render with equal-width columns
- [ ] Expiration mode dropdown works with Calendar/Clock icons
- [ ] Form validation and submission work unchanged
- [ ] Tags section and save button remain at bottom
- [ ] Layout works on mobile and desktop (rows stay as rows)
- [ ] All tests pass
- [ ] Storybook stories updated

**Files changed:**
- `src/routes/items/$id.tsx`
- `src/components/ItemForm.tsx`
- `src/components/ItemForm.test.tsx`
- `src/routes/items/$id.test.tsx`
- `src/components/ItemForm.stories.tsx` (optional)
