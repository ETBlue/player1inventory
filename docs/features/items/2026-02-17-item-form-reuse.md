# Item Form Reuse Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract the polished item detail form into a shared `ItemForm` component used by both the edit route and the new item route.

**Architecture:** A stateful `ItemForm` component manages all field state internally and reports results via callbacks. Routes handle mutations and navigation; the component handles layout, validation, dirty tracking, and unit conversion. The new item route drops the tags section (users assign tags post-creation from the Tags tab).

**Tech Stack:** React 19, TypeScript strict, Vitest + React Testing Library, Tailwind CSS v4, Storybook

---

## Field Mapping Reference

Before coding, know which fields live in which section:

| Field | Section | Create | Edit |
|-------|---------|--------|------|
| name | Item Info | ✓ | ✓ |
| packageUnit | Item Info | ✓ | ✓ |
| targetQuantity | Item Info | ✓ | ✓ |
| refillThreshold | Item Info | ✓ | ✓ |
| consumeAmount | Item Info | ✓ | ✓ |
| expirationMode | Item Info | ✓ | ✓ |
| expirationThreshold | Item Info | ✓ | ✓ |
| targetUnit | Advanced | ✓ | ✓ |
| measurementUnit | Advanced | ✓ | ✓ |
| amountPerPackage | Advanced | ✓ | ✓ |
| packedQuantity | Stock | — | ✓ |
| unpackedQuantity | Stock | — | ✓ |
| dueDate | Stock | — | ✓ |
| estimatedDueDays | Stock | — | ✓ |

`expirationMode` controls which expiration value field appears in the Stock section.

---

### Task 1: Create feature branch

**Step 1: Create git worktree**

```bash
git worktree add .worktrees/feature-item-form-reuse -b feature/item-form-reuse
cd .worktrees/feature-item-form-reuse
```

**Step 2: Verify the worktree is clean**

```bash
git status
```
Expected: clean working tree on branch `feature/item-form-reuse`

---

### Task 2: Write failing tests for ItemForm (create mode)

**Files:**
- Create: `src/components/ItemForm.test.tsx`

**Step 1: Write the failing tests**

Create `src/components/ItemForm.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ItemForm } from './ItemForm'

describe('ItemForm — create mode (no onDirtyChange)', () => {
  it('renders Item Info and Advanced Configuration sections by default', () => {
    render(<ItemForm onSubmit={vi.fn()} />)
    expect(screen.getByText('Item Info')).toBeInTheDocument()
    expect(screen.getByText('Advanced Configuration')).toBeInTheDocument()
    expect(screen.queryByText('Stock Status')).not.toBeInTheDocument()
  })

  it('does not render Stock Status section unless sections prop includes stock', () => {
    render(<ItemForm onSubmit={vi.fn()} sections={['info', 'advanced']} />)
    expect(screen.queryByText('Stock Status')).not.toBeInTheDocument()
  })

  it('submit button is enabled when name is filled and form is valid', async () => {
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} />)
    const nameInput = screen.getByLabelText(/Name/i)
    await user.type(nameInput, 'Milk')
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
  })

  it('calls onSubmit with form values when submitted', async () => {
    const user = userEvent.setup()
    const handleSubmit = vi.fn()
    render(<ItemForm onSubmit={handleSubmit} />)
    await user.type(screen.getByLabelText(/Name/i), 'Milk')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(handleSubmit).toHaveBeenCalledOnce()
    const values = handleSubmit.mock.calls[0][0]
    expect(values.name).toBe('Milk')
    expect(values.packedQuantity).toBe(0)
    expect(values.unpackedQuantity).toBe(0)
    expect(values.targetUnit).toBe('package')
  })

  it('submit button disabled when measurement mode but missing units', async () => {
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} />)
    // Enable measurement tracking (switch is in Advanced section)
    const switchEl = screen.getByRole('switch', { name: /track in measurement/i })
    await user.click(switchEl)
    // Form is now in measurement mode with no measurementUnit or amountPerPackage
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('shows validation message when measurement mode is on but units are missing', async () => {
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} />)
    const switchEl = screen.getByRole('switch', { name: /track in measurement/i })
    await user.click(switchEl)
    await user.type(screen.getByLabelText(/Name/i), 'Milk')
    // Attempt submit to trigger validation display
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(screen.getByText(/measurement unit.*required/i)).toBeInTheDocument()
  })
})
```

