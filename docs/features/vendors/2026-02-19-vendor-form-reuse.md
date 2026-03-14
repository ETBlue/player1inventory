# Vendor Form Reuse Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the `VendorFormDialog` create dialog with a `/settings/vendors/new` route and extract a shared `VendorNameForm` component used by both the new-vendor page and the existing Info tab.

**Architecture:** Extract a presentational `VendorNameForm` component with no hooks. Create a `/settings/vendors/new` route that owns create logic and navigates to the detail page after success. The Info tab swaps its inline form JSX for `VendorNameForm`. Delete `VendorFormDialog` entirely.

**Tech Stack:** React 19, TanStack Router (file-based), TanStack Query (`useCreateVendor`), Dexie.js (IndexedDB via `@/db`), Vitest + React Testing Library, Storybook, Biome (linter/formatter)

---

## Background

Key files to read before starting:

- `src/components/VendorFormDialog.tsx` — what we are deleting
- `src/components/VendorFormDialog.stories.tsx` — also deleting
- `src/routes/settings/vendors/index.tsx` — vendor list page (remove dialog, add navigation)
- `src/routes/settings/vendors/$id/index.tsx` — Info tab (swap inline form for VendorNameForm)
- `src/hooks/useVendors.ts` — `useCreateVendor` returns the created `Vendor` in `onSuccess`
- `src/routes/settings/vendors.test.tsx` — existing list page tests (needs update)
- `src/routes/settings/vendors/$id.test.tsx` — existing Info tab tests (should still pass unchanged)

`createVendor` in `src/db/operations.ts` already returns `Promise<Vendor>`, so `useCreateVendor`'s `onSuccess` callback receives the new vendor as its first argument — no hook changes needed.

Test pattern for integration tests (real DB + RouterProvider):

```tsx
const renderPage = (path: string) => {
  const history = createMemoryHistory({ initialEntries: [path] })
  const router = createRouter({ routeTree, history })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}
```

---

## Task 1: Extract `VendorNameForm` component

**Files:**
- Create: `src/components/VendorNameForm.tsx`
- Create: `src/components/VendorNameForm.test.tsx`
- Create: `src/components/VendorNameForm.stories.tsx`

### Step 1: Write the failing test

```tsx
// src/components/VendorNameForm.test.tsx
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { VendorNameForm } from './VendorNameForm'

describe('VendorNameForm', () => {
  it('renders name input and save button', () => {
    render(
      <VendorNameForm
        name="Costco"
        onNameChange={vi.fn()}
        onSave={vi.fn()}
        isDirty={true}
      />,
    )
    expect(screen.getByLabelText('Name')).toHaveValue('Costco')
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('calls onSave when Save button is clicked', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <VendorNameForm
        name="Costco"
        onNameChange={vi.fn()}
        onSave={onSave}
        isDirty={true}
      />,
    )
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('calls onSave when Enter is pressed in the input', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <VendorNameForm
        name="Costco"
        onNameChange={vi.fn()}
        onSave={onSave}
        isDirty={true}
      />,
    )
    await user.type(screen.getByLabelText('Name'), '{Enter}')
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('calls onNameChange when input value changes', async () => {
    const onNameChange = vi.fn()
    const user = userEvent.setup()
    render(
      <VendorNameForm
        name=""
        onNameChange={onNameChange}
        onSave={vi.fn()}
        isDirty={false}
      />,
    )
    await user.type(screen.getByLabelText('Name'), 'W')
    expect(onNameChange).toHaveBeenCalledWith('W')
  })

  it('save button is disabled when isDirty is false', () => {
    render(
      <VendorNameForm
        name="Costco"
        onNameChange={vi.fn()}
        onSave={vi.fn()}
        isDirty={false}
      />,
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('save button is disabled when isPending is true', () => {
    render(
      <VendorNameForm
        name="Costco"
        onNameChange={vi.fn()}
        onSave={vi.fn()}
        isDirty={true}
        isPending={true}
      />,
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })
})
```

### Step 2: Run test to verify it fails

```bash
pnpm test src/components/VendorNameForm.test.tsx
```

Expected: FAIL — `Cannot find module './VendorNameForm'`

### Step 3: Write the implementation

```tsx
// src/components/VendorNameForm.tsx
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface VendorNameFormProps {
  name: string
  onNameChange: (name: string) => void
  onSave: () => void
  isDirty: boolean
  isPending?: boolean
}

export function VendorNameForm({
  name,
  onNameChange,
  onSave,
  isDirty,
  isPending,
}: VendorNameFormProps) {
  return (
    <form
      className="space-y-4 max-w-md"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="vendor-name">Name</Label>
        <Input
          id="vendor-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={!isDirty || isPending}>
        Save
      </Button>
    </form>
  )
}
```

