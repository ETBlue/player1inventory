# Vendor Items Inline Create Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `+ New` button to the vendor items tab that opens an inline input for quick item creation, immediately assigning the new item to the current vendor.

**Architecture:** All changes are confined to one route file and its existing test file. A new `isCreating` / `newItemName` state controls the inline input. On confirm, `useCreateItem` is called with `vendorIds: [vendorId]` pre-set so no separate assignment step is needed. TanStack Query cache invalidation already handles re-rendering the list with the new item checked.

**Tech Stack:** React (useState), TanStack Query (`useCreateItem`), Lucide icons (`Plus`, `Check`, `X`), shadcn/ui `Button` + `Input`, Vitest + React Testing Library.

---

### Task 1: Write failing tests

**Files:**
- Modify: `src/routes/settings/vendors/$id/items.test.tsx`

**Step 1: Add five new test cases at the bottom of the existing `describe` block**

Paste these tests inside the existing `describe('Vendor Detail - Items Tab', ...)` block, after the last existing test:

```ts
it('user can see a New button', async () => {
  // Given a vendor
  const vendor = await createVendor('Costco')
  renderItemsTab(vendor.id)

  // Then a New button is visible
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
  })
})

it('user can open the inline input by clicking New', async () => {
  // Given a vendor
  const vendor = await createVendor('Costco')
  renderItemsTab(vendor.id)
  const user = userEvent.setup()

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
  })

  // When user clicks New
  await user.click(screen.getByRole('button', { name: /new/i }))

  // Then an inline input appears
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/item name/i)).toBeInTheDocument()
  })
})

it('user can create an item by typing a name and pressing Enter', async () => {
  // Given a vendor
  const vendor = await createVendor('Costco')
  renderItemsTab(vendor.id)
  const user = userEvent.setup()

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
  })

  // When user opens inline input, types a name, and presses Enter
  await user.click(screen.getByRole('button', { name: /new/i }))
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/item name/i)).toBeInTheDocument()
  })
  await user.type(screen.getByPlaceholderText(/item name/i), 'Butter')
  await user.keyboard('{Enter}')

  // Then the new item appears in the list checked (assigned to vendor)
  await waitFor(async () => {
    expect(screen.getByLabelText('Butter')).toBeInTheDocument()
    expect(screen.getByLabelText('Butter')).toBeChecked()
    const items = await db.items.toArray()
    const butter = items.find((i) => i.name === 'Butter')
    expect(butter?.vendorIds).toContain(vendor.id)
  })
})

it('user can cancel inline creation by pressing Escape', async () => {
  // Given a vendor with the inline input open
  const vendor = await createVendor('Costco')
  renderItemsTab(vendor.id)
  const user = userEvent.setup()

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole('button', { name: /new/i }))
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/item name/i)).toBeInTheDocument()
  })

  // When user presses Escape
  await user.keyboard('{Escape}')

  // Then the inline input closes and no item was created
  await waitFor(() => {
    expect(screen.queryByPlaceholderText(/item name/i)).not.toBeInTheDocument()
  })
  const items = await db.items.toArray()
  expect(items).toHaveLength(0)
})

it('Add item button is disabled when input is empty', async () => {
  // Given a vendor with the inline input open
  const vendor = await createVendor('Costco')
  renderItemsTab(vendor.id)
  const user = userEvent.setup()

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole('button', { name: /new/i }))

  // Then the Add item button is disabled
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /add item/i })).toBeDisabled()
  })
})
```

**Step 2: Run the new tests to verify they all fail**

```bash
pnpm test src/routes/settings/vendors/\$id/items.test.tsx
```

Expected: 5 new tests FAIL (button not found, input not found, etc.). Existing tests should still pass.

---

### Task 2: Implement the feature

**Files:**
- Modify: `src/routes/settings/vendors/$id/items.tsx`

**Step 1: Add the new imports at the top of the file**

Add to the existing import block:

```ts
import { Check, Plus, X } from 'lucide-react'
import { useCreateItem } from '@/hooks'
```

**Step 2: Add state and handler inside `VendorItemsTab` function**

After the existing `const [toggled, setToggled] = useState...` line, add:

```ts
const [isCreating, setIsCreating] = useState(false)
const [newItemName, setNewItemName] = useState('')
const createItem = useCreateItem()

const handleCreate = async () => {
  const trimmed = newItemName.trim()
  if (!trimmed) return
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
  setNewItemName('')
  setIsCreating(false)
}

const handleNewItemKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter') handleCreate()
  if (e.key === 'Escape') {
    setNewItemName('')
    setIsCreating(false)
  }
}
```

**Step 3: Replace the search `<Input>` with a row that includes the `+ New` button**

Find this in the JSX:

```tsx
<Input
  placeholder="Search items..."
  value={search}
  onChange={(e) => setSearch(e.target.value)}
/>
```

Replace with:

```tsx
<div className="flex gap-2">
  <Input
    placeholder="Search items..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
  />
  <Button
    variant="outline"
    onClick={() => setIsCreating(true)}
    disabled={isCreating}
  >
    <Plus className="h-4 w-4" />
    New
  </Button>
</div>

{isCreating && (
  <div className="flex gap-2">
    <Input
      autoFocus
      placeholder="Item name..."
      value={newItemName}
      onChange={(e) => setNewItemName(e.target.value)}
      onKeyDown={handleNewItemKeyDown}
    />
    <Button
      size="icon"
      aria-label="Add item"
      onClick={handleCreate}
      disabled={!newItemName.trim() || createItem.isPending}
    >
      <Check className="h-4 w-4" />
    </Button>
    <Button
      size="icon"
      variant="outline"
      aria-label="Cancel"
      onClick={() => {
        setNewItemName('')
        setIsCreating(false)
      }}
    >
      <X className="h-4 w-4" />
    </Button>
  </div>
)}
```

**Step 4: Run the tests to verify all pass**

```bash
pnpm test src/routes/settings/vendors/\$id/items.test.tsx
```

Expected: All tests PASS (5 new + 7 existing = 12 total).

**Step 5: Run the full test suite to check for regressions**

```bash
pnpm test
```

Expected: All tests pass.

---

### Task 3: Commit

```bash
git add src/routes/settings/vendors/\$id/items.tsx src/routes/settings/vendors/\$id/items.test.tsx
git commit -m "feat(vendors): add inline item creation from vendor items tab"
```

---

### Task 4: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

Find the **Vendor Management** section. Under the `**Routes**` entry, the vendor detail page description currently ends at the Items tab. Update the Items tab description to mention inline creation:

Find:

```
**Vendor detail page**: `src/routes/settings/vendors/$id.tsx` — Tabbed layout (Info + Items). Info tab: edit vendor name with Save button. Items tab: searchable checklist of all items showing their current vendor assignments; uses delta-based staged state (toggled map) with explicit Save that calls `useUpdateItem` concurrently for changed items.
```

Replace with:

```
**Vendor detail page**: `src/routes/settings/vendors/$id.tsx` — Tabbed layout (Info + Items). Info tab: edit vendor name with Save button. Items tab: searchable checklist of all items showing their current vendor assignments; uses delta-based staged state (toggled map) with explicit Save that calls `useUpdateItem` concurrently for changed items. `+ New` button opens an inline input to create a new item immediately assigned to this vendor (bypasses staged state, saved directly to DB).
```

**Step 1: Run tests one more time**

```bash
pnpm test
```

Expected: All pass.

**Step 2: Commit the docs update**

```bash
git add CLAUDE.md
git commit -m "docs(vendors): document inline item creation in vendor items tab"
```