**Step 2: Run tests to confirm they fail**

```bash
pnpm test src/components/ItemForm.test.tsx
```
Expected: FAIL with "Cannot find module './ItemForm'"

---

### Task 3: Implement ItemForm (create mode — info + advanced sections)

**Files:**
- Create: `src/components/ItemForm.tsx`

**Step 1: Create the component**

```tsx
import { Calendar, Clock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { packUnpacked } from '@/lib/quantityUtils'

export type ItemFormValues = {
  // Stock fields (used when sections includes 'stock')
  packedQuantity: number
  unpackedQuantity: number
  dueDate: string
  estimatedDueDays: string | number
  // Item Info fields
  name: string
  packageUnit: string
  targetQuantity: number
  refillThreshold: number
  consumeAmount: number
  expirationMode: 'date' | 'days'
  expirationThreshold: string | number
  // Advanced fields
  targetUnit: 'package' | 'measurement'
  measurementUnit: string
  amountPerPackage: string | number
}

const DEFAULT_VALUES: ItemFormValues = {
  packedQuantity: 0,
  unpackedQuantity: 0,
  dueDate: '',
  estimatedDueDays: '',
  name: '',
  packageUnit: '',
  targetQuantity: 1,
  refillThreshold: 1,
  consumeAmount: 1,
  expirationMode: 'date',
  expirationThreshold: '',
  targetUnit: 'package',
  measurementUnit: '',
  amountPerPackage: '',
}

interface ItemFormProps {
  initialValues?: Partial<ItemFormValues>
  sections?: ('stock' | 'info' | 'advanced')[]
  onSubmit: (values: ItemFormValues) => void
  onDirtyChange?: (isDirty: boolean) => void
  savedAt?: number   // increment on successful save to reset dirty state
  submitLabel?: string
}

export function ItemForm({
  initialValues,
  sections = ['info', 'advanced'],
  onSubmit,
  onDirtyChange,
  savedAt,
  submitLabel = 'Save',
}: ItemFormProps) {
  const merged = { ...DEFAULT_VALUES, ...initialValues }

  // Stock fields
  const [packedQuantity, setPackedQuantity] = useState(merged.packedQuantity)
  const [unpackedQuantity, setUnpackedQuantity] = useState(merged.unpackedQuantity)
  const [dueDate, setDueDate] = useState(merged.dueDate)
  const [estimatedDueDays, setEstimatedDueDays] = useState(merged.estimatedDueDays)

  // Item Info fields
  const [name, setName] = useState(merged.name)
  const [packageUnit, setPackageUnit] = useState(merged.packageUnit)
  const [targetQuantity, setTargetQuantity] = useState(merged.targetQuantity)
  const [refillThreshold, setRefillThreshold] = useState(merged.refillThreshold)
  const [consumeAmount, setConsumeAmount] = useState(merged.consumeAmount)
  const [expirationMode, setExpirationMode] = useState<'date' | 'days'>(merged.expirationMode)
  const [expirationThreshold, setExpirationThreshold] = useState(merged.expirationThreshold)

  // Advanced fields
  const [targetUnit, setTargetUnit] = useState<'package' | 'measurement'>(merged.targetUnit)
  const [measurementUnit, setMeasurementUnit] = useState(merged.measurementUnit)
  const [amountPerPackage, setAmountPerPackage] = useState(merged.amountPerPackage)

  // Track initial values for dirty comparison (only matters in edit mode)
  const [baseValues, setBaseValues] = useState<ItemFormValues>({ ...merged })

  // Keep a ref to current values so effects can read them without stale closures
  const currentValuesRef = useRef<ItemFormValues>(merged)

  // Update ref on every render
  const currentValues: ItemFormValues = {
    packedQuantity,
    unpackedQuantity,
    dueDate,
    estimatedDueDays,
    name,
    packageUnit,
    targetQuantity,
    refillThreshold,
    consumeAmount,
    expirationMode,
    expirationThreshold,
    targetUnit,
    measurementUnit,
    amountPerPackage,
  }
  currentValuesRef.current = currentValues

  // Dirty state
  const isDirty =
    packedQuantity !== baseValues.packedQuantity ||
    unpackedQuantity !== baseValues.unpackedQuantity ||
    dueDate !== baseValues.dueDate ||
    estimatedDueDays !== baseValues.estimatedDueDays ||
    name !== baseValues.name ||
    packageUnit !== baseValues.packageUnit ||
    targetQuantity !== baseValues.targetQuantity ||
    refillThreshold !== baseValues.refillThreshold ||
    consumeAmount !== baseValues.consumeAmount ||
    expirationMode !== baseValues.expirationMode ||
    expirationThreshold !== baseValues.expirationThreshold ||
    targetUnit !== baseValues.targetUnit ||
    measurementUnit !== baseValues.measurementUnit ||
    amountPerPackage !== baseValues.amountPerPackage

  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty

  // Report dirty state to parent (edit mode only)
  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  // Sync from initialValues prop when it changes and form is clean
  // (handles background refetches, e.g. from +/- buttons on pantry page)
  useEffect(() => {
    if (!initialValues) return
    if (isDirtyRef.current) return
    const next = { ...DEFAULT_VALUES, ...initialValues }
    setPackedQuantity(next.packedQuantity)
    setUnpackedQuantity(next.unpackedQuantity)
    setDueDate(next.dueDate)
    setEstimatedDueDays(next.estimatedDueDays)
    setName(next.name)
    setPackageUnit(next.packageUnit)
    setTargetQuantity(next.targetQuantity)
    setRefillThreshold(next.refillThreshold)
    setConsumeAmount(next.consumeAmount)
    setExpirationMode(next.expirationMode)
    setExpirationThreshold(next.expirationThreshold)
    setTargetUnit(next.targetUnit)
    setMeasurementUnit(next.measurementUnit)
    setAmountPerPackage(next.amountPerPackage)
    setBaseValues({ ...next })
  }, [initialValues])

  // When savedAt changes, a save just succeeded — reset dirty state
  useEffect(() => {
    if (savedAt === undefined) return
    setBaseValues({ ...currentValuesRef.current })
  }, [savedAt])

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

  const isValidationFailed =
    targetUnit === 'measurement' && (!measurementUnit || !amountPerPackage)

  const validationMessage = isValidationFailed
    ? !measurementUnit && !amountPerPackage
      ? 'Measurement unit and amount per package are required'
      : !measurementUnit
        ? 'Measurement unit is required'
        : 'Amount per package is required'
    : null

  const isSubmitDisabled =
    isValidationFailed || (onDirtyChange !== undefined && !isDirty)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isValidationFailed) return
    onSubmit(currentValuesRef.current)
  }

  const showStock = sections.includes('stock')
  const showInfo = sections.includes('info')
  const showAdvanced = sections.includes('advanced')

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl mx-auto">
      {/* Stock Status Section */}
      {showStock && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
            <div className="h-px bg-accessory-emphasized" />
            <h2 className="text-sm font-medium uppercase">Stock Status</h2>
            <div className="h-px bg-accessory-emphasized" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="packedQuantity">
                Quantity{' '}
                <span className="text-xs font-normal">
                  ({packageUnit || 'pack'})
                </span>
              </Label>
              <Input
                id="packedQuantity"
                type="number"
                min={0}
                step={1}
                value={packedQuantity}
                onChange={(e) => setPackedQuantity(Number(e.target.value))}
              />
              <p className="text-xs text-foreground-muted">
                Number of whole packages in stock
              </p>
            </div>

            <div>
              <Label htmlFor="unpackedQuantity">
                Unpacked Quantity{' '}
                <span className="text-xs font-normal">
                  (
                  {targetUnit === 'measurement'
                    ? measurementUnit
                    : packageUnit || 'pack'}
                  )
                </span>
              </Label>
              <Input
                id="unpackedQuantity"
                type="number"
                min={0}
                step={consumeAmount || 1}
                value={unpackedQuantity}
                onChange={(e) => setUnpackedQuantity(Number(e.target.value))}
              />
              <p className="text-xs text-foreground-muted">
                Loose amount from opened package(s)
              </p>
            </div>
          </div>

          {/* Pack unpacked button */}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="neutral-outline"
              size="sm"
              disabled={
                targetUnit === 'package'
                  ? unpackedQuantity < 1
                  : targetUnit === 'measurement'
                    ? !amountPerPackage || unpackedQuantity < Number(amountPerPackage)
                    : true
              }
              onClick={() => {
                const itemLike = {
                  packedQuantity,
                  unpackedQuantity,
                  targetUnit,
                  measurementUnit: measurementUnit || undefined,
                  amountPerPackage: amountPerPackage ? Number(amountPerPackage) : undefined,
                } as Parameters<typeof packUnpacked>[0]
                packUnpacked(itemLike)
                setPackedQuantity(itemLike.packedQuantity)
                setUnpackedQuantity(itemLike.unpackedQuantity)
              }}
            >
              Pack unpacked
            </Button>
          </div>

          {/* Expiration value (dynamic per purchase) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="expirationValue">
                {expirationMode === 'date' ? (
                  'Expires on'
                ) : (
                  <>
                    Expires in <span className="text-xs font-normal">(days)</span>
                  </>
                )}
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
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Item Info Section */}
      {showInfo && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
            <div className="h-px bg-accessory-emphasized" />
            <h2 className="text-sm font-medium uppercase">Item Info</h2>
            <div className="h-px bg-accessory-emphasized" />
          </div>

          <div>
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="packageUnit">Package Unit</Label>
            <Input
              id="packageUnit"
              value={packageUnit}
              placeholder="default: pack"
              onChange={(e) => setPackageUnit(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="targetQuantity">
                Target Quantity{' '}
                <span className="text-xs font-normal">
                  (
                  {targetUnit === 'measurement'
                    ? measurementUnit
                    : packageUnit || 'pack'}
                  )
                </span>
              </Label>
              <Input
                id="targetQuantity"
                type="number"
                min={0}
                step={targetUnit === 'package' ? 1 : consumeAmount || 1}
                value={targetQuantity}
                onChange={(e) => setTargetQuantity(Number(e.target.value))}
              />
              <p className="text-xs text-foreground-muted">
                Item becomes inactive when set to 0
              </p>
            </div>

            <div>
              <Label htmlFor="refillThreshold">
                Refill When Below{' '}
                <span className="text-xs font-normal">
                  (
                  {targetUnit === 'measurement'
                    ? measurementUnit
                    : packageUnit || 'pack'}
                  )
                </span>
              </Label>
              <Input
                id="refillThreshold"
                type="number"
                min={0}
                step={consumeAmount || 1}
                value={refillThreshold}
                onChange={(e) => setRefillThreshold(Number(e.target.value))}
              />
              <p className="text-xs text-foreground-muted">
                Shows warning on low stock
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="consumeAmount">
              Amount per Consume{' '}
              <span className="text-xs font-normal">
                (
                {targetUnit === 'measurement'
                  ? measurementUnit
                  : packageUnit || 'pack'}
                )
              </span>
            </Label>
            <Input
              id="consumeAmount"
              type="number"
              step="0.01"
              min={0}
              value={consumeAmount}
              onChange={(e) => setConsumeAmount(Number(e.target.value))}
              required
            />
            <p className="text-xs text-foreground-muted">
              Amount added/removed per +/- button click
            </p>
          </div>

          {/* Expiration configuration (how to track expiration) */}
          <div>
            <Label htmlFor="expirationMode">Calculate Expiration based on</Label>
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

          <div>
            <Label htmlFor="expirationThreshold">
              Warning in <span className="text-xs font-normal">(days)</span>
            </Label>
            <Input
              id="expirationThreshold"
              type="number"
              min={0}
              value={expirationThreshold}
              onChange={(e) => setExpirationThreshold(e.target.value)}
            />
            <p className="text-xs text-foreground-muted">
              Shows warning when about to expire
            </p>
          </div>
        </div>
      )}

      {/* Advanced Configuration Section */}
      {showAdvanced && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
            <div className="h-px bg-accessory-emphasized" />
            <h2 className="text-sm font-medium uppercase">
              Advanced Configuration
            </h2>
            <div className="h-px bg-accessory-emphasized" />
          </div>

          <div>
            <div className="flex items-center gap-3">
              <Switch
                id="targetUnit"
                checked={targetUnit === 'measurement'}
                onCheckedChange={handleTargetUnitChange}
              />
              <Label htmlFor="targetUnit" className="cursor-pointer">
                Track in measurement{' '}
                <span className="text-xs font-normal">
                  ({measurementUnit || '?'})
                </span>
              </Label>
            </div>
            <p className="text-xs text-foreground-muted">
              Turn on to enable precise measurement tracking
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="measurementUnit">Measurement Unit</Label>
              <Input
                id="measurementUnit"
                value={measurementUnit}
                onChange={(e) => setMeasurementUnit(e.target.value)}
                disabled={targetUnit !== 'measurement'}
              />
              <p className="text-xs text-foreground-muted">
                Precise unit like g / lb / ml
              </p>
            </div>

            <div>
              <Label htmlFor="amountPerPackage">
                Amount per Package
                {measurementUnit && (
                  <span className="text-xs font-normal"> ({measurementUnit})</span>
                )}
              </Label>
              <Input
                id="amountPerPackage"
                type="number"
                step="1"
                min={1}
                value={amountPerPackage}
                onChange={(e) => setAmountPerPackage(e.target.value)}
                disabled={targetUnit !== 'measurement'}
              />
              <p className="text-xs text-foreground-muted">
                How many {measurementUnit || '?'} per pack
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="space-y-2">
        <Button
          type="submit"
          disabled={isSubmitDisabled}
          className="w-full"
        >
          {submitLabel}
        </Button>
        {isDirty && validationMessage && (
          <p className="text-sm text-destructive">{validationMessage}</p>
        )}
      </div>
    </form>
  )
}
```

