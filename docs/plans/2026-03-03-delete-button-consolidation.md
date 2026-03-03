# Delete Button Consolidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate all delete flows to use the shared `DeleteButton` component, and update every confirmation dialog to explicitly state cascade impact on related objects (or state there is none).

**Architecture:** `DeleteButton` wraps `AlertDialog` with internal open state — callers just pass `onDelete` (the actual delete function). Three pages still use the old pattern: plain `Button` + external `ConfirmDialog` + state. We replace those three with `DeleteButton`. Dialog descriptions are audited and updated to always mention impact.

**Tech Stack:** React 19, TypeScript strict, TanStack Query, Vitest + React Testing Library, Storybook

---

## Context: Working Tree State

The user has already modified several files (uncommitted). Commit 1 organises those. Read all files before touching them.

**Already modified in working tree (from `git status`):**
- `src/components/DeleteButton.tsx` — default variant → `destructive-ghost`, description outside header, `flex-1` footer spacer
- `src/components/ui/alert-dialog.tsx` — border-bottom header, horizontal footer, `neutral-outline` cancel
- `src/components/VendorNameForm.tsx`, `RecipeNameForm.tsx`, `TagNameForm.tsx` — `max-w-2xl`, full-width save button
- `src/routes/settings/tags/index.tsx` — tag badge description improved; tag type button variant changed to `destructive-ghost` (NOT yet replaced with DeleteButton)
- `src/routes/settings/tags/$id/index.tsx` — (minor, check with `git diff HEAD`)
- `src/routes/settings/vendors/$id/index.tsx` — DeleteButton with impact count (good)
- `src/routes/settings/recipes/$id/index.tsx` — DeleteButton but missing recipe item count (fix in Task 5)
- `src/routes/items/$id/index.tsx` — DeleteButton styling fixed (good)

---

## Task 1: Commit existing style changes

**Goal:** Land all the user's working-tree style changes as one clean commit before adding new features.

**Files:**
- Modify: `src/components/DeleteButton.stories.tsx`
- Inspect: all files listed in "Already modified" section above

**Step 1: Review existing working tree changes**

```bash
git diff HEAD
```

Confirm the changes match the descriptions above. No action needed if they do.

**Step 2: Update DeleteButton.stories.tsx to match new defaults**

The stories still use the old `buttonVariant: 'ghost'` pattern and `text-destructive` class overrides. Update to reflect the new default `destructive-ghost` variant.

Replace the entire content of `src/components/DeleteButton.stories.tsx` with:

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
    trigger: 'Delete',
    dialogTitle: 'Delete Tag?',
    dialogDescription: 'Are you sure you want to delete this tag?',
    onDelete: () => console.log('Deleted'),
  },
}

export const WithImpact: Story = {
  args: {
    trigger: 'Delete',
    dialogTitle: 'Delete Tag?',
    dialogDescription: (
      <>
        <strong>Vegetables</strong> will be removed from 12 items.
      </>
    ),
    onDelete: () => console.log('Deleted with impact'),
  },
}

export const NoImpact: Story = {
  args: {
    trigger: 'Delete',
    dialogTitle: 'Delete Tag?',
    dialogDescription: (
      <>No items are using <strong>Vegetables</strong>.</>
    ),
    onDelete: () => console.log('Deleted with no impact'),
  },
}

export const IconButton: Story = {
  args: {
    trigger: <X className="h-3 w-3" />,
    buttonSize: 'icon-xs',
    buttonClassName: 'h-5',
    dialogTitle: 'Delete Tag?',
    dialogDescription: 'Are you sure?',
    onDelete: () => console.log('Deleted from badge'),
  },
}

export const TrashIcon: Story = {
  args: {
    trigger: <Trash2 className="h-4 w-4" />,
    buttonSize: 'icon',
    buttonClassName: 'h-8 w-8',
    dialogTitle: 'Delete Item?',
    dialogDescription: 'This action cannot be undone.',
    onDelete: () => console.log('Deleted item'),
  },
}

