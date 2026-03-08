# Cooking Page — Sort, Search URL Params, Expand/Collapse All Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add user-controlled recipe sorting (name/recent/count), move search query to URL params, and add an expand/collapse all button in a new second toolbar row (`CookingControlBar`).

**Architecture:** A new `CookingControlBar` component (`src/components/recipe/CookingControlBar/index.tsx`) owns all search and sort UI and reads/writes URL params directly via TanStack Router hooks. The cooking route gains a `validateSearch` to define `?sort`, `?dir`, and `?q`. Expand/collapse all state remains in `cooking.tsx` and is passed as props.

**Tech Stack:** React 19, TanStack Router (`useSearch`, `useNavigate`), Dexie.js (schema v5), Lucide icons, shadcn/ui (`Select`, `Button`, `Input`)

---

### Task 1: Add `lastCookedAt` to Recipe type

**Files:**
- Modify: `src/types/index.ts:98-104`

**Step 1: Add the optional field**

In `src/types/index.ts`, update the `Recipe` interface:

```ts
export interface Recipe {
  id: string
  name: string
  items: RecipeItem[]
  createdAt: Date
  updatedAt: Date
  lastCookedAt?: Date
}
```

**Step 2: Verify TypeScript compiles**

```bash
pnpm check
```

Expected: no errors (the field is optional, existing code unaffected).

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(cooking): add lastCookedAt field to Recipe type"
```

---

### Task 2: Add Dexie schema version 5

**Files:**
- Modify: `src/db/index.ts`

**Step 1: Add version 5**

In `src/db/index.ts`, after the existing `db.version(4)` block (line 55–65), add:

```ts
// Version 5: Add lastCookedAt to recipes
db.version(5).stores({
  items: 'id, name, targetUnit, createdAt, updatedAt',
  tags: 'id, name, typeId',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id, status, createdAt, completedAt',
  cartItems: 'id, cartId, itemId',
  vendors: 'id, name',
  recipes: 'id, name, lastCookedAt',
})
```

No `.upgrade()` needed — `lastCookedAt` is optional; existing records are valid as-is.

**Step 2: Verify no migration errors**

```bash
pnpm dev
```

Open the app. No console errors about schema migration.

**Step 3: Commit**

```bash
git add src/db/index.ts
git commit -m "feat(cooking): add Dexie schema v5 with lastCookedAt index on recipes"
```

---

### Task 3: Add `updateRecipeLastCookedAt` operation with tests

**Files:**
- Modify: `src/db/operations.ts`
- Modify: `src/db/operations.test.ts`

`updateRecipe` always sets `updatedAt: new Date()`. Cooking updates `lastCookedAt` only — recipe content hasn't changed — so we need a separate function.

**Step 1: Write the failing test**

In `src/db/operations.test.ts`, inside the `'Recipe operations'` describe block (after existing tests), add:

```ts
it('user can record lastCookedAt on a recipe', async () => {
  // Given a recipe exists
  const recipe = await createRecipe({ name: 'Soup' })
  expect(recipe.lastCookedAt).toBeUndefined()

  // When lastCookedAt is updated
  const before = new Date()
  await updateRecipeLastCookedAt(recipe.id)
  const after = new Date()

  // Then the recipe has a lastCookedAt timestamp
  const updated = await getRecipe(recipe.id)
  expect(updated?.lastCookedAt).toBeDefined()
  expect(updated!.lastCookedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
  expect(updated!.lastCookedAt!.getTime()).toBeLessThanOrEqual(after.getTime())
  // And updatedAt is unchanged
  expect(updated?.updatedAt.getTime()).toEqual(recipe.updatedAt.getTime())
})
```

Also add `updateRecipeLastCookedAt` to the import at the top of the test file (alongside `createRecipe`, `getRecipe`, etc.).

**Step 2: Run the test to confirm it fails**

```bash
pnpm test src/db/operations.test.ts --reporter=verbose 2>&1 | grep -A5 "lastCookedAt"
```

Expected: FAIL — `updateRecipeLastCookedAt is not a function`.

**Step 3: Implement `updateRecipeLastCookedAt` in operations.ts**

In `src/db/operations.ts`, after `updateRecipe` (around line 450), add:

```ts
export async function updateRecipeLastCookedAt(id: string): Promise<void> {
  await db.recipes.update(id, { lastCookedAt: new Date() })
}
```

Also add it to the export list if operations.ts uses a barrel export (check if there's an index barrel — if not, just the `export` keyword is enough).

**Step 4: Run the test to confirm it passes**

```bash
pnpm test src/db/operations.test.ts --reporter=verbose 2>&1 | grep -A5 "lastCookedAt"
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/db/operations.ts src/db/operations.test.ts
git commit -m "feat(cooking): add updateRecipeLastCookedAt operation"
```

---

### Task 4: Add `validateSearch` to the cooking route

**Files:**
- Modify: `src/routes/cooking.tsx:54-56`

This defines the URL search param schema for `/cooking`. TanStack Router calls `validateSearch` with the raw query string object and uses the return type for `useSearch`.

**Step 1: Update the route definition**

Replace lines 54–56 in `src/routes/cooking.tsx`:

```ts
// Before:
export const Route = createFileRoute('/cooking')({
  component: CookingPage,
})

// After:
export const Route = createFileRoute('/cooking')({
  component: CookingPage,
  validateSearch: (search: Record<string, unknown>) => ({
    sort:
      search.sort === 'recent' || search.sort === 'count'
        ? (search.sort as 'recent' | 'count')
        : ('name' as const),
    dir: search.dir === 'desc' ? ('desc' as const) : ('asc' as const),
    q: typeof search.q === 'string' ? search.q : '',
  }),
})
```

**Step 2: Read sort params in `CookingPage` for sorting**

In `CookingPage`, add after `const navigate = useNavigate()` (line 59):

```ts
const { sort, dir, q } = Route.useSearch()
```

Replace the current `searchQuery` state references with `q` (just enough to not break the build — full integration happens in Task 6).

**Step 3: Verify TypeScript compiles**

```bash
pnpm check
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/routes/cooking.tsx
git commit -m "feat(cooking): add validateSearch for sort, dir, q URL params"
```

---

### Task 5: Create `CookingControlBar` component

**Files:**
- Create: `src/components/recipe/CookingControlBar/index.tsx`
- Create: `src/components/recipe/CookingControlBar/index.stories.tsx`

**Step 1: Create the component**

```tsx
// src/components/recipe/CookingControlBar/index.tsx
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Route } from '@/routes/cooking'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface CookingControlBarProps {
  allExpanded: boolean
  onExpandAll: () => void
  onCollapseAll: () => void
}