**Step 2: Run the tests**

```bash
pnpm test src/components/ItemForm.test.tsx
```
Expected: all tests pass

**Step 3: Commit**

```bash
git add src/components/ItemForm.tsx src/components/ItemForm.test.tsx
git commit -m "feat(item-form): add shared ItemForm component with create mode"
```

---

### Task 4: Write failing tests for ItemForm edit mode

**Files:**
- Modify: `src/components/ItemForm.test.tsx`

**Step 1: Add edit-mode tests**

Append to `src/components/ItemForm.test.tsx`:

```tsx
describe('ItemForm — edit mode (with onDirtyChange)', () => {
  const editInitialValues: ItemFormValues = {
    packedQuantity: 2,
    unpackedQuantity: 0,
    dueDate: '',
    estimatedDueDays: '',
    name: 'Milk',
    packageUnit: 'pack',
    targetQuantity: 3,
    refillThreshold: 1,
    consumeAmount: 1,
    expirationMode: 'date',
    expirationThreshold: '',
    targetUnit: 'package',
    measurementUnit: '',
    amountPerPackage: '',
  }

  it('renders Stock Status section when sections includes stock', () => {
    render(
      <ItemForm
        initialValues={editInitialValues}
        sections={['stock', 'info', 'advanced']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Stock Status')).toBeInTheDocument()
  })

  it('submit button disabled when form is clean', () => {
    render(
      <ItemForm
        initialValues={editInitialValues}
        sections={['stock', 'info', 'advanced']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('submit button enabled when form is dirty', async () => {
    const user = userEvent.setup()
    render(
      <ItemForm
        initialValues={editInitialValues}
        sections={['stock', 'info', 'advanced']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )
    const nameInput = screen.getByLabelText(/Name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Oat Milk')
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
  })

  it('calls onDirtyChange(true) when a field is changed', async () => {
    const user = userEvent.setup()
    const handleDirtyChange = vi.fn()
    render(
      <ItemForm
        initialValues={editInitialValues}
        sections={['stock', 'info', 'advanced']}
        onSubmit={vi.fn()}
        onDirtyChange={handleDirtyChange}
      />,
    )
    const nameInput = screen.getByLabelText(/Name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Oat Milk')
    expect(handleDirtyChange).toHaveBeenCalledWith(true)
  })

  it('pre-fills fields from initialValues', () => {
    render(
      <ItemForm
        initialValues={editInitialValues}
        sections={['stock', 'info', 'advanced']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )
    expect(screen.getByDisplayValue('Milk')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2')).toBeInTheDocument() // packedQuantity
  })
})
```

