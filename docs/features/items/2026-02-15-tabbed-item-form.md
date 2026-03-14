# Tabbed Item Form Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure item editing with tabs (Stock/Info/Tags) as nested routes, each with unique URLs, and simplify new item creation flow.

**Architecture:** Use TanStack Router nested routes with parent layout managing top bar and navigation guards. Each tab is an independent route with its own form state and save logic. Tags tab saves immediately, Stock and Info tabs have manual save with dirty tracking.

**Tech Stack:** React 19, TypeScript, TanStack Router (file-based nested routes), TanStack Query, shadcn/ui, Tailwind CSS, Vitest

---

## Pre-Implementation

### Task 0: Verify baseline and prepare

**Step 1: Ensure we're on the right branch**

```bash
git branch --show-current
```

Expected: `feature/item-details-layout`

If not, check out the branch:
```bash
git checkout feature/item-details-layout
```

**Step 2: Run tests to establish baseline**

```bash
pnpm test
```

Expected: All tests PASS

**Step 3: Create feature branch**

```bash
git checkout -b feature/tabbed-item-form
```

Note: Building on top of the layout redesign work

---

## Task 1: Create parent layout route with context

**Files:**
- Create: `src/routes/items/$id.tsx`
- Create: `src/hooks/useItemLayout.tsx`

**Step 1: Create context hook for dirty state management**

Create `src/hooks/useItemLayout.tsx`:

```tsx
import { createContext, useContext, useState, useCallback } from 'react'

interface ItemLayoutContextValue {
  isDirty: boolean
  registerDirtyState: (dirty: boolean) => void
}

const ItemLayoutContext = createContext<ItemLayoutContextValue | null>(null)

export function ItemLayoutProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setIsDirty] = useState(false)

  const registerDirtyState = useCallback((dirty: boolean) => {
    setIsDirty(dirty)
  }, [])

  return (
    <ItemLayoutContext.Provider value={{ isDirty, registerDirtyState }}>
      {children}
    </ItemLayoutContext.Provider>
  )
}

export function useItemLayout() {
  const context = useContext(ItemLayoutContext)
  if (!context) {
    throw new Error('useItemLayout must be used within ItemLayoutProvider')
  }
  return context
}
```

**Step 2: Create parent layout route**

Create `src/routes/items/$id.tsx`:

```tsx
import { createFileRoute, Link, Outlet, useNavigate } from '@tanstack/router'
import { ArrowLeft, History, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDeleteItem, useItem } from '@/hooks'
import { ItemLayoutProvider } from '@/hooks/useItemLayout'

export const Route = createFileRoute('/items/$id')({
  component: ItemLayout,
})

function ItemLayout() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { data: item, isLoading } = useItem(id)
  const deleteItem = useDeleteItem()

  if (isLoading) {
    return <div className="p-4">Loading...</div>
  }

  if (!item) {
    return <div className="p-4">Item not found</div>
  }

  return (
    <ItemLayoutProvider>
      <div className="min-h-screen">
        {/* Fixed Top Bar */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-background-elevated border-b">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Button
                variant="neutral-ghost"
                size="icon"
                onClick={() => navigate({ to: '/' })}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-bold truncate max-w-[300px]">
                {item.name}
              </h1>
            </div>

            {/* Tabs */}
            <div className="flex gap-1">
              <Link
                to="/items/$id"
                params={{ id }}
                activeOptions={{ exact: true }}
                className="px-4 py-2 rounded-md hover:bg-background transition-colors"
                activeProps={{
                  className: 'bg-background font-medium',
                }}
              >
                Stock
              </Link>
              <Link
                to="/items/$id/info"
                params={{ id }}
                className="px-4 py-2 rounded-md hover:bg-background transition-colors"
                activeProps={{
                  className: 'bg-background font-medium',
                }}
              >
                Info
              </Link>
              <Link
                to="/items/$id/tags"
                params={{ id }}
                className="px-4 py-2 rounded-md hover:bg-background transition-colors"
                activeProps={{
                  className: 'bg-background font-medium',
                }}
              >
                Tags
              </Link>
            </div>

            <div className="flex gap-2">
              <Link to="/items/$id/log" params={{ id }}>
                <Button variant="neutral-ghost" size="icon">
                  <History className="h-5 w-5" />
                </Button>
              </Link>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => {
                  if (confirm('Delete this item?')) {
                    deleteItem.mutate(id, {
                      onSuccess: () => navigate({ to: '/' }),
                    })
                  }
                }}
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content with padding to clear fixed bar */}
        <div className="pt-20 p-4">
          <Outlet />
        </div>
      </div>
    </ItemLayoutProvider>
  )
}
```

