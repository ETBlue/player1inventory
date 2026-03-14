# Item Recipe Tab & Inline Creation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Recipes tab to the item detail page (mirroring the Vendors tab) and add "New Vendor" / "New Recipe" inline creation buttons (dialog-based, matching the Tags tab "New Tag" pattern) to both tabs.

**Architecture:** Recipe-centric — the recipe-item relationship is stored on `Recipe.items[]` and there are no changes to the `Item` type. The recipe tab derives assigned recipes by filtering `Recipe.items` for the current item ID. Toggle mutations update the recipe, not the item. The vendor tab gains the same inline-create dialog pattern already used in the tags tab (`AddTagDialog`).

**Tech Stack:** React 19, TanStack Router (file-based), TanStack Query, Dexie.js (IndexedDB), Tailwind CSS v4, shadcn/ui, Vitest + React Testing Library, lucide-react

---

## Task 1: Add Recipes tab to item detail nav

**Files:**
- Modify: `src/routes/items/$id.tsx`

**Step 1: Add the CookingPot icon import and Recipes tab link**

In `src/routes/items/$id.tsx`, add `CookingPot` to the lucide-react import and insert a new `<Link>` for the recipes tab between the Vendors and History links. `CookingPot` is the same icon used for Recipes in the settings page (`src/routes/settings/index.tsx`).

Current imports line:
```typescript
import { ArrowLeft, History, Settings2, Store, Tags } from 'lucide-react'
```
Change to:
```typescript
import { ArrowLeft, CookingPot, History, Settings2, Store, Tags } from 'lucide-react'
```

Insert this `<Link>` between the Vendors and History links (after the `Store` link, before the `History` link):
```tsx
<Link
  to="/items/$id/recipes"
  params={{ id }}
  className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
  activeProps={{
    className: 'border-foreground-muted',
  }}
  onClick={(e) => handleTabClick(e, `/items/${id}/recipes`)}
>
  <CookingPot className="h-4 w-4" />
</Link>
```

**Step 2: Run the dev server to verify the tab appears visually**

```bash
pnpm dev
```

Navigate to any item's detail page. A `UtensilsCrossed` icon tab should appear between Vendors and History. Clicking it will show a 404 until Task 2 is done — that's expected.

**Step 3: Commit**

```bash
git add src/routes/items/\$id.tsx
git commit -m "feat(item): add recipes tab icon to item detail nav"
```

---

## Task 2: Create the Recipes tab route

**Files:**
- Create: `src/routes/items/$id/recipes.tsx`
- Create: `src/routes/items/$id/recipes.test.tsx`

**Step 1: Write the failing test**

