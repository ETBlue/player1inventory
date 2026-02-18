# Vendor CRUD Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full create/update/delete for vendors at `/settings/vendors`, following the existing tags CRUD pattern.

**Architecture:** New DB operations + mutation hooks + two new components (`VendorCard`, `VendorFormDialog`) + a new settings route. No schema migration needed — the vendors Dexie table and `Vendor` type already exist. `getVendors()` and `useVendors()` already exist.

**Tech Stack:** Dexie.js (IndexedDB), TanStack Query mutations, TanStack Router (file-based), React + TypeScript, shadcn/ui, Vitest + React Testing Library, Storybook

---

## Task 1: Add vendor DB operations

**Files:**
- Modify: `src/db/operations.ts` (after the existing `getVendors()` at line 277)
- Modify: `src/db/operations.test.ts` (add a new `describe('Vendor operations')` block)

**Step 1: Add failing tests**

In `src/db/operations.test.ts`, add these imports and describe block. Add to the existing imports at the top:

```ts
import {
  // ...existing imports...
  createVendor,
  updateVendor,
  deleteVendor,
} from './operations'
```

Then add this describe block at the end of the file:

```ts
describe('Vendor operations', () => {
  beforeEach(async () => {
    await db.vendors.clear()
  })

  it('user can create a vendor', async () => {
    // Given a vendor name
    const name = 'Costco'

    // When creating the vendor
    const vendor = await createVendor(name)

    // Then vendor is persisted with id and createdAt
    expect(vendor.id).toBeDefined()
    expect(vendor.name).toBe('Costco')
    expect(vendor.createdAt).toBeInstanceOf(Date)
  })

  it('user can list all vendors', async () => {
    // Given two vendors
    await createVendor('Costco')
    await createVendor('Trader Joes')

    // When listing vendors
    const vendors = await getVendors()

    // Then both vendors are returned
    expect(vendors).toHaveLength(2)
    expect(vendors.map((v) => v.name)).toContain('Costco')
    expect(vendors.map((v) => v.name)).toContain('Trader Joes')
  })

  it('user can update a vendor name', async () => {
    // Given an existing vendor
    const vendor = await createVendor('Costco')

    // When updating the vendor name
    await updateVendor(vendor.id, 'Costco Wholesale')

    // Then the vendor is updated in the database
    const vendors = await getVendors()
    const updated = vendors.find((v) => v.id === vendor.id)
    expect(updated?.name).toBe('Costco Wholesale')
  })

  it('user can delete a vendor', async () => {
    // Given an existing vendor
    const vendor = await createVendor('Costco')

    // When deleting the vendor
    await deleteVendor(vendor.id)

    // Then the vendor is no longer in the database
    const vendors = await getVendors()
    expect(vendors.find((v) => v.id === vendor.id)).toBeUndefined()
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test src/db/operations.test.ts
```

Expected: FAIL — `createVendor`, `updateVendor`, `deleteVendor` are not exported

**Step 3: Implement the operations**

In `src/db/operations.ts`, add after the existing `getVendors()` function:

```ts
export async function createVendor(name: string): Promise<Vendor> {
  const vendor: Vendor = {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date(),
  }
  await db.vendors.add(vendor)
  return vendor
}

export async function updateVendor(id: string, name: string): Promise<void> {
  await db.vendors.update(id, { name })
}

export async function deleteVendor(id: string): Promise<void> {
  await db.vendors.delete(id)
}
```

**Step 4: Run tests to verify they pass**

```bash
pnpm test src/db/operations.test.ts
```

Expected: All vendor operation tests PASS

**Step 5: Commit**

```bash
git add src/db/operations.ts src/db/operations.test.ts
git commit -m "feat(vendors): add createVendor, updateVendor, deleteVendor operations"
```

---

## Task 2: Add vendor mutation hooks

**Files:**
- Modify: `src/hooks/useVendors.ts`

**Step 1: Update the hook file**

Replace the entire content of `src/hooks/useVendors.ts` with:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createVendor,
  deleteVendor,
  getVendors,
  updateVendor,
} from '@/db/operations'

export function useVendors() {
  return useQuery({
    queryKey: ['vendors'],
    queryFn: getVendors,
  })
}

export function useCreateVendor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (name: string) => createVendor(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
    },
  })
}