### Step 4: Run test to verify it passes

```bash
pnpm test src/components/VendorNameForm.test.tsx
```

Expected: PASS (6 tests)

### Step 5: Write Storybook stories

```tsx
// src/components/VendorNameForm.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { VendorNameForm } from './VendorNameForm'

const meta: Meta<typeof VendorNameForm> = {
  title: 'Components/VendorNameForm',
  component: VendorNameForm,
}
export default meta
type Story = StoryObj<typeof VendorNameForm>

export const Empty: Story = {
  render: () => {
    const [name, setName] = useState('')
    return (
      <VendorNameForm
        name={name}
        onNameChange={setName}
        onSave={() => console.log('save', name)}
        isDirty={name.trim() !== ''}
      />
    )
  },
}

export const WithName: Story = {
  render: () => {
    const [name, setName] = useState('Costco')
    return (
      <VendorNameForm
        name={name}
        onNameChange={setName}
        onSave={() => console.log('save', name)}
        isDirty={name !== 'Costco'}
      />
    )
  },
}

export const Pending: Story = {
  render: () => (
    <VendorNameForm
      name="Costco"
      onNameChange={() => {}}
      onSave={() => {}}
      isDirty={true}
      isPending={true}
    />
  ),
}
```

### Step 6: Commit

```bash
git add src/components/VendorNameForm.tsx src/components/VendorNameForm.test.tsx src/components/VendorNameForm.stories.tsx
git commit -m "feat(vendors): add VendorNameForm presentational component"
```

---

## Task 2: Use `VendorNameForm` in the Info tab

**Files:**
- Modify: `src/routes/settings/vendors/$id/index.tsx`
- Test: `src/routes/settings/vendors/$id.test.tsx` (run only — no changes needed)

### Step 1: Run existing Info tab tests to establish baseline

```bash
pnpm test src/routes/settings/vendors/\\$id.test.tsx
```

Expected: PASS (3 tests)

### Step 2: Update the Info tab to use `VendorNameForm`

Replace the inline `<form>` JSX in `src/routes/settings/vendors/$id/index.tsx` with `VendorNameForm`. The state management (`name`, `savedAt`, `isDirty`, `handleSave`) stays exactly the same — only the rendered JSX changes.

Current file (full):

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useVendorLayout } from '@/hooks/useVendorLayout'
import { useUpdateVendor, useVendors } from '@/hooks/useVendors'

export const Route = createFileRoute('/settings/vendors/$id/')(...)

function VendorInfoTab() {
  // ... state and handlers unchanged
  return (
    <form className="space-y-4 max-w-md" onSubmit={...}>
      <div className="space-y-2">
        <Label htmlFor="vendor-name">Name</Label>
        <Input id="vendor-name" value={name} onChange={...} />
      </div>
      <Button type="submit" disabled={!isDirty}>Save</Button>
    </form>
  )
}
```

Replace with:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { VendorNameForm } from '@/components/VendorNameForm'
import { useVendorLayout } from '@/hooks/useVendorLayout'
import { useUpdateVendor, useVendors } from '@/hooks/useVendors'

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally sync only on id change or after save
  useEffect(() => {
    if (vendor) {
      setName(vendor.name)
    }
  }, [vendor?.id, savedAt])

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
    <VendorNameForm
      name={name}
      onNameChange={setName}
      onSave={handleSave}
      isDirty={isDirty}
      isPending={updateVendor.isPending}
    />
  )
}
```

Note: Remove the `Button`, `Input`, `Label` imports — they are no longer used directly.

### Step 3: Run Info tab tests to verify no regression

```bash
pnpm test src/routes/settings/vendors/\\$id.test.tsx
```

Expected: PASS (3 tests, same as before)

### Step 4: Commit

```bash
git add src/routes/settings/vendors/\\$id/index.tsx
git commit -m "refactor(vendors): use VendorNameForm in vendor Info tab"
```

---

## Task 3: Create the new vendor page

**Files:**
- Create: `src/routes/settings/vendors/new.tsx`
- Create: `src/routes/settings/vendors/new.test.tsx`

> **Note on routing:** TanStack Router uses file-based routing. After creating `new.tsx`, run `pnpm dev` briefly (or just run `pnpm test` — it auto-generates the route tree) so that `src/routeTree.gen.ts` is regenerated. The test imports `routeTree` from there.

### Step 1: Write the failing test

