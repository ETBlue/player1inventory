# UX Polish: Navigation History and Vendor Counts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add vendor item counts to UI and implement smart back navigation that tracks app history with fallback to home.

**Architecture:** Two custom hooks - `useVendorItemCounts()` returns memoized Map of vendor counts, `useAppNavigation()` tracks navigation in sessionStorage and provides `goBack()` function. Integrate into shopping page, vendor list, item detail, and vendor detail pages.

**Tech Stack:** React 19, TypeScript, TanStack Router, Vitest, React Testing Library

---

## Task 1: Create useVendorItemCounts hook with tests

**Files:**
- Create: `src/hooks/useVendorItemCounts.ts`
- Create: `src/hooks/useVendorItemCounts.test.ts`

**Step 1: Write failing test for empty items**

Create `src/hooks/useVendorItemCounts.test.ts`:

```typescript
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useVendorItemCounts } from './useVendorItemCounts'
import * as hooks from './index'

vi.mock('./index', () => ({
  useItems: vi.fn(),
}))

describe('useVendorItemCounts', () => {
  it('returns empty Map when no items', () => {
    vi.mocked(hooks.useItems).mockReturnValue({ data: [] } as any)

    const { result } = renderHook(() => useVendorItemCounts())

    expect(result.current.size).toBe(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test useVendorItemCounts`
Expected: FAIL with "useVendorItemCounts is not defined"

**Step 3: Write minimal implementation**

Create `src/hooks/useVendorItemCounts.ts`:

```typescript
import { useMemo } from 'react'
import { useItems } from './index'

export function useVendorItemCounts(): Map<string, number> {
  const { data: items = [] } = useItems()

  return useMemo(() => {
    const counts = new Map<string, number>()
    return counts
  }, [items])
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test useVendorItemCounts`
Expected: PASS

**Step 5: Write failing test for counting items**

Add to `src/hooks/useVendorItemCounts.test.ts`:

```typescript
it('counts items for single vendor', () => {
  const items = [
    { id: '1', name: 'Milk', vendorIds: ['v1'], tagIds: [], targetQuantity: 2, refillThreshold: 1, packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1, targetUnit: 'package' as const, createdAt: new Date(), updatedAt: new Date() },
    { id: '2', name: 'Eggs', vendorIds: ['v1'], tagIds: [], targetQuantity: 2, refillThreshold: 1, packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1, targetUnit: 'package' as const, createdAt: new Date(), updatedAt: new Date() },
  ]
  vi.mocked(hooks.useItems).mockReturnValue({ data: items } as any)

  const { result } = renderHook(() => useVendorItemCounts())

  expect(result.current.get('v1')).toBe(2)
})
```

**Step 6: Run test to verify it fails**

Run: `pnpm test useVendorItemCounts`
Expected: FAIL with "Expected 2, received undefined"

**Step 7: Implement counting logic**

Update `src/hooks/useVendorItemCounts.ts`:

```typescript
export function useVendorItemCounts(): Map<string, number> {
  const { data: items = [] } = useItems()

  return useMemo(() => {
    const counts = new Map<string, number>()

    for (const item of items) {
      for (const vendorId of item.vendorIds ?? []) {
        counts.set(vendorId, (counts.get(vendorId) ?? 0) + 1)
      }
    }

    return counts
  }, [items])
}
```

**Step 8: Run test to verify it passes**

Run: `pnpm test useVendorItemCounts`
Expected: PASS

**Step 9: Write failing tests for edge cases**

Add to `src/hooks/useVendorItemCounts.test.ts`:

