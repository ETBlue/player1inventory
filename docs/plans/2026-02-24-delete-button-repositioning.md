# Delete Button Repositioning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move delete buttons from top bars to Info tabs and add delete to tag badges for consistent, decluttered UI.

**Architecture:** Shared `DeleteButton` component with AlertDialog confirmation. Accepts flexible trigger (string or icon), button styling props, and JSX dialog content.

**Tech Stack:** React 19, TypeScript, shadcn AlertDialog, Lucide icons, Vitest, Storybook

---

## Task 1: Create DeleteButton Component (TDD)

**Files:**
- Create: `src/components/DeleteButton.tsx`
- Create: `src/components/DeleteButton.test.tsx`

### Step 1: Write the failing test

**File:** `src/components/DeleteButton.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { DeleteButton } from './DeleteButton'

describe('DeleteButton', () => {
  it('user can open confirmation dialog by clicking delete button', async () => {
    const user = userEvent.setup()
    const handleDelete = vi.fn()

    render(
      <DeleteButton
        trigger="Delete Item"
        dialogTitle="Delete Item?"
        dialogDescription="Are you sure?"
        onDelete={handleDelete}
      />,
    )

    // Given delete button is rendered
    const deleteButton = screen.getByRole('button', { name: /delete item/i })
    expect(deleteButton).toBeInTheDocument()

    // When user clicks delete button
    await user.click(deleteButton)

    // Then confirmation dialog appears
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Delete Item?')).toBeInTheDocument()
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
  })

  it('user can confirm deletion', async () => {
    const user = userEvent.setup()
    const handleDelete = vi.fn()

    render(
      <DeleteButton
        trigger="Delete Item"
        dialogTitle="Delete Item?"
        dialogDescription="Are you sure?"
        onDelete={handleDelete}
      />,
    )

    // Given dialog is open
    await user.click(screen.getByRole('button', { name: /delete item/i }))

    // When user clicks confirm button
    const confirmButton = screen.getByRole('button', { name: /^delete$/i })
    await user.click(confirmButton)

    // Then onDelete callback is called
    expect(handleDelete).toHaveBeenCalledTimes(1)
  })

  it('user can cancel deletion', async () => {
    const user = userEvent.setup()
    const handleDelete = vi.fn()

    render(
      <DeleteButton
        trigger="Delete Item"
        dialogTitle="Delete Item?"
        dialogDescription="Are you sure?"
        onDelete={handleDelete}
      />,
    )

    // Given dialog is open
    await user.click(screen.getByRole('button', { name: /delete item/i }))

    // When user clicks cancel button
    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelButton)

    // Then onDelete is not called and dialog closes
    expect(handleDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('user can use icon as trigger', () => {
    const handleDelete = vi.fn()

    render(
      <DeleteButton
        trigger={<span data-testid="trash-icon">🗑️</span>}
        dialogTitle="Delete?"
        dialogDescription="Sure?"
        onDelete={handleDelete}
      />,
    )

    // Given icon trigger is rendered
    expect(screen.getByTestId('trash-icon')).toBeInTheDocument()
  })

  it('user can customize button styling', () => {
    const handleDelete = vi.fn()

    render(
      <DeleteButton
        trigger="Delete"
        buttonVariant="ghost"
        buttonClassName="text-destructive"
        dialogTitle="Delete?"
        dialogDescription="Sure?"
        onDelete={handleDelete}
      />,
    )

    // Given button has custom classes
    const button = screen.getByRole('button', { name: /delete/i })
    expect(button.className).toContain('text-destructive')
  })
})
```

### Step 2: Run test to verify it fails

**Command:**
```bash
pnpm test src/components/DeleteButton.test.tsx
```

**Expected:** FAIL - "Cannot find module './DeleteButton'"

### Step 3: Write minimal implementation

**File:** `src/components/DeleteButton.tsx`

