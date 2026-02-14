# Manual Quantity Input Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to manually set current inventory quantities (packed/unpacked) in the item detail form.

**Architecture:** Add two number input fields to ItemForm component - "Packed Quantity" (always visible) and "Unpacked Quantity" (visible only for dual-unit items). Form submission directly updates item.packedQuantity and item.unpackedQuantity without creating inventory logs. Validation ensures non-negative values and warns when unpacked exceeds amountPerPackage.

**Tech Stack:** React 19, TypeScript, Vitest, React Testing Library, Storybook

---

## Task 1: Add Packed Quantity Field to ItemForm (TDD)

**Files:**
- Modify: `src/components/ItemForm.tsx:1-322`
- Test: `src/components/ItemForm.test.tsx` (create new)

**Step 1: Write failing test for packed quantity field**

Create test file:

```typescript
// src/components/ItemForm.test.tsx
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ItemForm } from './ItemForm'

// Mock the hooks
vi.mock('@/hooks/useTags', () => ({
  useTags: () => ({ data: [] }),
  useTagTypes: () => ({ data: [] }),
}))

describe('ItemForm - Packed Quantity', () => {
  it('renders packed quantity field', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByLabelText(/packed quantity/i)).toBeInTheDocument()
  })

  it('initializes packed quantity from initialData', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{ packedQuantity: 5 }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByLabelText(/packed quantity/i) as HTMLInputElement
    expect(input.value).toBe('5')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test ItemForm.test.tsx`

Expected: FAIL - "Unable to find label with text /packed quantity/i"

**Step 3: Add packed quantity field to ItemForm**

Modify `src/components/ItemForm.tsx`:

```typescript
// Add state after line 55 (after tagIds state)
const [packedQuantity, setPackedQuantity] = useState(
  initialData?.packedQuantity ?? 0,
)

// Add field before "Expiration" section (after line 220, before line 222)
// Insert this between "Amount per Consume" and "Expiration":

<div className="border-t pt-6 space-y-4">
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
    <p className="text-xs text-foreground-muted">
      Number of whole packages currently in stock
    </p>
  </div>
</div>

// Update handleSubmit function (around line 63) to include packedQuantity
const data: ItemFormData = {
  name,
  targetUnit,
  targetQuantity,
  refillThreshold,
  packedQuantity,  // Change from hardcoded 0
  unpackedQuantity: 0,
  consumeAmount,
  tagIds,
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test ItemForm.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ItemForm.tsx src/components/ItemForm.test.tsx
git commit -m "feat(form): add packed quantity input field

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Add Unpacked Quantity Field for Dual-Unit Items (TDD)

**Files:**
- Modify: `src/components/ItemForm.tsx:1-322`
- Modify: `src/components/ItemForm.test.tsx`

**Step 1: Write failing test for unpacked quantity field**

Add to `src/components/ItemForm.test.tsx`:

```typescript
describe('ItemForm - Unpacked Quantity', () => {
  it('hides unpacked quantity field for package-only items', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{ targetUnit: 'package' }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    expect(screen.queryByLabelText(/unpacked quantity/i)).not.toBeInTheDocument()
  })

  it('shows unpacked quantity field for dual-unit items', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          packageUnit: 'bottle',
          measurementUnit: 'L',
          targetUnit: 'measurement',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByLabelText(/unpacked quantity/i)).toBeInTheDocument()
  })

  it('initializes unpacked quantity from initialData', () => {
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          packageUnit: 'bottle',
          measurementUnit: 'L',
          targetUnit: 'measurement',
          unpackedQuantity: 0.5,
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByLabelText(/unpacked quantity/i) as HTMLInputElement
    expect(input.value).toBe('0.5')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test ItemForm.test.tsx`

Expected: FAIL - "Unable to find label with text /unpacked quantity/i"

**Step 3: Add unpacked quantity field conditionally**

Modify `src/components/ItemForm.tsx`:

```typescript
// Add state after packedQuantity state
const [unpackedQuantity, setUnpackedQuantity] = useState(
  initialData?.unpackedQuantity ?? 0,
)

// Add field after packed quantity field (inside the border-t div)
{targetUnit === 'measurement' && measurementUnit && (
  <div className="space-y-2">
    <Label htmlFor="unpackedQuantity">Unpacked Quantity</Label>
    <Input
      id="unpackedQuantity"
      type="number"
      min={0}
      step={0.01}
      value={unpackedQuantity}
      onChange={(e) => setUnpackedQuantity(Number(e.target.value))}
      placeholder="0"
    />
    <p className="text-xs text-foreground-muted">
      Loose amount ({measurementUnit}) from opened package
    </p>
  </div>
)}

// Update handleSubmit to include unpackedQuantity
const data: ItemFormData = {
  name,
  targetUnit,
  targetQuantity,
  refillThreshold,
  packedQuantity,
  unpackedQuantity,  // Change from hardcoded 0
  consumeAmount,
  tagIds,
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test ItemForm.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ItemForm.tsx src/components/ItemForm.test.tsx
git commit -m "feat(form): add unpacked quantity field for dual-unit items

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Add Validation for Negative Values (TDD)

**Files:**
- Modify: `src/components/ItemForm.test.tsx`
- Modify: `src/components/ItemForm.tsx:1-322`

**Step 1: Write failing test for negative value validation**

Add to `src/components/ItemForm.test.tsx`:

```typescript
describe('ItemForm - Validation', () => {
  it('prevents negative packed quantity', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{ name: 'Test Item' }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByLabelText(/packed quantity/i)
    await user.clear(input)
    await user.type(input, '-5')

    const submitButton = screen.getByRole('button', { name: /save/i })
    await user.click(submitButton)

    // Form should not submit with negative value
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('prevents negative unpacked quantity', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ItemForm
        initialData={{
          name: 'Test Item',
          packageUnit: 'bottle',
          measurementUnit: 'L',
          targetUnit: 'measurement',
        }}
        submitLabel="Save"
        onSubmit={onSubmit}
      />,
    )

    const input = screen.getByLabelText(/unpacked quantity/i)
    await user.clear(input)
    await user.type(input, '-0.5')

    const submitButton = screen.getByRole('button', { name: /save/i })
    await user.click(submitButton)

    // Form should not submit with negative value
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test ItemForm.test.tsx`

Expected: FAIL - "expect(onSubmit).not.toHaveBeenCalled()" fails because HTML5 min validation may not prevent form submission in test environment

**Step 3: Add custom validation logic**

Modify `src/components/ItemForm.tsx`:

```typescript
// Add validation state
const [errors, setErrors] = useState<Record<string, string>>({})

// Update handleSubmit function to validate before submitting
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault()

  // Validate
  const newErrors: Record<string, string> = {}

  if (packedQuantity < 0) {
    newErrors.packedQuantity = 'Must be 0 or greater'
  }

  if (unpackedQuantity < 0) {
    newErrors.unpackedQuantity = 'Must be 0 or greater'
  }

  if (Object.keys(newErrors).length > 0) {
    setErrors(newErrors)
    return
  }

  setErrors({})

  // ... rest of existing handleSubmit code
}

// Add error display below packed quantity input
{errors.packedQuantity && (
  <p className="text-xs text-status-error">{errors.packedQuantity}</p>
)}

// Add error display below unpacked quantity input
{errors.unpackedQuantity && (
  <p className="text-xs text-status-error">{errors.unpackedQuantity}</p>
)}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test ItemForm.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ItemForm.tsx src/components/ItemForm.test.tsx
git commit -m "feat(form): add validation for negative quantities

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Add Warning for Excess Unpacked Quantity (TDD)

**Files:**
- Modify: `src/components/ItemForm.test.tsx`
- Modify: `src/components/ItemForm.tsx:1-322`

**Step 1: Write failing test for excess unpacked warning**

Add to `src/components/ItemForm.test.tsx`:

```typescript
it('shows warning when unpacked quantity exceeds amountPerPackage', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  render(
    <ItemForm
      initialData={{
        name: 'Test Item',
        packageUnit: 'bottle',
        measurementUnit: 'L',
        amountPerPackage: 1,
        targetUnit: 'measurement',
      }}
      submitLabel="Save"
      onSubmit={onSubmit}
    />,
  )

  const input = screen.getByLabelText(/unpacked quantity/i)
  await user.clear(input)
  await user.type(input, '1.5')

  // Trigger validation by attempting to submit
  const submitButton = screen.getByRole('button', { name: /save/i })
  await user.click(submitButton)

  expect(
    screen.getByText(/should be less than 1 L/i),
  ).toBeInTheDocument()
  expect(onSubmit).not.toHaveBeenCalled()
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test ItemForm.test.tsx`

Expected: FAIL - "Unable to find text matching /should be less than 1 L/i"

**Step 3: Add validation for excess unpacked quantity**

Modify `src/components/ItemForm.tsx`:

```typescript
// In handleSubmit validation section, add check for excess unpacked
if (
  targetUnit === 'measurement' &&
  amountPerPackage &&
  unpackedQuantity >= Number(amountPerPackage)
) {
  newErrors.unpackedQuantity = `Should be less than ${amountPerPackage} ${measurementUnit}. Consider adding to packed quantity.`
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test ItemForm.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ItemForm.tsx src/components/ItemForm.test.tsx
git commit -m "feat(form): warn when unpacked exceeds package amount

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Create Storybook Stories for Manual Quantity Input

**Files:**
- Create: `src/components/ItemForm.stories.tsx`

**Step 1: Create Storybook story file**

```typescript
// src/components/ItemForm.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ItemForm } from './ItemForm'

const meta: Meta<typeof ItemForm> = {
  title: 'Components/ItemForm',
  component: ItemForm,
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof ItemForm>

export const NewItem: Story = {
  args: {
    submitLabel: 'Create Item',
    onSubmit: (data) => console.log('Submit:', data),
  },
}

export const EditPackageOnlyItem: Story = {
  args: {
    initialData: {
      name: 'Rice',
      packageUnit: 'pack',
      targetUnit: 'package',
      targetQuantity: 5,
      refillThreshold: 2,
      packedQuantity: 3,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    },
    submitLabel: 'Save Changes',
    onSubmit: (data) => console.log('Submit:', data),
  },
}

export const EditDualUnitItem: Story = {
  args: {
    initialData: {
      name: 'Milk',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      targetQuantity: 5,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 0.5,
      consumeAmount: 0.25,
      tagIds: [],
    },
    submitLabel: 'Save Changes',
    onSubmit: (data) => console.log('Submit:', data),
  },
}

export const ValidationErrors: Story = {
  args: {
    initialData: {
      name: 'Test Item',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      targetQuantity: 5,
      refillThreshold: 1,
      packedQuantity: -1,  // Invalid
      unpackedQuantity: 1.5,  // Exceeds amountPerPackage
      consumeAmount: 1,
      tagIds: [],
    },
    submitLabel: 'Save Changes',
    onSubmit: (data) => console.log('Submit:', data),
  },
}
```

**Step 2: Verify stories render correctly**

Run: `pnpm storybook`

Navigate to "Components/ItemForm" and verify:
- "New Item" shows empty form with packed quantity at 0
- "Edit Package Only Item" shows packed quantity field only (3 packs)
- "Edit Dual Unit Item" shows both packed (2) and unpacked (0.5 L) fields
- "Validation Errors" shows error messages when submit is clicked

**Step 3: Commit**

```bash
git add src/components/ItemForm.stories.tsx
git commit -m "docs(storybook): add ItemForm stories

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Add Integration Test for Item Detail Page (TDD)

**Files:**
- Create: `src/routes/items/$id.test.tsx`

**Step 1: Write integration test**

```typescript
// src/routes/items/$id.test.tsx
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
import { createItem } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Item detail page - manual quantity input', () => {
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

  const renderItemDetailPage = (itemId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/items/${itemId}`],
    })
    const router = createRouter({ routeTree, history })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can manually set packed quantity', async () => {
    const user = userEvent.setup()

    // Given an item with initial quantities
    const item = await createItem({
      name: 'Test Item',
      packageUnit: 'pack',
      targetUnit: 'package',
      targetQuantity: 5,
      refillThreshold: 2,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    // When user opens item detail page
    await waitFor(() => {
      expect(screen.getByLabelText(/packed quantity/i)).toBeInTheDocument()
    })

    // Initial value should be 2
    const packedInput = screen.getByLabelText(/packed quantity/i) as HTMLInputElement
    expect(packedInput.value).toBe('2')

    // When user changes packed quantity to 5
    await user.clear(packedInput)
    await user.type(packedInput, '5')

    // And saves the form
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then item is updated in database
    await waitFor(async () => {
      const updatedItem = await db.items.get(item.id)
      expect(updatedItem?.packedQuantity).toBe(5)
    })

    // And no inventory log is created
    const logs = await db.inventoryLogs.where('itemId').equals(item.id).toArray()
    expect(logs).toHaveLength(0)
  })

  it('user can manually set unpacked quantity for dual-unit items', async () => {
    const user = userEvent.setup()

    // Given a dual-unit item
    const item = await createItem({
      name: 'Milk',
      packageUnit: 'bottle',
      measurementUnit: 'L',
      amountPerPackage: 1,
      targetUnit: 'measurement',
      targetQuantity: 5,
      refillThreshold: 1,
      packedQuantity: 2,
      unpackedQuantity: 0,
      consumeAmount: 0.25,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/unpacked quantity/i)).toBeInTheDocument()
    })

    // When user sets unpacked quantity to 0.5
    const unpackedInput = screen.getByLabelText(/unpacked quantity/i)
    await user.clear(unpackedInput)
    await user.type(unpackedInput, '0.5')

    // And saves the form
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then item is updated in database
    await waitFor(async () => {
      const updatedItem = await db.items.get(item.id)
      expect(updatedItem?.unpackedQuantity).toBe(0.5)
    })
  })

  it('hides unpacked quantity field for package-only items', async () => {
    // Given a package-only item
    const item = await createItem({
      name: 'Rice',
      packageUnit: 'pack',
      targetUnit: 'package',
      targetQuantity: 5,
      refillThreshold: 2,
      packedQuantity: 3,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    await waitFor(() => {
      expect(screen.getByLabelText(/packed quantity/i)).toBeInTheDocument()
    })

    // Unpacked field should not be visible
    expect(screen.queryByLabelText(/unpacked quantity/i)).not.toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it passes**

Run: `pnpm test items/\$id.test.tsx`

Expected: PASS (all tests should pass because implementation is already complete from previous tasks)

**Step 3: Commit**

```bash
git add src/routes/items/\$id.test.tsx
git commit -m "test(item-detail): add integration tests for manual quantity input

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Visual Refinement - Add Section Divider

**Files:**
- Modify: `src/components/ItemForm.tsx:1-322`

**Step 1: Add visual separator for Current Inventory section**

The "Current Inventory" section should have a visual distinction from other fields. Currently it uses `border-t pt-6` which adds a top border.

Let's improve it with a section heading:

```typescript
// Update the "Current Inventory" section wrapper
<div className="border-t pt-6 space-y-4">
  <h3 className="text-sm font-medium text-foreground-muted">
    Current Inventory
  </h3>
  <div className="space-y-2">
    <Label htmlFor="packedQuantity">Packed Quantity</Label>
    {/* ... rest of packed quantity field ... */}
  </div>
  {/* ... unpacked quantity field ... */}
</div>
```

**Step 2: Verify in Storybook**

Run: `pnpm storybook`

Navigate to "Components/ItemForm" stories and verify the "Current Inventory" heading appears above the quantity fields.

**Step 3: Commit**

```bash
git add src/components/ItemForm.tsx
git commit -m "style(form): add section heading for current inventory

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Update Documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Document the new feature**

Add section to CLAUDE.md under "Key Patterns" or create a new "Features" section:

```markdown
## Features

### Manual Quantity Input

Users can manually set current inventory quantities in the item detail form:
- **Packed Quantity** - Number of whole packages (always visible)
- **Unpacked Quantity** - Loose amount from opened packages (only for dual-unit items)

**Location:** Item detail page (`/items/$id`) via ItemForm component

**Behavior:**
- Pre-populates with current `item.packedQuantity` and `item.unpackedQuantity`
- Validates non-negative values
- Warns when unpacked ≥ amountPerPackage
- Saves directly to database without creating inventory log entries
- Use for initial setup, corrections, or adjustments

**Files:**
- `src/components/ItemForm.tsx` - Form component with quantity fields
- `src/components/ItemForm.test.tsx` - Component tests
- `src/components/ItemForm.stories.tsx` - Storybook stories
- `src/routes/items/$id.test.tsx` - Integration tests
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document manual quantity input feature

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Final Verification

**Files:**
- All modified files

**Step 1: Run all tests**

Run: `pnpm test`

Expected: All tests pass

**Step 2: Run linter**

Run: `pnpm lint`

Expected: No errors

**Step 3: Check Storybook**

Run: `pnpm storybook`

Verify all ItemForm stories render correctly and validation works as expected.

**Step 4: Manual testing in dev server**

Run: `pnpm dev`

1. Create a new package-only item
   - Verify packed quantity field is visible
   - Verify unpacked quantity field is NOT visible
   - Set packed quantity to 3 and save
   - Verify item detail page shows 3 in the packed quantity field

2. Create a new dual-unit item (e.g., milk in bottles, tracked in L)
   - Verify both packed and unpacked quantity fields are visible
   - Set packed to 2 and unpacked to 0.5
   - Save and verify values persist
   - Verify no inventory log entry was created

3. Test validation
   - Try to enter negative packed quantity - verify error
   - Try to enter negative unpacked quantity - verify error
   - Enter unpacked value > amountPerPackage - verify warning
   - Verify form doesn't submit with errors

**Step 5: Commit verification results**

If any issues found, fix them and commit. Otherwise, mark task complete.

---

## Completion Checklist

- [x] Task 1: Add Packed Quantity Field
- [x] Task 2: Add Unpacked Quantity Field
- [x] Task 3: Add Validation for Negative Values
- [x] Task 4: Add Warning for Excess Unpacked Quantity
- [x] Task 5: Create Storybook Stories
- [x] Task 6: Add Integration Test
- [x] Task 7: Visual Refinement
- [x] Task 8: Update Documentation
- [x] Task 9: Final Verification

## Post-Implementation

After all tasks complete:

**REQUIRED SUB-SKILL:** Use superpowers:finishing-a-development-branch to complete this work.