export function CookingControlBar({
  allExpanded,
  onExpandAll,
  onCollapseAll,
}: CookingControlBarProps) {
  const { sort, dir, q } = Route.useSearch()
  const navigate = useNavigate()

  const [searchVisible, setSearchVisible] = useState(!!q)

  // Open search row on mount if URL already has a query
  useEffect(() => {
    if (q) setSearchVisible(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setParam = (
    updates: Partial<{ sort: 'name' | 'recent' | 'count'; dir: 'asc' | 'desc'; q: string }>,
  ) => {
    navigate({
      to: '/cooking',
      search: (prev) => ({ ...prev, ...updates }),
    })
  }

  // Derive whether an exact recipe title match exists — needed for Create button
  // (CookingControlBar doesn't have recipes, so it exposes a callback instead)
  // The parent passes this via the search row's onSearchSubmit. Since the component
  // owns search rendering entirely, it needs the recipes. For simplicity, we import
  // useRecipes here — acceptable since this component is page-specific.
  const hasExactTitleMatch = false // placeholder; overridden below via the hook

  return (
    <>
      {/* Row 1: sort dropdown | sort direction | expand/collapse | spacer | search toggle */}
      <div className="flex items-center gap-2 border-b-2 border-accessory-default bg-background-elevated px-3 py-2">
        <Select
          value={sort}
          onValueChange={(value) =>
            setParam({ sort: value as 'name' | 'recent' | 'count' })
          }
        >
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="recent">Recent</SelectItem>
            <SelectItem value="count">Item Count</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="neutral-outline"
          size="icon"
          aria-label={dir === 'asc' ? 'Sort ascending' : 'Sort descending'}
          onClick={() => setParam({ dir: dir === 'asc' ? 'desc' : 'asc' })}
        >
          {dir === 'asc' ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )}
        </Button>

        <Button
          variant="neutral-outline"
          size="icon"
          aria-label={allExpanded ? 'Collapse all' : 'Expand all'}
          onClick={allExpanded ? onCollapseAll : onExpandAll}
        >
          {allExpanded ? (
            <ChevronsDownUp className="h-4 w-4" />
          ) : (
            <ChevronsUpDown className="h-4 w-4" />
          )}
        </Button>

        <span className="flex-1" />

        <Button
          variant={searchVisible ? 'neutral' : 'neutral-outline'}
          size="icon"
          aria-label="Toggle search"
          onClick={() => {
            if (searchVisible) {
              setParam({ q: '' })
            }
            setSearchVisible((v) => !v)
          }}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {/* Row 2: search input (conditional) */}
      {searchVisible && (
        <SearchRow q={q} setParam={setParam} onClose={() => setSearchVisible(false)} />
      )}
    </>
  )
}

// Extracted so we can use useRecipes without importing at the top level
function SearchRow({
  q,
  setParam,
  onClose: _onClose,
}: {
  q: string
  setParam: (u: Partial<{ q: string }>) => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { data: recipes = [] } = (
    await import('@/hooks/useRecipes')
  ).useRecipes()

  const lowerQ = q.toLowerCase().trim()
  const hasExactTitleMatch = lowerQ
    ? recipes.some((r) => r.name.toLowerCase() === lowerQ)
    : false

  return (
    <div className="flex items-center gap-2 border-b-2 border-accessory-default px-3">
      <Input
        placeholder="Search recipes or items..."
        value={q}
        onChange={(e) => setParam({ q: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setParam({ q: '' })
            // keep searchVisible open per design
          }
          if (e.key === 'Enter' && q.trim() && !hasExactTitleMatch) {
            navigate({
              to: '/settings/recipes/new',
              search: { name: q.trim() },
            })
          }
        }}
        className="border-none shadow-none bg-transparent h-auto py-2 text-sm flex-1"
        autoFocus
      />
      {q &&
        (!hasExactTitleMatch ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              navigate({
                to: '/settings/recipes/new',
                search: { name: q.trim() },
              })
            }
          >
            <Plus /> Create
          </Button>
        ) : (
          <Button
            size="icon"
            variant="neutral-ghost"
            className="h-6 w-6 shrink-0"
            aria-label="Clear search"
            onClick={() => setParam({ q: '' })}
          >
            <X />
          </Button>
        ))}
    </div>
  )
}
```

**NOTE:** The `SearchRow` above uses dynamic `import()` which won't work correctly in a React component. Revise to import `useRecipes` at the top of the file statically:

```tsx
// At the top of the file, replace the SearchRow function with:
import { useRecipes } from '@/hooks/useRecipes'

// And SearchRow becomes:
function SearchRow({ q, setParam, onClose: _onClose }: ...) {
  const navigate = useNavigate()
  const { data: recipes = [] } = useRecipes()
  // ... rest same
}
```

**Full corrected component** (`src/components/recipe/CookingControlBar/index.tsx`):

```tsx
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRecipes } from '@/hooks/useRecipes'
import { Route } from '@/routes/cooking'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface CookingControlBarProps {
  allExpanded: boolean
  onExpandAll: () => void
  onCollapseAll: () => void
}

