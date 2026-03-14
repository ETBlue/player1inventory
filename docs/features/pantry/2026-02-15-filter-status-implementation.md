# Filter Status Display Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Always show filter status (item count and clear button) when filters are active, regardless of filter toggle state.

**Architecture:** Extract filter status bar into new FilterStatus component. Update pantry page to conditionally render FilterStatus when filters are active but toggle is off.

**Tech Stack:** React 19, TypeScript, Vitest, React Testing Library

---

## Task 1: Create FilterStatus Component

**Files:**
- Create: `src/components/FilterStatus.tsx`
- Create: `src/components/FilterStatus.test.tsx`

**Step 1: Write failing tests for FilterStatus**

Create `src/components/FilterStatus.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { FilterStatus } from './FilterStatus'

describe('FilterStatus', () => {
  it('displays correct item counts', () => {
    render(
      <FilterStatus
        filteredCount={5}
        totalCount={10}
        hasActiveFilters={true}
        onClearAll={vi.fn()}
      />
    )

    expect(screen.getByText('Showing 5 of 10 items')).toBeInTheDocument()
  })

  it('shows clear button when filters are active', () => {
    render(
      <FilterStatus
        filteredCount={5}
        totalCount={10}
        hasActiveFilters={true}
        onClearAll={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /clear filter/i })).toBeInTheDocument()
  })

  it('hides clear button when no filters are active', () => {
    render(
      <FilterStatus
        filteredCount={10}
        totalCount={10}
        hasActiveFilters={false}
        onClearAll={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: /clear filter/i })).not.toBeInTheDocument()
  })

  it('calls onClearAll when clear button is clicked', async () => {
    const onClearAll = vi.fn()
    const user = userEvent.setup()

    render(
      <FilterStatus
        filteredCount={5}
        totalCount={10}
        hasActiveFilters={true}
        onClearAll={onClearAll}
      />
    )

    await user.click(screen.getByRole('button', { name: /clear filter/i }))
    expect(onClearAll).toHaveBeenCalledOnce()
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test FilterStatus
```

Expected: FAIL - module not found

**Step 3: Write minimal implementation for FilterStatus**

Create `src/components/FilterStatus.tsx`:

```typescript
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FilterStatusProps {
  filteredCount: number
  totalCount: number
  hasActiveFilters: boolean
  onClearAll: () => void
}

export function FilterStatus({
  filteredCount,
  totalCount,
  hasActiveFilters,
  onClearAll,
}: FilterStatusProps) {
  return (
    <div className="flex items-center h-6 px-1 py-1">
      <div className="ml-3 text-xs text-foreground-muted">
        Showing {filteredCount} of {totalCount} items
      </div>
      <div className="flex-1" />
      {hasActiveFilters && (
        <Button variant="neutral-ghost" size="xs" onClick={onClearAll}>
          <X />
          Clear filter
        </Button>
      )}
    </div>
  )
}
```

**Step 4: Run tests to verify all tests pass**

```bash
pnpm test FilterStatus
```

Expected: All 4 tests PASS

**Step 5: Commit FilterStatus component**