```tsx
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import type { ButtonProps } from '@/components/ui/button'

export interface DeleteButtonProps {
  onDelete: () => void | Promise<void>
  trigger: ReactNode
  buttonVariant?: ButtonProps['variant']
  buttonSize?: ButtonProps['size']
  buttonClassName?: string
  dialogTitle?: string
  dialogDescription?: ReactNode
  confirmLabel?: string
}

export function DeleteButton({
  onDelete,
  trigger,
  buttonVariant = 'ghost',
  buttonSize,
  buttonClassName,
  dialogTitle = 'Delete?',
  dialogDescription = 'Are you sure?',
  confirmLabel = 'Delete',
}: DeleteButtonProps) {
  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleConfirm = async () => {
    setIsDeleting(true)
    try {
      await onDelete()
      setOpen(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Button
        variant={buttonVariant}
        size={buttonSize}
        className={buttonClassName}
        onClick={() => setOpen(true)}
      >
        {trigger}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>{dialogDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

### Step 4: Run test to verify it passes

**Command:**
```bash
pnpm test src/components/DeleteButton.test.tsx
```

**Expected:** PASS - All 5 tests passing

### Step 5: Commit

**Command:**
```bash
git add src/components/DeleteButton.tsx src/components/DeleteButton.test.tsx
git commit -m "feat(ui): add DeleteButton component with tests

- Shared component for consistent delete actions
- Supports string or icon triggers
- Configurable button styling via props
- AlertDialog confirmation with loading state

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create DeleteButton Storybook Stories

**Files:**
- Create: `src/components/DeleteButton.stories.tsx`

### Step 1: Write Storybook stories

**File:** `src/components/DeleteButton.stories.tsx`

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Trash2, X } from 'lucide-react'
import { DeleteButton } from './DeleteButton'