```tsx
// src/routes/settings/vendors/new.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { routeTree } from '@/routeTree.gen'

describe('New Vendor page', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.vendors.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderPage = () => {
    const history = createMemoryHistory({
      initialEntries: ['/settings/vendors/new'],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  it('user can create a vendor and is redirected to its detail page', async () => {
    // Given the new vendor page
    const router = renderPage()
    const user = userEvent.setup()

    // When user types a name and saves
    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText('Name'), 'Whole Foods')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the vendor is created in the database
    await waitFor(async () => {
      const vendors = await db.vendors.toArray()
      expect(vendors).toHaveLength(1)
      expect(vendors[0].name).toBe('Whole Foods')
    })

    // And user is redirected to vendor detail page
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/settings\/vendors\//)
      expect(router.state.location.pathname).not.toBe('/settings/vendors/new')
    })
  })

  it('save button is disabled when name is empty', async () => {
    // Given the new vendor page
    renderPage()

    // Then the Save button is disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    })
  })
})
```

### Step 2: Run test to verify it fails

```bash
pnpm test src/routes/settings/vendors/new.test.tsx
```

Expected: FAIL — route not found / component not rendered

### Step 3: Create the new vendor page

```tsx
// src/routes/settings/vendors/new.tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { VendorNameForm } from '@/components/VendorNameForm'
import { Button } from '@/components/ui/button'
import { useCreateVendor } from '@/hooks/useVendors'

export const Route = createFileRoute('/settings/vendors/new')({
  component: NewVendorPage,
})

function NewVendorPage() {
  const navigate = useNavigate()
  const createVendor = useCreateVendor()
  const [name, setName] = useState('')

  const isDirty = name.trim() !== ''

  const handleSave = () => {
    if (!isDirty) return
    createVendor.mutate(name.trim(), {
      onSuccess: (vendor) => {
        navigate({ to: '/settings/vendors/$id', params: { id: vendor.id } })
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="neutral-ghost"
          size="icon"
          onClick={() => navigate({ to: '/settings/vendors/' })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">New Vendor</h1>
      </div>
      <VendorNameForm
        name={name}
        onNameChange={setName}
        onSave={handleSave}
        isDirty={isDirty}
        isPending={createVendor.isPending}
      />
    </div>
  )
}
```

> **After creating this file:** run `pnpm dev` briefly in a terminal to regenerate `src/routeTree.gen.ts`. Then stop the dev server and run tests.

### Step 4: Run test to verify it passes

```bash
pnpm test src/routes/settings/vendors/new.test.tsx
```

Expected: PASS (2 tests)

### Step 5: Commit

```bash
git add src/routes/settings/vendors/new.tsx src/routes/settings/vendors/new.test.tsx src/routeTree.gen.ts
git commit -m "feat(vendors): add new vendor page at /settings/vendors/new"
```

---

## Task 4: Update vendor list page — replace dialog with navigation

**Files:**
- Modify: `src/routes/settings/vendors/index.tsx`
- Modify: `src/routes/settings/vendors.test.tsx`

### Step 1: Run existing list page tests to establish baseline

```bash
pnpm test src/routes/settings/vendors.test.tsx
```

Expected: PASS (4 tests — list, empty state, open dialog, create via form, delete)

### Step 2: Update the vendor list page

Replace the full content of `src/routes/settings/vendors/index.tsx`:

```tsx
// src/routes/settings/vendors/index.tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { VendorCard } from '@/components/VendorCard'
import { useDeleteVendor, useVendors } from '@/hooks/useVendors'
import type { Vendor } from '@/types'

export const Route = createFileRoute('/settings/vendors/')(({
  component: VendorSettings,
})

function VendorSettings() {
  const navigate = useNavigate()
  const { data: vendors = [] } = useVendors()
  const deleteVendor = useDeleteVendor()

  const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null)

  const sortedVendors = [...vendors].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

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
        <Button onClick={() => navigate({ to: '/settings/vendors/new' })}>
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
              onDelete={() => setVendorToDelete(vendor)}
            />
          ))}
        </div>
      )}

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

Key changes:
- Removed `useCreateVendor` import and usage
- Removed `formOpen` state and `handleSave` function
- Removed `VendorFormDialog` import and JSX
- "New Vendor" button now calls `navigate({ to: '/settings/vendors/new' })`

### Step 3: Update vendor list tests

Replace the full content of `src/routes/settings/vendors.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vendor } from '@/types'

