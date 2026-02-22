# Tag Items Combined Search+Create Input Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the combined search+create input pattern (already live in the vendor items tab) to the tag detail page's Items tab.

**Architecture:** All logic is isolated to three files. The existing Items Tab tests move out of `$id.test.tsx` into a dedicated `$id/items.test.tsx`, then get updated for the new pattern. The component `$id/items.tsx` gets the same `isCreating`→`search`-doubles-as-creation refactor as the vendor tab. The placeholder references in the remaining `$id.test.tsx` get updated to match.

**Tech Stack:** React 19, TanStack Query, Vitest + React Testing Library, shadcn/ui (`Input`)

---

### Task 1: Create the new items test file

**Files:**
- Create: `src/routes/settings/tags/$id/items.test.tsx`

This task creates a new test file containing the Items Tab tests extracted from `$id.test.tsx` and updated for the combined input pattern.

**Step 1: Create the file with this exact content**

```tsx
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
import { createItem, createTag, createTagType } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'
import { TagColor } from '@/types'

describe('Tag Detail - Items Tab', () => {
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

  const renderItemsTab = (tagId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/settings/tags/${tagId}/items`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  const makeItem = (name: string, tagIds: string[] = []) =>
    createItem({
      name,
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds,
      vendorIds: [],
    })

  it('user can see all items in the checklist', async () => {
    // Given a tag type, tag, and two items
    const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    await makeItem('Milk')
    await makeItem('Eggs')

    renderItemsTab(tag.id)

    // Then both items appear in the list
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeInTheDocument()
      expect(screen.getByLabelText('Eggs')).toBeInTheDocument()
    })
  })

  it('user can see already-assigned items as checked', async () => {
    // Given a tag and an item already assigned to it
    const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    await makeItem('Milk', [tag.id])
    await makeItem('Eggs')

    renderItemsTab(tag.id)

    // Then Milk's checkbox is checked and Eggs' is not
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeChecked()
      expect(screen.getByLabelText('Eggs')).not.toBeChecked()
    })
  })

  it('user can filter items by name', async () => {
    // Given a tag and two items
    const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    await makeItem('Milk')
    await makeItem('Eggs')

    renderItemsTab(tag.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search or create/i)).toBeInTheDocument()
    })

    // When user types "mil"
    await user.type(screen.getByPlaceholderText(/search or create/i), 'mil')

    // Then only Milk is visible
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeInTheDocument()
      expect(screen.queryByLabelText('Eggs')).not.toBeInTheDocument()
    })
  })

  it('user can assign this tag to an item by clicking the checkbox', async () => {
    // Given a tag and an unassigned item
    const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    const item = await makeItem('Milk')

    renderItemsTab(tag.id)
    const user = userEvent.setup()

    // When user clicks the checkbox
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Milk'))

    // Then the item now has this tag assigned in the DB
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.tagIds).toContain(tag.id)
    })
  })

  it('user can remove this tag from an item by clicking the checkbox', async () => {
    // Given a tag already assigned to an item
    const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    const item = await makeItem('Milk', [tag.id])

    renderItemsTab(tag.id)
    const user = userEvent.setup()

    // When user unchecks the item
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeChecked()
    })
    await user.click(screen.getByLabelText('Milk'))

    // Then the tag is removed from the item in the DB
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.tagIds ?? []).not.toContain(tag.id)
    })
  })

  it('user can see other tags as badges on items', async () => {
    // Given a tag and an item with other tags
    const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    const otherTagType = await createTagType({ name: 'Location', color: TagColor.green })
    const otherTag = await createTag({ name: 'Fridge', typeId: otherTagType.id })
    await makeItem('Milk', [otherTag.id])

    renderItemsTab(tag.id)

    // Then the other tag appears as a badge
    await waitFor(() => {
      expect(screen.getByText('Fridge')).toBeInTheDocument()
    })
  })

  it('user can create an item by typing a name and pressing Enter', async () => {
    // Given a tag with no items matching "Butter"
    const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    renderItemsTab(tag.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search or create/i)).toBeInTheDocument()
    })

    // When user types "Butter" into the search input (zero matches) and presses Enter
    await user.type(screen.getByPlaceholderText(/search or create/i), 'Butter')
    await user.keyboard('{Enter}')

    // Then the new item appears in the list checked (assigned to tag)
    await waitFor(() => {
      expect(screen.getByLabelText('Butter')).toBeChecked()
    })

    await waitFor(async () => {
      const items = await db.items.toArray()
      const butter = items.find((i) => i.name === 'Butter')
      expect(butter?.tagIds).toContain(tag.id)
    })
  })

  it('user sees a create row only when search has text and zero items match', async () => {
    // Given a tag with one item
    const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    await makeItem('Milk')
    renderItemsTab(tag.id)
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

    // When user clears the input and types text that matches an item
    await user.clear(screen.getByPlaceholderText(/search or create/i))
    await user.type(screen.getByPlaceholderText(/search or create/i), 'mil')

    // Then the create row is not shown (Milk matched)
    await waitFor(() => {
      expect(screen.queryByText(/create/i)).not.toBeInTheDocument()
      expect(screen.getByLabelText('Milk')).toBeInTheDocument()
    })
  })

  it('user can create an item by clicking the create row', async () => {
    // Given a tag with no items matching "Butter"
    const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    renderItemsTab(tag.id)
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
    // Given a tag and the search input has text
    const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    renderItemsTab(tag.id)
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
    // Given a tag
    const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    renderItemsTab(tag.id)

    // Then no New button is present
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /new/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('shows No items yet when there are no items', async () => {
    // Given a tag with no items
    const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    renderItemsTab(tag.id)

    // Then shows empty state message
    await waitFor(() => {
      expect(screen.getByText(/no items yet/i)).toBeInTheDocument()
    })
  })

  it('shows no results message when search has no matches', async () => {
    // Given a tag with items
    const tagType = await createTagType({ name: 'Category', color: TagColor.blue })
    const tag = await createTag({ name: 'Dairy', typeId: tagType.id })
    await makeItem('Milk')
    await makeItem('Eggs')

    renderItemsTab(tag.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search or create/i)).toBeInTheDocument()
    })

    // When user searches for non-existent item
    await user.type(screen.getByPlaceholderText(/search or create/i), 'xyz')

    // Then the create row appears (zero-match state), not a "no results" message
    await waitFor(() => {
      expect(screen.getByText(/create "xyz"/i)).toBeInTheDocument()
    })
  })
})
```

**Step 2: Run the new test file to verify it fails for the right reasons**

```bash
pnpm test "src/routes/settings/tags/\$id/items.test.tsx"
```

Expected: failures on tests using `/search or create/i` (placeholder still says "Search items...") and the create-row tests. The checkbox and badge tests should pass since the component logic is unchanged.

**Step 3: Commit**

```bash
git add "src/routes/settings/tags/\$id/items.test.tsx"
git commit -m "test(tags): add items tab test file for combined search+create input"
```

---

### Task 2: Update `$id.test.tsx`

**Files:**
- Modify: `src/routes/settings/tags/$id.test.tsx`

Two changes needed: remove the now-duplicate Items Tab describe block, and fix 3 placeholder refs that will break once the component is updated.

**Step 1: Remove the Items Tab describe block**

Delete the entire block from line 412 to line 756 (inclusive):

```ts
describe('Tag Detail - Items Tab', () => {
  // ... everything until the closing })
})
```

The file should now contain only:
- `describe('Tag Detail - Info Tab', ...)`
- `describe('Tag Detail - Tab Navigation', ...)`

**Step 2: Update 3 placeholder references**

In the remaining file, find all occurrences of `/search items/i` and replace with `/search or create item/i`.

There are exactly 3 occurrences — in these tests:
1. `'user can confirm discard and lose changes'` — verifies Items tab loads after discarding
2. `'user does not see discard dialog after discarding and returning to Info tab'` — same
3. `'user can navigate between Info and Items tabs'` (Tab Navigation describe) — verifies Items tab content

**Step 3: Run tests to verify they fail correctly**

```bash
pnpm test "src/routes/settings/tags/\$id.test.tsx"
```

Expected: the 3 tests with `/search or create item/i` should fail (component still has old placeholder). All other Info Tab and Tab Navigation tests should pass.

**Step 4: Commit**

```bash
git add "src/routes/settings/tags/\$id.test.tsx"
git commit -m "test(tags): remove items tab tests from layout test file, update placeholder refs"
```

---

### Task 3: Update the component

**Files:**
- Modify: `src/routes/settings/tags/$id/items.tsx`

**Step 1: Update imports**

Change the React import to include `useRef`:
```ts
import { useMemo, useRef, useState } from 'react'
```

Change lucide imports — remove `Check` and `X`, keep `Plus`:
```ts
import { Plus } from 'lucide-react'
```

Remove the `Button` import (entire line). Keep `Input`, `Checkbox`, `Label`, `Badge`.

**Step 2: Remove obsolete state and handlers**

Remove these two state declarations:
```ts
const [isCreating, setIsCreating] = useState(false)
const [newItemName, setNewItemName] = useState('')
```

Remove the entire `handleCreate` async function.

Remove the entire `handleNewItemKeyDown` async function.

**Step 3: Add input ref and new handlers**

The component has `tagMap`, `isAssigned`, `handleToggle`, `sortedItems`, `filteredItems` computed before the JSX return. Make sure the new handlers are added AFTER these computed values (so `filteredItems` is in scope).

After the `filteredItems` declaration, add:

```ts
const inputRef = useRef<HTMLInputElement>(null)