export function CookingControlBar({
  allExpanded,
  onExpandAll,
  onCollapseAll,
}: CookingControlBarProps) {
  const { sort, dir, q } = Route.useSearch()
  const navigate = useNavigate()
  const { data: recipes = [] } = useRecipes()

  const [searchVisible, setSearchVisible] = useState(!!q)

  useEffect(() => {
    if (q && !searchVisible) setSearchVisible(true)
  }, [q]) // open row if q appears in URL (e.g. page load with existing params)

  const setParam = (
    updates: Partial<{
      sort: 'name' | 'recent' | 'count'
      dir: 'asc' | 'desc'
      q: string
    }>,
  ) => {
    navigate({ to: '/cooking', search: (prev) => ({ ...prev, ...updates }) })
  }

  const lowerQ = q.toLowerCase().trim()
  const hasExactTitleMatch = lowerQ
    ? recipes.some((r) => r.name.toLowerCase() === lowerQ)
    : false

  return (
    <>
      {/* Row 1: controls */}
      <div className="flex items-center gap-2 border-b-2 border-accessory-default bg-background-elevated px-3 py-2">
        <Select
          value={sort}
          onValueChange={(value) =>
            setParam({ sort: value as 'name' | 'recent' | 'count' })
          }
        >
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="recent">Recent</SelectItem>
            <SelectItem value="count">Item Count</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="neutral-outline"
          size="icon"
          aria-label={dir === 'asc' ? 'Sort ascending' : 'Sort descending'}
          onClick={() => setParam({ dir: dir === 'asc' ? 'desc' : 'asc' })}
        >
          {dir === 'asc' ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )}
        </Button>

        <Button
          variant="neutral-outline"
          size="icon"
          aria-label={allExpanded ? 'Collapse all' : 'Expand all'}
          onClick={allExpanded ? onCollapseAll : onExpandAll}
        >
          {allExpanded ? (
            <ChevronsDownUp className="h-4 w-4" />
          ) : (
            <ChevronsUpDown className="h-4 w-4" />
          )}
        </Button>

        <span className="flex-1" />

        <Button
          variant={searchVisible ? 'neutral' : 'neutral-outline'}
          size="icon"
          aria-label="Toggle search"
          onClick={() => {
            if (searchVisible) setParam({ q: '' })
            setSearchVisible((v) => !v)
          }}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {/* Row 2: search input */}
      {searchVisible && (
        <div className="flex items-center gap-2 border-b-2 border-accessory-default px-3">
          <Input
            placeholder="Search recipes or items..."
            value={q}
            onChange={(e) => setParam({ q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setParam({ q: '' })
                // Per design: Escape clears query but keeps row open
              }
              if (e.key === 'Enter' && q.trim() && !hasExactTitleMatch) {
                navigate({
                  to: '/settings/recipes/new',
                  search: { name: q.trim() },
                })
              }
            }}
            className="border-none shadow-none bg-transparent h-auto py-2 text-sm flex-1"
            autoFocus
          />
          {q &&
            (!hasExactTitleMatch ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  navigate({
                    to: '/settings/recipes/new',
                    search: { name: q.trim() },
                  })
                }
              >
                <Plus /> Create
              </Button>
            ) : (
              <Button
                size="icon"
                variant="neutral-ghost"
                className="h-6 w-6 shrink-0"
                aria-label="Clear search"
                onClick={() => setParam({ q: '' })}
              >
                <X />
              </Button>
            ))}
        </div>
      )}
    </>
  )
}
```

**Step 2: Create Storybook stories**

```tsx
// src/components/recipe/CookingControlBar/index.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useState } from 'react'
import { routeTree } from '@/routeTree.gen'
import { CookingControlBar } from '.'