// Mock TanStack Router
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({
      children,
      to,
      ...props
    }: {
      children?: React.ReactNode
      to: string
      [key: string]: unknown
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

// Mock vendor hooks
vi.mock('@/hooks/useVendors', () => ({
  useVendors: vi.fn(),
  useDeleteVendor: vi.fn(),
}))

const { useVendors, useDeleteVendor } = await import('@/hooks/useVendors')

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
  vi.mocked(useDeleteVendor).mockReturnValue({ mutate } as ReturnType<
    typeof useDeleteVendor
  >)
  return { mutate }
}

import { Route } from './vendors/index'

const VendorSettings = Route.options.component as () => JSX.Element

describe('Vendor Settings Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderPage = (vendors?: Vendor[]) => {
    setupMocks(vendors)
    return render(<VendorSettings />)
  }

  it('user can see the vendor list', () => {
    // Given two vendors exist
    renderPage()

    // Then both vendor names are shown
    expect(screen.getByText('Costco')).toBeInTheDocument()
    expect(screen.getByText("Trader Joe's")).toBeInTheDocument()
  })

  it('user can see empty state when no vendors exist', () => {
    // Given no vendors
    renderPage([])

    // Then empty state message is shown
    expect(
      screen.getByText('No vendors yet. Add your first vendor.'),
    ).toBeInTheDocument()
  })

  it('user can navigate to new vendor page when clicking New Vendor', async () => {
    // Given the vendors page
    renderPage()
    const user = userEvent.setup()

    // When user clicks "New Vendor"
    await user.click(screen.getByRole('button', { name: /new vendor/i }))

    // Then navigate is called to go to new vendor page
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/vendors/new' })
  })

  it('user can delete a vendor with confirmation', async () => {
    // Given a vendor
    const { mutate } = setupMocks([
      { id: '1', name: 'Costco', createdAt: new Date() },
    ])
    render(<VendorSettings />)
    const user = userEvent.setup()

    // When user clicks the delete button
    await user.click(screen.getByRole('button', { name: 'Delete Costco' }))

    // Then confirmation dialog appears
    await screen.findByText(/delete "costco"/i)

    // When user confirms
    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    // Then deleteVendor mutation is called with the vendor id
    expect(mutate).toHaveBeenCalledWith('1')
  })
})
```

Key changes:
- `mockNavigate` is now a named `vi.fn()` shared across all tests (not a new fn per `useNavigate()` call)
- `useNavigate` mock returns the same `mockNavigate` instance
- Removed `useCreateVendor` from mock and imports
- Replaced "open the create dialog" and "create a vendor via the form" tests with "navigate to new vendor page" test

### Step 4: Run all vendor list tests

```bash
pnpm test src/routes/settings/vendors.test.tsx
```

Expected: PASS (4 tests)

### Step 5: Commit

```bash
git add src/routes/settings/vendors/index.tsx src/routes/settings/vendors.test.tsx
git commit -m "feat(vendors): replace create dialog with navigation to new vendor page"
```

---

## Task 5: Delete `VendorFormDialog` and update docs

**Files:**
- Delete: `src/components/VendorFormDialog.tsx`
- Delete: `src/components/VendorFormDialog.stories.tsx`
- Modify: `CLAUDE.md`

### Step 1: Run all tests to establish pre-deletion baseline

```bash
pnpm test
```

Expected: All tests pass. If any test still imports `VendorFormDialog`, it will fail here — fix before proceeding.

### Step 2: Check for remaining references to `VendorFormDialog`

```bash
grep -r "VendorFormDialog" src/
```

Expected: No results. If any remain, fix them before deleting the file.

### Step 3: Delete the files

```bash
rm src/components/VendorFormDialog.tsx
rm src/components/VendorFormDialog.stories.tsx
```

### Step 4: Run all tests to verify nothing broke

```bash
pnpm test
```

Expected: All tests still pass.

### Step 5: Update CLAUDE.md

In the **Vendor Management** section of `CLAUDE.md`, update the Components subsection.

Find this line:
```
- `src/components/VendorFormDialog.tsx` — shared dialog for create (no `vendor` prop) and edit (`vendor` prop provided)
```

Replace with:
```
- `src/components/VendorNameForm.tsx` — presentational form component (name input + save button) used by both the new vendor page and the Info tab
```

Also update the **Route** line to mention the new route. Find:
```
**Route**: `src/routes/settings/vendors.tsx` — list + create/edit dialog + delete confirmation
```

Replace with:
```
**Routes**: `src/routes/settings/vendors/index.tsx` — vendor list + delete confirmation; `src/routes/settings/vendors/new.tsx` — create new vendor, redirects to detail page after save
```

### Step 6: Commit everything

```bash
git add CLAUDE.md
git commit -m "chore(vendors): delete VendorFormDialog, update docs"
```

---

## Final verification

```bash
pnpm test
pnpm lint
```

Expected: All tests pass, no lint errors.