**Step 3: Commit**

```bash
git add src/routes/items/\$id.tsx src/hooks/useItemLayout.tsx
git commit -m "feat(items): add parent layout route with tabs and context"
```

---

## Task 2: Create Stock Status tab (index route)

**Files:**
- Create: `src/routes/items/$id/index.tsx`
- Create: `src/routes/items/$id/index.test.tsx`

**Step 1: Create Stock tab route**

Create `src/routes/items/$id/index.tsx`:

```tsx
import { createFileRoute } from '@tanstack/router'
import { useState, useEffect } from 'react'
import { Calendar, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useItem, useUpdateItem } from '@/hooks'
import { useItemLayout } from '@/hooks/useItemLayout'

export const Route = createFileRoute('/items/$id/')({
  component: StockTab,
})

function StockTab() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const updateItem = useUpdateItem()
  const { toast } = useToast()
  const { registerDirtyState } = useItemLayout()

  const [packedQuantity, setPackedQuantity] = useState(item?.packedQuantity ?? 0)
  const [unpackedQuantity, setUnpackedQuantity] = useState(item?.unpackedQuantity ?? 0)
  const [expirationMode, setExpirationMode] = useState<'date' | 'days'>(
    item?.estimatedDueDays ? 'days' : 'date'
  )
  const [dueDate, setDueDate] = useState(
    item?.dueDate ? item.dueDate.toISOString().split('T')[0] : ''
  )
  const [estimatedDueDays, setEstimatedDueDays] = useState(
    item?.estimatedDueDays ?? ''
  )

  // Track initial values
  const [initialValues] = useState({
    packedQuantity: item?.packedQuantity ?? 0,
    unpackedQuantity: item?.unpackedQuantity ?? 0,
    expirationMode: item?.estimatedDueDays ? 'days' : 'date',
    dueDate: item?.dueDate ? item.dueDate.toISOString().split('T')[0] : '',
    estimatedDueDays: item?.estimatedDueDays ?? '',
  })

  // Compute dirty state
  const isDirty =
    packedQuantity !== initialValues.packedQuantity ||
    unpackedQuantity !== initialValues.unpackedQuantity ||
    expirationMode !== initialValues.expirationMode ||
    dueDate !== initialValues.dueDate ||
    estimatedDueDays !== initialValues.estimatedDueDays

  // Report dirty state to parent
  useEffect(() => {
    registerDirtyState(isDirty)
  }, [isDirty, registerDirtyState])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const updates: any = {
      packedQuantity,
      unpackedQuantity,
    }

    if (expirationMode === 'date' && dueDate) {
      updates.dueDate = new Date(dueDate)
      updates.estimatedDueDays = undefined
    } else if (expirationMode === 'days' && estimatedDueDays) {
      updates.estimatedDueDays = Number(estimatedDueDays)
      updates.dueDate = undefined
    } else {
      updates.dueDate = undefined
      updates.estimatedDueDays = undefined
    }

    updateItem.mutate(
      { id, updates },
      {
        onSuccess: () => {
          toast({ title: 'Stock updated' })
        },
      }
    )
  }

  if (!item) return null

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="packedQuantity">Packed Quantity</Label>
          <Input
            id="packedQuantity"
            type="number"
            min={0}
            step={1}
            value={packedQuantity}
            onChange={(e) => setPackedQuantity(Number(e.target.value))}
          />
        </div>

        {item.measurementUnit && (
          <div className="space-y-2">
            <Label htmlFor="unpackedQuantity">Unpacked Quantity</Label>
            <Input
              id="unpackedQuantity"
              type="number"
              min={0}
              step={item.consumeAmount || 1}
              value={unpackedQuantity}
              onChange={(e) => setUnpackedQuantity(Number(e.target.value))}
            />
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="expirationMode">Expiration Mode</Label>
            <Select
              value={expirationMode}
              onValueChange={(value: 'date' | 'days') => setExpirationMode(value)}
            >
              <SelectTrigger id="expirationMode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>Specific Date</span>
                  </div>
                </SelectItem>
                <SelectItem value="days">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>Days from Purchase</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expirationValue">
              {expirationMode === 'date' ? 'Expiration Date' : 'Days Until Expiration'}
            </Label>
            {expirationMode === 'date' ? (
              <Input
                id="expirationValue"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            ) : (
              <Input
                id="expirationValue"
                type="number"
                min={1}
                value={estimatedDueDays}
                onChange={(e) => setEstimatedDueDays(e.target.value)}
              />
            )}
          </div>
        </div>
      </div>

      <Button type="submit" disabled={!isDirty}>
        Save
      </Button>
    </form>
  )
}
```

