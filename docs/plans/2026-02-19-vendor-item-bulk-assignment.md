# Vendor Item Bulk Assignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a vendor detail page at `/settings/vendors/$id` with Info and Items tabs, so users can assign a vendor to multiple items at once via a searchable checklist with an explicit Save button.

**Architecture:** New tabbed layout route mirroring `items/$id.tsx`. A `useVendorLayout` context (copy of `useItemLayout`) provides dirty state tracking between tabs. The Items tab uses a delta-based staged state (tracking which items were toggled) so no initialization side effects are needed.

**Tech Stack:** TanStack Router (file-based routes), TanStack Query, Dexie.js, React 19, Tailwind CSS v4, shadcn/ui, Vitest + React Testing Library

---

### Task 1: Create `useVendorLayout` hook

**Files:**
- Create: `src/hooks/useVendorLayout.tsx`

**Step 1: Create the hook**

```tsx
import { createContext, useCallback, useContext, useState } from 'react'

interface VendorLayoutContextValue {
  isDirty: boolean
  registerDirtyState: (dirty: boolean) => void
}

const VendorLayoutContext = createContext<VendorLayoutContextValue | null>(null)

export function VendorLayoutProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isDirty, setIsDirty] = useState(false)

  const registerDirtyState = useCallback((dirty: boolean) => {
    setIsDirty(dirty)
  }, [])

  return (
    <VendorLayoutContext.Provider value={{ isDirty, registerDirtyState }}>
      {children}
    </VendorLayoutContext.Provider>
  )
}

export function useVendorLayout() {
  const context = useContext(VendorLayoutContext)
  if (!context) {
    throw new Error('useVendorLayout must be used within VendorLayoutProvider')
  }
  return context
}
```

**Step 2: Commit**

```bash
git add src/hooks/useVendorLayout.tsx
git commit -m "feat(vendors): add useVendorLayout dirty state context"
```

---

### Task 2: Create vendor detail parent layout route

**Files:**
- Create: `src/routes/settings/vendors/$id.tsx`

**Note:** TanStack Router auto-generates `src/routeTree.gen.ts` when the dev server runs. The tests use `routeTree` from that file. Run `pnpm dev` briefly (or `pnpm build`) after creating route files to regenerate it before running tests.

**Step 1: Create the parent layout**

```tsx
import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { ArrowLeft, List, Settings2 } from 'lucide-react'
import { useState } from 'react'
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
import { useVendors } from '@/hooks/useVendors'
import { VendorLayoutProvider, useVendorLayout } from '@/hooks/useVendorLayout'

export const Route = createFileRoute('/settings/vendors/$id')({
  component: VendorDetailLayout,
})

function VendorDetailLayoutInner() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const { data: vendors = [] } = useVendors()
  const vendor = vendors.find((v) => v.id === id)
  const { isDirty } = useVendorLayout()

  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)

  const handleTabClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    path: string,
  ) => {
    if (isDirty && router.state.location.pathname !== path) {
      e.preventDefault()
      setPendingNavigation(path)
      setShowDiscardDialog(true)
    }
  }

  const confirmDiscard = () => {
    if (pendingNavigation) {
      setShowDiscardDialog(false)
      navigate({ to: pendingNavigation })
      setPendingNavigation(null)
    }
  }

  const cancelDiscard = () => {
    setShowDiscardDialog(false)
    setPendingNavigation(null)
  }

  if (!vendor) {
    return <div className="p-4">Vendor not found</div>
  }

  return (
    <>
      <div className="min-h-screen">
        {/* Fixed Top Bar */}
        <div
          className={`px-3 flex items-center gap-2
          fixed top-0 left-0 right-0 z-50
          bg-background-elevated
          border-b-2 border-accessory-default`}
        >
          <Link
            to="/settings/vendors"
            className="px-3 py-4 hover:bg-background-surface transition-colors"
            onClick={(e) => handleTabClick(e, '/settings/vendors')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-md font-regular truncate flex-1">{vendor.name}</h1>

          {/* Tabs */}
          <div className="flex items-center">
            <Link
              to="/settings/vendors/$id"
              params={{ id }}
              activeOptions={{ exact: true }}
              className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
              activeProps={{ className: 'border-foreground-muted' }}
              onClick={(e) => handleTabClick(e, `/settings/vendors/${id}`)}
            >
              <Settings2 className="h-4 w-4" />
            </Link>
            <Link
              to="/settings/vendors/$id/items"
              params={{ id }}
              className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
              activeProps={{ className: 'border-foreground-muted' }}
              onClick={(e) =>
                handleTabClick(e, `/settings/vendors/${id}/items`)
              }
            >
              <List className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Main Content with padding to clear fixed bar */}
        <div className="pt-16 p-4">
          <Outlet />
        </div>
      </div>

      {/* Discard Confirmation Dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Discard changes?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDiscard}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function VendorDetailLayout() {
  return (
    <VendorLayoutProvider>
      <VendorDetailLayoutInner />
    </VendorLayoutProvider>
  )
}
```