**Step 2: Run tests to confirm new ones fail**

```bash
pnpm test src/components/ItemForm.test.tsx
```
Expected: the new edit-mode tests fail (currently `ItemForm` doesn't accept `sections` with stock, or doesn't disable save when clean).

Wait — actually the ItemForm code in Task 3 already handles most of these cases. Run the tests and see which ones fail. Fix any issues in `ItemForm.tsx` before moving to the next task.

Expected: all tests pass once ItemForm implementation is complete.

**Step 3: Commit**

```bash
git add src/components/ItemForm.test.tsx
git commit -m "test(item-form): add edit mode tests for shared ItemForm"
```

---

### Task 5: Refactor the edit route to use ItemForm

**Files:**
- Modify: `src/routes/items/$id/index.tsx`

**Step 1: Run existing tests to establish baseline**

```bash
pnpm test src/routes/items/\$id.test.tsx
```
Expected: all existing tests pass (this is the baseline before refactoring)

**Step 2: Replace the edit route implementation**

Replace the entire contents of `src/routes/items/$id/index.tsx` with:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { ItemForm } from '@/components/ItemForm'
import type { ItemFormValues } from '@/components/ItemForm'
import { useItem, useUpdateItem } from '@/hooks'
import { useItemLayout } from '@/hooks/useItemLayout'
import type { Item } from '@/types'