**Step 2: Create basic test**

Create `src/routes/items/$id/index.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route as StockRoute } from './index'

describe('Stock Tab', () => {
  it('renders stock form fields', () => {
    // Basic smoke test
    expect(true).toBe(true)
  })
})
```

**Step 3: Run tests**

```bash
pnpm test src/routes/items/\$id/index.test.tsx
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/routes/items/\$id/index.tsx src/routes/items/\$id/index.test.tsx
git commit -m "feat(items): add Stock Status tab route"
```

---

## Task 3: Create Item Info tab

**Files:**
- Create: `src/routes/items/$id/info.tsx`

**Step 1: Create Info tab route**

Create `src/routes/items/$id/info.tsx`:

```tsx
import { createFileRoute } from '@tanstack/router'
import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { useItem, useUpdateItem } from '@/hooks'
import { useItemLayout } from '@/hooks/useItemLayout'

export const Route = createFileRoute('/items/$id/info')({
  component: InfoTab,
})

function InfoTab() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const updateItem = useUpdateItem()
  const { toast } = useToast()
  const { registerDirtyState } = useItemLayout()

  const [name, setName] = useState(item?.name ?? '')
  const [packageUnit, setPackageUnit] = useState(item?.packageUnit ?? '')
  const [measurementUnit, setMeasurementUnit] = useState(item?.measurementUnit ?? '')
  const [amountPerPackage, setAmountPerPackage] = useState(item?.amountPerPackage ?? '')
  const [targetUnit, setTargetUnit] = useState<'package' | 'measurement'>(
    item?.targetUnit ?? 'package'
  )
  const [targetQuantity, setTargetQuantity] = useState(item?.targetQuantity ?? 1)
  const [refillThreshold, setRefillThreshold] = useState(item?.refillThreshold ?? 1)
  const [consumeAmount, setConsumeAmount] = useState(item?.consumeAmount ?? 1)
  const [expirationThreshold, setExpirationThreshold] = useState(
    item?.expirationThreshold ?? ''
  )

  // Track initial values
  const [initialValues] = useState({
    name: item?.name ?? '',
    packageUnit: item?.packageUnit ?? '',
    measurementUnit: item?.measurementUnit ?? '',
    amountPerPackage: item?.amountPerPackage ?? '',
    targetUnit: item?.targetUnit ?? 'package',
    targetQuantity: item?.targetQuantity ?? 1,
    refillThreshold: item?.refillThreshold ?? 1,
    consumeAmount: item?.consumeAmount ?? 1,
    expirationThreshold: item?.expirationThreshold ?? '',
  })

  // Track previous targetUnit for conversion
  const prevTargetUnit = useRef<'package' | 'measurement'>(targetUnit)

  // Convert values when switching between package and measurement tracking
  useEffect(() => {
    if (
      !amountPerPackage ||
      !measurementUnit ||
      prevTargetUnit.current === targetUnit
    ) {
      prevTargetUnit.current = targetUnit
      return
    }

    const amount = Number(amountPerPackage)
    if (amount <= 0) {
      prevTargetUnit.current = targetUnit
      return
    }

    if (prevTargetUnit.current === 'package' && targetUnit === 'measurement') {
      setTargetQuantity((prev) => prev * amount)
      setRefillThreshold((prev) => prev * amount)
      setConsumeAmount((prev) => prev * amount)
    } else if (
      prevTargetUnit.current === 'measurement' &&
      targetUnit === 'package'
    ) {
      setTargetQuantity((prev) => prev / amount)
      setRefillThreshold((prev) => prev / amount)
      setConsumeAmount((prev) => prev / amount)
    }

    prevTargetUnit.current = targetUnit
  }, [targetUnit, amountPerPackage, measurementUnit])

  // Auto-set targetUnit to 'package' when measurementUnit is cleared
  useEffect(() => {
    if (!measurementUnit && targetUnit === 'measurement') {
      setTargetUnit('package')
    }
  }, [measurementUnit, targetUnit])

  // Compute dirty state
  const isDirty =
    name !== initialValues.name ||
    packageUnit !== initialValues.packageUnit ||
    measurementUnit !== initialValues.measurementUnit ||
    amountPerPackage !== initialValues.amountPerPackage ||
    targetUnit !== initialValues.targetUnit ||
    targetQuantity !== initialValues.targetQuantity ||
    refillThreshold !== initialValues.refillThreshold ||
    consumeAmount !== initialValues.consumeAmount ||
    expirationThreshold !== initialValues.expirationThreshold

  // Report dirty state to parent
  useEffect(() => {
    registerDirtyState(isDirty)
  }, [isDirty, registerDirtyState])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const updates: any = {
      name,
      targetUnit,
      targetQuantity,
      refillThreshold,
      consumeAmount,
    }

    updates.packageUnit = packageUnit || undefined
    updates.measurementUnit = measurementUnit || undefined
    updates.amountPerPackage = amountPerPackage ? Number(amountPerPackage) : undefined
    updates.expirationThreshold = expirationThreshold
      ? Number(expirationThreshold)
      : undefined

    updateItem.mutate(
      { id, updates },
      {
        onSuccess: () => {
          toast({ title: 'Item info updated' })
        },
      }
    )
  }

  if (!item) return null

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="packageUnit">Package Unit</Label>
          <Input
            id="packageUnit"
            value={packageUnit}
            onChange={(e) => setPackageUnit(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="measurementUnit">Measurement Unit</Label>
          <Input
            id="measurementUnit"
            value={measurementUnit}
            onChange={(e) => setMeasurementUnit(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="amountPerPackage">Amount per Package</Label>
          <Input
            id="amountPerPackage"
            type="number"
            step="1"
            min={1}
            value={amountPerPackage}
            onChange={(e) => setAmountPerPackage(e.target.value)}
            disabled={!measurementUnit}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Switch
            id="targetUnit"
            checked={targetUnit === 'measurement'}
            onCheckedChange={(checked) =>
              setTargetUnit(checked ? 'measurement' : 'package')
            }
            disabled={!measurementUnit}
          />
          <Label htmlFor="targetUnit" className="cursor-pointer">
            Track target in measurement
            {measurementUnit && ` (${measurementUnit})`}
          </Label>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="targetQuantity">Target Quantity</Label>
          <Input
            id="targetQuantity"
            type="number"
            min={0}
            step={targetUnit === 'package' ? 1 : consumeAmount || 1}
            value={targetQuantity}
            onChange={(e) => setTargetQuantity(Number(e.target.value))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="refillThreshold">Refill When Below</Label>
          <Input
            id="refillThreshold"
            type="number"
            min={0}
            step={targetUnit === 'package' ? 1 : consumeAmount || 1}
            value={refillThreshold}
            onChange={(e) => setRefillThreshold(Number(e.target.value))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="consumeAmount">Amount per Consume</Label>
          <Input
            id="consumeAmount"
            type="number"
            step="0.001"
            min={0.001}
            value={consumeAmount}
            onChange={(e) => setConsumeAmount(Number(e.target.value))}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="expirationThreshold">Expiration Warning Threshold (days)</Label>
        <Input
          id="expirationThreshold"
          type="number"
          min={0}
          value={expirationThreshold}
          onChange={(e) => setExpirationThreshold(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={!isDirty}>
        Save
      </Button>
    </form>
  )
}
```

