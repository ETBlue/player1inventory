# Delete Confirmation Dialogs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace browser `confirm()` with custom AlertDialog components showing impact counts, and implement cascade deletion for items.

**Architecture:** Extend database operations layer with cascade deletion and count helpers, add React Query hooks for counts, update UI components with inline AlertDialog following existing "unsaved changes" pattern.

**Tech Stack:** Dexie.js (IndexedDB), TanStack Query, React, TypeScript, Vitest, shadcn/ui AlertDialog

---

## Task 1: Database Cascade Deletion for Items

**Files:**
- Modify: `src/db/operations.ts:43-45` (deleteItem function)
- Test: `src/db/operations.test.ts`

**Step 1: Write failing test for inventory log cascade deletion**

Add to `src/db/operations.test.ts`:

```typescript
it('deleteItem cascades to inventory logs', async () => {
  // Given an item with inventory logs
  const item = await createItem({
    name: 'Test Item',
    tagIds: [],
    targetQuantity: 5,
    refillThreshold: 2,
  })
  await db.inventoryLogs.add({
    id: crypto.randomUUID(),
    itemId: item.id,
    delta: 5,
    occurredAt: new Date(),
    createdAt: new Date(),
  })
  await db.inventoryLogs.add({
    id: crypto.randomUUID(),
    itemId: item.id,
    delta: -2,
    occurredAt: new Date(),
    createdAt: new Date(),
  })

  // When item is deleted
  await deleteItem(item.id)

  // Then inventory logs are also deleted
  const logs = await db.inventoryLogs.where('itemId').equals(item.id).toArray()
  expect(logs).toHaveLength(0)
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/db/operations.test.ts -t "deleteItem cascades to inventory logs"`

Expected: FAIL - logs array still has 2 items

**Step 3: Write failing test for cart items cascade deletion**

Add to `src/db/operations.test.ts`:

```typescript
it('deleteItem cascades to cart items', async () => {
  // Given an item in a shopping cart
  const item = await createItem({
    name: 'Test Item',
    tagIds: [],
    targetQuantity: 5,
    refillThreshold: 2,
  })
  const cart = await db.shoppingCarts.add({
    id: crypto.randomUUID(),
    status: 'active',
    createdAt: new Date(),
  })
  await db.cartItems.add({
    id: crypto.randomUUID(),
    cartId: cart,
    itemId: item.id,
    quantity: 3,
  })

  // When item is deleted
  await deleteItem(item.id)

  // Then cart items are also deleted
  const cartItems = await db.cartItems.where('itemId').equals(item.id).toArray()
  expect(cartItems).toHaveLength(0)
})
```

**Step 4: Run test to verify it fails**

Run: `pnpm test src/db/operations.test.ts -t "deleteItem cascades to cart items"`

Expected: FAIL - cartItems array still has 1 item

**Step 5: Implement cascade deletion in deleteItem**

Modify `src/db/operations.ts` deleteItem function (around line 43):

```typescript
export async function deleteItem(id: string): Promise<void> {
  // Delete related inventory logs
  await db.inventoryLogs.where('itemId').equals(id).delete()

  // Delete related cart items
  await db.cartItems.where('itemId').equals(id).delete()

  // Delete the item itself
  await db.items.delete(id)
}
```

**Step 6: Run tests to verify they pass**

Run: `pnpm test src/db/operations.test.ts -t "deleteItem cascades"`

Expected: PASS for both tests

**Step 7: Commit**

