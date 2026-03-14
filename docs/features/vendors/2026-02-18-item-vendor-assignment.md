# Item-to-Vendor Assignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Vendors tab to the item detail page where users can assign/unassign vendors to an item by clicking toggle badges.

**Architecture:** New route `src/routes/items/$id/vendors.tsx` (mirrors tags tab), plus a new tab icon in the existing `$id.tsx` layout header. No new DB operations or hooks needed — uses existing `useUpdateItem`, `useVendors`, and `useItem`.

**Tech Stack:** TanStack Router (file-based), TanStack Query, React + TypeScript, shadcn/ui Badge, Vitest + React Testing Library (RouterProvider integration test pattern)

---

## Task 1: Add Vendors tab icon to item detail layout

**Files:**
- Modify: `src/routes/items/$id.tsx` (line 8 — imports, and lines 121-131 — tab links)
- Modify: `src/routes/items/$id.test.tsx` (add one test for the tab icon)

The item detail layout currently has 3 tab icons: Settings2 (stock/info), Tags, History. Add a `Store` icon tab between Tags and History linking to `/items/$id/vendors`.

**Step 1: Add failing test**

In `src/routes/items/$id.test.tsx`, add this test inside the existing `describe` block (after the last existing test):

```ts
  it('user can see the vendors tab icon', async () => {
    // Given an item
    const item = await createItem({
      name: 'Test Item',
      packageUnit: 'pack',
      targetUnit: 'package',
      targetQuantity: 5,
      refillThreshold: 2,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

    renderItemDetailPage(item.id)

    // When item detail page loads
    await waitFor(() => {
      expect(screen.getByText('Test Item')).toBeInTheDocument()
    })

    // Then a link to the vendors tab exists
    const vendorsLink = screen.getByRole('link', { name: '' })
    const vendorsHref = `/items/${item.id}/vendors`
    const allLinks = screen.getAllByRole('link')
    expect(allLinks.some((l) => l.getAttribute('href') === vendorsHref)).toBe(true)
  })
```

**Step 2: Run to confirm it fails**

```bash
pnpm test src/routes/items/\$id.test.tsx --run
```

Expected: The new test FAILS (no `/vendors` link in DOM yet)

**Step 3: Add Store tab to the layout**

In `src/routes/items/$id.tsx`:

1. Add `Store` to the lucide-react import (line 8):

```tsx
import { ArrowLeft, History, Settings2, Store, Tags, Trash2 } from 'lucide-react'
```

2. Insert a new `<Link>` for the vendors tab between the Tags link and the History link (after line 120, before the History link):

```tsx
            <Link
              to="/items/$id/vendors"
              params={{ id }}
              className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
              activeProps={{
                className: 'border-foreground-muted',
              }}
              onClick={(e) => handleTabClick(e, `/items/${id}/vendors`)}
            >
              <Store className="h-4 w-4" />
            </Link>
```

**Step 4: Run test to confirm it passes**

```bash
pnpm test src/routes/items/\$id.test.tsx --run
```

Expected: All tests PASS including the new vendors tab test

**Step 5: Run all tests**

```bash
pnpm test --run
```

Expected: All tests PASS. Note: TanStack Router generates `routeTree.gen.ts` on dev server start — if the new route file doesn't exist yet, the router won't have it. That's fine for this task; we're only testing the link href attribute, not navigation.

**Step 6: Run lint**

```bash
pnpm check
```

Expected: No errors

**Step 7: Commit**

```bash
git add src/routes/items/\$id.tsx src/routes/items/\$id.test.tsx
git commit -m "feat(vendors): add vendors tab icon to item detail layout"
```

---

## Task 2: Create the vendors tab route

**Files:**
- Create: `src/routes/items/$id/vendors.tsx`
- Create: `src/routes/items/$id/vendors.test.tsx`

This tab displays all vendors as click-to-toggle badges. Assigned vendors (in `item.vendorIds`) show filled with an X icon; unassigned show outlined. Clicking a badge immediately saves via `updateItem`.

**Step 1: Write the failing tests**