export function useUpdateVendor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateVendor(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
    },
  })
}

export function useDeleteVendor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteVendor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
    },
  })
}
```

**Step 2: Run all tests to confirm nothing is broken**

```bash
pnpm test
```

Expected: All tests PASS (no hook tests to add — hooks are thin wrappers tested via integration)

**Step 3: Commit**

```bash
git add src/hooks/useVendors.ts
git commit -m "feat(vendors): add useCreateVendor, useUpdateVendor, useDeleteVendor hooks"
```

---

## Task 3: Create VendorFormDialog component

This single dialog handles both create and edit — when `vendor` prop is undefined it's "create" mode; when populated it's "edit" mode.

**Files:**
- Create: `src/components/VendorFormDialog.tsx`
- Create: `src/components/VendorFormDialog.stories.tsx`

**Step 1: Create the component**

Create `src/components/VendorFormDialog.tsx`:

```tsx
import { useEffect, useState } from 'react'
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
import type { Vendor } from '@/types'

interface VendorFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vendor?: Vendor
  onSave: (name: string) => void
}

export function VendorFormDialog({
  open,
  onOpenChange,
  vendor,
  onSave,
}: VendorFormDialogProps) {
  const [name, setName] = useState('')

  useEffect(() => {
    if (open) {
      setName(vendor?.name ?? '')
    }
  }, [open, vendor])

  const isEdit = !!vendor
  const isValid = name.trim().length > 0

  const handleSave = () => {
    if (!isValid) return
    onSave(name.trim())
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Vendor' : 'New Vendor'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="vendorName">Name</Label>
            <Input
              id="vendorName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Costco, Trader Joe's"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="neutral-ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            {isEdit ? 'Save' : 'Add Vendor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Create the Storybook story**

Create `src/components/VendorFormDialog.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { VendorFormDialog } from './VendorFormDialog'
import { Button } from './ui/button'
import type { Vendor } from '@/types'

const meta: Meta<typeof VendorFormDialog> = {
  title: 'Components/VendorFormDialog',
  component: VendorFormDialog,
}

export default meta
type Story = StoryObj<typeof VendorFormDialog>

export const CreateMode: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Add Vendor</Button>
        <VendorFormDialog
          open={open}
          onOpenChange={setOpen}
          onSave={(name) => {
            console.log('Create:', name)
          }}
        />
      </>
    )
  },
}

const existingVendor: Vendor = {
  id: '1',
  name: 'Costco',
  createdAt: new Date(),
}

export const EditMode: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Edit Vendor</Button>
        <VendorFormDialog
          open={open}
          onOpenChange={setOpen}
          vendor={existingVendor}
          onSave={(name) => {
            console.log('Save:', name)
          }}
        />
      </>
    )
  },
}
```

**Step 3: Verify Storybook runs without errors**

```bash
pnpm storybook
```

Check that both `CreateMode` and `EditMode` stories render correctly. Cancel closes dialog. Enter key submits. Save button disabled when name is empty.

**Step 4: Commit**

```bash
git add src/components/VendorFormDialog.tsx src/components/VendorFormDialog.stories.tsx
git commit -m "feat(vendors): add VendorFormDialog component with create and edit modes"
```

---

## Task 4: Create VendorCard component

**Files:**
- Create: `src/components/VendorCard.tsx`
- Create: `src/components/VendorCard.stories.tsx`

**Step 1: Create the component**

Create `src/components/VendorCard.tsx`:

```tsx
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Vendor } from '@/types'

interface VendorCardProps {
  vendor: Vendor
  onEdit: () => void
  onDelete: () => void
}

export function VendorCard({ vendor, onEdit, onDelete }: VendorCardProps) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <span className="font-medium">{vendor.name}</span>
        <div className="flex gap-1">
          <Button
            variant="neutral-ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="neutral-ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 2: Create the Storybook story**

Create `src/components/VendorCard.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { VendorCard } from './VendorCard'
import type { Vendor } from '@/types'

const meta: Meta<typeof VendorCard> = {
  title: 'Components/VendorCard',
  component: VendorCard,
}

export default meta
type Story = StoryObj<typeof VendorCard>

const vendor: Vendor = {
  id: '1',
  name: 'Costco',
  createdAt: new Date(),
}

export const Default: Story = {
  args: {
    vendor,
    onEdit: () => console.log('Edit'),
    onDelete: () => console.log('Delete'),
  },
}
```

**Step 3: Verify Storybook**

```bash
pnpm storybook
```

Check `VendorCard/Default` renders with vendor name, pencil edit button, and trash delete button.

**Step 4: Commit**

```bash
git add src/components/VendorCard.tsx src/components/VendorCard.stories.tsx
git commit -m "feat(vendors): add VendorCard component"
```

---

## Task 5: Create the vendors settings route

**Files:**
- Create: `src/routes/settings/vendors.tsx`
- Create: `src/routes/settings/vendors.test.tsx`

**Step 1: Write the failing tests**

Create `src/routes/settings/vendors.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vendor } from '@/types'

// Mock TanStack Router
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

// Mock vendor hooks
vi.mock('@/hooks/useVendors', () => ({
  useVendors: vi.fn(),
  useCreateVendor: vi.fn(),
  useUpdateVendor: vi.fn(),
  useDeleteVendor: vi.fn(),
}))

const { useVendors, useCreateVendor, useUpdateVendor, useDeleteVendor } =
  await import('@/hooks/useVendors')

const mockVendors: Vendor[] = [
  { id: '1', name: 'Costco', createdAt: new Date() },
  { id: '2', name: "Trader Joe's", createdAt: new Date() },
]

const setupMocks = (vendors: Vendor[] = mockVendors) => {
  const mutate = vi.fn()
  vi.mocked(useVendors).mockReturnValue({
    data: vendors,
    isLoading: false,
  } as ReturnType<typeof useVendors>)
  vi.mocked(useCreateVendor).mockReturnValue({ mutate } as ReturnType<
    typeof useCreateVendor
  >)
  vi.mocked(useUpdateVendor).mockReturnValue({ mutate } as ReturnType<
    typeof useUpdateVendor
  >)
  vi.mocked(useDeleteVendor).mockReturnValue({ mutate } as ReturnType<
    typeof useDeleteVendor
  >)
  return { mutate }
}

import { Route } from './vendors'
const VendorSettings = Route.options.component as () => JSX.Element

describe('Vendor Settings Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderPage = () => render(<VendorSettings />)

  it('user can see the vendor list', () => {
    // Given two vendors exist
    setupMocks()
    renderPage()

    // Then both vendor names are shown
    expect(screen.getByText('Costco')).toBeInTheDocument()
    expect(screen.getByText("Trader Joe's")).toBeInTheDocument()
  })

  it('user can see empty state when no vendors exist', () => {
    // Given no vendors
    setupMocks([])
    renderPage()

    // Then empty state message is shown
    expect(
      screen.getByText('No vendors yet. Add your first vendor.'),
    ).toBeInTheDocument()
  })

  it('user can open the create dialog', async () => {
    // Given the vendors page
    setupMocks()
    renderPage()
    const user = userEvent.setup()

    // When user clicks "New Vendor"
    await user.click(screen.getByRole('button', { name: /new vendor/i }))

    // Then the dialog opens with "New Vendor" title
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('New Vendor')).toBeInTheDocument()
  })

  it('user can create a vendor via the form', async () => {
    // Given the vendors page
    const { mutate } = setupMocks()
    renderPage()
    const user = userEvent.setup()

    // When user clicks New Vendor, types a name, and saves
    await user.click(screen.getByRole('button', { name: /new vendor/i }))
    await user.type(screen.getByLabelText('Name'), 'Whole Foods')
    await user.click(screen.getByRole('button', { name: /add vendor/i }))

    // Then createVendor mutation is called with the name
    expect(mutate).toHaveBeenCalledWith('Whole Foods', expect.anything())
  })

  it('user can open the edit dialog for a vendor', async () => {
    // Given two vendors
    setupMocks()
    renderPage()
    const user = userEvent.setup()

    // When user clicks the edit button for Costco (first edit button)
    const editButtons = screen.getAllByRole('button', { name: '' })
    // Find the pencil/edit button for Costco by clicking the first one
    await user.click(editButtons[0])

    // Then the dialog opens in edit mode
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Edit Vendor')).toBeInTheDocument()
    })
  })

  it('user can edit a vendor name', async () => {
    // Given a vendor exists
    setupMocks([{ id: '1', name: 'Costco', createdAt: new Date() }])
    renderPage()
    const user = userEvent.setup()

    // When user opens edit dialog and changes the name
    const { mutate } = setupMocks([
      { id: '1', name: 'Costco', createdAt: new Date() },
    ])
    render(<VendorSettings />)
    await user.click(screen.getAllByRole('button', { name: '' })[0])

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    const nameInput = screen.getByLabelText('Name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Costco Wholesale')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then updateVendor mutation is called
    expect(mutate).toHaveBeenCalledWith(
      { id: '1', name: 'Costco Wholesale' },
      expect.anything(),
    )
  })

  it('user can delete a vendor with confirmation', async () => {
    // Given a vendor
    const { mutate } = setupMocks([
      { id: '1', name: 'Costco', createdAt: new Date() },
    ])
    renderPage()
    const user = userEvent.setup()

    // When user clicks the delete button
    const buttons = screen.getAllByRole('button', { name: '' })
    await user.click(buttons[1]) // second button = trash/delete

    // Then confirmation dialog appears
    await waitFor(() => {
      expect(
        screen.getByText(/delete "costco"/i),
      ).toBeInTheDocument()
    })

    // When user confirms
    await user.click(screen.getByRole('button', { name: /delete/i }))

    // Then deleteVendor mutation is called
    expect(mutate).toHaveBeenCalledWith('1', expect.anything())
  })
})
```

**Step 2: Run tests to confirm they fail**

```bash
pnpm test src/routes/settings/vendors.test.tsx
```

Expected: FAIL — module `./vendors` not found

**Step 3: Create the route**

Create `src/routes/settings/vendors.tsx`:

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { VendorCard } from '@/components/VendorCard'
import { VendorFormDialog } from '@/components/VendorFormDialog'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  useCreateVendor,
  useDeleteVendor,
  useUpdateVendor,
  useVendors,
} from '@/hooks/useVendors'
import type { Vendor } from '@/types'

export const Route = createFileRoute('/settings/vendors')({
  component: VendorSettings,
})

function VendorSettings() {
  const navigate = useNavigate()
  const { data: vendors = [] } = useVendors()
  const createVendor = useCreateVendor()
  const updateVendor = useUpdateVendor()
  const deleteVendor = useDeleteVendor()

  const [formOpen, setFormOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | undefined>()
  const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null)

  const sortedVendors = [...vendors].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  const handleOpenCreate = () => {
    setEditingVendor(undefined)
    setFormOpen(true)
  }

  const handleOpenEdit = (vendor: Vendor) => {
    setEditingVendor(vendor)
    setFormOpen(true)
  }

  const handleSave = (name: string) => {
    if (editingVendor) {
      updateVendor.mutate({ id: editingVendor.id, name })
    } else {
      createVendor.mutate(name)
    }
  }

  const handleConfirmDelete = () => {
    if (vendorToDelete) {
      deleteVendor.mutate(vendorToDelete.id)
      setVendorToDelete(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="neutral-ghost"
            size="icon"
            onClick={() => navigate({ to: '/settings' })}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Vendors</h1>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Vendor
        </Button>
      </div>

      {sortedVendors.length === 0 ? (
        <p className="text-foreground-muted text-sm">
          No vendors yet. Add your first vendor.
        </p>
      ) : (
        <div className="space-y-2">
          {sortedVendors.map((vendor) => (
            <VendorCard
              key={vendor.id}
              vendor={vendor}
              onEdit={() => handleOpenEdit(vendor)}
              onDelete={() => setVendorToDelete(vendor)}
            />
          ))}
        </div>
      )}

      <VendorFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        vendor={editingVendor}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={!!vendorToDelete}
        onOpenChange={(open) => !open && setVendorToDelete(null)}
        title={`Delete "${vendorToDelete?.name}"?`}
        description="This will remove the vendor. Items assigned to this vendor will not be affected."
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        destructive
      />
    </div>
  )
}
```

