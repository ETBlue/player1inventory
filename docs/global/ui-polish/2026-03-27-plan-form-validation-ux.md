# Form Validation UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show validation error messages and red-border visual state under invalid form inputs immediately on page load, so users can see why the Save button is disabled.

**Architecture:** Add an `error?: string` prop to the shared `Input` component that renders red-border styling and a message below the field. Each form derives an inline `errors` object from current field values — no new state, no validation library. The Save button's `disabled` condition unifies with the errors object.

**Tech Stack:** React 19, TypeScript (strict), Tailwind CSS v4, react-i18next, Vitest + React Testing Library, Storybook

**Worktree:** `.worktrees/feature-form-validation-ux` · **Branch:** `feature/form-validation-ux`

---

## File Structure

**Modified files:**
- `apps/web/src/components/ui/input.tsx` — add `error?: string` prop, red-border class, error message render
- `apps/web/src/components/ui/input.stories.tsx` — add `WithError` story
- `apps/web/src/components/ui/input.stories.test.tsx` — add smoke test for `WithError` story
- `apps/web/src/i18n/locales/en.json` — add `validation.required` and `validation.positiveNumber` keys
- `apps/web/src/i18n/locales/tw.json` — same keys in Traditional Chinese
- `apps/web/src/components/vendor/VendorNameForm/index.tsx` — derive nameError, thread to Input, update button disabled
- `apps/web/src/components/vendor/VendorNameForm/VendorNameForm.stories.tsx` — add `WithError` story
- `apps/web/src/components/vendor/VendorNameForm/VendorNameForm.stories.test.tsx` — add smoke test
- `apps/web/src/components/recipe/RecipeNameForm/index.tsx` — same as VendorNameForm
- `apps/web/src/components/recipe/RecipeNameForm/RecipeNameForm.stories.tsx` — add `WithError` story
- `apps/web/src/components/recipe/RecipeNameForm/RecipeNameForm.stories.test.tsx` — add smoke test
- `apps/web/src/components/tag/TagNameForm/index.tsx` — same as VendorNameForm (also add `useTranslation`)
- `apps/web/src/components/AddNameDialog/index.tsx` — derive nameError, thread to Input, disable submit button when empty
- `apps/web/src/components/item/ItemForm/index.tsx` — derive errors per field, remove old `validationMessage` block, thread errors to Inputs, update `isSubmitDisabled`
- `apps/web/src/components/item/ItemForm/ItemForm.stories.tsx` — add `CreateModeEmptyError` story
- `apps/web/src/components/item/ItemForm/ItemForm.test.tsx` — add/update validation error tests

---

## Task 1: Update `Input` component and i18n strings

**Files:**
- Modify: `apps/web/src/components/ui/input.tsx`
- Modify: `apps/web/src/components/ui/input.stories.tsx`
- Modify: `apps/web/src/components/ui/input.stories.test.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/tw.json`

- [ ] **Step 1.1: Write failing test for Input `error` prop**

Add to `apps/web/src/components/ui/input.stories.test.tsx` — add a new `describe` block after the existing smoke tests:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Input } from './input'