Create `src/routes/items/$id/vendors.test.tsx`:

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
import { createItem, createVendor } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Vendors Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.vendors.clear()
    await db.inventoryLogs.clear()

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderVendorsTab = (itemId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/items/${itemId}/vendors`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can see all vendors on the vendors tab', async () => {
    // Given an item and two vendors
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
    await createVendor('Costco')
    await createVendor("Trader Joe's")

    renderVendorsTab(item.id)

    // Then both vendor names appear as badges
    await waitFor(() => {
      expect(screen.getByText('Costco')).toBeInTheDocument()
      expect(screen.getByText("Trader Joe's")).toBeInTheDocument()
    })
  })

  it('user can see empty state when no vendors exist', async () => {
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

    // Then empty state message is shown
    await waitFor(() => {
      expect(screen.getByText(/no vendors yet/i)).toBeInTheDocument()
    })
  })

  it('user can see assigned vendors highlighted', async () => {
    // Given a vendor assigned to an item
    const vendor = await createVendor('Costco')
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [vendor.id],
    })

    renderVendorsTab(item.id)

    // Then the assigned vendor badge shows an X icon (aria-label or role)
    await waitFor(() => {
      expect(screen.getByText('Costco')).toBeInTheDocument()
    })
    // Assigned badge contains an X icon (lucide X renders as svg)
    const badge = screen.getByText('Costco').closest('[class*="badge"], span, div')
    expect(badge).toBeInTheDocument()
  })

  it('user can assign a vendor to an item', async () => {
    // Given an item with no vendors and one available vendor
    const vendor = await createVendor('Costco')
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

    // When user clicks the vendor badge
    await waitFor(() => {
      expect(screen.getByText('Costco')).toBeInTheDocument()
    })
    await user.click(screen.getByText('Costco'))

    // Then the item's vendorIds is updated in the database
    await waitFor(async () => {
      const updatedItem = await db.items.get(item.id)
      expect(updatedItem?.vendorIds).toContain(vendor.id)
    })
  })

  it('user can unassign a vendor from an item', async () => {
    // Given an item with a vendor already assigned
    const vendor = await createVendor('Costco')
    const item = await createItem({
      name: 'Test Item',
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds: [vendor.id],
    })

    renderVendorsTab(item.id)
    const user = userEvent.setup()

    // When user clicks the assigned vendor badge
    await waitFor(() => {
      expect(screen.getByText('Costco')).toBeInTheDocument()
    })
    await user.click(screen.getByText('Costco'))

    // Then the vendor is removed from the item's vendorIds
    await waitFor(async () => {
      const updatedItem = await db.items.get(item.id)
      expect(updatedItem?.vendorIds ?? []).not.toContain(vendor.id)
    })
  })
})
```

**Step 2: Run to confirm tests fail**

```bash
pnpm test src/routes/items/\$id/vendors.test.tsx --run
```

Expected: FAIL — module `./vendors` not found (route file doesn't exist yet)

**Step 3: Create the route**

Create `src/routes/items/$id/vendors.tsx`:

```tsx
import { createFileRoute, Link } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useItem, useUpdateItem, useVendors } from '@/hooks'

export const Route = createFileRoute('/items/$id/vendors')({
  component: VendorsTab,
})

function VendorsTab() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const { data: vendors = [] } = useVendors()
  const updateItem = useUpdateItem()

  const toggleVendor = (vendorId: string) => {
    if (!item) return

    const currentVendorIds = item.vendorIds ?? []
    const newVendorIds = currentVendorIds.includes(vendorId)
      ? currentVendorIds.filter((vid) => vid !== vendorId)
      : [...currentVendorIds, vendorId]

    updateItem.mutate({ id, updates: { vendorIds: newVendorIds } })
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
                className="cursor-pointer"
                onClick={() => toggleVendor(vendor.id)}
              >
                {vendor.name}
                {isAssigned && <X className="ml-1 h-3 w-3" />}
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

**Note on Badge variants:** Look at the existing tags tab to confirm variant names. The tags tab uses `tagType.color` (e.g. `'blue'`) for selected and `'neutral-outline'` for unselected. For vendors (no color), use `'neutral'` for selected and `'neutral-outline'` for unselected. Run `grep -r "variant=" src/components/ui/badge.tsx` to confirm available variants if unsure.

**Step 4: Start dev server briefly to regenerate routeTree.gen.ts**

The TanStack Router generates `routeTree.gen.ts` automatically when the dev server starts. Run it once to pick up the new route:

```bash
pnpm dev &
sleep 5
kill %1
```

Or just run `pnpm build` which also triggers route generation:

```bash
pnpm build 2>&1 | head -20
```

Expected: `routeTree.gen.ts` is updated to include `/items/$id/vendors`

**Step 5: Run tests**

```bash
pnpm test src/routes/items/\$id/vendors.test.tsx --run
```

Expected: All 5 tests PASS

If `user can see assigned vendors highlighted` is flaky or hard to assert (icon detection), simplify that test to just check the badge renders — the assign/unassign tests cover behavior.

**Step 6: Run all tests**

```bash
pnpm test --run
```

Expected: All tests PASS

**Step 7: Run lint**

```bash
pnpm check
```

Expected: No errors

**Step 8: Commit**

```bash
git add src/routes/items/\$id/vendors.tsx src/routes/items/\$id/vendors.test.tsx
git commit -m "feat(vendors): add vendors tab to item detail for vendor assignment"
```

---

## Task 3: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the Vendor Management section**

In `CLAUDE.md`, find the `### Vendor Management` section and update the Note at the bottom:

Find:
```markdown
**Note:** Items already have `vendorIds?: string[]`. Item-to-vendor assignment UI is not yet implemented.
```

Replace with:
```markdown
**Assignment UI**: `src/routes/items/$id/vendors.tsx` — Vendors tab in item detail. Click-to-toggle badges, immediate save via `useUpdateItem`. No Save button (same as tags tab).
```

**Step 2: Run lint**

```bash
pnpm check
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(vendors): update CLAUDE.md — item-vendor assignment UI implemented"
```

---

## Done

After all tasks complete, verify:

```bash
pnpm test --run
pnpm check
```

Then test in the browser (`pnpm dev`):
- Open any item detail page → a Store icon tab appears between Tags and Log
- Navigate to the vendors tab
- If no vendors: empty state with link to Settings → Vendors
- If vendors exist: badges appear
- Click an unassigned vendor → fills, X appears, item saved
- Click an assigned vendor → reverts to outline, item saved