const meta = {
  title: 'Recipe/CookingControlBar',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function BarWrapper({
  initialSearch = '/cooking',
  allExpanded = false,
}: {
  initialSearch?: string
  allExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(allExpanded)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialSearch] }),
    context: { queryClient },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider
        router={router}
        defaultComponent={() => (
          <CookingControlBar
            allExpanded={expanded}
            onExpandAll={() => setExpanded(true)}
            onCollapseAll={() => setExpanded(false)}
          />
        )}
      />
    </QueryClientProvider>
  )
}

export const Default: Story = {
  render: () => <BarWrapper />,
}

export const AllExpanded: Story = {
  render: () => <BarWrapper allExpanded={true} />,
}

export const SortByRecent: Story = {
  render: () => <BarWrapper initialSearch="/cooking?sort=recent" />,
}

export const SortDescending: Story = {
  render: () => <BarWrapper initialSearch="/cooking?sort=name&dir=desc" />,
}

export const WithSearch: Story = {
  render: () => <BarWrapper initialSearch="/cooking?q=pasta" />,
}
```

**Note on stories:** The `RouterProvider defaultComponent` pattern above may not match how the project's router is set up. Look at `src/routes/cooking.stories.tsx` (the existing CookingStory wrapper) for the correct pattern. Adapt the stories wrapper to match it — the key is rendering `CookingControlBar` inside a router context that navigates to `/cooking`.

**Step 3: Verify TypeScript compiles**

```bash
pnpm check
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/components/recipe/CookingControlBar/
git commit -m "feat(cooking): add CookingControlBar component with sort, search, expand/collapse"
```

---

### Task 6: Integrate `CookingControlBar` into `cooking.tsx`

**Files:**
- Modify: `src/routes/cooking.tsx`

**Step 1: Remove local search state and search button from toolbar**

In `CookingPage`:
- Remove lines 85–86 (`const [searchVisible, setSearchVisible] = useState(false)` and `const [searchQuery, setSearchQuery] = useState('')`)
- Remove the search toggle `<Button>` from the `<Toolbar>` (lines 352–362)
- Remove the entire `{searchVisible && (...)}` block (lines 365–416)

**Step 2: Replace `searchQuery` references with URL param `q`**

The function already has `const { sort, dir, q } = Route.useSearch()` added in Task 4. Now update all `searchQuery` → `q`:
- Line 98: `const lowerQuery = searchQuery.toLowerCase().trim()` → `const lowerQuery = q.toLowerCase().trim()`
- Line 484: `{highlight(recipe.name, searchQuery)}` → `{highlight(recipe.name, q)}`
- Line 597: `searchQuery ? highlight(...)` → `q ? highlight(...)`

**Step 3: Update `sortedRecipes` to use URL sort params**

Replace the current `sortedRecipes` memo (lines 90–96):

```ts
const sortedRecipes = useMemo(() => {
  const sorted = [...recipes].sort((a, b) => {
    if (sort === 'recent') {
      const aTime = a.lastCookedAt?.getTime() ?? 0
      const bTime = b.lastCookedAt?.getTime() ?? 0
      // Undefined (never cooked) always sorts last regardless of direction
      if (!a.lastCookedAt && !b.lastCookedAt) return 0
      if (!a.lastCookedAt) return 1
      if (!b.lastCookedAt) return -1
      return dir === 'asc' ? aTime - bTime : bTime - aTime
    }
    if (sort === 'count') {
      const diff = a.items.length - b.items.length
      return dir === 'asc' ? diff : -diff
    }
    // Default: name
    const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    return dir === 'asc' ? cmp : -cmp
  })
  return sorted
}, [recipes, sort, dir])
```

**Step 4: Add `CookingControlBar` between toolbar and recipe list**

In the JSX, after the `</Toolbar>` closing tag (line 363) and before the `{sortedRecipes.length === 0 ? ...}` block (line 418), insert:

```tsx
<CookingControlBar
  allExpanded={
    recipes.length > 0 && expandedRecipeIds.size === recipes.length
  }
  onExpandAll={() =>
    setExpandedRecipeIds(new Set(recipes.map((r) => r.id)))
  }
  onCollapseAll={() => setExpandedRecipeIds(new Set())}
