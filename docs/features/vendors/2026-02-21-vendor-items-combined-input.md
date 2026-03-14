# Vendor Items Combined Search+Create Input Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the two-element toolbar (search input + `+ New` button with a secondary inline input row) with a single combined input that handles both searching and creating items.

**Architecture:** All changes are isolated to one file: `src/routes/settings/vendors/$id/items.tsx`. The `search` state string doubles as the creation value. A `+ Create "<name>"` row appears in the list only when the search has non-empty text and zero items match. Pressing Enter or clicking the row creates the item, then clears the input and refocuses it.

**Tech Stack:** React 19, TanStack Query, Vitest + React Testing Library, shadcn/ui (`Input`, `Button`)

---

### Task 1: Update tests

**Files:**
- Modify: `src/routes/settings/vendors/$id/items.test.tsx`

The existing tests include several that cover the `+ New` button and secondary inline input. Replace them with tests for the new combined input behavior.

**Step 1: Remove obsolete tests**

Delete these `it(...)` blocks entirely (they test the old `+ New` flow):
- `'user can see a New button'`
- `'user can open the inline input by clicking New'`
- `'user can cancel inline creation by pressing Escape'`
- `'user cannot submit inline creation when the item name is empty'`

Also update the existing `'user can create an item by typing a name and pressing Enter'` test — it currently opens the secondary inline input first. Replace its body with the new flow (type in the search input directly).

**Step 2: Update the filter test's placeholder assertion**

In `'user can filter items by name'`, change:
```ts
screen.getByPlaceholderText(/search items/i)
```
to:
```ts
screen.getByPlaceholderText(/search or create/i)
```

**Step 3: Replace the create-by-Enter test**

Replace the body of `'user can create an item by typing a name and pressing Enter'`:

```ts
it('user can create an item by typing a name and pressing Enter', async () => {
  // Given a vendor with no items matching "Butter"
  const vendor = await createVendor('Costco')
  renderItemsTab(vendor.id)
  const user = userEvent.setup()

  await waitFor(() => {
    expect(screen.getByPlaceholderText(/search or create/i)).toBeInTheDocument()
  })

  // When user types "Butter" into the search input (zero matches) and presses Enter
  await user.type(screen.getByPlaceholderText(/search or create/i), 'Butter')
  await user.keyboard('{Enter}')

  // Then the new item appears in the list checked (assigned to the vendor)
  await waitFor(() => {
    expect(screen.getByLabelText('Butter')).toBeChecked()
  })

  const items = await db.items.toArray()
  const butter = items.find((i) => i.name === 'Butter')
  expect(butter?.vendorIds).toContain(vendor.id)
})
```

**Step 4: Add new tests after the updated Enter test**

```ts
it('user sees a create row only when search has text and zero items match', async () => {
  // Given a vendor with one item
  const vendor = await createVendor('Costco')
  await makeItem('Milk')
  renderItemsTab(vendor.id)
  const user = userEvent.setup()

  await waitFor(() => {
    expect(screen.getByPlaceholderText(/search or create/i)).toBeInTheDocument()
  })

  // When user types text that matches no items
  await user.type(screen.getByPlaceholderText(/search or create/i), 'xyz')

  // Then the create row is visible
  await waitFor(() => {
    expect(screen.getByText(/create "xyz"/i)).toBeInTheDocument()
  })

  // When user clears the input (types text that matches an item)
  await user.clear(screen.getByPlaceholderText(/search or create/i))
  await user.type(screen.getByPlaceholderText(/search or create/i), 'mil')

  // Then the create row is not shown (Milk matched)
  await waitFor(() => {
    expect(screen.queryByText(/create/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Milk')).toBeInTheDocument()
  })
})

it('user can create an item by clicking the create row', async () => {
  // Given a vendor with no items matching "Butter"
  const vendor = await createVendor('Costco')
  renderItemsTab(vendor.id)
  const user = userEvent.setup()

  await waitFor(() => {
    expect(screen.getByPlaceholderText(/search or create/i)).toBeInTheDocument()
  })

  // When user types "Butter" and clicks the create row
  await user.type(screen.getByPlaceholderText(/search or create/i), 'Butter')
  await waitFor(() => {
    expect(screen.getByText(/create "Butter"/i)).toBeInTheDocument()
  })
  await user.click(screen.getByText(/create "Butter"/i))

  // Then Butter appears in the list checked and the input is cleared
  await waitFor(() => {
    expect(screen.getByLabelText('Butter')).toBeChecked()
    expect(screen.getByPlaceholderText(/search or create/i)).toHaveValue('')
  })
})

it('user can clear the search by pressing Escape', async () => {
  // Given a vendor and the search input has text
  const vendor = await createVendor('Costco')
  renderItemsTab(vendor.id)
  const user = userEvent.setup()

  await waitFor(() => {
    expect(screen.getByPlaceholderText(/search or create/i)).toBeInTheDocument()
  })
  await user.type(screen.getByPlaceholderText(/search or create/i), 'xyz')

  // When user presses Escape
  await user.keyboard('{Escape}')

  // Then the input is cleared
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/search or create/i)).toHaveValue('')
  })
})

it('user does not see the New button', async () => {
  // Given a vendor
  const vendor = await createVendor('Costco')
  renderItemsTab(vendor.id)

  // Then no New button is present
  await waitFor(() => {
    expect(screen.queryByRole('button', { name: /new/i })).not.toBeInTheDocument()
  })
})
```