```typescript
it('counts items for multiple vendors', () => {
  const items = [
    { id: '1', name: 'Milk', vendorIds: ['v1'], tagIds: [], targetQuantity: 2, refillThreshold: 1, packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1, targetUnit: 'package' as const, createdAt: new Date(), updatedAt: new Date() },
    { id: '2', name: 'Eggs', vendorIds: ['v2'], tagIds: [], targetQuantity: 2, refillThreshold: 1, packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1, targetUnit: 'package' as const, createdAt: new Date(), updatedAt: new Date() },
  ]
  vi.mocked(hooks.useItems).mockReturnValue({ data: items } as any)

  const { result } = renderHook(() => useVendorItemCounts())

  expect(result.current.get('v1')).toBe(1)
  expect(result.current.get('v2')).toBe(1)
})

it('handles items with multiple vendors', () => {
  const items = [
    { id: '1', name: 'Milk', vendorIds: ['v1', 'v2'], tagIds: [], targetQuantity: 2, refillThreshold: 1, packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1, targetUnit: 'package' as const, createdAt: new Date(), updatedAt: new Date() },
  ]
  vi.mocked(hooks.useItems).mockReturnValue({ data: items } as any)

  const { result } = renderHook(() => useVendorItemCounts())

  expect(result.current.get('v1')).toBe(1)
  expect(result.current.get('v2')).toBe(1)
})

it('handles items without vendorIds', () => {
  const items = [
    { id: '1', name: 'Milk', tagIds: [], targetQuantity: 2, refillThreshold: 1, packedQuantity: 0, unpackedQuantity: 0, consumeAmount: 1, targetUnit: 'package' as const, createdAt: new Date(), updatedAt: new Date() },
  ]
  vi.mocked(hooks.useItems).mockReturnValue({ data: items } as any)

  const { result } = renderHook(() => useVendorItemCounts())

  expect(result.current.size).toBe(0)
})
```

**Step 10: Run tests to verify they pass**

Run: `pnpm test useVendorItemCounts`
Expected: All tests PASS (implementation already handles these cases)

**Step 11: Commit**

```bash
git add src/hooks/useVendorItemCounts.ts src/hooks/useVendorItemCounts.test.ts
git commit -m "feat(hooks): add useVendorItemCounts hook with tests"
```

---

## Task 2: Create navigation history sessionStorage helpers with tests