/>
```

**Step 5: Add the import**

At the top of `cooking.tsx`, add:

```ts
import { CookingControlBar } from '@/components/recipe/CookingControlBar'
```

Also add `updateRecipeLastCookedAt` to the operations import (needed in Task 7).

**Step 6: Update `hasExactTitleMatch` to use `q` (already done via lowerQuery)**

`hasExactTitleMatch` on line 111 uses `lowerQuery` which now reads from `q` — no separate change needed.

**Step 7: Verify TypeScript compiles and app renders**

```bash
pnpm check
pnpm dev
```

Visit `/cooking`. Verify the second row appears with sort dropdown, direction button, expand/collapse button, and search toggle. Verify recipes still render correctly.

**Step 8: Commit**

```bash
git add src/routes/cooking.tsx
git commit -m "feat(cooking): integrate CookingControlBar; sort/search via URL params"
```

---

### Task 7: Update `handleConfirmDone` to record `lastCookedAt`

**Files:**
- Modify: `src/routes/cooking.tsx:284-316`

**Step 1: Add import**

In the import block at the top of `cooking.tsx`, add `updateRecipeLastCookedAt` to the db operations import:

```ts
import { updateRecipeLastCookedAt } from '@/db/operations'
```

**Step 2: Update `handleConfirmDone`**

After the item consumption loop (after `setShowDoneDialog(false)`), but before resetting state, add calls to update `lastCookedAt` for each recipe that had checked items:

```ts
const handleConfirmDone = async () => {
  const now = new Date()

  for (const [itemId, totalAmount] of totalByItemId) {
    const item = items.find((i) => i.id === itemId)
    if (!item) continue

    const updatedItem = { ...item }
    consumeItem(updatedItem, totalAmount)

    await updateItem.mutateAsync({
      id: itemId,
      updates: {
        packedQuantity: updatedItem.packedQuantity,
        unpackedQuantity: updatedItem.unpackedQuantity,
      },
    })

    await addInventoryLog.mutateAsync({
      itemId,
      delta: -totalAmount,
      occurredAt: now,
      note: 'consumed via recipe',
    })
  }

  // Record lastCookedAt for each recipe that had items checked
  const cookedRecipeIds = [...checkedItemIds.entries()]
    .filter(([, itemSet]) => itemSet.size > 0)
    .map(([recipeId]) => recipeId)
  await Promise.all(cookedRecipeIds.map((id) => updateRecipeLastCookedAt(id)))

  // Reset state
  setExpandedRecipeIds(new Set())
  setSessionServings(new Map())
  setSessionAmounts(new Map())
  setCheckedItemIds(new Map())
  setShowDoneDialog(false)
}
```

**Step 3: Verify TypeScript compiles**

```bash
pnpm check
```

**Step 4: Commit**

```bash
git add src/routes/cooking.tsx
git commit -m "feat(cooking): record lastCookedAt on recipes when Done is confirmed"
```

---

### Task 8: Update `cooking.test.tsx` for new behaviors

**Files:**
- Modify: `src/routes/cooking.test.tsx`

**Step 1: Add import for `updateRecipeLastCookedAt`**

```ts
import { createItem, createRecipe, updateRecipeLastCookedAt } from '@/db/operations'
// (updateRecipeLastCookedAt may not be needed in tests — but getRecipe will be)
import { createItem, createRecipe, getRecipe } from '@/db/operations'
```

**Step 2: Update existing search test**

Find any existing test that interacts with the search button in the toolbar. The search button has moved from the main toolbar to `CookingControlBar`. Update the test to click the search toggle in the control bar row (it still has `aria-label="Toggle search"`).

**Step 3: Add sort tests**

Add these tests inside the `'Use (Cooking) Page'` describe block:

```ts
it('user can sort recipes by name (default)', async () => {
  // Given two recipes with non-alphabetical creation order
  await createRecipe({ name: 'Zucchini Soup' })
  await createRecipe({ name: 'Apple Tart' })

  renderPage()

  // Then recipes appear alphabetically by default
  await waitFor(() => {
    const names = screen
      .getAllByRole('button', { name: /zucchini soup|apple tart/i })
      .map((el) => el.textContent)
    expect(names[0]).toMatch(/apple tart/i)
    expect(names[1]).toMatch(/zucchini soup/i)
  })
})