**Step 2: Commit**

```bash
git add src/routes/settings/vendors/$id.tsx
git commit -m "feat(vendors): add vendor detail parent layout with tab navigation"
```

---

### Task 3: Create vendor Info tab

**Files:**
- Create: `src/routes/settings/vendors/$id/index.tsx`

**Step 1: Write the failing test**

Create `src/routes/settings/vendors/$id.test.tsx`:

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
import { createVendor } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Vendor Detail - Info Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.vendors.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderInfoTab = (vendorId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/settings/vendors/${vendorId}`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can see the vendor name in the heading', async () => {
    // Given a vendor exists
    const vendor = await createVendor('Costco')

    renderInfoTab(vendor.id)

    // Then the vendor name is shown as the page heading
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Costco' })).toBeInTheDocument()
    })
  })

  it('user can edit the vendor name and save', async () => {
    // Given a vendor exists
    const vendor = await createVendor('Costco')

    renderInfoTab(vendor.id)
    const user = userEvent.setup()

    // When user clears the name field and types a new name
    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toBeInTheDocument()
    })
    const nameInput = screen.getByLabelText('Name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Costco Wholesale')

    // When user clicks Save
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the vendor name is updated in the database
    await waitFor(async () => {
      const updated = await db.vendors.get(vendor.id)
      expect(updated?.name).toBe('Costco Wholesale')
    })
  })

  it('save button is disabled when name has not changed', async () => {
    // Given a vendor exists
    const vendor = await createVendor('Costco')

    renderInfoTab(vendor.id)

    // Then the Save button is disabled when form is clean
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    })
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test src/routes/settings/vendors/\$id.test.tsx
```

Expected: FAIL — route not found / component not rendered.

**Step 3: Create the Info tab component**

Create `src/routes/settings/vendors/$id/index.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUpdateVendor, useVendors } from '@/hooks/useVendors'
import { useVendorLayout } from '@/hooks/useVendorLayout'

export const Route = createFileRoute('/settings/vendors/$id/')({
  component: VendorInfoTab,
})

function VendorInfoTab() {
  const { id } = Route.useParams()
  const { data: vendors = [] } = useVendors()
  const vendor = vendors.find((v) => v.id === id)
  const updateVendor = useUpdateVendor()
  const { registerDirtyState } = useVendorLayout()

  const [name, setName] = useState('')
  const [savedAt, setSavedAt] = useState(0)

  // Sync name when vendor loads or after save
  useEffect(() => {
    if (vendor) {
      setName(vendor.name)
    }
  }, [vendor?.id, savedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty = vendor ? name !== vendor.name : false

  useEffect(() => {
    registerDirtyState(isDirty)
  }, [isDirty, registerDirtyState])

  const handleSave = () => {
    if (!vendor || !isDirty) return
    updateVendor.mutate(
      { id, updates: { name } },
      { onSuccess: () => setSavedAt((n) => n + 1) },
    )
  }

  if (!vendor) return null

  return (
    <div className="space-y-4 max-w-md">
      <div className="space-y-2">
        <Label htmlFor="vendor-name">Name</Label>
        <Input
          id="vendor-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <Button onClick={handleSave} disabled={!isDirty}>
        Save
      </Button>
    </div>
  )
}
```

**Step 4: Regenerate route tree and run tests**

```bash
pnpm build 2>/dev/null || true
pnpm test src/routes/settings/vendors/\$id.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/settings/vendors/$id/index.tsx src/routes/settings/vendors/$id.test.tsx src/routeTree.gen.ts
git commit -m "feat(vendors): add vendor info tab with name editing"
```

---

### Task 4: Create vendor Items tab

**Files:**
- Create: `src/routes/settings/vendors/$id/items.tsx`
- Create: `src/routes/settings/vendors/$id/items.test.tsx`

**Step 1: Write the failing tests**

Create `src/routes/settings/vendors/$id/items.test.tsx`:

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

describe('Vendor Detail - Items Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.vendors.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderItemsTab = (vendorId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/settings/vendors/${vendorId}/items`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  const makeItem = (name: string, vendorIds: string[] = []) =>
    createItem({
      name,
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
      vendorIds,
    })

  it('user can see all items in the checklist', async () => {
    // Given a vendor and two items
    const vendor = await createVendor('Costco')
    await makeItem('Milk')
    await makeItem('Eggs')

    renderItemsTab(vendor.id)

    // Then both items appear in the list
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeInTheDocument()
      expect(screen.getByLabelText('Eggs')).toBeInTheDocument()
    })
  })

  it('user can see already-assigned items as checked', async () => {
    // Given a vendor and an item already assigned to it
    const vendor = await createVendor('Costco')
    await makeItem('Milk', [vendor.id])
    await makeItem('Eggs')

    renderItemsTab(vendor.id)

    // Then Milk's checkbox is checked and Eggs' is not
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeChecked()
      expect(screen.getByLabelText('Eggs')).not.toBeChecked()
    })
  })

  it('user can filter items by name', async () => {
    // Given a vendor and two items
    const vendor = await createVendor('Costco')
    await makeItem('Milk')
    await makeItem('Eggs')

    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search items/i)).toBeInTheDocument()
    })

    // When user types "mil"
    await user.type(screen.getByPlaceholderText(/search items/i), 'mil')

    // Then only Milk is visible
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeInTheDocument()
      expect(screen.queryByLabelText('Eggs')).not.toBeInTheDocument()
    })
  })

  it('save button is disabled when no changes are made', async () => {
    // Given a vendor and an item
    const vendor = await createVendor('Costco')
    await makeItem('Milk')

    renderItemsTab(vendor.id)

    // Then Save is disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    })
  })

  it('user can assign this vendor to an item and save', async () => {
    // Given a vendor and an unassigned item
    const vendor = await createVendor('Costco')
    const item = await makeItem('Milk')

    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    // When user checks the item and saves
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Milk'))
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the item now has this vendor assigned
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.vendorIds).toContain(vendor.id)
    })
  })

  it('user can remove this vendor from an item and save', async () => {
    // Given a vendor already assigned to an item
    const vendor = await createVendor('Costco')
    const item = await makeItem('Milk', [vendor.id])

    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    // When user unchecks the item and saves
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeChecked()
    })
    await user.click(screen.getByLabelText('Milk'))
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the vendor is removed from the item
    await waitFor(async () => {
      const updated = await db.items.get(item.id)
      expect(updated?.vendorIds ?? []).not.toContain(vendor.id)
    })
  })

  it('save button is disabled after saving (form is clean)', async () => {
    // Given a vendor and an unassigned item
    const vendor = await createVendor('Costco')
    await makeItem('Milk')

    renderItemsTab(vendor.id)
    const user = userEvent.setup()

    // When user checks item and saves
    await waitFor(() => {
      expect(screen.getByLabelText('Milk')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Milk'))
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then save button becomes disabled again
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    })
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test src/routes/settings/vendors/\$id/items.test.tsx
```

Expected: FAIL — route not found.

**Step 3: Create the Items tab component**

Create `src/routes/settings/vendors/$id/items.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useItems, useUpdateItem } from '@/hooks'
import { useVendors } from '@/hooks/useVendors'
import { useVendorLayout } from '@/hooks/useVendorLayout'

export const Route = createFileRoute('/settings/vendors/$id/items')({
  component: VendorItemsTab,
})

function VendorItemsTab() {
  const { id: vendorId } = Route.useParams()
  const { data: items = [] } = useItems()
  const { data: vendors = [] } = useVendors()
  const updateItem = useUpdateItem()
  const { registerDirtyState } = useVendorLayout()

  const [search, setSearch] = useState('')
  // toggled[itemId] = true means this item's assignment to this vendor has been flipped
  const [toggled, setToggled] = useState<Record<string, boolean>>({})

  const vendorMap = useMemo(
    () => Object.fromEntries(vendors.map((v) => [v.id, v])),
    [vendors],
  )

  const isDirty = Object.keys(toggled).length > 0

  useEffect(() => {
    registerDirtyState(isDirty)
  }, [isDirty, registerDirtyState])

  const isAssigned = (itemId: string, vendorIds: string[] = []) => {
    const dbAssigned = vendorIds.includes(vendorId)
    return toggled[itemId] ? !dbAssigned : dbAssigned
  }

  const handleToggle = (itemId: string) => {
    setToggled((prev) => {
      const next = { ...prev }
      if (next[itemId]) {
        delete next[itemId]
      } else {
        next[itemId] = true
      }
      return next
    })
  }

  const handleSave = async () => {
    const changedItems = items.filter((item) => toggled[item.id])
    await Promise.all(
      changedItems.map((item) => {
        const dbAssigned = (item.vendorIds ?? []).includes(vendorId)
        const newVendorIds = dbAssigned
          ? (item.vendorIds ?? []).filter((id) => id !== vendorId)
          : [...(item.vendorIds ?? []), vendorId]
        return updateItem.mutateAsync({ id: item.id, updates: { vendorIds: newVendorIds } })
      }),
    )
    setToggled({})
  }

  const sortedItems = [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  const filteredItems = sortedItems.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-4 max-w-2xl">
      <Input
        placeholder="Search items..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="space-y-2">
        {filteredItems.map((item) => {
          const checked = isAssigned(item.id, item.vendorIds)
          const otherVendors = (item.vendorIds ?? [])
            .filter((vid) => vid !== vendorId)
            .map((vid) => vendorMap[vid])
            .filter(Boolean)

          return (
            <div
              key={item.id}
              className="flex items-center gap-3 py-2 px-1 rounded hover:bg-background-surface transition-colors"
            >
              <Checkbox
                id={`item-${item.id}`}
                checked={checked}
                onCheckedChange={() => handleToggle(item.id)}
              />
              <Label
                htmlFor={`item-${item.id}`}
                className="flex-1 cursor-pointer font-normal"
              >
                {item.name}
              </Label>
              <div className="flex gap-1 flex-wrap justify-end">
                {otherVendors.map((v) => (
                  <Badge key={v.id} variant="neutral-outline" className="text-xs">
                    {v.name}
                  </Badge>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <Button onClick={handleSave} disabled={!isDirty}>
        Save
      </Button>
    </div>
  )
}
```

**Step 4: Regenerate route tree and run tests**

```bash
pnpm build 2>/dev/null || true
pnpm test src/routes/settings/vendors/\$id/items.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/settings/vendors/$id/items.tsx src/routes/settings/vendors/$id/items.test.tsx src/routeTree.gen.ts
git commit -m "feat(vendors): add vendor items tab with bulk assignment checklist"
```

---

### Task 5: Update VendorCard to link to detail page

**Files:**
- Modify: `src/components/VendorCard.tsx`

**Step 1: Add navigation link to the vendor name**

The vendor name `<span>` becomes a `<Link>` to `/settings/vendors/$id`. Import `Link` from `@tanstack/react-router`.

Replace this in `src/components/VendorCard.tsx`:

```tsx
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Vendor } from '@/types'
```

With:

```tsx
import { Link } from '@tanstack/react-router'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Vendor } from '@/types'
```

Replace the name span:

```tsx
<span className="font-medium">{vendor.name}</span>
```

With:

```tsx
<Link
  to="/settings/vendors/$id"
  params={{ id: vendor.id }}
  className="font-medium hover:underline"
>
  {vendor.name}
</Link>
```

**Step 2: Run existing vendor tests to ensure nothing broke**

```bash
pnpm test src/routes/settings/vendors.test.tsx
```

Expected: PASS (existing tests still pass)

**Step 3: Commit**

```bash
git add src/components/VendorCard.tsx
git commit -m "feat(vendors): link vendor name to vendor detail page"
```

---

### Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add vendor detail page documentation**

In the `### Vendor Management` section, add after the existing `**Assignment UI**` line:

```markdown
**Vendor detail page**: `src/routes/settings/vendors/$id.tsx` — Tabbed layout (Info + Items). Info tab: edit vendor name with Save button. Items tab: searchable checklist of all items showing their current vendor assignments; uses delta-based staged state (toggled map) with explicit Save that calls `useUpdateItem` concurrently for changed items.

**Dirty state**: `src/hooks/useVendorLayout.tsx` — same pattern as `useItemLayout`. Navigation guard on parent layout prevents tab switching with unsaved changes.
```

**Step 2: Run all tests**

```bash
pnpm test
```

Expected: all tests PASS

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(vendors): document vendor detail page in CLAUDE.md"
```