export const Route = createFileRoute('/items/$id/')({
  component: ItemDetailTab,
})

function itemToFormValues(item: Item): ItemFormValues {
  return {
    packedQuantity: item.packedQuantity,
    unpackedQuantity: item.unpackedQuantity ?? 0,
    dueDate: item.dueDate ? item.dueDate.toISOString().split('T')[0] : '',
    estimatedDueDays: item.estimatedDueDays ?? '',
    name: item.name,
    packageUnit: item.packageUnit ?? '',
    measurementUnit: item.measurementUnit ?? '',
    amountPerPackage: item.amountPerPackage ?? '',
    targetUnit: item.targetUnit,
    targetQuantity: item.targetQuantity,
    refillThreshold: item.refillThreshold,
    consumeAmount: item.consumeAmount ?? 1,
    expirationMode: item.estimatedDueDays ? 'days' : 'date',
    expirationThreshold: item.expirationThreshold ?? '',
  }
}

function buildUpdates(values: ItemFormValues) {
  const updates: Record<string, unknown> = {
    packedQuantity: values.packedQuantity,
    unpackedQuantity: values.unpackedQuantity,
    name: values.name,
    targetUnit: values.targetUnit,
    targetQuantity: values.targetQuantity,
    refillThreshold: values.refillThreshold,
    consumeAmount: values.consumeAmount,
  }

  if (values.expirationMode === 'date' && values.dueDate) {
    updates.dueDate = new Date(values.dueDate as string)
    updates.estimatedDueDays = undefined
  } else if (values.expirationMode === 'days' && values.estimatedDueDays) {
    updates.estimatedDueDays = Number(values.estimatedDueDays)
    updates.dueDate = undefined
  } else {
    updates.dueDate = undefined
    updates.estimatedDueDays = undefined
  }

  updates.packageUnit = values.packageUnit || undefined
  updates.measurementUnit = values.measurementUnit || undefined
  updates.amountPerPackage = values.amountPerPackage
    ? Number(values.amountPerPackage)
    : undefined
  updates.expirationThreshold = values.expirationThreshold
    ? Number(values.expirationThreshold)
    : undefined

  return updates
}