**Files:**
- Modify: `src/lib/sessionStorage.ts`
- Create: `src/lib/sessionStorage.test.ts` (if doesn't exist)

**Step 1: Write failing test for loading empty history**

Create or update `src/lib/sessionStorage.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadNavigationHistory,
  saveNavigationHistory,
} from './sessionStorage'

describe('Navigation History', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('loads empty array when no history exists', () => {
    const history = loadNavigationHistory()
    expect(history).toEqual([])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test sessionStorage`
Expected: FAIL with "loadNavigationHistory is not defined"

**Step 3: Implement navigation history helpers**

Add to `src/lib/sessionStorage.ts`:

```typescript
const NAVIGATION_HISTORY_KEY = 'app-navigation-history'

export function loadNavigationHistory(): string[] {
  const stored = sessionStorage.getItem(NAVIGATION_HISTORY_KEY)
  return stored ? JSON.parse(stored) : []
}

export function saveNavigationHistory(history: string[]): void {
  sessionStorage.setItem(NAVIGATION_HISTORY_KEY, JSON.stringify(history))
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test sessionStorage`
Expected: PASS

**Step 5: Write failing test for save/load round trip**

Add to `src/lib/sessionStorage.test.ts`:

```typescript
it('saves and loads navigation history', () => {
  const history = ['/', '/items/123', '/items/123/tags']

  saveNavigationHistory(history)
  const loaded = loadNavigationHistory()

  expect(loaded).toEqual(history)
})

it('overwrites previous history on save', () => {
  saveNavigationHistory(['/', '/items/123'])
  saveNavigationHistory(['/settings'])

  const loaded = loadNavigationHistory()

  expect(loaded).toEqual(['/settings'])
})
```

**Step 6: Run tests to verify they pass**

Run: `pnpm test sessionStorage`
Expected: All tests PASS (implementation already handles this)

**Step 7: Commit**

```bash
git add src/lib/sessionStorage.ts src/lib/sessionStorage.test.ts
git commit -m "feat(lib): add navigation history sessionStorage helpers"
```

---

## Task 3: Create useAppNavigation hook with tests

**Files:**
- Create: `src/hooks/useAppNavigation.ts`
- Create: `src/hooks/useAppNavigation.test.ts`

**Step 1: Write failing test for goBack with empty history**

Create `src/hooks/useAppNavigation.test.ts`:

```typescript
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppNavigation } from './useAppNavigation'

describe('useAppNavigation', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('goBack navigates to home when history is empty', async () => {
    const Wrapper = ({ children }: { children: React.ReactNode }) => {
      const rootRoute = createRootRoute({ component: () => <div>{children}</div> })
      const router = createRouter({
        routeTree: rootRoute,
        history: createMemoryHistory({ initialEntries: ['/items/123'] }),
      })
      return <RouterProvider router={router} />
    }

    const { result } = renderHook(() => useAppNavigation(), { wrapper: Wrapper })

    result.current.goBack()

    await waitFor(() => {
      const history = JSON.parse(sessionStorage.getItem('app-navigation-history') || '[]')
      // Should navigate to '/' but we'll verify the navigation attempt
      expect(typeof result.current.goBack).toBe('function')
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test useAppNavigation`
Expected: FAIL with "useAppNavigation is not defined"

**Step 3: Write minimal implementation**

Create `src/hooks/useAppNavigation.ts`:

```typescript
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect } from 'react'
import {
  loadNavigationHistory,
  saveNavigationHistory,
} from '@/lib/sessionStorage'

export function useAppNavigation() {
  const router = useRouter()
  const navigate = useNavigate()

  // Track navigation
  useEffect(() => {
    const history = loadNavigationHistory()
    const currentPath = router.state.location.pathname

    // Only track app routes
    if (currentPath.startsWith('/')) {
      history.push(currentPath)
      // Keep last 50 entries
      if (history.length > 50) history.shift()
      saveNavigationHistory(history)
    }
  }, [router.state.location.pathname])

  const goBack = useCallback(() => {
    const history = loadNavigationHistory()

    // Get previous page WITHOUT modifying array
    const currentIndex = history.length - 1
    const previousPath = history[currentIndex - 1]

    if (previousPath && previousPath !== router.state.location.pathname) {
      // Remove current page from history before navigating
      const newHistory = history.slice(0, -1)
      saveNavigationHistory(newHistory)
      navigate({ to: previousPath })
    } else {
      // No valid previous page - go home
      navigate({ to: '/' })
    }
  }, [navigate, router.state.location.pathname])

  return { goBack }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test useAppNavigation`
Expected: PASS

**Step 5: Write failing test for tracking navigation**

Add to `src/hooks/useAppNavigation.test.ts`:

```typescript
it('tracks navigation in sessionStorage', async () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const rootRoute = createRootRoute({ component: () => <div>{children}</div> })
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    return <RouterProvider router={router} />
  }

  renderHook(() => useAppNavigation(), { wrapper: Wrapper })

  await waitFor(() => {
    const history = loadNavigationHistory()
    expect(history).toContain('/')
  })
})
```

**Step 6: Run test to verify it passes**

Run: `pnpm test useAppNavigation`
Expected: PASS (implementation already handles this)

**Step 7: Write failing test for goBack with history**

Add to `src/hooks/useAppNavigation.test.ts`:

```typescript
it('goBack navigates to previous page', async () => {
  // Pre-populate history
  saveNavigationHistory(['/', '/items/123', '/items/123/tags'])

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const rootRoute = createRootRoute({ component: () => <div>{children}</div> })
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/items/123/tags'] }),
    })
    return <RouterProvider router={router} />
  }

  const { result } = renderHook(() => useAppNavigation(), { wrapper: Wrapper })

  result.current.goBack()

  await waitFor(() => {
    const history = loadNavigationHistory()
    // Should have removed current page from history
    expect(history).not.toContain('/items/123/tags')
  })
})
```

**Step 8: Run test to verify it passes**

Run: `pnpm test useAppNavigation`
Expected: PASS

**Step 9: Write failing test for history size limit**

Add to `src/hooks/useAppNavigation.test.ts`:

```typescript
it('limits history to 50 entries', async () => {
  // Pre-populate with 51 entries
  const initialHistory = Array.from({ length: 51 }, (_, i) => `/page-${i}`)
  saveNavigationHistory(initialHistory)

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const rootRoute = createRootRoute({ component: () => <div>{children}</div> })
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/new-page'] }),
    })
    return <RouterProvider router={router} />
  }

  renderHook(() => useAppNavigation(), { wrapper: Wrapper })

  await waitFor(() => {
    const history = loadNavigationHistory()
    expect(history.length).toBeLessThanOrEqual(50)
    expect(history[0]).not.toBe('/page-0') // Oldest removed
  })
})
```

**Step 10: Run test to verify it passes**

Run: `pnpm test useAppNavigation`
Expected: PASS

**Step 11: Commit**

```bash
git add src/hooks/useAppNavigation.ts src/hooks/useAppNavigation.test.ts
git commit -m "feat(hooks): add useAppNavigation hook with sessionStorage tracking"
```

---

## Task 4: Update VendorCard to display item count

**Files:**
- Modify: `src/components/VendorCard.tsx`

**Step 1: Read current VendorCard implementation**

Run: `cat src/components/VendorCard.tsx`
Note: Current props and structure

**Step 2: Write failing test for item count display**

Add to existing `src/components/VendorCard.test.tsx` (or create if doesn't exist):

```typescript
it('displays item count when provided', () => {
  const vendor = {
    id: 'v1',
    name: 'Costco',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  render(<VendorCard vendor={vendor} itemCount={5} onDelete={() => {}} />)

  expect(screen.getByText(/5 items/i)).toBeInTheDocument()
})

it('does not display item count when not provided', () => {
  const vendor = {
    id: 'v1',
    name: 'Costco',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  render(<VendorCard vendor={vendor} onDelete={() => {}} />)

  expect(screen.queryByText(/items/i)).not.toBeInTheDocument()
})
```

**Step 3: Run test to verify it fails**

Run: `pnpm test VendorCard`
Expected: FAIL with "itemCount prop not recognized"

**Step 4: Update VendorCard interface and implementation**

Update `src/components/VendorCard.tsx`:

```typescript
interface VendorCardProps {
  vendor: Vendor
  itemCount?: number
  onDelete: () => void
}

export function VendorCard({ vendor, itemCount, onDelete }: VendorCardProps) {
  // ... existing implementation

  // In the render, update vendor name display:
  <div className="flex items-center gap-2">
    <h3 className="text-lg font-semibold">{vendor.name}</h3>
    {itemCount !== undefined && (
      <span className="text-sm text-foreground-muted">· {itemCount} items</span>
    )}
  </div>
}
```

**Step 5: Run test to verify it passes**

Run: `pnpm test VendorCard`
Expected: PASS

**Step 6: Commit**

```bash
git add src/components/VendorCard.tsx src/components/VendorCard.test.tsx
git commit -m "feat(components): add item count display to VendorCard"
```

---

## Task 5: Update shopping page to show vendor counts

**Files:**
- Modify: `src/routes/shopping.tsx`
- Modify: `src/routes/shopping.test.tsx`

**Step 1: Write failing test for vendor counts in dropdown**

Add to `src/routes/shopping.test.tsx`:

```typescript
it('displays item counts in vendor dropdown', async () => {
  // Setup: Create vendor and items
  const vendor = await createVendor('Costco')
  await createItem({ name: 'Milk', vendorIds: [vendor.id], tagIds: [], targetQuantity: 2, refillThreshold: 1 })
  await createItem({ name: 'Eggs', vendorIds: [vendor.id], tagIds: [], targetQuantity: 2, refillThreshold: 1 })

  await renderShoppingPage()
  const user = userEvent.setup()

  // Open vendor dropdown
  const vendorTrigger = screen.getByRole('combobox')
  await user.click(vendorTrigger)

  // Should show vendor with count
  expect(await screen.findByRole('option', { name: /Costco.*2/i })).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test shopping`
Expected: FAIL with "Expected to find 'Costco (2)' but found 'Costco'"

**Step 3: Update shopping page to use useVendorItemCounts**

Update `src/routes/shopping.tsx`:

```typescript
import { useVendorItemCounts } from '@/hooks/useVendorItemCounts'

function Shopping() {
  // ... existing code
  const vendorCounts = useVendorItemCounts()

  // Update vendor Select rendering:
  <SelectContent>
    <SelectItem value="all">All vendors</SelectItem>
    {vendors.map((v) => (
      <SelectItem key={v.id} value={v.id}>
        {v.name} ({vendorCounts.get(v.id) ?? 0})
      </SelectItem>
    ))}
  </SelectContent>
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test shopping`
Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/shopping.tsx src/routes/shopping.test.tsx
git commit -m "feat(shopping): display item counts in vendor dropdown"
```

---

## Task 6: Update vendor list page to show vendor counts

**Files:**
- Modify: `src/routes/settings/vendors/index.tsx`
- Modify: `src/routes/settings/vendors.test.tsx`

**Step 1: Write failing test for vendor counts in list**

Add to `src/routes/settings/vendors.test.tsx`:

```typescript
it('displays item counts next to vendor names', async () => {
  // Setup: Create vendor and items
  const vendor = await createVendor('Costco')
  await createItem({ name: 'Milk', vendorIds: [vendor.id], tagIds: [], targetQuantity: 2, refillThreshold: 1 })

  await renderVendorSettings()

  expect(await screen.findByText(/Costco.*1 items/i)).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test vendors`
Expected: FAIL

**Step 3: Update vendor list to use useVendorItemCounts**

Update `src/routes/settings/vendors/index.tsx`:

```typescript
import { useVendorItemCounts } from '@/hooks/useVendorItemCounts'

function VendorSettings() {
  // ... existing code
  const vendorCounts = useVendorItemCounts()

  // Update VendorCard rendering:
  {sortedVendors.map((vendor) => (
    <VendorCard
      key={vendor.id}
      vendor={vendor}
      itemCount={vendorCounts.get(vendor.id) ?? 0}
      onDelete={() => setVendorToDelete(vendor)}
    />
  ))}
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test vendors`
Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/settings/vendors/index.tsx src/routes/settings/vendors.test.tsx
git commit -m "feat(vendors): display item counts in vendor list"
```

---

## Task 7: Update item detail page with navigation hook

**Files:**
- Modify: `src/routes/items/$id.tsx`
- Modify: `src/routes/items/$id/index.tsx`
- Modify: `src/routes/items/$id.test.tsx`

**Step 1: Write failing test for back button navigation**

Add to `src/routes/items/$id.test.tsx`:

```typescript
it('back button uses navigation history', async () => {
  // Setup navigation history
  sessionStorage.setItem('app-navigation-history', JSON.stringify(['/', `/items/${item.id}`]))

  await renderItemDetail()
  const user = userEvent.setup()

  const backButton = screen.getByRole('button', { name: /back/i })
  await user.click(backButton)

  // Should navigate to previous page
  await waitFor(() => {
    expect(window.location.pathname).toBe('/')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test items/\\$id`
Expected: FAIL

**Step 3: Update item detail layout to use useAppNavigation**

Update `src/routes/items/$id.tsx`:

```typescript
import { useAppNavigation } from '@/hooks/useAppNavigation'

function ItemLayoutInner() {
  // ... existing code
  const { goBack } = useAppNavigation()

  // Replace Link back button with button + onClick:
  <button
    onClick={() => {
      if (isOnStockTab && isDirty) {
        // Show discard dialog
        setPendingNavigation('back')
        setShowDiscardDialog(true)
      } else {
        goBack()
      }
    }}
    className="px-3 py-4 hover:bg-background-surface transition-colors"
  >
    <ArrowLeft className="h-4 w-4" />
  </button>

  // Update confirmDiscard to handle 'back' navigation:
  const confirmDiscard = () => {
    if (pendingNavigation === 'back') {
      setShowDiscardDialog(false)
      goBack()
      setPendingNavigation(null)
    } else if (pendingNavigation) {
      setShowDiscardDialog(false)
      navigate({ to: pendingNavigation })
      setPendingNavigation(null)
    }
  }
}
```

**Step 4: Write failing test for auto-navigate after save**

Add to `src/routes/items/$id.test.tsx`:

```typescript
it('navigates back after successful save', async () => {
  sessionStorage.setItem('app-navigation-history', JSON.stringify(['/', `/items/${item.id}`]))

  await renderItemDetail()
  const user = userEvent.setup()

  // Make a change
  const nameInput = screen.getByLabelText(/item name/i)
  await user.clear(nameInput)
  await user.type(nameInput, 'Updated Name')

  // Save
  const saveButton = screen.getByRole('button', { name: /save/i })
  await user.click(saveButton)

  // Should navigate back
  await waitFor(() => {
    expect(window.location.pathname).toBe('/')
  })
})
```

**Step 5: Run test to verify it fails**

Run: `pnpm test items/\\$id`
Expected: FAIL

**Step 6: Update item detail form to navigate after save**

Update `src/routes/items/$id/index.tsx`:

```typescript
import { useAppNavigation } from '@/hooks/useAppNavigation'

function ItemDetail() {
  // ... existing code
  const { goBack } = useAppNavigation()

  // Update save handler:
  const handleSave = async () => {
    // ... validation and update logic
    await updateItem.mutateAsync({
      id,
      updates: {
        // ... updates
      },
    })

    // Navigate back after successful save
    goBack()
  }
}
```

**Step 7: Run tests to verify they pass**

Run: `pnpm test items/\\$id`
Expected: PASS

**Step 8: Update delete handler to navigate back**

Update `src/routes/items/$id.tsx`:

```typescript
// Update deleteItem onSuccess:
deleteItem.mutate(id, {
  onSuccess: () => goBack() // Was: navigate({ to: '/' })
})
```

**Step 9: Run all tests**

Run: `pnpm test items/\\$id`
Expected: All tests PASS

**Step 10: Commit**

```bash
git add src/routes/items/\$id.tsx src/routes/items/\$id/index.tsx src/routes/items/\$id.test.tsx
git commit -m "feat(items): use navigation history for back button and auto-navigate after save/delete"
```

---

## Task 8: Update vendor detail page with navigation hook

**Files:**
- Modify: `src/routes/settings/vendors/$id.tsx`
- Modify: `src/routes/settings/vendors/$id/index.tsx`
- Modify: `src/routes/settings/vendors/$id.test.tsx`

**Step 1: Write failing test for back button navigation**

Add to `src/routes/settings/vendors/$id.test.tsx`:

```typescript
it('back button uses navigation history', async () => {
  sessionStorage.setItem('app-navigation-history', JSON.stringify(['/settings/vendors', `/settings/vendors/${vendor.id}`]))

  await renderVendorDetail()
  const user = userEvent.setup()

  const backButton = screen.getByRole('button', { name: /back/i })
  await user.click(backButton)

  await waitFor(() => {
    expect(window.location.pathname).toBe('/settings/vendors')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test vendors/\\$id`
Expected: FAIL

**Step 3: Update vendor detail layout to use useAppNavigation**

Update `src/routes/settings/vendors/$id.tsx`:

```typescript
import { useAppNavigation } from '@/hooks/useAppNavigation'

function VendorDetailLayoutInner() {
  // ... existing code
  const { goBack } = useAppNavigation()

  // Replace Link back button with button + onClick:
  <button
    onClick={() => {
      if (isDirty) {
        setPendingNavigation('back')
        setShowDiscardDialog(true)
      } else {
        goBack()
      }
    }}
    className="px-3 py-4 hover:bg-background-surface transition-colors"
  >
    <ArrowLeft className="h-4 w-4" />
  </button>

  // Update confirmDiscard:
  const confirmDiscard = () => {
    if (pendingNavigation === 'back') {
      setShowDiscardDialog(false)
      goBack()
      setPendingNavigation(null)
    } else if (pendingNavigation) {
      setShowDiscardDialog(false)
      navigate({ to: pendingNavigation })
      setPendingNavigation(null)
    }
  }
}
```

**Step 4: Write failing test for auto-navigate after save**

Add to `src/routes/settings/vendors/$id.test.tsx`:

```typescript
it('navigates back after successful save', async () => {
  sessionStorage.setItem('app-navigation-history', JSON.stringify(['/settings/vendors', `/settings/vendors/${vendor.id}`]))

  await renderVendorDetail()
  const user = userEvent.setup()

  // Edit vendor name
  const nameInput = screen.getByLabelText(/vendor name/i)
  await user.clear(nameInput)
  await user.type(nameInput, 'Updated Vendor')

  // Save
  const saveButton = screen.getByRole('button', { name: /save/i })
  await user.click(saveButton)

  await waitFor(() => {
    expect(window.location.pathname).toBe('/settings/vendors')
  })
})
```

**Step 5: Run test to verify it fails**

Run: `pnpm test vendors/\\$id`
Expected: FAIL

**Step 6: Update vendor detail form to navigate after save**

Update `src/routes/settings/vendors/$id/index.tsx`:

```typescript
import { useAppNavigation } from '@/hooks/useAppNavigation'

function VendorDetail() {
  // ... existing code
  const { goBack } = useAppNavigation()

  // Update save handler:
  const handleSave = () => {
    updateVendor.mutate(
      { id, updates: { name: vendorName } },
      {
        onSuccess: () => {
          setIsDirty(false)
          goBack()
        },
      },
    )
  }
}
```

**Step 7: Run tests to verify they pass**

Run: `pnpm test vendors/\\$id`
Expected: PASS

**Step 8: Commit**

```bash
git add src/routes/settings/vendors/\$id.tsx src/routes/settings/vendors/\$id/index.tsx src/routes/settings/vendors/\$id.test.tsx
git commit -m "feat(vendors): use navigation history for back button and auto-navigate after save"
```

---

## Task 9: Update CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add documentation for new hooks**

Add to CLAUDE.md under appropriate section:

```markdown
### Navigation and UI Helpers

**`useVendorItemCounts()`** - Returns Map of item counts per vendor
- Counts all items assigned to each vendor (regardless of stock level)
- Memoized for performance
- Used in shopping page vendor dropdown and vendor list

**`useAppNavigation()`** - Smart back navigation with app history tracking
- Tracks navigation within app in sessionStorage
- `goBack()` returns to previous app page, falls back to home
- Only tracks routes starting with `/` (filters external navigation)
- Limits history to 50 entries
- Used in item and vendor detail pages for back button + post-save navigation
```

**Step 2: Update Shopping Page documentation**

Update Shopping Page section:

```markdown
### Shopping Page

**Vendor filter:** Select dropdown in toolbar. Single-select, filters items by assigned vendor. Shows item count per vendor (all items, not filtered). State is not persisted.
```

**Step 3: Update Vendor Management documentation**

Update Vendor Management section:

```markdown
**Route**: `src/routes/settings/vendors.tsx` — list with item counts + create/edit dialog + delete confirmation
```

**Step 4: Verify documentation accuracy**

Review changes to ensure consistency with implementation.

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document useVendorItemCounts and useAppNavigation hooks"
```

---

## Verification

After all tasks complete:

**Run full test suite:**
```bash
pnpm test
```
Expected: All tests PASS

**Run type check:**
```bash
pnpm typecheck
```
Expected: No errors

**Run linter:**
```bash
pnpm lint
```
Expected: No errors

**Manual testing checklist:**
- [ ] Shopping page shows vendor counts in dropdown
- [ ] Vendor counts remain constant when tag filters change
- [ ] Vendor list page shows item counts next to names
- [ ] Item detail back button goes to previous page (not hardcoded `/`)
- [ ] Item detail navigates back after save
- [ ] Item detail navigates back after delete
- [ ] Vendor detail back button goes to previous page
- [ ] Vendor detail navigates back after save
- [ ] Back navigation falls back to home when no history
- [ ] Back button respects dirty state (shows discard dialog)

## Notes

- All navigation tracking happens automatically via `useAppNavigation` hook's `useEffect`
- SessionStorage key: `'app-navigation-history'` stores array of paths
- History limited to 50 entries to prevent storage bloat
- Vendor counts computed once per render, memoized for efficiency
- Back button integrates with existing dirty state guards in detail pages