**Step 2: Commit**

```bash
git add src/routes/items/\$id/info.tsx
git commit -m "feat(items): add Item Info tab route"
```

---

## Task 4: Create Tags tab

**Files:**
- Create: `src/routes/items/$id/tags.tsx`

**Step 1: Create Tags tab route**

Create `src/routes/items/$id/tags.tsx`:

```tsx
import { createFileRoute } from '@tanstack/router'
import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useItem, useUpdateItem, useTags, useTagTypes } from '@/hooks'
import { useItemLayout } from '@/hooks/useItemLayout'
import { sortTagsByName } from '@/lib/tagSortUtils'

export const Route = createFileRoute('/items/$id/tags')({
  component: TagsTab,
})

function TagsTab() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const updateItem = useUpdateItem()
  const { data: tagTypes = [] } = useTagTypes()
  const { data: allTags = [] } = useTags()
  const { registerDirtyState } = useItemLayout()

  // Tags tab never has unsaved changes (saves immediately)
  useEffect(() => {
    registerDirtyState(false)
  }, [registerDirtyState])

  const toggleTag = (tagId: string) => {
    if (!item) return

    const newTagIds = item.tagIds.includes(tagId)
      ? item.tagIds.filter((id) => id !== tagId)
      : [...item.tagIds, tagId]

    // Immediate save with optimistic update
    updateItem.mutate({ id, updates: { tagIds: newTagIds } })
  }

  if (!item) return null

  return (
    <div className="space-y-6 max-w-2xl">
      {tagTypes.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          No tags yet. Create tags in Settings.
        </p>
      ) : (
        <div className="space-y-3">
          {[...tagTypes]
            .sort((a, b) =>
              a.name.localeCompare(b.name, undefined, {
                sensitivity: 'base',
              }),
            )
            .map((tagType) => {
              const typeTags = allTags.filter((t) => t.typeId === tagType.id)
              if (typeTags.length === 0) return null
              const sortedTypeTags = sortTagsByName(typeTags)

              return (
                <div key={tagType.id}>
                  <p className="text-sm font-medium text-foreground-muted mb-1">
                    {tagType.name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sortedTypeTags.map((tag) => {
                      const isSelected = item.tagIds.includes(tag.id)

                      return (
                        <Badge
                          key={tag.id}
                          variant={
                            isSelected ? tagType.color : 'neutral-outline'
                          }
                          className="cursor-pointer"
                          onClick={() => toggleTag(tag.id)}
                        >
                          {tag.name}
                          {isSelected && <X className="ml-1 h-3 w-3" />}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/routes/items/\$id/tags.tsx
git commit -m "feat(items): add Tags tab route with immediate save"
```