const handleCreateFromSearch = async () => {
  const trimmed = search.trim()
  if (!trimmed) return
  try {
    await createItem.mutateAsync({
      name: trimmed,
      tagIds: [tagId],
      vendorIds: [],
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

const handleSearchKeyDown = async (e: React.KeyboardEvent) => {
  if (
    e.key === 'Enter' &&
    filteredItems.length === 0 &&
    search.trim() &&
    !createItem.isPending
  ) {
    await handleCreateFromSearch()
  }
  if (e.key === 'Escape') {
    setSearch('')
  }
}
```

**Step 4: Update the JSX**

Replace the toolbar `<div className="flex gap-2">` (which currently contains the Input + Button) with:

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

Replace the two empty-state paragraphs:

```tsx
{items.length === 0 && !isCreating && (
  <p className="text-sm text-foreground-muted">No items yet.</p>
)}

{items.length > 0 && filteredItems.length === 0 && !isCreating && (
  <p className="text-sm text-foreground-muted">No items found.</p>
)}
```

with:

```tsx
{items.length === 0 && !search.trim() && (
  <p className="text-sm text-foreground-muted">No items yet.</p>
)}

{items.length > 0 && filteredItems.length === 0 && !search.trim() && (
  <p className="text-sm text-foreground-muted">No items found.</p>
)}
```

Inside the `<div className="space-y-2">`, after the `{filteredItems.map(...)}` block, add the create row:

```tsx
{filteredItems.length === 0 && search.trim() && (
  <button
    type="button"
    className="flex items-center gap-2 py-2 px-1 w-full text-left rounded hover:bg-background-surface transition-colors text-foreground-muted"
    onClick={handleCreateFromSearch}
    disabled={createItem.isPending}
  >
    <Plus className="h-4 w-4" />
    Create "{search.trim()}"
  </button>
)}
```

**Step 5: Run the tests**

```bash
pnpm test "src/routes/settings/tags/\$id/items.test.tsx"
```

Expected: all tests pass.

Also run the layout tests:
```bash
pnpm test "src/routes/settings/tags/\$id.test.tsx"
```

Expected: all tests pass (placeholder refs now match).

**Step 6: Commit**

```bash
git add "src/routes/settings/tags/\$id/items.tsx"
git commit -m "feat(tags): replace search+new button with combined search+create input"
```

---

### Task 4: Verify and clean up

**Step 1: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass, no regressions.

**Step 2: Run lint**

```bash
pnpm lint
```

Fix any errors (likely unused imports in `$id/items.tsx`).

**Step 3: Commit lint fixes if any**

```bash
git add "src/routes/settings/tags/\$id/items.tsx"
git commit -m "chore(tags): remove unused imports after combined input refactor"
```

**Step 4: Update CLAUDE.md**

In `CLAUDE.md`, find the Tag Management section. The line describing the Items tab currently says:

> `+ New` button opens an inline input to create a new item immediately assigned to this tag, saved directly to DB.

Replace with:

> Items tab: combined search+create input with a searchable checklist of all items showing their current tag assignments; saves immediately when a checkbox is clicked (no staged state, no Save button), same pattern as the vendor Items tab. Typing a name that matches no items reveals a `+ Create "<name>"` row — clicking it or pressing Enter creates the item immediately assigned to this tag; pressing Escape clears the input.

**Step 5: Commit CLAUDE.md update**

```bash
git add CLAUDE.md
git commit -m "docs(tags): update CLAUDE.md to describe combined search+create input pattern"
```

---