**Step 4: Run tests**

```bash
pnpm test src/routes/settings/vendors.test.tsx
```

Expected: Most tests PASS. If any fail due to button accessibility names, check the aria labels — icon-only buttons may need `aria-label` attributes. If needed, update `VendorCard.tsx` to add `aria-label="Edit vendor"` and `aria-label="Delete vendor"` to the buttons, then update the test queries accordingly.

**Step 5: Run all tests**

```bash
pnpm test
```

Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/routes/settings/vendors.tsx src/routes/settings/vendors.test.tsx
git commit -m "feat(vendors): add /settings/vendors route with CRUD UI"
```

---

## Task 6: Add Vendors link to settings index

**Files:**
- Modify: `src/routes/settings/index.tsx`
- Modify: `src/routes/settings/index.test.tsx`

**Step 1: Add the Vendors link card**

In `src/routes/settings/index.tsx`, add the `Store` icon import and the vendors link card after the Tags card.

Add `Store` to the import from `lucide-react`:

```tsx
import { ChevronRight, Moon, Store, Sun, Tags } from 'lucide-react'
```

Add this block after the closing `</Link>` of the Tags card (before the closing `</div>` of the cards section):

```tsx
        {/* Vendors Card */}
        <Link to="/settings/vendors">
          <Card className="hover:bg-background-surface/50 transition-colors">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Store className="h-5 w-5 text-foreground-muted" />
                <div>
                  <p className="font-medium">Vendors</p>
                  <p className="text-sm text-foreground-muted">
                    Manage vendors
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-foreground-muted" />
            </CardContent>
          </Card>
        </Link>