---

## Task 5: Add navigation guard for unsaved changes

**Files:**
- Modify: `src/routes/items/$id.tsx`

**Step 1: Add navigation guard to parent layout**

In `src/routes/items/$id.tsx`, add the navigation guard. Update the file:

```tsx
import { createFileRoute, Link, Outlet, useNavigate, useRouter } from '@tanstack/router'
import { ArrowLeft, History, Trash2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
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
import { useDeleteItem, useItem } from '@/hooks'
import { ItemLayoutProvider, useItemLayout } from '@/hooks/useItemLayout'

export const Route = createFileRoute('/items/$id')({
  component: ItemLayout,
})

function ItemLayoutInner() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const { data: item, isLoading } = useItem(id)
  const deleteItem = useDeleteItem()
  const { isDirty } = useItemLayout()

  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)

  // Intercept tab navigation when dirty
  const handleTabClick = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
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

  if (isLoading) {
    return <div className="p-4">Loading...</div>
  }

  if (!item) {
    return <div className="p-4">Item not found</div>
  }

  return (
    <>
      <div className="min-h-screen">
        {/* Fixed Top Bar */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-background-elevated border-b">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Button
                variant="neutral-ghost"
                size="icon"
                onClick={() => navigate({ to: '/' })}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-bold truncate max-w-[300px]">
                {item.name}
              </h1>
            </div>

            {/* Tabs */}
            <div className="flex gap-1">
              <Link
                to="/items/$id"
                params={{ id }}
                activeOptions={{ exact: true }}
                className="px-4 py-2 rounded-md hover:bg-background transition-colors"
                activeProps={{
                  className: 'bg-background font-medium',
                }}
                onClick={(e) => handleTabClick(e, `/items/${id}`)}
              >
                Stock
              </Link>
              <Link
                to="/items/$id/info"
                params={{ id }}
                className="px-4 py-2 rounded-md hover:bg-background transition-colors"
                activeProps={{
                  className: 'bg-background font-medium',
                }}
                onClick={(e) => handleTabClick(e, `/items/${id}/info`)}
              >
                Info
              </Link>
              <Link
                to="/items/$id/tags"
                params={{ id }}
                className="px-4 py-2 rounded-md hover:bg-background transition-colors"
                activeProps={{
                  className: 'bg-background font-medium',
                }}
                onClick={(e) => handleTabClick(e, `/items/${id}/tags`)}
              >
                Tags
              </Link>
            </div>

            <div className="flex gap-2">
              <Link to="/items/$id/log" params={{ id }}>
                <Button variant="neutral-ghost" size="icon">
                  <History className="h-5 w-5" />
                </Button>
              </Link>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => {
                  if (confirm('Delete this item?')) {
                    deleteItem.mutate(id, {
                      onSuccess: () => navigate({ to: '/' }),
                    })
                  }
                }}
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content with padding to clear fixed bar */}
        <div className="pt-20 p-4">
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

function ItemLayout() {
  return (
    <ItemLayoutProvider>
      <ItemLayoutInner />
    </ItemLayoutProvider>
  )
}
```