it('user can change sort to item count', async () => {
  // Given two recipes with different item counts
  const item1 = await createItem({ name: 'Egg', targetUnit: 'package', targetQuantity: 10, refillThreshold: 2, packedQuantity: 5, unpackedQuantity: 0, consumeAmount: 1, tagIds: [] })
  const item2 = await createItem({ name: 'Milk', targetUnit: 'package', targetQuantity: 10, refillThreshold: 2, packedQuantity: 5, unpackedQuantity: 0, consumeAmount: 1, tagIds: [] })
  await createRecipe({ name: 'Omelette', items: [{ itemId: item1.id, defaultAmount: 2 }, { itemId: item2.id, defaultAmount: 1 }] })
  await createRecipe({ name: 'Toast', items: [] })

  // When user renders the page and selects sort by item count
  const router = renderPage()

  await waitFor(() => {
    expect(screen.getByText('Omelette')).toBeInTheDocument()
  })

  // Navigate to sort=count
  await router.navigate({ to: '/cooking', search: { sort: 'count', dir: 'desc', q: '' } })

  // Then recipe with more items appears first
  await waitFor(() => {
    const cards = screen.getAllByRole('button').filter(
      (el) => el.textContent === 'Omelette' || el.textContent === 'Toast',
    )
    // Omelette (2 items) should appear before Toast (0 items) in desc order
    expect(cards[0].textContent).toMatch(/omelette/i)
  })
})
```

**Step 4: Add expand/collapse all test**

```ts
it('user can expand all recipes at once', async () => {
  // Given two recipes with items
  const item = await createItem({ name: 'Pasta', targetUnit: 'package', targetQuantity: 10, refillThreshold: 2, packedQuantity: 5, unpackedQuantity: 0, consumeAmount: 1, tagIds: [] })
  await createRecipe({ name: 'Pasta Dinner', items: [{ itemId: item.id, defaultAmount: 1 }] })
  await createRecipe({ name: 'Pasta Salad', items: [{ itemId: item.id, defaultAmount: 0.5 }] })

  renderPage()

  await waitFor(() => {
    expect(screen.getByText('Pasta Dinner')).toBeInTheDocument()
  })

  // When user clicks "Expand all"
  const expandBtn = screen.getByRole('button', { name: /expand all/i })
  await userEvent.click(expandBtn)

  // Then all items are visible and button changes to collapse
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /collapse all/i })).toBeInTheDocument()
    // Item name appears twice (once per recipe)
    expect(screen.getAllByText('Pasta')).toHaveLength(2)
  })
})