const meta = {
  title: 'Components/DeleteButton',
  component: DeleteButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DeleteButton>

export default meta
type Story = StoryObj<typeof meta>

export const TextButton: Story = {
  args: {
    trigger: 'Delete Tag',
    buttonVariant: 'ghost',
    buttonClassName: 'text-destructive hover:bg-destructive/10',
    dialogTitle: 'Delete Tag?',
    dialogDescription: 'Are you sure you want to delete this tag?',
    onDelete: () => console.log('Deleted'),
  },
}

export const WithCascadeWarning: Story = {
  args: {
    trigger: 'Delete Tag',
    buttonVariant: 'ghost',
    buttonClassName: 'text-destructive hover:bg-destructive/10',
    dialogTitle: 'Delete Tag?',
    dialogDescription: (
      <>
        Are you sure you want to delete <strong>Vegetables</strong>?
        <p className="mt-2 text-sm text-muted-foreground">
          This tag will be removed from 12 items.
        </p>
      </>
    ),
    onDelete: () => console.log('Deleted with cascade'),
  },
}

export const IconButton: Story = {
  args: {
    trigger: <X className="h-3 w-3" />,
    buttonVariant: 'ghost',
    buttonSize: 'icon',
    buttonClassName: 'h-4 w-4 p-0 hover:bg-destructive/20',
    dialogTitle: 'Delete Tag?',
    dialogDescription: 'Are you sure?',
    onDelete: () => console.log('Deleted from badge'),
  },
}

export const TrashIcon: Story = {
  args: {
    trigger: <Trash2 className="h-4 w-4" />,
    buttonVariant: 'ghost',
    buttonSize: 'icon',
    dialogTitle: 'Delete Item?',
    dialogDescription: 'This action cannot be undone.',
    onDelete: () => console.log('Deleted item'),
  },
}

export const AsyncDelete: Story = {
  args: {
    trigger: 'Delete (Async)',
    buttonVariant: 'ghost',
    buttonClassName: 'text-destructive',
    dialogTitle: 'Delete Item?',
    dialogDescription: 'This will take a few seconds...',
    onDelete: () =>
      new Promise((resolve) => {
        setTimeout(() => {
          console.log('Async delete complete')
          resolve()
        }, 2000)
      }),
  },
}
```

### Step 2: Verify Storybook renders correctly

**Command:**
```bash
pnpm storybook
```

**Expected:** Storybook opens at http://localhost:6006, DeleteButton stories render with different variants

### Step 3: Commit

**Command:**
```bash
git add src/components/DeleteButton.stories.tsx
git commit -m "docs(storybook): add DeleteButton stories

- Text button variant
- Icon button variants (X and Trash2)
- Cascade warning example
- Async delete example

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Update Tag Detail Page

**Files:**
- Modify: `src/routes/settings/tags/$id.tsx` (remove top bar delete button, lines 130-138)
- Modify: `src/routes/settings/tags/$id/index.tsx` (add delete button to Info tab)

### Step 1: Remove delete button from top bar

**File:** `src/routes/settings/tags/$id.tsx`

Find and remove this code (lines 130-138):

```tsx
{/* Delete Button */}
<button
  type="button"
  onClick={() => setShowDeleteDialog(true)}
  className="px-3 py-4 hover:bg-background-surface transition-colors text-destructive"
  aria-label="Delete tag"
>
  <Trash2 className="h-4 w-4" />
</button>
```

Also remove unused imports:
- Remove `Trash2` from lucide-react imports (line 8)
- Remove `useDeleteTag`, `useItemCountByTag` from useTags imports (line 23)
- Remove `deleteTag`, `affectedItemCount` variable declarations (lines 37-38)
- Remove `showDeleteDialog` state (line 41)
- Remove entire "Delete Confirmation Dialog" section (lines 167-193)

**Command:**
```bash
pnpm test src/routes/settings/tags
```

**Expected:** Tests pass (if any exist)

### Step 2: Add DeleteButton to Info tab

**File:** `src/routes/settings/tags/$id/index.tsx`

Add import at top:

```tsx
import { DeleteButton } from '@/components/DeleteButton'
import { useDeleteTag, useItemCountByTag } from '@/hooks/useTags'
```

Add delete logic after the `goBack` hook (around line 28):

```tsx
const deleteTag = useDeleteTag()
const { data: affectedItemCount = 0 } = useItemCountByTag(id)

const handleDelete = async () => {
  deleteTag.mutate(id, {
    onSuccess: () => goBack(),
  })
}
```

Add DeleteButton after the Save button (find the Button with "Save Changes" and add below it):

```tsx
<Button
  onClick={handleSave}
  disabled={!isDirty || isSaving}
  className="w-full"
>
  {isSaving ? 'Saving...' : 'Save Changes'}
</Button>

<DeleteButton
  trigger="Delete Tag"
  buttonVariant="ghost"
  buttonClassName="text-destructive hover:bg-destructive/10 w-full mt-4"
  dialogTitle="Delete Tag?"
  dialogDescription={
    <>
      Are you sure you want to delete <strong>{tag.name}</strong>?
      {affectedItemCount > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          This tag will be removed from {affectedItemCount} item
          {affectedItemCount !== 1 ? 's' : ''}.
        </p>
      )}
    </>
  }
  onDelete={handleDelete}
/>
```

### Step 3: Verify changes work

**Command:**
```bash
pnpm dev
```

**Manual test:**
1. Navigate to `/settings/tags`
2. Click a tag to go to detail page
3. Verify top bar has NO delete button
4. Verify Info tab has delete button at bottom
5. Click delete, verify dialog appears with cascade warning
6. Test confirm and cancel

### Step 4: Commit

**Command:**
```bash
git add src/routes/settings/tags/\$id.tsx src/routes/settings/tags/\$id/index.tsx
git commit -m "feat(tags): move delete button from top bar to Info tab

- Remove delete button from top bar
- Add DeleteButton to bottom of Info tab form
- Show cascade warning in confirmation dialog

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Update Item Detail Page

**Files:**
- Modify: `src/routes/items/$id/index.tsx` (add delete button to Info tab)

### Step 1: Add DeleteButton to Info tab

**File:** `src/routes/items/$id/index.tsx`

Add imports:

```tsx
import { DeleteButton } from '@/components/DeleteButton'
import { useDeleteItem } from '@/hooks/useItems'
```

Add delete logic in the component (look for existing hooks like `useUpdateItem`):

```tsx
const deleteItem = useDeleteItem()
const { goBack } = useAppNavigation()

const handleDelete = async () => {
  deleteItem.mutate(item.id, {
    onSuccess: () => goBack(),
  })
}
```

Find the Save button and add DeleteButton after it:

```tsx
<Button
  onClick={handleSave}
  disabled={!isDirty || updateItem.isPending}
  className="w-full"
>
  {updateItem.isPending ? 'Saving...' : 'Save Changes'}
</Button>

<DeleteButton
  trigger="Delete Item"
  buttonVariant="ghost"
  buttonClassName="text-destructive hover:bg-destructive/10 w-full mt-4"
  dialogTitle="Delete Item?"
  dialogDescription={
    <>
      Are you sure you want to delete <strong>{item.name}</strong>?
      <p className="mt-2 text-sm text-muted-foreground">
        This will permanently remove this item and its history.
      </p>
    </>
  }
  onDelete={handleDelete}
/>
```

### Step 2: Verify changes work

**Command:**
```bash
pnpm dev
```

**Manual test:**
1. Navigate to an item detail page
2. Go to Info tab (Stock Status tab)
3. Verify delete button appears at bottom
4. Click delete, verify dialog appears
5. Test confirm and cancel

### Step 3: Commit

**Command:**
```bash
git add src/routes/items/\$id/index.tsx
git commit -m "feat(items): add delete button to Info tab

- Add DeleteButton to bottom of Stock Status/Info tab
- Show confirmation dialog with warning message

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Update Vendor Detail Page

**Files:**
- Modify: `src/routes/settings/vendors/$id/index.tsx` (add delete button to Info tab)

### Step 1: Add DeleteButton to Info tab

**File:** `src/routes/settings/vendors/$id/index.tsx`

Add imports:

```tsx
import { DeleteButton } from '@/components/DeleteButton'
import { useDeleteVendor, useItemCountByVendor } from '@/hooks/useVendors'
```

Add delete logic:

```tsx
const deleteVendor = useDeleteVendor()
const { data: affectedItemCount = 0 } = useItemCountByVendor(id)

const handleDelete = async () => {
  deleteVendor.mutate(id, {
    onSuccess: () => goBack(),
  })
}
```

Add DeleteButton after Save button:

```tsx
<Button
  onClick={handleSave}
  disabled={!isDirty || isSaving}
  className="w-full"
>
  {isSaving ? 'Saving...' : 'Save Changes'}
</Button>

<DeleteButton
  trigger="Delete Vendor"
  buttonVariant="ghost"
  buttonClassName="text-destructive hover:bg-destructive/10 w-full mt-4"
  dialogTitle="Delete Vendor?"
  dialogDescription={
    <>
      Are you sure you want to delete <strong>{vendor.name}</strong>?
      {affectedItemCount > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          This vendor will be removed from {affectedItemCount} item
          {affectedItemCount !== 1 ? 's' : ''}.
        </p>
      )}
    </>
  }
  onDelete={handleDelete}
/>
```

### Step 2: Verify changes work

**Command:**
```bash
pnpm dev
```

**Manual test:**
1. Navigate to `/settings/vendors`
2. Click a vendor to go to detail page
3. Verify Info tab has delete button at bottom
4. Click delete, verify dialog with cascade warning
5. Test confirm and cancel

### Step 3: Commit

**Command:**
```bash
git add src/routes/settings/vendors/\$id/index.tsx
git commit -m "feat(vendors): add delete button to Info tab

- Add DeleteButton to bottom of Info tab form
- Show cascade warning in confirmation dialog

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Update Recipe Detail Page

**Files:**
- Modify: `src/routes/settings/recipes/$id/index.tsx` (add delete button to Info tab)

### Step 1: Add DeleteButton to Info tab

**File:** `src/routes/settings/recipes/$id/index.tsx`

Add imports:

```tsx
import { DeleteButton } from '@/components/DeleteButton'
import { useDeleteRecipe } from '@/hooks/useRecipes'
```

Add delete logic:

```tsx
const deleteRecipe = useDeleteRecipe()

const handleDelete = async () => {
  deleteRecipe.mutate(id, {
    onSuccess: () => goBack(),
  })
}
```

Add DeleteButton after Save button:

```tsx
<Button
  onClick={handleSave}
  disabled={!isDirty || isSaving}
  className="w-full"
>
  {isSaving ? 'Saving...' : 'Save Changes'}
</Button>

<DeleteButton
  trigger="Delete Recipe"
  buttonVariant="ghost"
  buttonClassName="text-destructive hover:bg-destructive/10 w-full mt-4"
  dialogTitle="Delete Recipe?"
  dialogDescription={
    <>
      Are you sure you want to delete <strong>{recipe.name}</strong>?
      <p className="mt-2 text-sm text-muted-foreground">
        This will permanently remove this recipe.
      </p>
    </>
  }
  onDelete={handleDelete}
/>
```

### Step 2: Verify changes work

**Command:**
```bash
pnpm dev
```

**Manual test:**
1. Navigate to `/settings/recipes`
2. Click a recipe to go to detail page
3. Verify Info tab has delete button at bottom
4. Click delete, verify dialog appears
5. Test confirm and cancel

### Step 3: Commit

**Command:**
```bash
git add src/routes/settings/recipes/\$id/index.tsx
git commit -m "feat(recipes): add delete button to Info tab

- Add DeleteButton to bottom of Info tab form
- Show confirmation dialog with warning message

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Update Tags List Page (Add Delete to Badges)

**Files:**
- Modify: `src/routes/settings/tags/index.tsx` (add delete button to each tag badge)

### Step 1: Add DeleteButton to tag badges

**File:** `src/routes/settings/tags/index.tsx`

Add import:

```tsx
import { X } from 'lucide-react'
import { DeleteButton } from '@/components/DeleteButton'
import { useDeleteTag, useItemCountByTag } from '@/hooks/useTags'
```

Find the tag rendering code (likely in a map function rendering badges). Look for `Badge` components or similar tag display elements.

Add DeleteButton inside each tag badge. The exact location depends on the current structure, but it should look something like:

```tsx
{tags.map((tag) => {
  const itemCount = itemCountsByTag.get(tag.id) ?? 0

  return (
    <div key={tag.id} className="inline-flex items-center gap-1">
      <Badge
        // ... existing badge props
        onClick={() => navigate({ to: '/settings/tags/$id', params: { id: tag.id } })}
      >
        {tag.name}
      </Badge>

      <DeleteButton
        trigger={<X className="h-3 w-3" />}
        buttonVariant="ghost"
        buttonSize="icon"
        buttonClassName="h-4 w-4 p-0 hover:bg-destructive/20"
        dialogTitle="Delete Tag?"
        dialogDescription={
          <>
            Are you sure you want to delete <strong>{tag.name}</strong>?
            {itemCount > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                This tag will be removed from {itemCount} item
                {itemCount !== 1 ? 's' : ''}.
              </p>
            )}
          </>
        }
        onDelete={async () => {
          const deleteTag = useDeleteTag()
          deleteTag.mutate(tag.id)
        }}
      />
    </div>
  )
})}
```

**Note:** The exact implementation depends on the current badge structure. You may need to adjust the layout to accommodate the delete button.

### Step 2: Verify changes work

**Command:**
```bash
pnpm dev
```

**Manual test:**
1. Navigate to `/settings/tags`
2. Verify each tag badge has an X button
3. Click X on a tag
4. Verify dialog appears with cascade warning
5. Test confirm (tag disappears) and cancel

### Step 3: Commit

**Command:**
```bash
git add src/routes/settings/tags/index.tsx
git commit -m "feat(tags): add delete button to tag badges

- Add X icon delete button to each tag badge
- Show cascade warning in confirmation dialog
- Always visible for immediate access

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Run Full Test Suite and Manual Verification

### Step 1: Run all tests

**Command:**
```bash
pnpm test
```

**Expected:** All tests pass

### Step 2: Run lint check

**Command:**
```bash
pnpm check
```

**Expected:** No errors

### Step 3: Manual testing checklist

**Manual tests:**
- [ ] Item detail: delete button at bottom of Stock Status tab, no button in top bar
- [ ] Tag detail: delete button at bottom of Info tab, no button in top bar
- [ ] Vendor detail: delete button at bottom of Info tab
- [ ] Recipe detail: delete button at bottom of Info tab
- [ ] Tags list: X button on each tag badge
- [ ] All confirmations use consistent dialog style
- [ ] Cascade warnings show correct item counts
- [ ] Cancel works (dialog closes, item not deleted)
- [ ] Confirm works (item deleted, navigates back)
- [ ] Loading states work (button shows "Deleting...")

### Step 4: Final commit (if any fixes needed)

**Command:**
```bash
git add .
git commit -m "fix(delete-button): address test/manual testing issues

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Success Criteria

- ✅ DeleteButton component created with tests and Storybook stories
- ✅ Top bars contain only navigation elements (back button, title, tabs)
- ✅ All detail page Info tabs have delete button at bottom
- ✅ Tag badges have X button for delete
- ✅ All delete actions use consistent confirmation dialog
- ✅ Cascade warnings show correct item counts
- ✅ All tests pass
- ✅ Manual testing checklist complete

---

## Notes

**DRY Principle:** Single DeleteButton component used everywhere with different props

**YAGNI Principle:** No extra features beyond the design spec (no undo, no bulk delete, etc.)

**TDD Approach:** Tests written first for DeleteButton component, integration verified manually

**Frequent Commits:** Each task gets its own commit with clear message