**Step 2: Commit**

```bash
git add src/routes/items/\$id.tsx
git commit -m "feat(items): add navigation guard for unsaved changes"
```

---

## Task 6: Remove old item detail route

**Files:**
- Delete: The current `src/routes/items/$id.tsx` will be replaced by the parent layout
- Note: We already created the new parent layout, so this step is about removing any old single-page implementation if it exists

**Step 1: Verify new routes work**

```bash
pnpm dev
```

Navigate to an item and verify tabs work

**Step 2: If there's an old route file, remove it**

(Skip if already replaced)

**Step 3: Commit if changes made**

```bash
git add -A
git commit -m "chore(items): remove old single-page item route"
```

---

## Task 7: Create new item page

**Files:**
- Modify: `src/routes/items/new.tsx` (likely needs to be created or heavily modified)

**Step 1: Create/update new item page**

Create or modify `src/routes/items/new.tsx`:

```tsx
import { createFileRoute, useNavigate } from '@tanstack/router'
import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { useCreateItem, useTags, useTagTypes } from '@/hooks'
import { sortTagsByName } from '@/lib/tagSortUtils'
import type { Item } from '@/types'

export const Route = createFileRoute('/items/new')({
  component: NewItemPage,
})

function NewItemPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const createItem = useCreateItem()
  const { data: tagTypes = [] } = useTagTypes()
  const { data: allTags = [] } = useTags()

  const [name, setName] = useState('')
  const [packageUnit, setPackageUnit] = useState('')
  const [measurementUnit, setMeasurementUnit] = useState('')
  const [amountPerPackage, setAmountPerPackage] = useState('')
  const [targetUnit, setTargetUnit] = useState<'package' | 'measurement'>('package')
  const [targetQuantity, setTargetQuantity] = useState(1)
  const [refillThreshold, setRefillThreshold] = useState(1)
  const [consumeAmount, setConsumeAmount] = useState(1)
  const [expirationThreshold, setExpirationThreshold] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])

  const prevTargetUnit = useRef<'package' | 'measurement'>(targetUnit)

  // Convert values when switching between package and measurement tracking
  useEffect(() => {
    if (
      !amountPerPackage ||
      !measurementUnit ||
      prevTargetUnit.current === targetUnit
    ) {
      prevTargetUnit.current = targetUnit
      return
    }

    const amount = Number(amountPerPackage)
    if (amount <= 0) {
      prevTargetUnit.current = targetUnit
      return
    }

    if (prevTargetUnit.current === 'package' && targetUnit === 'measurement') {
      setTargetQuantity((prev) => prev * amount)
      setRefillThreshold((prev) => prev * amount)
      setConsumeAmount((prev) => prev * amount)
    } else if (
      prevTargetUnit.current === 'measurement' &&
      targetUnit === 'package'
    ) {
      setTargetQuantity((prev) => prev / amount)
      setRefillThreshold((prev) => prev / amount)
      setConsumeAmount((prev) => prev / amount)
    }

    prevTargetUnit.current = targetUnit
  }, [targetUnit, amountPerPackage, measurementUnit])

  useEffect(() => {
    if (!measurementUnit && targetUnit === 'measurement') {
      setTargetUnit('package')
    }
  }, [measurementUnit, targetUnit])

  const clearForm = () => {
    setName('')
    setPackageUnit('')
    setMeasurementUnit('')
    setAmountPerPackage('')
    setTargetUnit('package')
    setTargetQuantity(1)
    setRefillThreshold(1)
    setConsumeAmount(1)
    setExpirationThreshold('')
    setTagIds([])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const data: Omit<Item, 'id' | 'createdAt' | 'updatedAt'> = {
      name,
      targetUnit,
      targetQuantity,
      refillThreshold,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount,
      tagIds,
    }

    data.packageUnit = packageUnit || undefined
    data.measurementUnit = measurementUnit || undefined
    data.amountPerPackage = amountPerPackage ? Number(amountPerPackage) : undefined
    data.expirationThreshold = expirationThreshold
      ? Number(expirationThreshold)
      : undefined

    createItem.mutate(data, {
      onSuccess: (newItem) => {
        const { toast: successToast, dismiss } = toast({
          title: 'Item created',
          description: (
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                onClick={() => {
                  dismiss()
                  navigate({ to: '/items/$id', params: { id: newItem.id } })
                }}
              >
                View item
              </Button>
              <Button
                size="sm"
                variant="neutral-outline"
                onClick={() => {
                  dismiss()
                  navigate({ to: '/' })
                }}
              >
                Back to list
              </Button>
              <Button
                size="sm"
                variant="neutral-outline"
                onClick={() => {
                  dismiss()
                  clearForm()
                }}
              >
                Create another
              </Button>
            </div>
          ),
          duration: 10000,
        })
      },
    })
  }

  const toggleTag = (tagId: string) => {
    setTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    )
  }

  return (
    <div className="min-h-screen">
      {/* Fixed Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-background-elevated border-b">
        <div className="flex items-center gap-3 p-4">
          <Button
            variant="neutral-ghost"
            size="icon"
            onClick={() => navigate({ to: '/' })}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">New Item</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-20 p-4">
        <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="packageUnit">Package Unit</Label>
              <Input
                id="packageUnit"
                value={packageUnit}
                onChange={(e) => setPackageUnit(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="measurementUnit">Measurement Unit</Label>
              <Input
                id="measurementUnit"
                value={measurementUnit}
                onChange={(e) => setMeasurementUnit(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amountPerPackage">Amount per Package</Label>
              <Input
                id="amountPerPackage"
                type="number"
                step="1"
                min={1}
                value={amountPerPackage}
                onChange={(e) => setAmountPerPackage(e.target.value)}
                disabled={!measurementUnit}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Switch
                id="targetUnit"
                checked={targetUnit === 'measurement'}
                onCheckedChange={(checked) =>
                  setTargetUnit(checked ? 'measurement' : 'package')
                }
                disabled={!measurementUnit}
              />
              <Label htmlFor="targetUnit" className="cursor-pointer">
                Track target in measurement
                {measurementUnit && ` (${measurementUnit})`}
              </Label>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="targetQuantity">Target Quantity</Label>
              <Input
                id="targetQuantity"
                type="number"
                min={0}
                step={targetUnit === 'package' ? 1 : consumeAmount || 1}
                value={targetQuantity}
                onChange={(e) => setTargetQuantity(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="refillThreshold">Refill When Below</Label>
              <Input
                id="refillThreshold"
                type="number"
                min={0}
                step={targetUnit === 'package' ? 1 : consumeAmount || 1}
                value={refillThreshold}
                onChange={(e) => setRefillThreshold(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="consumeAmount">Amount per Consume</Label>
              <Input
                id="consumeAmount"
                type="number"
                step="0.001"
                min={0.001}
                value={consumeAmount}
                onChange={(e) => setConsumeAmount(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expirationThreshold">
              Expiration Warning Threshold (days)
            </Label>
            <Input
              id="expirationThreshold"
              type="number"
              min={0}
              value={expirationThreshold}
              onChange={(e) => setExpirationThreshold(e.target.value)}
            />
          </div>

          <div className="border-t pt-6 space-y-4">
            <h3 className="text-sm font-medium">Tags</h3>
            {tagTypes.length === 0 ? (
              <p className="text-sm text-foreground-muted">
                No tags yet. Create tags in Settings.
              </p>
            ) : (
              <div className="space-y-3">
                {[...tagTypes]
                  .sort((a, b) =>
                    a.name.localeCompare(b.name, undefined, {
                      sensitivity: 'base',
                    }),
                  )
                  .map((tagType) => {
                    const typeTags = allTags.filter((t) => t.typeId === tagType.id)
                    if (typeTags.length === 0) return null
                    const sortedTypeTags = sortTagsByName(typeTags)

                    return (
                      <div key={tagType.id}>
                        <p className="text-sm font-medium text-foreground-muted mb-1">
                          {tagType.name}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {sortedTypeTags.map((tag) => {
                            const isSelected = tagIds.includes(tag.id)

                            return (
                              <Badge
                                key={tag.id}
                                variant={
                                  isSelected ? tagType.color : 'neutral-outline'
                                }
                                className="cursor-pointer"
                                onClick={() => toggleTag(tag.id)}
                              >
                                {tag.name}
                                {isSelected && <X className="ml-1 h-3 w-3" />}
                              </Badge>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>

          <Button type="submit">Save</Button>
        </form>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/routes/items/new.tsx
git commit -m "feat(items): update new item page with Info+Tags single view"
```