Create `src/routes/items/$id/recipes.test.tsx`:

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createItem, createRecipe } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Recipes Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.recipes.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderRecipesTab = (itemId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/items/${itemId}/recipes`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can see all recipes on the recipes tab', async () => {
    // Given an item and two recipes (neither contains the item)
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
    await createRecipe({ name: 'Pasta Sauce' })
    await createRecipe({ name: 'Smoothie' })

    renderRecipesTab(item.id)

    // Then both recipe names appear as badges
    await waitFor(() => {
      expect(screen.getByText('Pasta Sauce')).toBeInTheDocument()
      expect(screen.getByText('Smoothie')).toBeInTheDocument()
    })
  })

  it('user can see assigned recipes highlighted', async () => {
    // Given a recipe that already contains the item
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
    await createRecipe({
      name: 'Pasta Sauce',
      items: [{ itemId: item.id, defaultAmount: 0 }],
    })

    renderRecipesTab(item.id)

    // Then the recipe badge is visible (assigned recipes appear in list)
    await waitFor(() => {
      expect(screen.getByText('Pasta Sauce')).toBeInTheDocument()
    })
  })

  it('user can assign a recipe to an item', async () => {
    // Given an item and a recipe that does not contain the item
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
    const recipe = await createRecipe({ name: 'Pasta Sauce' })

    renderRecipesTab(item.id)
    const user = userEvent.setup()

    // When user clicks the recipe badge
    await waitFor(() => {
      expect(screen.getByText('Pasta Sauce')).toBeInTheDocument()
    })
    await user.click(screen.getByText('Pasta Sauce'))

    // Then the recipe's items array includes the item with defaultAmount 0
    await waitFor(async () => {
      const updatedRecipe = await db.recipes.get(recipe.id)
      expect(updatedRecipe?.items).toContainEqual({
        itemId: item.id,
        defaultAmount: 0,
      })
    })
  })

  it('user can unassign a recipe from an item', async () => {
    // Given a recipe that contains the item
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })
    const recipe = await createRecipe({
      name: 'Pasta Sauce',
      items: [{ itemId: item.id, defaultAmount: 0 }],
    })

    renderRecipesTab(item.id)
    const user = userEvent.setup()

    // When user clicks the assigned recipe badge
    await waitFor(() => {
      expect(screen.getByText('Pasta Sauce')).toBeInTheDocument()
    })
    await user.click(screen.getByText('Pasta Sauce'))

    // Then the item is removed from the recipe's items array
    await waitFor(async () => {
      const updatedRecipe = await db.recipes.get(recipe.id)
      expect(
        updatedRecipe?.items.some((ri) => ri.itemId === item.id),
      ).toBe(false)
    })
  })

  it('user can create a new recipe from the recipes tab', async () => {
    // Given an item and no recipes
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderRecipesTab(item.id)
    const user = userEvent.setup()

    // When user clicks "New Recipe" button and types a name
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new recipe/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /new recipe/i }))

    // Then the dialog opens
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText(/name/i), 'My New Recipe')
    await user.click(screen.getByRole('button', { name: /add recipe/i }))

    // Then a recipe is created and assigned to this item
    await waitFor(async () => {
      const recipes = await db.recipes.toArray()
      const newRecipe = recipes.find((r) => r.name === 'My New Recipe')
      expect(newRecipe).toBeDefined()
      expect(newRecipe?.items.some((ri) => ri.itemId === item.id)).toBe(true)
    })
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test src/routes/items/\$id/recipes.test.tsx
```

Expected: All tests FAIL (route doesn't exist yet, will fail with routing errors).

**Step 3: Create the Recipes tab route**

Create `src/routes/items/$id/recipes.tsx`:

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { AddTagDialog } from '@/components/AddTagDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useItem, useUpdateItem } from '@/hooks'
import { useCreateRecipe, useRecipes, useUpdateRecipe } from '@/hooks/useRecipes'

export const Route = createFileRoute('/items/$id/recipes')({
  component: RecipesTab,
})

function RecipesTab() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const { data: recipes = [] } = useRecipes()
  const updateRecipe = useUpdateRecipe()
  const createRecipe = useCreateRecipe()
  const [showDialog, setShowDialog] = useState(false)
  const [newRecipeName, setNewRecipeName] = useState('')

  const toggleRecipe = (recipe: { id: string; items: { itemId: string; defaultAmount: number }[] }) => {
    if (!item) return

    const isAssigned = recipe.items.some((ri) => ri.itemId === id)
    const newItems = isAssigned
      ? recipe.items.filter((ri) => ri.itemId !== id)
      : [...recipe.items, { itemId: id, defaultAmount: 0 }]

    updateRecipe.mutate({ id: recipe.id, updates: { items: newItems } })
  }

  const handleAddRecipe = () => {
    if (!newRecipeName.trim()) return

    createRecipe.mutate(
      {
        name: newRecipeName.trim(),
        items: [{ itemId: id, defaultAmount: 0 }],
      },
      {
        onSuccess: () => {
          setNewRecipeName('')
          setShowDialog(false)
        },
      },
    )
  }

  if (!item) return null

  const sortedRecipes = [...recipes].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex flex-wrap gap-2">
        {sortedRecipes.map((recipe) => {
          const isAssigned = recipe.items.some((ri) => ri.itemId === id)

          return (
            <Badge
              key={recipe.id}
              variant={isAssigned ? 'neutral' : 'neutral-outline'}
              className="cursor-pointer capitalize"
              onClick={() => toggleRecipe(recipe)}
            >
              {recipe.name}
              {isAssigned && <X className="ml-1 h-3 w-3" />}
            </Badge>
          )
        })}
      </div>

      <Button
        variant="neutral-ghost"
        size="sm"
        className="gap-1"
        onClick={() => setShowDialog(true)}
      >
        <Plus />
        New Recipe
      </Button>

      <AddTagDialog
        open={showDialog}
        tagName={newRecipeName}
        onTagNameChange={setNewRecipeName}
        onAdd={handleAddRecipe}
        onClose={() => {
          setNewRecipeName('')
          setShowDialog(false)
        }}
      />
    </div>
  )
}
```

**Note on `AddTagDialog` reuse:** `AddTagDialog` is a generic name/input dialog. Its labels ("Add Tag", "Name") will show generic text. If the product wants "Add Recipe" as the dialog title, a new `AddRecipeDialog` component would be needed — but for now we reuse `AddTagDialog` to keep it simple. If this bothers you, see the optional Task 5 below.

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/routes/items/\$id/recipes.test.tsx
```

Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add src/routes/items/\$id/recipes.tsx src/routes/items/\$id/recipes.test.tsx
git commit -m "feat(item): add recipes tab with toggle and inline create"
```

---

## Task 3: Add "New Vendor" button to the Vendors tab

**Files:**
- Modify: `src/routes/items/$id/vendors.tsx`
- Modify: `src/routes/items/$id/vendors.test.tsx`

**Step 1: Write the failing test**

Add this test to `src/routes/items/$id/vendors.test.tsx` inside the existing `describe('Vendors Tab', ...)` block:

```typescript
it('user can create a new vendor from the vendors tab', async () => {
  // Given an item and no vendors
  const item = await createItem({
    name: 'Test Item',
    targetUnit: 'package',
    targetQuantity: 2,
    refillThreshold: 1,
    packedQuantity: 0,
    unpackedQuantity: 0,
    consumeAmount: 1,
    tagIds: [],
  })

  renderVendorsTab(item.id)
  const user = userEvent.setup()

  // When user clicks "New Vendor" and types a name
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /new vendor/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole('button', { name: /new vendor/i }))

  await waitFor(() => {
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
  await user.type(screen.getByLabelText(/name/i), 'Costco')
  await user.click(screen.getByRole('button', { name: /add tag/i }))

  // Then the vendor is created and assigned to the item
  await waitFor(async () => {
    const vendors = await db.vendors.toArray()
    const newVendor = vendors.find((v) => v.name === 'Costco')
    expect(newVendor).toBeDefined()
    const updatedItem = await db.items.get(item.id)
    expect(updatedItem?.vendorIds).toContain(newVendor?.id)
  })
})
```

Also add `db` and `createVendor` to imports if needed (they're already there in the existing test file), and add `useCreateVendor` to imports in the component.

**Step 2: Run test to verify it fails**

```bash
pnpm test src/routes/items/\$id/vendors.test.tsx
```

Expected: The new test FAILS. Existing tests PASS.

**Step 3: Update the Vendors tab component**

Replace the contents of `src/routes/items/$id/vendors.tsx` with:

```typescript
import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { AddTagDialog } from '@/components/AddTagDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useItem, useUpdateItem, useVendors } from '@/hooks'
import { useCreateVendor } from '@/hooks/useVendors'

export const Route = createFileRoute('/items/$id/vendors')({
  component: VendorsTab,
})

function VendorsTab() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const { data: vendors = [] } = useVendors()
  const updateItem = useUpdateItem()
  const createVendor = useCreateVendor()
  const [showDialog, setShowDialog] = useState(false)
  const [newVendorName, setNewVendorName] = useState('')

  const toggleVendor = (vendorId: string) => {
    if (!item) return

    const currentVendorIds = item.vendorIds ?? []
    const newVendorIds = currentVendorIds.includes(vendorId)
      ? currentVendorIds.filter((vid) => vid !== vendorId)
      : [...currentVendorIds, vendorId]

    updateItem.mutate({ id, updates: { vendorIds: newVendorIds } })
  }

  const handleAddVendor = () => {
    if (!newVendorName.trim()) return

    createVendor.mutate(newVendorName.trim(), {
      onSuccess: (newVendor) => {
        // Immediately assign to current item
        const currentVendorIds = item?.vendorIds ?? []
        updateItem.mutate({
          id,
          updates: { vendorIds: [...currentVendorIds, newVendor.id] },
        })
        setNewVendorName('')
        setShowDialog(false)
      },
    })
  }

  if (!item) return null

  const sortedVendors = [...vendors].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  return (
    <div className="space-y-6 max-w-2xl">
      {sortedVendors.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          No vendors yet.{' '}
          <Link to="/settings/vendors" className="underline">
            Add vendors in Settings → Vendors
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sortedVendors.map((vendor) => {
            const isAssigned = (item.vendorIds ?? []).includes(vendor.id)

            return (
              <Badge
                key={vendor.id}
                variant={isAssigned ? 'neutral' : 'neutral-outline'}
                className="cursor-pointer normal-case"
                onClick={() => toggleVendor(vendor.id)}
              >
                {vendor.name}
                {isAssigned && <X className="ml-1 h-3 w-3" />}
              </Badge>
            )
          })}
        </div>
      )}

      <Button
        variant="neutral-ghost"
        size="sm"
        className="gap-1"
        onClick={() => setShowDialog(true)}
      >
        <Plus />
        New Vendor
      </Button>

      <AddTagDialog
        open={showDialog}
        tagName={newVendorName}
        onTagNameChange={setNewVendorName}
        onAdd={handleAddVendor}
        onClose={() => {
          setNewVendorName('')
          setShowDialog(false)
        }}
      />
    </div>
  )
}
```

**Note on `useCreateVendor` return value:** Check that `createVendor` in `src/db/operations.ts` returns the created `Vendor` object (it should, since `createRecipe` does). If it returns `void`, use an alternative approach: after `createVendor` succeeds, query the latest vendors list to find the new ID. But operations.ts in this project returns the created entity, so `onSuccess: (newVendor)` should work.

**Step 4: Run all vendor tab tests**

```bash
pnpm test src/routes/items/\$id/vendors.test.tsx
```

Expected: All 6 tests PASS.

**Step 5: Commit**

```bash
git add src/routes/items/\$id/vendors.tsx src/routes/items/\$id/vendors.test.tsx
git commit -m "feat(item): add new vendor button with inline create dialog"
```

---

## Task 4: Run full test suite and verify no regressions

**Step 1: Run all tests**

```bash
pnpm test
```

Expected: All tests PASS. No regressions.

**Step 2: Run the dev server and manually verify**

```bash
pnpm dev
```

Manual checks:
- Navigate to any item's detail page
- Verify 5 tabs appear: Settings | Tags | Vendors | UtensilsCrossed | History
- Click the UtensilsCrossed tab → recipe badges appear; toggle works; "New Recipe" button opens dialog
- Click the Vendors tab → "New Vendor" button visible; dialog opens; created vendor immediately assigned
- Back-navigation and dirty state still work correctly (try editing stock status, then switching tabs)

**Step 3: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix(item): address any issues found in manual verification"
```