describe('Input error prop', () => {
  it('shows error message when error prop is set', () => {
    render(<Input error="This field is required." />)
    expect(screen.getByText('This field is required.')).toBeInTheDocument()
  })

  it('applies destructive border class when error prop is set', () => {
    const { container } = render(<Input error="Error" />)
    expect(container.querySelector('input')).toHaveClass('border-destructive')
  })

  it('does not show error message when error prop is undefined', () => {
    render(<Input placeholder="test" />)
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux && pnpm test --run src/components/ui/input.stories.test.tsx
```

Expected: FAIL — `error` prop does not exist yet on `Input`

- [ ] **Step 1.3: Update `Input` component**

Replace the entire contents of `apps/web/src/components/ui/input.tsx` with:

```tsx
import * as React from 'react'

import { cn } from '@/lib/utils'

interface InputProps extends React.ComponentProps<'input'> {
  error?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          type={type}
          className={cn(
            `flex h-10 w-full px-2 py-0
            file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground
            placeholder:text-accessory-emphasized
            disabled:cursor-not-allowed disabled:opacity-50 md:text-sm
            border border-accessory bg-background-surface `,
            error && 'border-destructive focus-visible:ring-destructive',
            className,
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="text-sm text-destructive mt-1">{error}</p>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'

export { Input }
```

- [ ] **Step 1.4: Run test to verify it passes**

```bash
cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux && pnpm test --run src/components/ui/input.stories.test.tsx
```

Expected: all tests PASS

- [ ] **Step 1.5: Add `WithError` story to `input.stories.tsx`**

Add after the `WithValue` story in `apps/web/src/components/ui/input.stories.tsx`:

```tsx
export const WithError: Story = {
  args: {
    value: '',
    error: 'This field is required.',
  },
}
```

- [ ] **Step 1.6: Add i18n validation keys to `en.json`**

In `apps/web/src/i18n/locales/en.json`, add a new top-level `"validation"` key after `"common"`:

```json
"validation": {
  "required": "This field is required.",
  "positiveNumber": "Must be greater than 0."
},
```

- [ ] **Step 1.7: Add matching keys to `tw.json`**

In `apps/web/src/i18n/locales/tw.json`, add the same `"validation"` key after `"common"`:

```json
"validation": {
  "required": "此欄位為必填。",
  "positiveNumber": "必須大於 0。"
},
```

- [ ] **Step 1.8: Run locale parity test to verify**

```bash
cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux && pnpm test --run src/i18n/locales/locales.test.ts
```

Expected: PASS — en.json and tw.json have the same translation keys

- [ ] **Step 1.9: Run verification gate**

```bash
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux/apps/web && pnpm lint)
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux/apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux/apps/web && pnpm build-storybook)
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux/apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

All four must pass and grep must return no matches.

- [ ] **Step 1.10: Commit**

```bash
cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux
git add apps/web/src/components/ui/input.tsx apps/web/src/components/ui/input.stories.tsx apps/web/src/components/ui/input.stories.test.tsx apps/web/src/i18n/locales/en.json apps/web/src/i18n/locales/tw.json
git commit -m "feat(ui): add error prop to Input component and validation i18n strings

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Update simple name forms

**Files:**
- Modify: `apps/web/src/components/vendor/VendorNameForm/index.tsx`
- Modify: `apps/web/src/components/vendor/VendorNameForm/VendorNameForm.stories.tsx`
- Modify: `apps/web/src/components/vendor/VendorNameForm/VendorNameForm.stories.test.tsx`
- Modify: `apps/web/src/components/recipe/RecipeNameForm/index.tsx`
- Modify: `apps/web/src/components/recipe/RecipeNameForm/RecipeNameForm.stories.tsx`
- Modify: `apps/web/src/components/recipe/RecipeNameForm/RecipeNameForm.stories.test.tsx`
- Modify: `apps/web/src/components/tag/TagNameForm/index.tsx`
- Modify: `apps/web/src/components/AddNameDialog/index.tsx`

- [ ] **Step 2.1: Write failing test for VendorNameForm error display**

Create `apps/web/src/components/vendor/VendorNameForm/VendorNameForm.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VendorNameForm } from '.'

describe('VendorNameForm validation', () => {
  it('shows required error immediately when name is empty', () => {
    // Given a VendorNameForm with an empty name
    render(
      <VendorNameForm
        name=""
        onNameChange={vi.fn()}
        onSave={vi.fn()}
        isDirty={false}
      />,
    )

    // Then the required error is shown
    expect(screen.getByText('This field is required.')).toBeInTheDocument()
  })

  it('does not show error when name is filled', () => {
    // Given a VendorNameForm with a non-empty name
    render(
      <VendorNameForm
        name="Costco"
        onNameChange={vi.fn()}
        onSave={vi.fn()}
        isDirty={false}
      />,
    )

    // Then no error is shown
    expect(screen.queryByText('This field is required.')).not.toBeInTheDocument()
  })

  it('disables Save button when name is empty', () => {
    // Given a VendorNameForm with an empty name
    render(
      <VendorNameForm
        name=""
        onNameChange={vi.fn()}
        onSave={vi.fn()}
        isDirty={false}
      />,
    )

    // Then Save is disabled
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })
})
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux && pnpm test --run src/components/vendor/VendorNameForm/VendorNameForm.test.tsx
```

Expected: FAIL

- [ ] **Step 2.3: Update `VendorNameForm`**

Replace the entire contents of `apps/web/src/components/vendor/VendorNameForm/index.tsx` with:

```tsx
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface VendorNameFormProps {
  name: string
  onNameChange: (name: string) => void
  onSave: () => void
  isDirty: boolean
  isPending?: boolean
}

export function VendorNameForm({
  name,
  onNameChange,
  onSave,
  isDirty,
  isPending,
}: VendorNameFormProps) {
  const { t } = useTranslation()
  const nameError = !name.trim() ? t('validation.required') : undefined

  return (
    <form
      className="space-y-4 max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="vendor-name">{t('common.nameLabel')}</Label>
        <Input
          id="vendor-name"
          value={name}
          autoFocus
          onChange={(e) => onNameChange(e.target.value)}
          error={nameError}
        />
      </div>
      <Button type="submit" disabled={!!nameError || !isDirty || !!isPending} className="w-full">
        {t('common.save')}
      </Button>
    </form>
  )
}
```

- [ ] **Step 2.4: Update `RecipeNameForm`**

Replace the entire contents of `apps/web/src/components/recipe/RecipeNameForm/index.tsx` with:

```tsx
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface RecipeNameFormProps {
  name: string
  onNameChange: (name: string) => void
  onSave: () => void
  isDirty: boolean
  isPending?: boolean
}

export function RecipeNameForm({
  name,
  onNameChange,
  onSave,
  isDirty,
  isPending,
}: RecipeNameFormProps) {
  const { t } = useTranslation()
  const nameError = !name.trim() ? t('validation.required') : undefined

  return (
    <form
      className="space-y-4 max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="recipe-name">{t('common.nameLabel')}</Label>
        <Input
          id="recipe-name"
          value={name}
          autoFocus
          onChange={(e) => onNameChange(e.target.value)}
          className="capitalize"
          error={nameError}
        />
      </div>
      <Button type="submit" disabled={!!nameError || !isDirty || !!isPending} className="w-full">
        {t('common.save')}
      </Button>
    </form>
  )
}
```

- [ ] **Step 2.5: Update `TagNameForm`**

Replace the entire contents of `apps/web/src/components/tag/TagNameForm/index.tsx` with:

```tsx
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface TagNameFormProps {
  name: string
  onNameChange: (name: string) => void
  onSave: () => void
  isDirty: boolean
  isPending?: boolean
}

export function TagNameForm({
  name,
  onNameChange,
  onSave,
  isDirty,
  isPending,
}: TagNameFormProps) {
  const { t } = useTranslation()
  const nameError = !name.trim() ? t('validation.required') : undefined

  return (
    <form
      className="space-y-4 max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="tag-name">{t('common.nameLabel')}</Label>
        <Input
          id="tag-name"
          value={name}
          autoFocus
          onChange={(e) => onNameChange(e.target.value)}
          className="capitalize"
          error={nameError}
        />
      </div>
      <Button type="submit" disabled={!!nameError || !isDirty || !!isPending} className="w-full">
        {t('common.save')}
      </Button>
    </form>
  )
}
```

Note: `TagNameForm` previously used hardcoded English strings ("Name", "Save"). This step migrates those two strings to i18n keys (`common.nameLabel`, `common.save`) so the validation error can also use `t('validation.required')`.

- [ ] **Step 2.6: Update `AddNameDialog`**

Replace the entire contents of `apps/web/src/components/AddNameDialog/index.tsx` with:

```tsx
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AddNameDialogProps {
  open: boolean
  title: string
  submitLabel: string
  name: string
  placeholder?: string
  onNameChange: (name: string) => void
  onAdd: () => void
  onClose: () => void
}

export function AddNameDialog({
  open,
  title,
  submitLabel,
  name,
  placeholder,
  onNameChange,
  onAdd,
  onClose,
}: AddNameDialogProps) {
  const { t } = useTranslation()
  const nameError = !name.trim() ? t('validation.required') : undefined

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="entityName">{t('common.nameLabel')}</Label>
            <Input
              id="entityName"
              value={name}
              autoFocus
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={placeholder}
              className="capitalize"
              onKeyDown={(e) => e.key === 'Enter' && !nameError && onAdd()}
              error={nameError}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="neutral-outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onAdd} disabled={!!nameError}>{submitLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2.7: Run VendorNameForm tests to verify they pass**

```bash
cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux && pnpm test --run src/components/vendor/VendorNameForm/
```

Expected: all tests PASS

- [ ] **Step 2.8: Add `WithError` story to VendorNameForm stories**

Add after `Pending` in `apps/web/src/components/vendor/VendorNameForm/VendorNameForm.stories.tsx`:

```tsx
export const WithError: Story = {
  render: () => (
    <VendorNameForm
      name=""
      onNameChange={() => {}}
      onSave={() => {}}
      isDirty={false}
    />
  ),
}
```

- [ ] **Step 2.9: Add `WithError` smoke test to VendorNameForm stories test**

Add to `apps/web/src/components/vendor/VendorNameForm/VendorNameForm.stories.test.tsx`:

```tsx
// At top: add WithError to the composeStories destructure
const { Empty, WithName, Pending, WithError } = composeStories(stories)

// Add to the describe block:
it('WithError renders validation message', () => {
  render(<WithError />)
  expect(screen.getByText('This field is required.')).toBeInTheDocument()
})
```

- [ ] **Step 2.10: Add `WithError` story to RecipeNameForm stories**

Read `apps/web/src/components/recipe/RecipeNameForm/RecipeNameForm.stories.tsx`, then add after the last story:

```tsx
export const WithError: Story = {
  render: () => (
    <RecipeNameForm
      name=""
      onNameChange={() => {}}
      onSave={() => {}}
      isDirty={false}
    />
  ),
}
```

Then add the smoke test to `apps/web/src/components/recipe/RecipeNameForm/RecipeNameForm.stories.test.tsx` (same pattern as VendorNameForm: add `WithError` to destructure, add `it` block asserting `'This field is required.'`).

- [ ] **Step 2.11: Run full test suite**

```bash
cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux && pnpm test --run
```

Expected: all 143 test files PASS

- [ ] **Step 2.12: Run verification gate**

```bash
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux/apps/web && pnpm lint)
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux/apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux/apps/web && pnpm build-storybook)
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux/apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

All four must pass.

- [ ] **Step 2.13: Commit**

```bash
cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux
git add \
  apps/web/src/components/vendor/VendorNameForm/ \
  apps/web/src/components/recipe/RecipeNameForm/ \
  apps/web/src/components/tag/TagNameForm/index.tsx \
  apps/web/src/components/AddNameDialog/index.tsx
git commit -m "feat(forms): show validation errors in simple name forms and AddNameDialog

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Update ItemForm

**Files:**
- Modify: `apps/web/src/components/item/ItemForm/index.tsx`
- Modify: `apps/web/src/components/item/ItemForm/ItemForm.stories.tsx`
- Modify: `apps/web/src/components/item/ItemForm/ItemForm.test.tsx`

- [ ] **Step 3.1: Write failing tests for ItemForm field-level errors**

Add to `apps/web/src/components/item/ItemForm/ItemForm.test.tsx` (after the existing tests):

```tsx
describe('ItemForm — validation errors on page load', () => {
  it('shows name required error immediately when name is empty', () => {
    // Given an ItemForm in create mode with no initial name
    render(<ItemForm onSubmit={vi.fn()} />)

    // Then the name required error is shown immediately
    expect(screen.getByText('Name is required.')).toBeInTheDocument()
  })

  it('does not show name error when name is pre-filled', () => {
    // Given an ItemForm with an initial name
    render(<ItemForm onSubmit={vi.fn()} initialValues={{ name: 'Milk' }} />)

    // Then no name error is shown
    expect(screen.queryByText('Name is required.')).not.toBeInTheDocument()
  })

  it('shows measurement unit error when tracking is on but unit is empty', async () => {
    // Given an ItemForm with measurement tracking enabled but no unit
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} />)
    await user.click(screen.getByRole('switch', { name: /track in measurement/i }))

    // Then the measurement unit error is shown
    expect(screen.getByText('Measurement unit is required.')).toBeInTheDocument()
  })

  it('shows amount per package error when tracking is on but amount is empty', async () => {
    // Given an ItemForm with measurement tracking enabled but no amount
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} />)
    await user.click(screen.getByRole('switch', { name: /track in measurement/i }))

    // Then the amount per package error is shown
    expect(screen.getByText('Amount per package is required.')).toBeInTheDocument()
  })

  it('shows consume amount error when consume amount is 0', async () => {
    // Given an ItemForm with consume amount set to 0
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} />)
    const consumeInput = screen.getByLabelText(/amount per consume/i)
    await user.clear(consumeInput)
    await user.type(consumeInput, '0')

    // Then the consume amount error is shown
    expect(screen.getByText('Must be greater than 0.')).toBeInTheDocument()
  })

  it('does not show the old single validation message below the submit button', async () => {
    // Given an ItemForm with measurement tracking on but no units
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} />)
    await user.click(screen.getByRole('switch', { name: /track in measurement/i }))

    // Then the old combined validation message is NOT shown (it's been replaced by field-level errors)
    expect(screen.queryByText(/measurement unit and amount per package are required/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux && pnpm test --run src/components/item/ItemForm/ItemForm.test.tsx
```

Expected: new tests FAIL (old tests still pass)

- [ ] **Step 3.3: Update `ItemForm`**

In `apps/web/src/components/item/ItemForm/index.tsx`:

**Replace** the `isValidationFailed`, `validationMessage`, and `isSubmitDisabled` block (lines 200–214):

```ts
// REMOVE this:
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
  isValidationFailed ||
  consumeAmount <= 0 ||
  (onDirtyChange !== undefined && !isDirty)
```

**With this:**

```ts
const nameError = !name.trim() ? 'Name is required.' : undefined
const measurementUnitError =
  targetUnit === 'measurement' && !measurementUnit
    ? 'Measurement unit is required.'
    : undefined
const amountPerPackageError =
  targetUnit === 'measurement' && !amountPerPackage
    ? 'Amount per package is required.'
    : undefined
const consumeAmountError = consumeAmount <= 0 ? 'Must be greater than 0.' : undefined

const isSubmitDisabled =
  !!(nameError || measurementUnitError || amountPerPackageError || consumeAmountError) ||
  (onDirtyChange !== undefined && !isDirty)
```

Also update the `handleSubmit` function — remove the `isValidationFailed` guard (the button is now disabled when invalid, so this guard is redundant, but keep `isSubmitDisabled` as the canonical check):

```ts
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault()
  if (isSubmitDisabled) return
  onSubmit(currentValuesRef.current)
}
```

**Thread errors to fields** — find each field and add its `error` prop:

1. Name field (around line 352):
```tsx
<Input
  id="name"
  value={name}
  onChange={(e) => setName(e.target.value)}
  required
  autoFocus
  className="capitalize"
  error={nameError}
/>
```

2. Consume Amount field (around line 435):
```tsx
<Input
  id="consumeAmount"
  type="number"
  step="0.01"
  min={0.01}
  value={consumeAmount}
  onChange={(e) => setConsumeAmount(Number(e.target.value))}
  required
  error={consumeAmountError}
/>
```

3. Measurement Unit field (around line 550):
```tsx
<Input
  id="measurementUnit"
  value={measurementUnit}
  onChange={(e) => setMeasurementUnit(e.target.value)}
  disabled={targetUnit !== 'measurement'}
  error={targetUnit === 'measurement' ? measurementUnitError : undefined}
/>
```

4. Amount per Package field (around line 571):
```tsx
<Input
  id="amountPerPackage"
  type="number"
  step="1"
  min={1}
  value={amountPerPackage}
  onChange={(e) => setAmountPerPackage(e.target.value)}
  disabled={targetUnit !== 'measurement'}
  error={targetUnit === 'measurement' ? amountPerPackageError : undefined}
/>
```

**Remove** the old `validationMessage` block at the bottom (around line 592–594):
```tsx
// REMOVE:
{validationMessage && (
  <p className="text-sm text-destructive">{validationMessage}</p>
)}
```

- [ ] **Step 3.4: Run ItemForm tests to verify they pass**

```bash
cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux && pnpm test --run src/components/item/ItemForm/ItemForm.test.tsx
```

Expected: all tests PASS (including the new validation tests and old tests)

Note: The existing test `'shows validation message when measurement mode is on but units are missing'` (line 72–87) checks for `/measurement unit.*required/i` — after our changes, this will match the new field-level error `'Measurement unit is required.'`. Verify it still passes.

- [ ] **Step 3.5: Add `CreateModeEmptyError` story to `ItemForm.stories.tsx`**

Add after `EditValidationError` in `apps/web/src/components/item/ItemForm/ItemForm.stories.tsx`:

```tsx
export const CreateModeEmptyError: Story = {
  name: 'Create Mode (empty — shows name error)',
  args: {
    onDirtyChange: undefined,
  },
}
```

- [ ] **Step 3.6: Run full test suite**

```bash
cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux && pnpm test --run
```

Expected: all 143 test files PASS

- [ ] **Step 3.7: Run verification gate**

```bash
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux/apps/web && pnpm lint)
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux/apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux/apps/web && pnpm build-storybook)
(cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux/apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
```

All four must pass.

- [ ] **Step 3.8: Commit**

```bash
cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux
git add apps/web/src/components/item/ItemForm/
git commit -m "feat(items): show field-level validation errors in ItemForm

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Update docs/INDEX.md and run final E2E tests

**Files:**
- Modify: `docs/INDEX.md`

- [ ] **Step 4.1: Update docs/INDEX.md status**

In `docs/INDEX.md`, find the row for the form validation UX plan and update its status from 🔲 Pending to ✅.

- [ ] **Step 4.2: Commit docs update**

```bash
cd /Users/etblue/Code/GitHub/player1inventory/.worktrees/feature-form-validation-ux
git add docs/INDEX.md docs/global/ui-polish/2026-03-27-plan-form-validation-ux.md
git commit -m "docs(ui-polish): add form validation UX plan and update INDEX.md status

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 4.3: Run final E2E tests**

```bash
cd /Users/etblue/Code/GitHub/player1inventory && pnpm test:e2e --grep "items|vendors|recipes|tags|settings|a11y"
```

Expected: all matched tests PASS. If any fail, fix before finishing the branch.