```bash
git add src/db/operations.ts src/db/operations.test.ts
git commit -m "feat(db): add cascade deletion for items

Deleting an item now cascades to:
- Inventory logs
- Cart items

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Database Count Helper Functions

**Files:**
- Modify: `src/db/operations.ts` (add after deleteItem)
- Test: `src/db/operations.test.ts`

**Step 1: Write failing test for getInventoryLogCountByItem**

Add to `src/db/operations.test.ts`:

```typescript
it('getInventoryLogCountByItem returns correct count', async () => {
  // Given an item with 3 inventory logs
  const item = await createItem({
    name: 'Test Item',
    tagIds: [],
    targetQuantity: 5,
    refillThreshold: 2,
  })
  await db.inventoryLogs.add({
    id: crypto.randomUUID(),
    itemId: item.id,
    delta: 5,
    occurredAt: new Date(),
    createdAt: new Date(),
  })
  await db.inventoryLogs.add({
    id: crypto.randomUUID(),
    itemId: item.id,
    delta: -2,
    occurredAt: new Date(),
    createdAt: new Date(),
  })
  await db.inventoryLogs.add({
    id: crypto.randomUUID(),
    itemId: item.id,
    delta: 1,
    occurredAt: new Date(),
    createdAt: new Date(),
  })

  // When counting logs
  const count = await getInventoryLogCountByItem(item.id)

  // Then count is correct
  expect(count).toBe(3)
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/db/operations.test.ts -t "getInventoryLogCountByItem"`

Expected: FAIL - "getInventoryLogCountByItem is not defined"

**Step 3: Write failing test for getCartItemCountByItem**

Add to `src/db/operations.test.ts`:

```typescript
it('getCartItemCountByItem returns correct count', async () => {
  // Given an item in 2 different carts
  const item = await createItem({
    name: 'Test Item',
    tagIds: [],
    targetQuantity: 5,
    refillThreshold: 2,
  })
  const cart1 = await db.shoppingCarts.add({
    id: crypto.randomUUID(),
    status: 'active',
    createdAt: new Date(),
  })
  const cart2 = await db.shoppingCarts.add({
    id: crypto.randomUUID(),
    status: 'active',
    createdAt: new Date(),
  })
  await db.cartItems.add({
    id: crypto.randomUUID(),
    cartId: cart1,
    itemId: item.id,
    quantity: 3,
  })
  await db.cartItems.add({
    id: crypto.randomUUID(),
    cartId: cart2,
    itemId: item.id,
    quantity: 1,
  })

  // When counting cart items
  const count = await getCartItemCountByItem(item.id)

  // Then count is correct
  expect(count).toBe(2)
})
```

**Step 4: Run test to verify it fails**

Run: `pnpm test src/db/operations.test.ts -t "getCartItemCountByItem"`

Expected: FAIL - "getCartItemCountByItem is not defined"

**Step 5: Implement count helper functions**

Add to `src/db/operations.ts` after deleteItem:

```typescript
export async function getInventoryLogCountByItem(
  itemId: string,
): Promise<number> {
  return await db.inventoryLogs.where('itemId').equals(itemId).count()
}

export async function getCartItemCountByItem(
  itemId: string,
): Promise<number> {
  return await db.cartItems.where('itemId').equals(itemId).count()
}
```

**Step 6: Run tests to verify they pass**

Run: `pnpm test src/db/operations.test.ts -t "Count"`

Expected: PASS for both count tests

**Step 7: Commit**

```bash
git add src/db/operations.ts src/db/operations.test.ts
git commit -m "feat(db): add count helpers for item relations

Add functions to count:
- Inventory logs by item
- Cart items by item

Used for delete confirmation dialogs

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: React Query Hooks for Counts

**Files:**
- Modify: `src/hooks/useItems.ts` (add at end)
- Modify: `src/db/operations.ts` (export count functions if not already exported)

**Step 1: Export count functions from operations**

Verify in `src/db/operations.ts` that the functions are exported (should be from Task 2).

**Step 2: Add useInventoryLogCountByItem hook**

Add to end of `src/hooks/useItems.ts`:

```typescript
import {
  // ... existing imports
  getInventoryLogCountByItem,
  getCartItemCountByItem,
} from '@/db/operations'

// ... existing hooks

export function useInventoryLogCountByItem(itemId: string) {
  return useQuery({
    queryKey: ['inventoryLogs', 'countByItem', itemId],
    queryFn: () => getInventoryLogCountByItem(itemId),
    enabled: !!itemId,
  })
}

export function useCartItemCountByItem(itemId: string) {
  return useQuery({
    queryKey: ['cartItems', 'countByItem', itemId],
    queryFn: () => getCartItemCountByItem(itemId),
    enabled: !!itemId,
  })
}
```

**Step 3: Verify hooks are exported**

Check that the functions are exported by searching for them:

Run: `grep -n "export function use" src/hooks/useItems.ts`

Expected: Should see both new hooks listed

**Step 4: Run type check**

Run: `pnpm build`

Expected: No TypeScript errors

**Step 5: Commit**

```bash
git add src/hooks/useItems.ts
git commit -m "feat(hooks): add count hooks for item relations

Add React Query hooks:
- useInventoryLogCountByItem
- useCartItemCountByItem

Used for delete confirmation dialogs

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Tag Page Delete Button & Dialog

**Files:**
- Modify: `src/routes/settings/tags/$id.tsx:1-163`

**Step 1: Add imports and hooks**

Modify imports section in `src/routes/settings/tags/$id.tsx`:

```typescript
import { ArrowLeft, ListTodo, Settings2, Trash2 } from 'lucide-react'
import { useState } from 'react'
// ... existing imports
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { TagLayoutProvider, useTagLayout } from '@/hooks/useTagLayout'
import { useDeleteTag, useTags, useItemCountByTag } from '@/hooks/useTags'
```

**Step 2: Add state and hooks in component**

In `TagDetailLayoutInner` function, add after existing hooks (around line 34):

```typescript
const deleteTag = useDeleteTag()
const { data: affectedItemCount = 0 } = useItemCountByTag(id)
const [showDeleteDialog, setShowDeleteDialog] = useState(false)
```

**Step 3: Add delete button in top bar**

Add delete button after the tabs div (around line 124), before the closing `</div>`:

```typescript
          </div>
          <Button
            variant="destructive"
            size="icon"
            onClick={() => setShowDeleteDialog(true)}
            aria-label="Delete tag"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
```

**Step 4: Add delete confirmation dialog**

Add after the existing "Discard Confirmation Dialog" (around line 152):

```typescript
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tag?</AlertDialogTitle>
            <AlertDialogDescription>
              {affectedItemCount > 0
                ? `${affectedItemCount} item${affectedItemCount === 1 ? '' : 's'} will lose this tag.`
                : 'This tag is not assigned to any items.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteTag.mutate(id, {
                  onSuccess: () => goBack(),
                })
              }}
              disabled={deleteTag.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTag.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
```

**Step 5: Run type check**

Run: `pnpm build`

Expected: No TypeScript errors

**Step 6: Manual test in browser**

Run: `pnpm dev`

- Navigate to `/settings/tags`
- Click on any tag to open detail page
- Verify delete button appears in top bar (red trash icon)
- Click delete button - dialog should appear with item count
- Click Cancel - dialog closes
- Click Delete - tag should be deleted and navigate back

**Step 7: Commit**

```bash
git add src/routes/settings/tags/\$id.tsx
git commit -m "feat(tags): add delete button with confirmation dialog

- Add Trash2 delete button in top bar
- Show AlertDialog with affected item count
- Navigate back on successful deletion
- Show loading state during deletion

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Item Page Delete Dialog

**Files:**
- Modify: `src/routes/items/$id.tsx:28,166-178`

**Step 1: Update imports**

Modify imports section in `src/routes/items/$id.tsx` (line 28):

```typescript
import { useDeleteItem, useItem } from '@/hooks'
import {
  useInventoryLogCountByItem,
  useCartItemCountByItem
} from '@/hooks/useItems'
```

**Step 2: Add hooks and state**

In `ItemLayoutInner` function, add after existing hooks (around line 43):

```typescript
const { data: logCount = 0 } = useInventoryLogCountByItem(id)
const { data: cartCount = 0 } = useCartItemCountByItem(id)
const [showDeleteDialog, setShowDeleteDialog] = useState(false)
```

**Step 3: Update delete button onClick**

Replace the existing delete button (lines 166-178) with:

```typescript
          <Button
            variant="destructive"
            size="icon"
            onClick={() => setShowDeleteDialog(true)}
            aria-label="Delete item"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
```

**Step 4: Add delete confirmation dialog**

Add after the existing "Discard Confirmation Dialog" (around line 205):

```typescript
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete item?</AlertDialogTitle>
            <AlertDialogDescription>
              {(logCount > 0 || cartCount > 0) && (
                <>
                  This will also delete:
                  <ul className="list-disc list-inside mt-2">
                    {logCount > 0 && (
                      <li>
                        {logCount} inventory log{logCount === 1 ? '' : 's'}
                      </li>
                    )}
                    {cartCount > 0 && (
                      <li>
                        {cartCount} cart entr{cartCount === 1 ? 'y' : 'ies'}
                      </li>
                    )}
                  </ul>
                </>
              )}
              {logCount === 0 && cartCount === 0 &&
                'This item has no related data.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteItem.mutate(id, {
                  onSuccess: () => goBack(),
                })
              }}
              disabled={deleteItem.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteItem.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
```

**Step 5: Run type check**

Run: `pnpm build`

Expected: No TypeScript errors

**Step 6: Manual test in browser**

Run: `pnpm dev`

- Navigate to any item detail page
- Click delete button - dialog should appear with counts
- Verify it shows "This item has no related data" if no logs/cart items
- Click Cancel - dialog closes
- Add some inventory logs (using +/- buttons on pantry page)
- Click delete again - should show log count
- Click Delete - item should be deleted and navigate back

**Step 7: Commit**

```bash
git add src/routes/items/\$id.tsx
git commit -m "feat(items): replace confirm() with custom delete dialog

- Replace browser confirm with AlertDialog
- Show inventory log and cart item counts
- Cascade deletion implemented in database layer
- Navigate back on successful deletion
- Show loading state during deletion

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Tag Page Integration Tests

**Files:**
- Create: `src/routes/settings/tags/$id.test.tsx`

**Step 1: Create test file with setup**

Create `src/routes/settings/tags/$id.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from '@/routeTree.gen'
import { db } from '@/db'
import { createTag, createTagType, createItem } from '@/db/operations'

function createTestRouter() {
  return createRouter({
    routeTree,
    context: undefined,
  })
}

function renderWithRouter(initialPath: string) {
  const router = createTestRouter()
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  router.navigate({ to: initialPath })

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('Tag Detail Page - Delete Dialog', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  // Tests will go here
})
```

**Step 2: Write test for opening delete dialog**

Add test inside describe block:

```typescript
it('user can open delete dialog', async () => {
  // Given a tag
  const tagType = await createTagType({ name: 'Category', color: 'blue' })
  const tag = await createTag({ name: 'Dairy', typeId: tagType.id })

  // When user navigates to tag detail page
  renderWithRouter(`/settings/tags/${tag.id}`)

  // Then delete button is visible
  const deleteButton = await screen.findByRole('button', {
    name: /delete tag/i,
  })
  expect(deleteButton).toBeInTheDocument()

  // When user clicks delete button
  await userEvent.click(deleteButton)

  // Then delete dialog appears
  expect(screen.getByText('Delete tag?')).toBeInTheDocument()
  expect(
    screen.getByText('This tag is not assigned to any items.'),
  ).toBeInTheDocument()
})
```

**Step 3: Run test to verify it works**

Run: `pnpm test src/routes/settings/tags/\$id.test.tsx -t "open delete dialog"`

Expected: PASS

**Step 4: Write test for showing affected item count**

Add test:

```typescript
it('user can see affected item count in delete dialog', async () => {
  // Given a tag assigned to 2 items
  const tagType = await createTagType({ name: 'Category', color: 'blue' })
  const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
  await createItem({
    name: 'Milk',
    tagIds: [tag.id],
    targetQuantity: 2,
    refillThreshold: 1,
  })
  await createItem({
    name: 'Cheese',
    tagIds: [tag.id],
    targetQuantity: 1,
    refillThreshold: 0,
  })

  // When user opens delete dialog
  renderWithRouter(`/settings/tags/${tag.id}`)
  const deleteButton = await screen.findByRole('button', {
    name: /delete tag/i,
  })
  await userEvent.click(deleteButton)

  // Then dialog shows affected item count
  await waitFor(() => {
    expect(screen.getByText(/2 items will lose this tag/i)).toBeInTheDocument()
  })
})
```

**Step 5: Run test to verify it works**

Run: `pnpm test src/routes/settings/tags/\$id.test.tsx -t "affected item count"`

Expected: PASS

**Step 6: Write test for confirming deletion**

Add test:

```typescript
it('user can confirm deletion and navigate back', async () => {
  // Given a tag
  const tagType = await createTagType({ name: 'Category', color: 'blue' })
  const tag = await createTag({ name: 'Dairy', typeId: tagType.id })

  // When user confirms deletion
  renderWithRouter(`/settings/tags/${tag.id}`)
  const deleteButton = await screen.findByRole('button', {
    name: /delete tag/i,
  })
  await userEvent.click(deleteButton)

  const confirmButton = screen.getByRole('button', { name: /^delete$/i })
  await userEvent.click(confirmButton)

  // Then tag is deleted
  await waitFor(async () => {
    const deletedTag = await db.tags.get(tag.id)
    expect(deletedTag).toBeUndefined()
  })

  // And user is navigated away from detail page
  await waitFor(() => {
    expect(window.location.pathname).not.toBe(`/settings/tags/${tag.id}`)
  })
})
```

**Step 7: Run test to verify it works**

Run: `pnpm test src/routes/settings/tags/\$id.test.tsx -t "confirm deletion"`

Expected: PASS

**Step 8: Write test for canceling deletion**

Add test:

```typescript
it('user can cancel deletion', async () => {
  // Given a tag
  const tagType = await createTagType({ name: 'Category', color: 'blue' })
  const tag = await createTag({ name: 'Dairy', typeId: tagType.id })

  // When user opens and cancels delete dialog
  renderWithRouter(`/settings/tags/${tag.id}`)
  const deleteButton = await screen.findByRole('button', {
    name: /delete tag/i,
  })
  await userEvent.click(deleteButton)

  const cancelButton = screen.getByRole('button', { name: /cancel/i })
  await userEvent.click(cancelButton)

  // Then dialog closes
  await waitFor(() => {
    expect(screen.queryByText('Delete tag?')).not.toBeInTheDocument()
  })

  // And tag is not deleted
  const stillExists = await db.tags.get(tag.id)
  expect(stillExists).toBeDefined()
  expect(stillExists?.name).toBe('Dairy')
})
```

**Step 9: Run all tests to verify they pass**

Run: `pnpm test src/routes/settings/tags/\$id.test.tsx`

Expected: PASS for all 4 tests

**Step 10: Commit**

```bash
git add src/routes/settings/tags/\$id.test.tsx
git commit -m "test(tags): add delete dialog integration tests

Tests cover:
- Opening delete dialog
- Showing affected item count
- Confirming deletion
- Canceling deletion

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Item Page Delete Dialog Tests

**Files:**
- Modify: `src/routes/items/$id.test.tsx`

**Step 1: Write test for opening delete dialog**

Add test to existing describe block in `src/routes/items/$id.test.tsx`:

```typescript
it('user can open delete dialog', async () => {
  // Given an item
  const item = await createItem({
    name: 'Milk',
    tagIds: [],
    targetQuantity: 2,
    refillThreshold: 1,
  })

  // When user navigates to item detail page
  renderWithRouter(`/items/${item.id}`)

  // Then delete button is visible
  const deleteButton = await screen.findByRole('button', {
    name: /delete item/i,
  })
  expect(deleteButton).toBeInTheDocument()

  // When user clicks delete button
  await userEvent.click(deleteButton)

  // Then delete dialog appears
  expect(screen.getByText('Delete item?')).toBeInTheDocument()
  expect(
    screen.getByText('This item has no related data.'),
  ).toBeInTheDocument()
})
```

**Step 2: Run test to verify it works**

Run: `pnpm test src/routes/items/\$id.test.tsx -t "open delete dialog"`

Expected: PASS

**Step 3: Write test for showing related data counts**

Add test:

```typescript
it('user can see related data counts in delete dialog', async () => {
  // Given an item with 2 inventory logs and 1 cart entry
  const item = await createItem({
    name: 'Milk',
    tagIds: [],
    targetQuantity: 2,
    refillThreshold: 1,
  })
  await db.inventoryLogs.add({
    id: crypto.randomUUID(),
    itemId: item.id,
    delta: 5,
    occurredAt: new Date(),
    createdAt: new Date(),
  })
  await db.inventoryLogs.add({
    id: crypto.randomUUID(),
    itemId: item.id,
    delta: -2,
    occurredAt: new Date(),
    createdAt: new Date(),
  })
  const cartId = await db.shoppingCarts.add({
    id: crypto.randomUUID(),
    status: 'active',
    createdAt: new Date(),
  })
  await db.cartItems.add({
    id: crypto.randomUUID(),
    cartId: cartId,
    itemId: item.id,
    quantity: 3,
  })

  // When user opens delete dialog
  renderWithRouter(`/items/${item.id}`)
  const deleteButton = await screen.findByRole('button', {
    name: /delete item/i,
  })
  await userEvent.click(deleteButton)

  // Then dialog shows related data counts
  await waitFor(() => {
    expect(screen.getByText(/2 inventory logs/i)).toBeInTheDocument()
    expect(screen.getByText(/1 cart entry/i)).toBeInTheDocument()
  })
})
```

**Step 4: Run test to verify it works**

Run: `pnpm test src/routes/items/\$id.test.tsx -t "related data counts"`

Expected: PASS

**Step 5: Write test for confirming deletion with cascade**

Add test:

```typescript
it('user can confirm deletion and related data is cascaded', async () => {
  // Given an item with related data
  const item = await createItem({
    name: 'Milk',
    tagIds: [],
    targetQuantity: 2,
    refillThreshold: 1,
  })
  const logId = crypto.randomUUID()
  await db.inventoryLogs.add({
    id: logId,
    itemId: item.id,
    delta: 5,
    occurredAt: new Date(),
    createdAt: new Date(),
  })
  const cartId = await db.shoppingCarts.add({
    id: crypto.randomUUID(),
    status: 'active',
    createdAt: new Date(),
  })
  const cartItemId = crypto.randomUUID()
  await db.cartItems.add({
    id: cartItemId,
    cartId: cartId,
    itemId: item.id,
    quantity: 3,
  })

  // When user confirms deletion
  renderWithRouter(`/items/${item.id}`)
  const deleteButton = await screen.findByRole('button', {
    name: /delete item/i,
  })
  await userEvent.click(deleteButton)

  const confirmButton = screen.getByRole('button', { name: /^delete$/i })
  await userEvent.click(confirmButton)

  // Then item and related data are deleted
  await waitFor(async () => {
    const deletedItem = await db.items.get(item.id)
    expect(deletedItem).toBeUndefined()

    const deletedLog = await db.inventoryLogs.get(logId)
    expect(deletedLog).toBeUndefined()

    const deletedCartItem = await db.cartItems.get(cartItemId)
    expect(deletedCartItem).toBeUndefined()
  })

  // And user is navigated away from detail page
  await waitFor(() => {
    expect(window.location.pathname).not.toBe(`/items/${item.id}`)
  })
})
```

**Step 6: Run test to verify it works**

Run: `pnpm test src/routes/items/\$id.test.tsx -t "cascaded"`

Expected: PASS

**Step 7: Write test for canceling deletion**

Add test:

```typescript
it('user can cancel item deletion', async () => {
  // Given an item
  const item = await createItem({
    name: 'Milk',
    tagIds: [],
    targetQuantity: 2,
    refillThreshold: 1,
  })

  // When user opens and cancels delete dialog
  renderWithRouter(`/items/${item.id}`)
  const deleteButton = await screen.findByRole('button', {
    name: /delete item/i,
  })
  await userEvent.click(deleteButton)

  const cancelButton = screen.getByRole('button', { name: /cancel/i })
  await userEvent.click(cancelButton)

  // Then dialog closes
  await waitFor(() => {
    expect(screen.queryByText('Delete item?')).not.toBeInTheDocument()
  })

  // And item is not deleted
  const stillExists = await db.items.get(item.id)
  expect(stillExists).toBeDefined()
  expect(stillExists?.name).toBe('Milk')
})
```

**Step 8: Run all new tests to verify they pass**

Run: `pnpm test src/routes/items/\$id.test.tsx -t "delete"`

Expected: PASS for all 4 new tests

**Step 9: Run all tests in the file**

Run: `pnpm test src/routes/items/\$id.test.tsx`

Expected: PASS for all tests (including existing ones)

**Step 10: Commit**

```bash
git add src/routes/items/\$id.test.tsx
git commit -m "test(items): add delete dialog integration tests

Tests cover:
- Opening delete dialog
- Showing inventory log and cart item counts
- Confirming deletion with cascade
- Canceling deletion

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Final Verification

**Files:**
- All modified files

**Step 1: Run all tests**

Run: `pnpm test`

Expected: All tests pass

**Step 2: Run type check**

Run: `pnpm build`

Expected: No TypeScript errors

**Step 3: Run linter**

Run: `pnpm lint`

Expected: No linting errors

**Step 4: Manual smoke test**

Run: `pnpm dev`

Test the following scenarios:

1. **Tag deletion:**
   - Navigate to `/settings/tags`
   - Click on a tag to view detail page
   - Click delete button
   - Verify dialog shows correct item count
   - Cancel and verify tag still exists
   - Delete and verify tag is removed and navigation works

2. **Item deletion:**
   - Create an item and add some inventory logs (use +/- buttons)
   - Open item detail page
   - Click delete button
   - Verify dialog shows inventory log count
   - Cancel and verify item still exists
   - Delete and verify item is removed and navigation works

**Step 5: Update CLAUDE.md if needed**

Check if any documentation updates are needed in `CLAUDE.md` for the delete confirmation pattern.

No updates needed - the inline AlertDialog pattern is already documented.

**Step 6: Final commit (if any changes made)**

If any fixes were needed during verification:

```bash
git add .
git commit -m "chore: final verification and cleanup

All tests passing, no lint errors

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Success Criteria

- ✅ Tag page has delete button in top bar matching item page pattern
- ✅ All `confirm()` calls replaced with custom AlertDialog
- ✅ Delete dialogs show impact counts before deletion
- ✅ Item deletion cascades to inventory logs and cart items
- ✅ Post-deletion navigation works (goBack to previous page)
- ✅ All tests pass (database operations + component integration)
- ✅ No TypeScript or linting errors
- ✅ Manual testing confirms expected behavior

---

## Notes for Implementation

**Test-Driven Development:**
- Write failing tests first, verify they fail
- Implement minimal code to pass tests
- Run tests to verify they pass
- Commit after each complete task

**Commit Frequently:**
- One commit per completed task (after tests pass)
- Use conventional commit format: `feat(scope):`, `test(scope):`
- Include co-author attribution for Claude

**YAGNI Principle:**
- No shared DeleteDialog component (only 2 use cases)
- No toast notifications (not in scope, can add later)
- Keep implementations simple and focused

**Reference Skills:**
- @superpowers:test-driven-development for TDD guidance
- @superpowers:verification-before-completion before claiming done