export const AsyncDelete: Story = {
  args: {
    trigger: 'Delete (Async)',
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

**Step 3: Run tests**

```bash
pnpm test --run
```

Note: `src/routes/settings/tags/$id.test.tsx` contains a selector `/delete tag/i` that targets the old button text. This will fail if the trigger was changed to `"Delete"` in the working tree. We fix that selector in Task 2. Confirm all other tests pass.

**Step 4: Commit**

```bash
git add src/components/DeleteButton.tsx src/components/ui/alert-dialog.tsx
git add src/components/VendorNameForm.tsx src/components/RecipeNameForm.tsx src/components/TagNameForm.tsx
git add src/routes/settings/tags/index.tsx src/routes/settings/tags/'$id'/index.tsx
git add src/routes/settings/vendors/'$id'/index.tsx
git add src/routes/settings/recipes/'$id'/index.tsx
git add src/routes/items/'$id'/index.tsx
git add src/components/DeleteButton.stories.tsx
git commit -m "$(cat <<'EOF'
style(delete): update alert-dialog layout, delete button defaults, form widths

- alert-dialog: border-bottom header, horizontal flex footer, neutral-outline cancel
- DeleteButton: destructive-ghost default variant, description outside header, flex-1 spacer
- VendorNameForm/RecipeNameForm/TagNameForm: max-w-2xl, full-width save button
- tags list: tag type delete button variant → destructive-ghost
- DeleteButton.stories: update to reflect new defaults and no-impact pattern

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Tag-related delete improvements

**Goal:** (a) Add `buttonAriaLabel` to `DeleteButton` for icon-only triggers. (b) Show exact item count in tag badge X dialog. (c) Replace tag type's `Button` + `ConfirmDialog` with `DeleteButton`. (d) Fix tag detail delete description for 0-item case.

**Files:**
- Modify: `src/components/DeleteButton.tsx`
- Modify: `src/routes/settings/tags/index.tsx`
- Modify: `src/routes/settings/tags/$id/index.tsx`
- Modify: `src/routes/settings/tags/$id.test.tsx`
- Storybook already updated in Task 1 — no further story changes needed here

### Step 1: Add `buttonAriaLabel` prop to DeleteButton

In `src/components/DeleteButton.tsx`, extend the interface and thread the prop to the `Button`:

```tsx
export interface DeleteButtonProps {
  onDelete: () => void | Promise<void>
  trigger: ReactNode
  buttonVariant?: ButtonProps['variant']
  buttonSize?: ButtonProps['size']
  buttonClassName?: string
  buttonAriaLabel?: string          // ← add this
  dialogTitle?: string
  dialogDescription?: ReactNode
  confirmLabel?: string
}

export function DeleteButton({
  onDelete,
  trigger,
  buttonVariant = 'destructive-ghost',
  buttonSize,
  buttonClassName,
  buttonAriaLabel,                  // ← add this
  dialogTitle = 'Delete?',
  dialogDescription = 'Are you sure?',
  confirmLabel = 'Delete',
}: DeleteButtonProps) {
  // ... state unchanged ...

  return (
    <>
      <Button
        variant={buttonVariant}
        size={buttonSize}
        className={buttonClassName}
        aria-label={buttonAriaLabel}  // ← add this
        onClick={() => setOpen(true)}
      >
        {trigger}
      </Button>
      {/* ... AlertDialog unchanged ... */}
    </>
  )
}
```

### Step 2: Write failing test for buttonAriaLabel

Add to `src/components/DeleteButton.test.tsx`:

```tsx
it('button has aria-label when buttonAriaLabel is provided', () => {
  render(
    <DeleteButton
      trigger={<span data-testid="icon">🗑️</span>}
      buttonAriaLabel="Delete Costco"
      dialogTitle="Delete?"
      dialogDescription="Sure?"
      onDelete={vi.fn()}
    />,
  )

  // Given icon-only button with aria-label
  const button = screen.getByRole('button', { name: 'Delete Costco' })
  expect(button).toBeInTheDocument()
})
```

**Step 3: Run test to verify it fails**

```bash
pnpm test --run src/components/DeleteButton.test.tsx
```

Expected: FAIL — `buttonAriaLabel` prop does not exist yet.

**Step 4: Apply the DeleteButton change from Step 1, run test again**

```bash
pnpm test --run src/components/DeleteButton.test.tsx
```

Expected: all tests PASS.

### Step 5: Add item count to DraggableTagBadge

In `src/routes/settings/tags/index.tsx`, the `DraggableTagBadge` function already uses `DeleteButton` for the X button. Add `useItemCountByTag` inside it and update the dialog description.

`useItemCountByTag` is already exported from `@/hooks/useTags` (see `tags/$id/index.tsx` for existing usage).

Find the `DraggableTagBadge` function. Add the hook and update the description:

```tsx
function DraggableTagBadge({
  tag,
  tagType,
  onDelete,
}: {
  tag: Tag
  tagType: TagType
  onDelete: () => void
}) {
  const { data: itemCount = 0 } = useItemCountByTag(tag.id)  // ← add this
  // ... rest unchanged until DialogDescription ...
```

Update the `dialogDescription` prop on `DeleteButton` inside `DraggableTagBadge`:

```tsx
dialogDescription={
  itemCount > 0 ? (
    <>
      <strong>{tag.name}</strong> will be removed from {itemCount} item
      {itemCount !== 1 ? 's' : ''}.
    </>
  ) : (
    <>
      No items are using <strong>{tag.name}</strong>.
    </>
  )
}
```

Also add `useItemCountByTag` to the import from `@/hooks/useTags`.

### Step 6: Replace tag type delete button with DeleteButton

In `src/routes/settings/tags/index.tsx`:

**In `DroppableTagTypeCard`:** add `tagCount: number` prop and replace the `Button` trash icon with `DeleteButton`.

Update the interface:
```tsx
function DroppableTagTypeCard({
  tagType,
  sortedTypeTags,
  onEdit,
  onDelete,
  onAddTag,
  onDeleteTag,
  tagCount,             // ← add this
}: {
  tagType: TagType
  sortedTypeTags: Tag[]
  onEdit: () => void
  onDelete: () => void  // semantics: now the actual delete fn, called by DeleteButton
  onAddTag: () => void
  onDeleteTag: (tagId: string) => void
  tagCount: number      // ← add this
})
```

Replace (in the card header area):
```tsx
<Button
  variant="destructive-ghost"
  size="icon"
  className="h-8 w-8"
  onClick={onDelete}
>
  <Trash2 className="h-4 w-4" />
</Button>
```

With:
```tsx
<DeleteButton
  trigger={<Trash2 className="h-4 w-4" />}
  buttonVariant="destructive-ghost"
  buttonSize="icon"
  buttonClassName="h-8 w-8"
  buttonAriaLabel={`Delete ${tagType.name}`}
  dialogTitle={`Delete "${tagType.name}"?`}
  dialogDescription={
    tagCount > 0 ? (
      <>
        This will delete <strong>{tagCount} tag{tagCount !== 1 ? 's' : ''}</strong>,
        removing them from all assigned items.
      </>
    ) : (
      <>This type has no tags.</>
    )
  }
  onDelete={onDelete}
/>
```

Also add `DeleteButton` to the imports at the top (it may already be imported — check first).
Remove `Trash2` from lucide imports if it's no longer used elsewhere in this file (check other usages first).

**In `TagSettings`:** remove the tag type delete machinery and pass the actual delete function.

Remove these lines:
```tsx
const [tagTypeToDelete, setTagTypeToDelete] = useState<TagType | null>(null)
const tagTypeDeleteId = tagTypeToDelete?.id ?? ''
const { data: tagTypeTagCount = 0 } = useTagCountByType(tagTypeDeleteId)
```

Remove the `handleDeleteTagType` function.

In the `DroppableTagTypeCard` render, change:
```tsx
onDelete={() => setTagTypeToDelete(tagType)}
```
to:
```tsx
onDelete={() => deleteTagType.mutate(tagType.id)}
```

Add the new `tagCount` prop:
```tsx
tagCount={typeTags.length}
```

(`typeTags` is already computed in the loop as `const typeTags = tags.filter((t) => t.typeId === tagType.id)`)

Remove the `ConfirmDialog` JSX block for tag type deletion (the one with `open={!!tagTypeToDelete}` at the bottom of the component return).

Remove unused imports:
- `useTagCountByType` from `@/hooks/useTags`
- `ConfirmDialog` from `@/components/ui/confirm-dialog` (check if used elsewhere first)

### Step 7: Fix tag detail delete description for 0-item case

In `src/routes/settings/tags/$id/index.tsx`, update the `dialogDescription` on `DeleteButton`:

Replace:
```tsx
dialogDescription={
  <>
    Are you sure you want to delete <strong>{tag.name}</strong>?
    {affectedItemCount > 0 && (
      <>
        {' '}
        This tag will be removed from {affectedItemCount} item
        {affectedItemCount !== 1 ? 's' : ''}.
      </>
    )}
  </>
}
```

With:
```tsx
dialogDescription={
  affectedItemCount > 0 ? (
    <>
      <strong>{tag.name}</strong> will be removed from {affectedItemCount}{' '}
      item{affectedItemCount !== 1 ? 's' : ''}.
    </>
  ) : (
    <>
      No items are using <strong>{tag.name}</strong>.
    </>
  )
}
```

### Step 8: Fix test selectors in tags/$id.test.tsx

In `src/routes/settings/tags/$id.test.tsx`, search for `/delete tag/i` — this was written when the button trigger was `"Delete Tag"`. The trigger is now `"Delete"`. Update every occurrence:

Find (3 occurrences around lines 577, 615, 636):
```tsx
const deleteButton = await screen.findByRole('button', {
  name: /delete tag/i,
})
```

Replace with:
```tsx
const deleteButton = await screen.findByRole('button', {
  name: /^delete$/i,
})
```

### Step 9: Run all tests

```bash
pnpm test --run
```

Expected: all tests PASS.

### Step 10: Commit

```bash
git add src/components/DeleteButton.tsx src/components/DeleteButton.test.tsx
git add src/routes/settings/tags/index.tsx
git add src/routes/settings/tags/'$id'/index.tsx
git add src/routes/settings/tags/'$id'.test.tsx
git commit -m "$(cat <<'EOF'
feat(tags): replace tag type delete button with DeleteButton

- DeleteButton: add buttonAriaLabel prop for icon-only triggers
- DraggableTagBadge: show exact item count in delete dialog
- DroppableTagTypeCard: replace Button+ConfirmDialog with DeleteButton
- TagSettings: remove tagTypeToDelete state, ConfirmDialog, useTagCountByType
- tag/$id: show explicit "no items" message in delete dialog when count is 0
- tests: fix stale /delete tag/i selector → /^delete$/i

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: VendorCard → DeleteButton

**Goal:** Replace the plain `Button` + external `ConfirmDialog` pattern in the vendor list page with `DeleteButton` inside `VendorCard`.

**Files:**
- Modify: `src/components/VendorCard.tsx`
- Modify: `src/routes/settings/vendors/index.tsx`
- Modify: `src/components/VendorCard.test.tsx`
- Modify: `src/components/VendorCard.stories.tsx`

### Step 1: Write failing test for full delete dialog flow

The current `VendorCard.test.tsx` test "calls onDelete when delete button is clicked" expects `onDelete` is called immediately on button click. After the change, it goes through a dialog. Update the test to verify the full flow AND that clicking Cancel does NOT call onDelete.

Replace the existing test with these two:

```tsx
it('user can delete vendor after confirming the dialog', async () => {
  // Given a vendor card with delete handler
  const onDelete = vi.fn()
  render(<VendorCard vendor={vendor} onDelete={onDelete} />)
  const user = userEvent.setup()

  // When user clicks the delete button
  await user.click(screen.getByRole('button', { name: 'Delete Costco' }))

  // Then confirmation dialog appears
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()

  // When user confirms
  await user.click(screen.getByRole('button', { name: /^delete$/i }))

  // Then onDelete is called
  expect(onDelete).toHaveBeenCalledOnce()
})

it('user can cancel vendor deletion', async () => {
  // Given a vendor card with delete handler
  const onDelete = vi.fn()
  render(<VendorCard vendor={vendor} onDelete={onDelete} />)
  const user = userEvent.setup()

  // When user clicks delete then cancels
  await user.click(screen.getByRole('button', { name: 'Delete Costco' }))
  await user.click(screen.getByRole('button', { name: /cancel/i }))

  // Then onDelete is NOT called
  expect(onDelete).not.toHaveBeenCalled()
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test --run src/components/VendorCard.test.tsx
```

Expected: FAIL — clicking the button calls `onDelete` immediately (no dialog).

### Step 3: Update VendorCard.tsx

Read the file first. Replace the `Button` element with `DeleteButton`:

Add import:
```tsx
import { DeleteButton } from '@/components/DeleteButton'
```

Remove import:
```tsx
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
```

(Only remove `Button` if it's not used elsewhere in the file.)

Replace:
```tsx
<Button
  variant="neutral-ghost"
  size="icon"
  className="h-8 w-8 text-destructive"
  aria-label={`Delete ${vendor.name}`}
  onClick={onDelete}
>
  <Trash2 className="h-4 w-4" />
</Button>
```

With:
```tsx
<DeleteButton
  trigger={<Trash2 className="h-4 w-4" />}
  buttonVariant="destructive-ghost"
  buttonSize="icon"
  buttonClassName="h-8 w-8"
  buttonAriaLabel={`Delete ${vendor.name}`}
  dialogTitle={`Delete "${vendor.name}"?`}
  dialogDescription={
    (itemCount ?? 0) > 0 ? (
      <>
        <strong>{itemCount}</strong> item{itemCount !== 1 ? 's' : ''} will be
        unassigned from {vendor.name}.
      </>
    ) : (
      <>
        No items are assigned to <strong>{vendor.name}</strong>.
      </>
    )
  }
  onDelete={onDelete}
/>
```

Re-add `Trash2` import from lucide-react (used inside the trigger JSX).

### Step 4: Run test to verify it passes

```bash
pnpm test --run src/components/VendorCard.test.tsx
```

Expected: all tests PASS.

### Step 5: Update vendors/index.tsx

Read the file first. The `VendorSettings` component currently manages `vendorToDelete` state + `ConfirmDialog`. After the change, `VendorCard.onDelete` is the actual delete function, so all of this moves away.

Remove:
- `useState` import (if `vendorToDelete` is the only state — check)
- `type Vendor` import (only used for state type — check)
- `const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null)`
- `const vendorDeleteId = vendorToDelete?.id ?? ''`
- `const { data: vendorItemCount = 0 } = useItemCountByVendor(vendorDeleteId)`
- `const handleConfirmDelete = () => { ... }`
- The entire `ConfirmDialog` JSX block at the bottom

Remove from imports:
- `ConfirmDialog` from `@/components/ui/confirm-dialog`
- `useItemCountByVendor` from `@/hooks/useVendors`

Change:
```tsx
onDelete={() => setVendorToDelete(vendor)}
```
To:
```tsx
onDelete={() => deleteVendor.mutate(vendor.id)}
```

### Step 6: Update VendorCard.stories.tsx

The `onDelete` prop now means "perform the delete". Update the story descriptions:

```tsx
export const Default: Story = {
  args: {
    vendor,
    onDelete: () => console.log('Delete Costco'),
  },
}

export const WithItemCount: Story = {
  args: {
    vendor,
    itemCount: 5,
    onDelete: () => console.log('Delete Costco'),
  },
}
```

(Minimal change — the stories functionally work the same since `onDelete` only fires after dialog confirm.)

### Step 7: Run all tests

```bash
pnpm test --run
```

Expected: all tests PASS. In particular:
- `vendors.test.tsx` "user can delete a vendor with confirmation" should still work: the delete button aria-label is preserved via `buttonAriaLabel`, the `DeleteButton` dialog title contains the vendor name, and confirming calls the `deleteVendor.mutate` fn which is the mocked `mutate`.

### Step 8: Commit

```bash
git add src/components/VendorCard.tsx src/components/VendorCard.test.tsx src/components/VendorCard.stories.tsx
git add src/routes/settings/vendors/index.tsx
git commit -m "$(cat <<'EOF'
feat(vendors): replace VendorCard delete button with DeleteButton

- VendorCard: Button+aria → DeleteButton with icon trigger, dialog shows item count
- vendors/index: remove ConfirmDialog, vendorToDelete state, useItemCountByVendor
- onDelete prop now receives the actual delete function (not a dialog-open trigger)
- VendorCard tests: verify full dialog flow (click → confirm → onDelete called)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: RecipeCard → DeleteButton

**Goal:** Same pattern as Task 3 but for recipes. Also add delete tests to `recipes/$id.test.tsx` (currently missing).

**Files:**
- Modify: `src/components/RecipeCard.tsx`
- Modify: `src/routes/settings/recipes/index.tsx`
- Modify: `src/components/RecipeCard.stories.tsx`
- Create: `src/components/RecipeCard.test.tsx`
- Modify: `src/routes/settings/recipes/$id.test.tsx`

### Step 1: Create RecipeCard.test.tsx

No test file exists for `RecipeCard`. Create `src/components/RecipeCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Recipe } from '@/types'
import { RecipeCard } from './RecipeCard'

// Mock TanStack Router Link
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      children?: React.ReactNode
      to?: string
      params?: unknown
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

const recipe: Recipe = {
  id: '1',
  name: 'Pasta Dinner',
  items: [],
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('RecipeCard', () => {
  it('displays recipe name', () => {
    // Given a recipe
    render(<RecipeCard recipe={recipe} onDelete={vi.fn()} />)

    // Then the recipe name is shown
    expect(screen.getByText('Pasta Dinner')).toBeInTheDocument()
  })

  it('user can delete recipe after confirming the dialog', async () => {
    // Given a recipe card with delete handler
    const onDelete = vi.fn()
    render(<RecipeCard recipe={recipe} onDelete={onDelete} />)
    const user = userEvent.setup()

    // When user clicks the delete button
    await user.click(screen.getByRole('button', { name: 'Delete Pasta Dinner' }))

    // Then confirmation dialog appears
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    // When user confirms
    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    // Then onDelete is called
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('user can cancel recipe deletion', async () => {
    // Given a recipe card
    const onDelete = vi.fn()
    render(<RecipeCard recipe={recipe} onDelete={onDelete} />)
    const user = userEvent.setup()

    // When user cancels the delete dialog
    await user.click(screen.getByRole('button', { name: 'Delete Pasta Dinner' }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Then onDelete is NOT called
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('displays item count when provided', () => {
    // Given a recipe with item count
    render(<RecipeCard recipe={recipe} itemCount={6} onDelete={vi.fn()} />)

    // Then the item count is shown
    expect(screen.getByText(/6 items/i)).toBeInTheDocument()
  })

  it('does not display item count when not provided', () => {
    // Given a recipe without item count
    render(<RecipeCard recipe={recipe} onDelete={vi.fn()} />)

    // Then no item count text is shown in the card
    expect(screen.queryByText(/· \d+ items/i)).not.toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test --run src/components/RecipeCard.test.tsx
```

Expected: FAIL — clicking delete button calls `onDelete` directly (no dialog yet).

### Step 3: Update RecipeCard.tsx

Read the file first. Apply same pattern as VendorCard.

Add import:
```tsx
import { DeleteButton } from '@/components/DeleteButton'
```

Replace the `Button`:
```tsx
<DeleteButton
  trigger={<Trash2 className="h-4 w-4" />}
  buttonVariant="destructive-ghost"
  buttonSize="icon"
  buttonClassName="h-8 w-8"
  buttonAriaLabel={`Delete ${recipe.name}`}
  dialogTitle={`Delete "${recipe.name}"?`}
  dialogDescription={
    (itemCount ?? 0) > 0 ? (
      <>
        This recipe contains <strong>{itemCount} item{itemCount !== 1 ? 's' : ''}</strong>.
        Your inventory will not be affected.
      </>
    ) : (
      <>This recipe has no items.</>
    )
  }
  onDelete={onDelete}
/>
```

### Step 4: Run test to verify it passes

```bash
pnpm test --run src/components/RecipeCard.test.tsx
```

Expected: all tests PASS.

### Step 5: Update recipes/index.tsx

Read the file first. Apply same cleanup as `vendors/index.tsx`:

Remove:
- `useState` (if `recipeToDelete` is only state)
- `type Recipe` import (if only used for state)
- `const [recipeToDelete, setRecipeToDelete] = useState<Recipe | null>(null)`
- `const recipeDeleteId = recipeToDelete?.id ?? ''`
- `const { data: recipeItemCount = 0 } = useItemCountByRecipe(recipeDeleteId)`
- `const handleConfirmDelete = () => { ... }`
- The `ConfirmDialog` JSX block

Remove from imports:
- `ConfirmDialog`
- `useItemCountByRecipe` from `@/hooks/useRecipes`

Change:
```tsx
onDelete={() => setRecipeToDelete(recipe)}
```
To:
```tsx
onDelete={() => deleteRecipe.mutate(recipe.id)}
```

### Step 6: Add delete tests to recipes/$id.test.tsx

Add a new describe block at the end of `src/routes/settings/recipes/$id.test.tsx`:

```tsx
describe('Recipe Detail - Delete Dialog', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.recipes.clear()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    sessionStorage.clear()
  })

  const renderInfoTab = (recipeId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/settings/recipes/${recipeId}`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can open delete dialog', async () => {
    // Given a recipe
    const recipe = await createRecipe({ name: 'Pasta Dinner' })
    renderInfoTab(recipe.id)
    const user = userEvent.setup()

    // Then delete button is visible
    const deleteButton = await screen.findByRole('button', {
      name: /^delete$/i,
    })
    expect(deleteButton).toBeInTheDocument()

    // When user clicks delete button
    await user.click(deleteButton)

    // Then delete dialog appears
    await waitFor(() => {
      expect(screen.getByText('Delete Recipe?')).toBeInTheDocument()
    })
  })

  it('user can confirm deletion and navigate back', async () => {
    // Given a recipe
    const recipe = await createRecipe({ name: 'Pasta Dinner' })
    renderInfoTab(recipe.id)
    const user = userEvent.setup()

    // When user confirms deletion
    const deleteButton = await screen.findByRole('button', {
      name: /^delete$/i,
    })
    await user.click(deleteButton)

    const confirmButton = await screen.findByRole('button', {
      name: /^delete$/i,
    })
    await user.click(confirmButton)

    // Then recipe is deleted
    await waitFor(async () => {
      const deletedRecipe = await db.recipes.get(recipe.id)
      expect(deletedRecipe).toBeUndefined()
    })
  })

  it('user can cancel deletion', async () => {
    // Given a recipe
    const recipe = await createRecipe({ name: 'Pasta Dinner' })
    renderInfoTab(recipe.id)
    const user = userEvent.setup()

    // When user opens and cancels
    const deleteButton = await screen.findByRole('button', {
      name: /^delete$/i,
    })
    await user.click(deleteButton)
    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelButton)

    // Then recipe is not deleted
    const stillExists = await db.recipes.get(recipe.id)
    expect(stillExists).toBeDefined()
    expect(stillExists?.name).toBe('Pasta Dinner')
  })
})
```

Note: Add missing imports to `recipes/$id.test.tsx` if needed (`db`, `createRecipe`, `waitFor`, etc. — check what's already imported).

### Step 7: Update RecipeCard.stories.tsx

Minimal update — same as VendorCard stories:

```tsx
export const Default: Story = {
  args: {
    recipe,
    onDelete: () => console.log('Delete Pasta Dinner'),
  },
}

export const WithItemCount: Story = {
  args: {
    recipe,
    itemCount: 6,
    onDelete: () => console.log('Delete Pasta Dinner'),
  },
}
```

### Step 8: Run all tests

```bash
pnpm test --run
```

Expected: all tests PASS.

### Step 9: Commit

```bash
git add src/components/RecipeCard.tsx src/components/RecipeCard.test.tsx src/components/RecipeCard.stories.tsx
git add src/routes/settings/recipes/index.tsx
git add src/routes/settings/recipes/'$id'.test.tsx
git commit -m "$(cat <<'EOF'
feat(recipes): replace RecipeCard delete button with DeleteButton

- RecipeCard: Button+aria → DeleteButton with icon trigger, dialog shows item count
- recipes/index: remove ConfirmDialog, recipeToDelete state, useItemCountByRecipe
- onDelete prop now receives the actual delete function
- Add RecipeCard.test.tsx with full dialog flow tests
- Add delete dialog tests to recipes/$id.test.tsx

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Fix remaining dialog description gaps

**Goal:** Ensure every delete dialog explicitly states cascade impact (or states there is none) for the remaining locations: vendor detail (0-item case), recipe detail (missing item count).

**Files:**
- Modify: `src/routes/settings/vendors/$id/index.tsx`
- Modify: `src/routes/settings/recipes/$id/index.tsx`

### Step 1: Fix vendor detail — 0-item case

Read `src/routes/settings/vendors/$id/index.tsx`.

The current `dialogDescription` has an awkward conditional:
```tsx
dialogDescription={
  <>
    <strong>{vendor.name}</strong>
    {affectedItemCount > 0 &&
      ` will be removed from ${affectedItemCount} item${affectedItemCount === 1 ? '' : 's'}.`}{' '}
    This action cannot be undone.
  </>
}
```

When count is 0 this renders: `Costco  This action cannot be undone.` — the name floats disconnected.

Replace with:
```tsx
dialogDescription={
  affectedItemCount > 0 ? (
    <>
      <strong>{vendor.name}</strong> will be removed from {affectedItemCount}{' '}
      item{affectedItemCount === 1 ? '' : 's'}. This action cannot be undone.
    </>
  ) : (
    <>
      No items are assigned to <strong>{vendor.name}</strong>. This action
      cannot be undone.
    </>
  )
}
```

### Step 2: Fix recipe detail — add item count

Read `src/routes/settings/recipes/$id/index.tsx`.

The `recipe` object has an `items` array (`recipe.items`). Use `recipe.items.length` for the count — no new hook needed.

Current:
```tsx
dialogDescription={
  <>
    <strong>{recipe.name}</strong> will be deleted. This action cannot
    be undone.
  </>
}
```

Replace with:
```tsx
dialogDescription={
  recipe.items.length > 0 ? (
    <>
      <strong>{recipe.name}</strong> will be deleted. It contains{' '}
      {recipe.items.length} item{recipe.items.length !== 1 ? 's' : ''}.
      Your inventory will not be affected.
    </>
  ) : (
    <>
      <strong>{recipe.name}</strong> will be deleted. It has no items.
    </>
  )
}
```

### Step 3: Run all tests

```bash
pnpm test --run
```

Expected: all tests PASS.

### Step 4: Commit

```bash
git add src/routes/settings/vendors/'$id'/index.tsx
git add src/routes/settings/recipes/'$id'/index.tsx
git commit -m "$(cat <<'EOF'
fix(delete): explicit no-impact messages in vendor and recipe delete dialogs

- vendor detail: show "No items are assigned to X" when count is 0
- recipe detail: show item count and "Your inventory will not be affected"

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Final Verification

After all 5 commits:

```bash
pnpm test --run
pnpm lint
pnpm build
```

All should pass cleanly. Optionally run `pnpm storybook` and spot-check:
- `Components/DeleteButton` stories show the new default variant
- `Components/VendorCard` stories open a confirmation dialog on delete click
- `Components/RecipeCard` stories same