it('user can collapse all recipes at once', async () => {
  // Given two expanded recipes
  const item = await createItem({ name: 'Pasta', targetUnit: 'package', targetQuantity: 10, refillThreshold: 2, packedQuantity: 5, unpackedQuantity: 0, consumeAmount: 1, tagIds: [] })
  await createRecipe({ name: 'Pasta Dinner', items: [{ itemId: item.id, defaultAmount: 1 }] })

  renderPage()

  await waitFor(() => {
    expect(screen.getByText('Pasta Dinner')).toBeInTheDocument()
  })

  // First expand all
  await userEvent.click(screen.getByRole('button', { name: /expand all/i }))

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /collapse all/i })).toBeInTheDocument()
  })

  // When user clicks "Collapse all"
  await userEvent.click(screen.getByRole('button', { name: /collapse all/i }))

  // Then items are hidden and button shows expand all again
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /expand all/i })).toBeInTheDocument()
    expect(screen.queryByText('Pasta')).not.toBeInTheDocument()
  })
})
```

**Step 5: Add lastCookedAt test**

```ts
it('user can have lastCookedAt recorded when done cooking', async () => {
  // Given a recipe with an item
  const item = await createItem({ name: 'Egg', targetUnit: 'package', targetQuantity: 10, refillThreshold: 2, packedQuantity: 5, unpackedQuantity: 0, consumeAmount: 1, tagIds: [] })
  const recipe = await createRecipe({ name: 'Omelette', items: [{ itemId: item.id, defaultAmount: 1 }] })

  renderPage()

  await waitFor(() => {
    expect(screen.getByText('Omelette')).toBeInTheDocument()
  })

  // When user checks the recipe checkbox and confirms Done
  const checkbox = screen.getByRole('checkbox', { name: /omelette/i })
  await userEvent.click(checkbox)
  await userEvent.click(screen.getByRole('button', { name: /done/i }))
  await userEvent.click(screen.getByRole('button', { name: /confirm/i }))

  // Then lastCookedAt is set on the recipe
  await waitFor(async () => {
    const updated = await getRecipe(recipe.id)
    expect(updated?.lastCookedAt).toBeDefined()
  })
})
```

**Step 6: Run all tests**

```bash
pnpm test src/routes/cooking.test.tsx --reporter=verbose
```

Expected: all existing tests pass, new tests pass.

**Step 7: Commit**

```bash
git add src/routes/cooking.test.tsx
git commit -m "test(cooking): add sort, expand/collapse, lastCookedAt tests"
```

---

### Task 9: Update `cooking.stories.tsx` for new toolbar layout

**Files:**
- Modify: `src/routes/cooking.stories.tsx`

**Step 1: Update `WithSearch` story**

The `WithSearch` story previously showed the search row. Now search is part of `CookingControlBar` and activated by the `?q` URL param. Update the story to use `?q=pasta` in the initial URL:

```ts
// In WithSearch story, change initialEntries:
history: createMemoryHistory({ initialEntries: ['/cooking?q=pasta'] }),
```

**Step 2: Add new stories for sort and expand/collapse**

Add these stories after the existing ones:

```ts
// Story: Sort by Recent — shows sort dropdown set to "Recent"
function SortByRecentStory() {
  return (
    <CookingStory
      setup={async () => {
        const egg = await createItem({ name: 'Egg', targetUnit: 'package', targetQuantity: 10, refillThreshold: 2, packedQuantity: 5, unpackedQuantity: 0, consumeAmount: 1, tagIds: [] })
        await createRecipe({ name: 'Omelette', items: [{ itemId: egg.id, defaultAmount: 2 }] })
        await createRecipe({ name: 'Pasta', items: [] })
      }}
      initialUrl="/cooking?sort=recent"
    />
  )
}