function ItemDetailTab() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const updateItem = useUpdateItem()
  const { registerDirtyState } = useItemLayout()
  const [savedAt, setSavedAt] = useState(0)

  if (!item) return null

  const formValues = itemToFormValues(item)

  const handleSubmit = (values: ItemFormValues) => {
    updateItem.mutate(
      { id, updates: buildUpdates(values) },
      { onSuccess: () => setSavedAt((n) => n + 1) },
    )
  }

  return (
    <ItemForm
      initialValues={formValues}
      sections={['stock', 'info', 'advanced']}
      onSubmit={handleSubmit}
      onDirtyChange={registerDirtyState}
      savedAt={savedAt}
    />
  )
}
```

**Step 3: Run existing tests to verify nothing regressed**

```bash
pnpm test src/routes/items/\$id.test.tsx
```
Expected: all tests pass

**Step 4: Run all tests**

```bash
pnpm test
```
Expected: all tests pass

**Step 5: Commit**

```bash
git add src/routes/items/\$id/index.tsx
git commit -m "refactor(item-detail): replace inline form with shared ItemForm component"
```

---

### Task 6: Refactor the new item route to use ItemForm

**Files:**
- Modify: `src/routes/items/new.tsx`

**Step 1: Replace the new item route implementation**

Replace the entire contents of `src/routes/items/new.tsx` with:

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { ItemForm } from '@/components/ItemForm'
import type { ItemFormValues } from '@/components/ItemForm'
import { Button } from '@/components/ui/button'
import { useCreateItem } from '@/hooks'
import type { Item } from '@/types'

export const Route = createFileRoute('/items/new')({
  component: NewItemPage,
})

function buildCreateData(
  values: ItemFormValues,
): Omit<Item, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: values.name,
    targetUnit: values.targetUnit,
    targetQuantity: values.targetQuantity,
    refillThreshold: values.refillThreshold,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: values.consumeAmount,
    tagIds: [],
    packageUnit: values.packageUnit || undefined,
    measurementUnit: values.measurementUnit || undefined,
    amountPerPackage: values.amountPerPackage
      ? Number(values.amountPerPackage)
      : undefined,
    expirationThreshold: values.expirationThreshold
      ? Number(values.expirationThreshold)
      : undefined,
  }
}

function NewItemPage() {
  const navigate = useNavigate()
  const createItem = useCreateItem()

  const handleSubmit = (values: ItemFormValues) => {
    createItem.mutate(buildCreateData(values), {
      onSuccess: (newItem) => {
        navigate({ to: '/items/$id', params: { id: newItem.id } })
      },
    })
  }

  return (
    <div className="min-h-screen">
      {/* Fixed Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-background-elevated border-b">
        <div className="flex items-center gap-3 p-4">
          <Button
            variant="neutral-ghost"
            size="icon"
            onClick={() => navigate({ to: '/' })}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">New Item</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-20 p-4">
        <ItemForm onSubmit={handleSubmit} />
      </div>
    </div>
  )
}
```