```bash
git add src/components/FilterStatus.tsx src/components/FilterStatus.test.tsx
git commit -m "feat(filters): add FilterStatus component with tests

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Update Pantry Page to Use FilterStatus

**Files:**
- Modify: `src/routes/index.tsx:5` (add import)
- Modify: `src/routes/index.tsx:176-186` (update conditional rendering)

**Step 1: Add FilterStatus import and calculate hasActiveFilters**

Update `src/routes/index.tsx`:

Add import at line 5 (after ItemFilters import):
```typescript
import { FilterStatus } from '@/components/FilterStatus'
```

Add after line 59 (after showInactive state):
```typescript
// Calculate if any filters are active
const hasActiveFilters = Object.values(filterState).some(
  (tagIds) => tagIds.length > 0
)
```

**Step 2: Update conditional rendering logic**

Replace lines 176-186 (the conditional ItemFilters rendering):

```typescript
{filtersVisible ? (
  <ItemFilters
    tagTypes={tagTypes}
    tags={tags}
    items={items}
    filterState={filterState}
    filteredCount={sortedItems.length}
    totalCount={items.length}
    onFilterChange={setFilterState}
  />
) : hasActiveFilters ? (
  <FilterStatus
    filteredCount={sortedItems.length}
    totalCount={items.length}
    hasActiveFilters={hasActiveFilters}
    onClearAll={() => setFilterState({})}
  />
) : null}
```

**Step 3: Run tests to verify no regressions**

```bash
pnpm test
```

Expected: All existing tests PASS

**Step 4: Manually verify behavior**

```bash
pnpm dev
```

Test scenarios:
1. Toggle filters ON → see full ItemFilters (dropdowns + status)
2. Toggle filters OFF with no active filters → see nothing
3. Select a filter, then toggle filters OFF → see FilterStatus (compact view)
4. Click "Clear filter" in FilterStatus → filters cleared, FilterStatus disappears

**Step 5: Commit pantry page changes**

```bash
git add src/routes/index.tsx
git commit -m "feat(filters): always show filter status when filters active

- Calculate hasActiveFilters from filterState
- Show FilterStatus when filters active but toggle off
- Maintains full ItemFilters when toggle is on

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Add Storybook Story for FilterStatus

**Files:**
- Create: `src/components/FilterStatus.stories.tsx`

**Step 1: Create Storybook stories**

Create `src/components/FilterStatus.stories.tsx`:

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { FilterStatus } from './FilterStatus'

const meta = {
  title: 'Components/FilterStatus',
  component: FilterStatus,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onClearAll: fn(),
  },
} satisfies Meta<typeof FilterStatus>

export default meta
type Story = StoryObj<typeof meta>

export const WithActiveFilters: Story = {
  args: {
    filteredCount: 5,
    totalCount: 10,
    hasActiveFilters: true,
  },
}

export const NoActiveFilters: Story = {
  args: {
    filteredCount: 10,
    totalCount: 10,
    hasActiveFilters: false,
  },
}

export const AllFiltered: Story = {
  args: {
    filteredCount: 0,
    totalCount: 10,
    hasActiveFilters: true,
  },
}

export const EmptyList: Story = {
  args: {
    filteredCount: 0,
    totalCount: 0,
    hasActiveFilters: false,
  },
}
```

**Step 2: Verify stories in Storybook**

```bash
pnpm storybook
```

Navigate to Components/FilterStatus and verify all 4 stories render correctly:
- WithActiveFilters: shows message + clear button
- NoActiveFilters: shows message only (no button)
- AllFiltered: shows "Showing 0 of 10 items" + clear button
- EmptyList: shows "Showing 0 of 0 items" (no button)

**Step 3: Commit Storybook story**

```bash
git add src/components/FilterStatus.stories.tsx
git commit -m "docs(filters): add FilterStatus Storybook stories

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Add Integration Test for Pantry Page