// Story: Sort by Item Count descending
function SortByCountStory() {
  return (
    <CookingStory
      setup={async () => {
        const egg = await createItem({ name: 'Egg', targetUnit: 'package', targetQuantity: 10, refillThreshold: 2, packedQuantity: 5, unpackedQuantity: 0, consumeAmount: 1, tagIds: [] })
        await createRecipe({ name: 'Omelette', items: [{ itemId: egg.id, defaultAmount: 2 }] })
        await createRecipe({ name: 'Toast', items: [] })
      }}
      initialUrl="/cooking?sort=count&dir=desc"
    />
  )
}

export const SortByRecent: Story = { render: () => <SortByRecentStory /> }
export const SortByCount: Story = { render: () => <SortByCountStory /> }
```

**Note:** The existing `CookingStory` wrapper uses a hardcoded `/cooking` URL. You'll need to add an optional `initialUrl` prop to `CookingStory`:

```ts
function CookingStory({ setup, initialUrl = '/cooking' }: { setup: () => Promise<void>; initialUrl?: string }) {
  // ...
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
    context: { queryClient },
  })
  // ...
}
```

**Step 3: Run Storybook to verify visually**

```bash
pnpm storybook
```

Check `Routes/Cooking` stories. Verify:
- `Default` shows the new control bar row (sort dropdown, direction, expand/collapse, search toggle)
- `WithSearch` shows the search input row open with "pasta" in the input
- `SortByRecent` shows "Recent" selected in the dropdown

**Step 4: Commit**

```bash
git add src/routes/cooking.stories.tsx
git commit -m "feat(cooking): update stories for new CookingControlBar toolbar row"
```

---

### Task 10: Final verification

**Step 1: Run all tests**

```bash
pnpm test
```

Expected: all pass.

**Step 2: Run type check and lint**

```bash
pnpm check
```

Expected: no errors.

**Step 3: Run Storybook**

```bash
pnpm storybook
```

Verify cooking stories visually correct.

**Step 4: Manual smoke test in dev**

```bash
pnpm dev
```

- Visit `/cooking` — second row visible with sort dropdown (Name), direction (↑), expand/collapse (ChevronsUpDown), search toggle
- Click sort dropdown → change to "Recent" → URL shows `?sort=recent`
- Click direction button → URL shows `?dir=desc`
- Add a recipe with items, check it, press Done → verify `lastCookedAt` is set (sort by Recent moves it to top)
- Click expand all → all recipes expand; button changes to collapse all
- Click search toggle → search row appears; type query → URL shows `?q=<query>`; press Escape → query clears, row stays open

**Step 5: Final commit if any cleanup needed**

```bash
git add -p  # stage any remaining changes selectively
git commit -m "chore(cooking): final cleanup and verification"
```