**Step 2: Run all tests**

```bash
pnpm test
```
Expected: all tests pass

**Step 3: Commit**

```bash
git add src/routes/items/new.tsx
git commit -m "refactor(new-item): replace inline form with shared ItemForm component, remove tags"
```

---

### Task 7: Create Storybook stories

**Files:**
- Create: `src/components/ItemForm.stories.tsx`

**Step 1: Create the stories file**

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { ItemForm } from './ItemForm'
import type { ItemFormValues } from './ItemForm'

const meta: Meta<typeof ItemForm> = {
  title: 'Components/ItemForm',
  component: ItemForm,
  args: {
    onSubmit: fn(),
    onDirtyChange: fn(),
  },
}

export default meta
type Story = StoryObj<typeof ItemForm>

const editValues: ItemFormValues = {
  packedQuantity: 3,
  unpackedQuantity: 0,
  dueDate: '',
  estimatedDueDays: '',
  name: 'Whole Milk',
  packageUnit: 'carton',
  targetQuantity: 4,
  refillThreshold: 2,
  consumeAmount: 1,
  expirationMode: 'days',
  expirationThreshold: 3,
  targetUnit: 'package',
  measurementUnit: '',
  amountPerPackage: '',
}

const measurementValues: ItemFormValues = {
  ...editValues,
  name: 'Olive Oil',
  packageUnit: 'bottle',
  targetUnit: 'measurement',
  measurementUnit: 'ml',
  amountPerPackage: 750,
  targetQuantity: 1500,
  refillThreshold: 250,
  consumeAmount: 15,
  unpackedQuantity: 300,
}

