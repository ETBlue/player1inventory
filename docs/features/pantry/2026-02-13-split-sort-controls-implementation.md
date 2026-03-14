# Split Sort Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Split the combined sort dropdown into two separate buttons - one for criteria selection (dropdown), one for direction toggle (icon button).

**Architecture:** Replace single DropdownMenu component with two adjacent buttons wrapped in flex container with reduced gap. Criteria button opens dropdown menu (text-based), direction button directly toggles asc/desc (icon-based). Both call same `onSortChange` callback with different parameters.

**Tech Stack:** React 19, TypeScript, lucide-react (ArrowUp/ArrowDown icons), shadcn/ui (Button, DropdownMenu), Vitest, React Testing Library, Storybook

---

## Task 1: Update PantryToolbar Component

**Files:**
- Modify: `src/components/PantryToolbar.tsx:1-120`
- Test: `src/components/PantryToolbar.test.tsx`

**Step 1: Write failing tests for split controls**

Add to `src/components/PantryToolbar.test.tsx`:

```typescript
it('renders five control buttons', async () => {
  await renderWithRouter(<PantryToolbar {...defaultProps} />)
  expect(screen.getByRole('button', { name: /filter/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /tags/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /sort by criteria/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /toggle sort direction/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /add item/i })).toBeInTheDocument()
})

it('displays current sort criteria as text', async () => {
  await renderWithRouter(
    <PantryToolbar {...defaultProps} sortBy="name" />,
  )
  expect(screen.getByRole('button', { name: /sort by criteria/i })).toHaveTextContent('Name')
})

it('displays ArrowUp icon when direction is asc', async () => {
  await renderWithRouter(
    <PantryToolbar {...defaultProps} sortDirection="asc" />,
  )
  const directionBtn = screen.getByRole('button', { name: /toggle sort direction/i })
  expect(directionBtn.querySelector('svg')).toBeInTheDocument()
  // ArrowUp icon has specific class or data attribute
})

it('displays ArrowDown icon when direction is desc', async () => {
  await renderWithRouter(
    <PantryToolbar {...defaultProps} sortDirection="desc" />,
  )
  const directionBtn = screen.getByRole('button', { name: /toggle sort direction/i })
  expect(directionBtn.querySelector('svg')).toBeInTheDocument()
})

it('calls onSortChange preserving direction when criteria changed', async () => {
  const user = userEvent.setup()
  const onSortChange = vi.fn()
  await renderWithRouter(
    <PantryToolbar {...defaultProps} sortDirection="desc" onSortChange={onSortChange} />,
  )

  await user.click(screen.getByRole('button', { name: /sort by criteria/i }))
  await user.click(screen.getByRole('menuitem', { name: /name/i }))

  expect(onSortChange).toHaveBeenCalledWith('name', 'desc')
})

it('calls onSortChange preserving criteria when direction toggled', async () => {
  const user = userEvent.setup()
  const onSortChange = vi.fn()
  await renderWithRouter(
    <PantryToolbar {...defaultProps} sortBy="quantity" sortDirection="asc" onSortChange={onSortChange} />,
  )

  await user.click(screen.getByRole('button', { name: /toggle sort direction/i }))

  expect(onSortChange).toHaveBeenCalledWith('quantity', 'desc')
})
```

Remove old test:

```typescript
// DELETE this test - no longer valid
it('displays current sort criteria with direction', async () => {
  await renderWithRouter(
    <PantryToolbar {...defaultProps} sortBy="name" sortDirection="desc" />,
  )
  expect(screen.getByText(/name.*↓/i)).toBeInTheDocument()
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test PantryToolbar.test.tsx --run`

Expected: FAIL - buttons not found, callbacks not working as expected

**Step 3: Update PantryToolbar component**

Modify `src/components/PantryToolbar.tsx`:

```typescript
import { Link } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, Filter, Plus, Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SortDirection, SortField } from '@/lib/sessionStorage'

interface PantryToolbarProps {
  filtersVisible: boolean
  tagsVisible: boolean
  sortBy: SortField
  sortDirection: SortDirection
  onToggleFilters: () => void
  onToggleTags: () => void
  onSortChange: (field: SortField, direction: SortDirection) => void
}

const sortLabels: Record<SortField, string> = {
  expiring: 'Expiring',
  name: 'Name',
  quantity: 'Quantity',
  status: 'Status',
  updatedAt: 'Updated',
}

export function PantryToolbar({
  filtersVisible,
  tagsVisible,
  sortBy,
  sortDirection,
  onToggleFilters,
  onToggleTags,
  onSortChange,
}: PantryToolbarProps) {
  const handleCriteriaChange = (field: SortField) => {
    onSortChange(field, sortDirection)
  }

  const handleDirectionToggle = () => {
    onSortChange(sortBy, sortDirection === 'asc' ? 'desc' : 'asc')
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-accessory-default bg-background-surface">
      <Button
        size="icon"
        variant={filtersVisible ? 'neutral' : 'neutral-ghost'}
        onClick={onToggleFilters}
        aria-label="Toggle filters"
      >
        <Filter />
      </Button>

      <Button
        size="icon"
        variant={tagsVisible ? 'neutral' : 'neutral-ghost'}
        onClick={onToggleTags}
        aria-label="Toggle tags"
      >
        <Tags />
      </Button>

      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="default" variant="neutral-ghost" aria-label="Sort by criteria">
              {sortLabels[sortBy]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              className={sortBy === 'expiring' ? 'bg-background-base' : ''}
              onClick={() => handleCriteriaChange('expiring')}
            >
              Expiring soon
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sortBy === 'name' ? 'bg-background-base' : ''}
              onClick={() => handleCriteriaChange('name')}
            >
              Name
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sortBy === 'quantity' ? 'bg-background-base' : ''}
              onClick={() => handleCriteriaChange('quantity')}
            >
              Quantity
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sortBy === 'status' ? 'bg-background-base' : ''}
              onClick={() => handleCriteriaChange('status')}
            >
              Status
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sortBy === 'updatedAt' ? 'bg-background-base' : ''}
              onClick={() => handleCriteriaChange('updatedAt')}
            >
              Last updated
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="icon"
          variant="neutral-ghost"
          onClick={handleDirectionToggle}
          aria-label="Toggle sort direction"
        >
          {sortDirection === 'asc' ? <ArrowUp /> : <ArrowDown />}
        </Button>
      </div>

      <span className="flex-1" />

      <Link to="/items/new">
        <Button>
          <Plus />
          Add item
        </Button>
      </Link>
    </div>
  )
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test PantryToolbar.test.tsx --run`

Expected: PASS - all new tests passing

**Step 5: Update old tests that are now invalid**

Update these tests in `src/components/PantryToolbar.test.tsx`:

```typescript
// UPDATE: Change from 3 to 5 buttons
it('renders five control buttons', async () => {
  // Already updated in step 1
})

// UPDATE: Remove this test about combined display
// DELETE:
// it('displays current sort criteria with direction', ...)

// UPDATE: This test needs to find criteria dropdown, not combined button
it('calls onSortChange with new field when different sort selected', async () => {
  const user = userEvent.setup()
  const onSortChange = vi.fn()
  await renderWithRouter(
    <PantryToolbar {...defaultProps} onSortChange={onSortChange} />,
  )

  await user.click(screen.getByRole('button', { name: /sort by criteria/i }))
  await user.click(screen.getByRole('menuitem', { name: /^name$/i }))

  expect(onSortChange).toHaveBeenCalledWith('name', 'asc')
})

// DELETE: This test is no longer valid - direction toggle is separate
// it('toggles direction when same sort field clicked', ...)
```

**Step 6: Run all tests**

Run: `pnpm test PantryToolbar.test.tsx --run`

Expected: PASS - all tests passing

**Step 7: Commit**

```bash
git add src/components/PantryToolbar.tsx src/components/PantryToolbar.test.tsx
git commit -m "refactor(toolbar): split sort controls into criteria and direction buttons

- Replace combined dropdown with two adjacent buttons
- Criteria button opens dropdown menu (text labels only)
- Direction button toggles asc/desc with ArrowUp/ArrowDown icons
- Preserve current direction when changing criteria
- Preserve current criteria when toggling direction
- Update tests for new button structure

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Update Integration Tests

**Files:**
- Modify: `src/routes/index.test.tsx:280-350`

**Step 1: Update failing integration tests**

Modify `src/routes/index.test.tsx`:

Find and update:

```typescript
it('user can sort items by name', async () => {
  const user = userEvent.setup()

  await createItem({ name: 'Tomatoes', targetQuantity: 4, refillThreshold: 1 })
  await createItem({ name: 'Apples', targetQuantity: 10, refillThreshold: 3 })
  await createItem({ name: 'Pasta', targetQuantity: 5, refillThreshold: 2 })

  renderApp()

  // Enable filters so we can see items
  await user.click(screen.getByRole('button', { name: /filter/i }))

  await waitFor(() => {
    expect(screen.getByText('Tomatoes')).toBeInTheDocument()
  })

  // Open sort menu - NOW using criteria button
  await user.click(screen.getByRole('button', { name: /sort by criteria/i }))

  // Select Name - no direction arrow in item text
  await user.click(screen.getByRole('menuitem', { name: /^name$/i }))

  // Items now alphabetical
  await waitFor(() => {
    const items = screen.getAllByRole('heading', { level: 3 })
    expect(items[0]).toHaveTextContent('Apples')
    expect(items[1]).toHaveTextContent('Pasta')
    expect(items[2]).toHaveTextContent('Tomatoes')
  })
})