---

## Task 5 (Optional): Rename AddTagDialog to a generic AddNameDialog

If the dialog showing "Add Tag" as title is unacceptable for the Vendor and Recipe tabs, create a generic dialog component.

**Files:**
- Create: `src/components/AddNameDialog.tsx`
- Modify: `src/components/AddTagDialog.tsx` (make it a thin wrapper)
- Modify: `src/routes/items/$id/tags.tsx` (update import)
- Modify: `src/routes/items/$id/vendors.tsx` (update import)
- Modify: `src/routes/items/$id/recipes.tsx` (update import)

**New `AddNameDialog` component:**

```typescript
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
  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="entityName">Name</Label>
            <Input
              id="entityName"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={placeholder}
              className="capitalize"
              onKeyDown={(e) => e.key === 'Enter' && onAdd()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="neutral-ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onAdd}>{submitLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

Update `AddTagDialog` to wrap `AddNameDialog`:

```typescript
import { AddNameDialog } from './AddNameDialog'

interface AddTagDialogProps {
  open: boolean
  tagName: string
  onTagNameChange: (name: string) => void
  onAdd: () => void
  onClose: () => void
}

export function AddTagDialog({
  open,
  tagName,
  onTagNameChange,
  onAdd,
  onClose,
}: AddTagDialogProps) {
  return (
    <AddNameDialog
      open={open}
      title="Add Tag"
      submitLabel="Add Tag"
      name={tagName}
      placeholder="e.g., Dairy, Frozen"
      onNameChange={onTagNameChange}
      onAdd={onAdd}
      onClose={onClose}
    />
  )
}
```

Update vendors tab to use `AddNameDialog` directly:
```tsx
<AddNameDialog
  open={showDialog}
  title="New Vendor"
  submitLabel="Add Vendor"
  name={newVendorName}
  placeholder="e.g., Costco, iHerb"
  onNameChange={setNewVendorName}
  onAdd={handleAddVendor}
  onClose={() => { setNewVendorName(''); setShowDialog(false) }}
/>
```

Update recipes tab similarly:
```tsx
<AddNameDialog
  open={showDialog}
  title="New Recipe"
  submitLabel="Add Recipe"
  name={newRecipeName}
  placeholder="e.g., Pasta Sauce, Smoothie"
  onNameChange={setNewRecipeName}
  onAdd={handleAddRecipe}
  onClose={() => { setNewRecipeName(''); setShowDialog(false) }}
/>
```

Update the test for recipes tab to match the new button label:
- Change `{ name: /add recipe/i }` to match whatever submit label is used.

**Run tests after this refactor:**
```bash
pnpm test
```

Expected: All tests PASS.

**Commit:**
```bash
git add src/components/AddNameDialog.tsx src/components/AddTagDialog.tsx \
  src/routes/items/\$id/tags.tsx src/routes/items/\$id/vendors.tsx \
  src/routes/items/\$id/recipes.tsx
git commit -m "refactor(dialog): extract generic AddNameDialog component"
```