export const CreateMode: Story = {
  name: 'Create Mode',
  args: {
    onDirtyChange: undefined,
  },
}

export const EditMode: Story = {
  name: 'Edit Mode (all sections)',
  args: {
    initialValues: editValues,
    sections: ['stock', 'info', 'advanced'],
  },
}

export const EditMeasurementMode: Story = {
  name: 'Edit Mode (measurement tracking)',
  args: {
    initialValues: measurementValues,
    sections: ['stock', 'info', 'advanced'],
  },
}

export const EditValidationError: Story = {
  name: 'Edit Mode (validation error)',
  args: {
    initialValues: {
      ...editValues,
      targetUnit: 'measurement',
      measurementUnit: '',
      amountPerPackage: '',
      // Make form dirty by changing name
      name: 'Soy Milk',
    },
    sections: ['stock', 'info', 'advanced'],
  },
}
```

**Step 2: Verify Storybook renders without errors**

```bash
pnpm storybook
```
Open `http://localhost:6006` and check all four ItemForm stories render correctly. Confirm:
- CreateMode: no Stock section, submit enabled when name is filled
- EditMode: all three sections, save button disabled (form starts clean)
- EditMeasurementMode: measurement fields enabled and populated
- EditValidationError: save button disabled, validation message visible

**Step 3: Commit**

```bash
git add src/components/ItemForm.stories.tsx
git commit -m "feat(item-form): add Storybook stories for ItemForm component"
```

---

### Task 8: Final verification

**Step 1: Run the full test suite**

```bash
pnpm test
```
Expected: all tests pass, no regressions

**Step 2: Run the linter**

```bash
pnpm lint
```
Expected: no lint errors

**Step 3: Build to verify no TypeScript errors**

```bash
pnpm build
```
Expected: build succeeds with no type errors

**Step 4: Update CLAUDE.md if needed**

Check `CLAUDE.md` for any mentions of the item form structure that need updating (e.g., if the file says "Item Info tab not yet implemented" — that section now exists in the shared component). Update if needed.

**Step 5: Commit any doc updates and push**

```bash
git status
git add -p   # review and stage only relevant changes
git commit -m "docs(claude): update item form documentation"
```

---

## Checklist Before PR

- [ ] `pnpm test` passes
- [ ] `pnpm lint` clean
- [ ] `pnpm build` succeeds
- [ ] All four Storybook stories render correctly
- [ ] New item form (`/items/new`) shows Info + Advanced sections only (no tags)
- [ ] Edit form (`/items/$id`) shows all three sections with correct pre-fill
- [ ] Save button disabled when edit form is clean, enabled when dirty
- [ ] Measurement mode validation works in both forms
- [ ] Background sync (pantry +/- buttons) doesn't overwrite unsaved edits
- [ ] CLAUDE.md updated if architecture changed