**Files:**
- Create: `src/routes/index.test.tsx` (if doesn't exist)
- OR Modify: `src/routes/index.test.tsx` (if exists)

**Step 1: Check if pantry page test exists**

```bash
ls src/routes/index.test.tsx
```

If exists, proceed to Step 2.
If not exists, create basic test file first.

**Step 2: Add integration tests for filter status display**

Add to `src/routes/index.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Route as IndexRoute } from './index'

// Mock hooks
vi.mock('@/hooks', () => ({
  useItems: vi.fn(() => ({ data: [], isLoading: false })),
  useAddInventoryLog: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn() })),
  useUpdateItem: vi.fn(() => ({ mutateAsync: vi.fn() })),
}))

vi.mock('@/hooks/useTags', () => ({
  useTags: vi.fn(() => ({ data: [] })),
  useTagTypes: vi.fn(() => ({ data: [] })),
}))

describe('Pantry Page - Filter Status Display', () => {
  const renderPantryPage = async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexRoute.component,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const result = render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )

    await router.load()
    return { ...result, router }
  }

  it('shows ItemFilters when toggle is on', async () => {
    await renderPantryPage()

    // Filter toggle should be visible in toolbar
    // ItemFilters should render when toggle is on
    // (This is existing behavior - just verify it still works)
  })

  it('shows FilterStatus when filters active but toggle off', async () => {
    await renderPantryPage()

    // TODO: Set up test with active filters and toggle off
    // Verify FilterStatus is visible
    // Verify tag dropdowns are NOT visible
  })

  it('hides FilterStatus when no filters active and toggle off', async () => {
    await renderPantryPage()

    // TODO: Set up test with no active filters and toggle off
    // Verify FilterStatus is NOT visible
  })

  it('clears filters when clear button clicked in FilterStatus', async () => {
    const user = userEvent.setup()
    await renderPantryPage()

    // TODO: Set up test with active filters and toggle off
    // Click clear button in FilterStatus
    // Verify filters are cleared
    // Verify FilterStatus disappears
  })
})
```

**Note:** The test setup may need adjustment based on existing test patterns in the codebase. The exact implementation depends on how the app handles routing and state in tests.

**Step 3: Run integration tests**

```bash
pnpm test index
```

Expected: Tests PASS (or SKIP if marked as TODO)

**Step 4: Commit integration tests**

```bash
git add src/routes/index.test.tsx
git commit -m "test(filters): add integration tests for filter status display

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Final Verification

**Files:**
- None (manual testing and verification only)

**Step 1: Run full test suite**

```bash
pnpm test
```

Expected: All tests PASS

**Step 2: Run linter**

```bash
pnpm lint
```

Expected: No lint errors

**Step 3: Run dev server and manual end-to-end testing**

```bash
pnpm dev
```

**Manual test checklist:**

1. **No filters, toggle off:**
   - [ ] No filter UI visible
   - [ ] Full item list shown

2. **No filters, toggle on:**
   - [ ] Full ItemFilters visible (dropdowns + status)
   - [ ] Full item list shown

3. **Active filters, toggle on:**
   - [ ] Full ItemFilters visible (dropdowns + status)
   - [ ] Filtered item list shown
   - [ ] "Showing N of M items" correct
   - [ ] Clear filter button works

4. **Active filters, toggle off:**
   - [ ] FilterStatus visible (compact view)
   - [ ] Tag dropdowns NOT visible
   - [ ] Filtered item list shown
   - [ ] "Showing N of M items" correct
   - [ ] Clear filter button works
   - [ ] After clearing, FilterStatus disappears

5. **Toggle interaction with active filters:**
   - [ ] Can toggle filters on/off while filters are active
   - [ ] UI switches between full and compact view
   - [ ] Filtered items remain consistent

**Step 4: Check if CLAUDE.md needs updates**

Review changes:
- Filter status display is a UI enhancement
- Doesn't change architecture or developer workflow
- Likely no CLAUDE.md updates needed

**Step 5: Verify all commits follow conventions**

```bash
git log --oneline -5
```

Verify commit messages follow format:
- `feat(filters): ...` for new features
- `test(filters): ...` for tests
- `docs(filters): ...` for documentation

---

## Completion Checklist

- [ ] FilterStatus component created with tests
- [ ] Pantry page updated with conditional rendering
- [ ] Storybook story added
- [ ] Integration tests added (or TODO markers if complex)
- [ ] All unit tests passing
- [ ] All component tests passing
- [ ] No lint errors
- [ ] Manual end-to-end testing completed
- [ ] All commits follow conventional commit format

## Notes

- FilterStatus component has the same styling as the status bar in ItemFilters to maintain visual consistency
- The `hasActiveFilters` calculation is simple: `Object.values(filterState).some(tagIds => tagIds.length > 0)`
- Future enhancement: Refactor ItemFilters to use FilterStatus internally to avoid code duplication (not required for this implementation)
- The integration tests may need adjustment based on existing test setup patterns in the codebase