```

**Step 2: Add test for the vendors link**

In `src/routes/settings/index.test.tsx`, add this test inside the `describe('Settings Page')` block:

```ts
  it('renders vendors link card', () => {
    // Given settings page
    setupMocks()
    renderSettings()

    // Then vendors card is shown
    expect(screen.getByText('Vendors')).toBeInTheDocument()
    expect(screen.getByText('Manage vendors')).toBeInTheDocument()
  })
```

Note: `setupMocks()` in this file just calls `vi.clearAllMocks()` — look at the existing test helper pattern and follow it. The `useTheme` mock is already set up in the existing test file.

**Step 3: Run tests**

```bash
pnpm test src/routes/settings/index.test.tsx
```

Expected: All tests PASS including the new vendors link test

**Step 4: Run all tests**

```bash
pnpm test
```

Expected: All tests PASS

**Step 5: Run lint check**

```bash
pnpm check
```

Expected: No errors

**Step 6: Commit**

```bash
git add src/routes/settings/index.tsx src/routes/settings/index.test.tsx
git commit -m "feat(vendors): add Vendors link to settings index page"
```

---

## Task 7: Update CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add vendor CRUD to the Features section**

In `CLAUDE.md`, find the `## Features` section and add a new subsection after the existing features:

```markdown
### Vendor Management

Vendor CRUD at `/settings/vendors`. Vendors are separate entities (not tags) used for filtering items in shopping mode.

**Vendor type** (`src/types/index.ts`): `id`, `name`, `createdAt` (minimal, name-only)

**Operations** (`src/db/operations.ts`): `getVendors`, `createVendor`, `updateVendor`, `deleteVendor`

**Hooks** (`src/hooks/useVendors.ts`): `useVendors`, `useCreateVendor`, `useUpdateVendor`, `useDeleteVendor`

**Route**: `src/routes/settings/vendors.tsx` — list + create/edit dialog + delete confirmation

**Components**:
- `src/components/VendorCard.tsx` — displays one vendor with edit/delete buttons
- `src/components/VendorFormDialog.tsx` — shared dialog for create (no `vendor` prop) and edit (`vendor` prop provided)

**Settings link**: `src/routes/settings/index.tsx` (Store icon)

**Note:** Items already have `vendorIds?: string[]`. Item-to-vendor assignment UI is not yet implemented.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(vendors): update CLAUDE.md with vendor CRUD documentation"
```

---

## Done

After all tasks complete, verify the full test suite and lint:

```bash
pnpm test
pnpm check
```

Then open Storybook to visually verify the new components:

```bash
pnpm storybook
```

Check:
- `Components/VendorCard` — shows name, edit and delete buttons
- `Components/VendorFormDialog/CreateMode` — blank input, "Add Vendor" button
- `Components/VendorFormDialog/EditMode` — pre-filled input, "Save" button

And verify in the running app (`pnpm dev`):
- Navigate to Settings → Vendors link appears
- `/settings/vendors` loads, shows empty state
- "New Vendor" opens dialog, typing and saving adds a vendor
- Edit pencil opens pre-filled dialog
- Delete trash shows confirmation, confirming removes the vendor