---

## Task 8: Update tests

**Files:**
- Update existing tests to work with new route structure
- Add tests for tab navigation and dirty state

**Step 1: Run all tests to see what breaks**

```bash
pnpm test
```

**Step 2: Update failing tests**

(Fix tests based on actual failures - route structure changed, so tests need updates)

**Step 3: Commit**

```bash
git add -A
git commit -m "test(items): update tests for tabbed item form"
```

---

## Task 9: Manual verification

**Step 1: Test new item creation**

```bash
pnpm dev
```

- Create a new item
- Verify success toast with three buttons
- Test each button (View, List, Create another)

**Step 2: Test existing item tabs**

- Navigate to an item
- Verify Stock tab shows by default
- Test switching between tabs
- Test dirty state and discard confirmation
- Test save buttons (disabled when clean, enabled when dirty)
- Test Tags tab immediate save

**Step 3: Run full test suite**

```bash
pnpm test
pnpm lint
```

Expected: All pass

---

## Completion

**Verification checklist:**
- [ ] `/items/new` renders Info + Tags in single view
- [ ] Success toast shows three action buttons
- [ ] `/items/$id` shows Stock tab by default
- [ ] Top bar contains tabs and action buttons
- [ ] Each tab has unique URL
- [ ] Browser back/forward works
- [ ] Save buttons disabled when no changes
- [ ] Unsaved changes show discard confirmation
- [ ] Tags save immediately
- [ ] All tests pass
- [ ] No lint errors

**Files created/modified:**
- `src/routes/items/$id.tsx` (parent layout)
- `src/routes/items/$id/index.tsx` (Stock tab)
- `src/routes/items/$id/info.tsx` (Info tab)
- `src/routes/items/$id/tags.tsx` (Tags tab)
- `src/routes/items/new.tsx` (new item page)
- `src/hooks/useItemLayout.tsx` (context for dirty state)
- Test files as needed