it('user can toggle sort direction', async () => {
  const user = userEvent.setup()

  await createItem({ name: 'Apples', targetQuantity: 10, refillThreshold: 3 })
  await createItem({
    name: 'Zucchini',
    targetQuantity: 5,
    refillThreshold: 2,
  })

  renderApp()

  await waitFor(() => {
    expect(screen.getByText('Apples')).toBeInTheDocument()
  })

  // Sort by name ascending - use criteria button
  await user.click(screen.getByRole('button', { name: /sort by criteria/i }))
  await user.click(screen.getByRole('menuitem', { name: /^name$/i }))

  await waitFor(() => {
    const items = screen.getAllByRole('heading', { level: 3 })
    expect(items[0]).toHaveTextContent('Apples')
  })

  // Toggle direction - NOW using direction button
  await user.click(screen.getByRole('button', { name: /toggle sort direction/i }))

  // Now descending
  await waitFor(() => {
    const items = screen.getAllByRole('heading', { level: 3 })
    expect(items[0]).toHaveTextContent('Zucchini')
  })
})
```

**Step 2: Run integration tests**

Run: `pnpm test index.test.tsx --run`

Expected: PASS - integration tests working with new button structure

**Step 3: Commit**

```bash
git add src/routes/index.test.tsx
git commit -m "test(pantry): update integration tests for split sort controls

- Use 'sort by criteria' button for criteria selection
- Use 'toggle sort direction' button for direction toggle
- Remove direction arrows from menuitem assertions

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Update Storybook Stories

**Files:**
- Modify: `src/components/PantryToolbar.stories.tsx`

**Step 1: Update existing stories**

Modify `src/components/PantryToolbar.stories.tsx`:

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { PantryToolbar } from './PantryToolbar'

const meta = {
  title: 'Components/PantryToolbar',
  component: PantryToolbar,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    filtersVisible: false,
    tagsVisible: false,
    sortBy: 'expiring',
    sortDirection: 'asc',
    onToggleFilters: () => {},
    onToggleTags: () => {},
    onSortChange: () => {},
  },
} satisfies Meta<typeof PantryToolbar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const FiltersVisible: Story = {
  args: {
    filtersVisible: true,
  },
}

export const TagsVisible: Story = {
  args: {
    tagsVisible: true,
  },
}

export const BothVisible: Story = {
  args: {
    filtersVisible: true,
    tagsVisible: true,
  },
}

export const SortByName: Story = {
  args: {
    sortBy: 'name',
  },
}

export const SortByQuantity: Story = {
  args: {
    sortBy: 'quantity',
  },
}

// NEW: Show descending direction
export const DescendingDirection: Story = {
  args: {
    sortBy: 'name',
    sortDirection: 'desc',
  },
}

// NEW: Show different combinations
export const QuantityDescending: Story = {
  args: {
    sortBy: 'quantity',
    sortDirection: 'desc',
  },
}
```

**Step 2: Build Storybook to verify**

Run: `pnpm storybook`

Expected: Storybook builds successfully, stories render correctly showing split buttons

**Step 3: Commit**

```bash
git add src/components/PantryToolbar.stories.tsx
git commit -m "docs(toolbar): update stories for split sort controls

- Add DescendingDirection story showing ArrowDown icon
- Add QuantityDescending story showing different criteria
- All existing stories now show split button design

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Final Verification

**Files:**
- All modified files

**Step 1: Run all tests**

Run: `pnpm test --run`

Expected: PASS - all 111 tests passing

**Step 2: Run type check**

Run: `pnpm tsc --noEmit`

Expected: No TypeScript errors

**Step 3: Run linter**

Run: `pnpm lint`

Expected: No linting errors

**Step 4: Build Storybook**

Run: `pnpm build-storybook`

Expected: Storybook builds successfully

**Step 5: Visual verification**

Run: `pnpm dev`

Expected:
- Open http://localhost:5173
- Verify toolbar shows Filter, Tags, "Expiring", ArrowUp, Add item buttons
- Click criteria button → dropdown shows 5 options
- Click direction button → icon toggles ArrowUp ↔ ArrowDown
- Items resort correctly

**Step 6: Final commit if any fixes needed**

If any fixes were needed during verification:

```bash
git add .
git commit -m "fix(toolbar): address issues found in final verification

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Summary

**Total Tasks:** 4

**Files Modified:**
- `src/components/PantryToolbar.tsx` - Split sort control implementation
- `src/components/PantryToolbar.test.tsx` - Updated unit tests
- `src/routes/index.test.tsx` - Updated integration tests
- `src/components/PantryToolbar.stories.tsx` - Updated Storybook stories

**Files Created:**
- None

**Key Changes:**
- Combined sort dropdown → Criteria dropdown + Direction toggle
- Removed direction arrows from dropdown items
- Independent controls for criteria and direction
- Visual grouping with reduced gap-1