**Step 5: Run tests to verify they fail for the right reasons**

```bash
pnpm test src/routes/settings/vendors/\\$id/items.test.tsx
```

Expected: failures on the new/updated tests (placeholder not found, create row not found, New button still present). The four tests that test the old flow that you deleted should no longer exist.

**Step 6: Commit**

```bash
git add src/routes/settings/vendors/\$id/items.test.tsx
git commit -m "test(vendors): update items tab tests for combined search+create input"
```

---

### Task 2: Update the component

**Files:**
- Modify: `src/routes/settings/vendors/$id/items.tsx`

**Step 1: Add the `useRef` import and remove unused state**

At the top of the file, add `useRef` to the React import:
```ts
import { useMemo, useRef, useState } from 'react'
```

Remove the `Plus` import from lucide-react (we'll re-add it in the JSX — actually keep it, it's used in the create row). Keep `Check`, remove `X` since we're removing the cancel button. Final lucide imports:
```ts
import { Plus } from 'lucide-react'
```

(`Check` and `X` are only used by the old inline input — remove them both.)

Remove the `Button` import since the `+ New` button is gone. Keep `Input`, `Checkbox`, `Label`, `Badge`.

**Step 2: Remove obsolete state and handlers inside `VendorItemsTab`**

Remove these lines:
```ts
const [isCreating, setIsCreating] = useState(false)
const [newItemName, setNewItemName] = useState('')
```

Remove the entire `handleCreate` function.

Remove the entire `handleNewItemKeyDown` function.

**Step 3: Add input ref and new handler**

After `const createItem = useCreateItem()`, add:

```ts
const inputRef = useRef<HTMLInputElement>(null)

const handleCreateFromSearch = async () => {
  const trimmed = search.trim()
  if (!trimmed) return
  try {
    await createItem.mutateAsync({
      name: trimmed,
      vendorIds: [vendorId],
      tagIds: [],
      targetUnit: 'package',
      targetQuantity: 1,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })
    setSearch('')
    inputRef.current?.focus()
  } catch {
    // input stays populated for retry
  }
}

const handleSearchKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' && filteredItems.length === 0 && search.trim()) {
    handleCreateFromSearch()
  }
  if (e.key === 'Escape') {
    setSearch('')
  }
}
```

**Step 4: Update the JSX**

Replace the entire toolbar `div` (currently `<div className="flex gap-2">`):

```tsx
<div className="flex gap-2">
  <Input
    ref={inputRef}
    placeholder="Search or create item..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    onKeyDown={handleSearchKeyDown}
  />
</div>
```

Remove the entire `{isCreating && (...)}` block.

Replace the `{items.length === 0 && !isCreating && (...)}` empty-state paragraph with:

```tsx
{items.length === 0 && !search.trim() && (
  <p className="text-sm text-foreground-muted">No items yet.</p>
)}
```

In the item list section, after the `<div className="space-y-2">` block, add the create row just before `</div>` closes... actually restructure it to render either the create row or the items list:

```tsx
<div className="space-y-2">
  {filteredItems.map((item) => {
    // ... existing map body unchanged ...
  })}
  {filteredItems.length === 0 && search.trim() && (
    <button
      type="button"
      className="flex items-center gap-2 py-2 px-1 w-full text-left rounded hover:bg-background-surface transition-colors text-foreground-muted"
      onClick={handleCreateFromSearch}
      disabled={createItem.isPending}
    >
      <Plus className="h-4 w-4" />
      Create &ldquo;{search.trim()}&rdquo;
    </button>
  )}
</div>
```

**Step 5: Run tests**

```bash
pnpm test src/routes/settings/vendors/\\$id/items.test.tsx
```

Expected: all tests pass.

**Step 6: Commit**

```bash
git add src/routes/settings/vendors/\$id/items.tsx
git commit -m "feat(vendors): replace search+new button with combined search+create input"
```

---

### Task 3: Verify and clean up

**Step 1: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass, no regressions.

**Step 2: Check for unused imports**

```bash
pnpm lint
```

Fix any lint errors (likely unused imports like `Check`, `X`, `Button`).

**Step 3: Commit lint fixes if any**

```bash
git add src/routes/settings/vendors/\$id/items.tsx
git commit -m "chore(vendors): remove unused imports after combined input refactor"
```

---
