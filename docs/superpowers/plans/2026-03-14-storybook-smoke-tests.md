# Storybook Smoke Tests Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `.stories.test.tsx` smoke tests for all 46 Storybook story files so that story regressions are caught in CI without manual review.

**Architecture:** One co-located `.stories.test.tsx` file per `.stories.tsx` file. Each exported story gets a test using `composeStories()` from `@storybook/react`, which applies all story decorators automatically. Tests use the most specific visible assertion (text, role, or container check for async).

**Tech Stack:** Vitest, React Testing Library, `@storybook/react` (`composeStories`), `@testing-library/jest-dom`

**Spec:** `docs/superpowers/specs/2026-03-14-storybook-smoke-tests-design.md`

**Working directory for all commands:** `apps/web`

---

## Assertion tier reference

- **Tier 1 (synchronous):** `render(<Story />)` + `expect(screen.getByText('...')).toBeInTheDocument()`
- **Tier 2 (async/router):** `const { container } = render(<Story />)` + `await waitFor(() => expect(container.firstChild).not.toBeNull())`
- **Tier 3 (Dexie/page routes):** `render(<Story />)` + `expect(screen.getByText('Loading...')).toBeInTheDocument()`

---

## Chunk 1: cooking update + shared components

### Task 1: Update `cooking.stories.test.tsx` (3 missing stories)

**Files:**
- Modify: `src/routes/cooking.stories.test.tsx`

The existing file covers 5 of 8 stories. Add the 3 missing ones. All cooking stories use Tier 3 (Dexie seeding via `useEffect` → renders "Loading..." immediately).

- [ ] **Step 1: Add the 3 missing tests**

Open `src/routes/cooking.stories.test.tsx`. The `composeStories` destructure at the top needs to include the 3 new story names. Add `WithCheckedRecipe`, `WithExpandedRecipe`, `WithActiveToolbar` to the destructure, then add 3 test cases following the existing pattern.

The file currently reads something like:
```tsx
const { Default, WithRecipes, WithSearch, SortByRecent, SortByCount } = composeStories(stories)
```

Change it to:
```tsx
const {
  Default,
  WithRecipes,
  WithCheckedRecipe,
  WithExpandedRecipe,
  WithActiveToolbar,
  WithSearch,
  SortByRecent,
  SortByCount,
} = composeStories(stories)
```

Add at the end of the existing describe block:
```tsx
it('WithCheckedRecipe renders without error', () => {
  render(<WithCheckedRecipe />)
  expect(screen.getByText('Loading...')).toBeInTheDocument()
})

it('WithExpandedRecipe renders without error', () => {
  render(<WithExpandedRecipe />)
  expect(screen.getByText('Loading...')).toBeInTheDocument()
})

it('WithActiveToolbar renders without error', () => {
  render(<WithActiveToolbar />)
  expect(screen.getByText('Loading...')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests**

```bash
pnpm test --run src/routes/cooking.stories.test.tsx
```

Expected: 8 tests pass (5 existing + 3 new).

- [ ] **Step 3: Commit**

```bash
git add src/routes/cooking.stories.test.tsx
git commit -m "test(cooking): add missing 3 story smoke tests"
```

---

### Task 2: `AddNameDialog.stories.test.tsx`

**Files:**
- Create: `src/components/AddNameDialog/AddNameDialog.stories.test.tsx`

Stories: `AddTag`, `AddVendor`, `AddRecipe`. Each renders a trigger button (dialog closed by default). Assert on the trigger button text. Tier 1.

- [ ] **Step 1: Create the test file**

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './AddNameDialog.stories'

const { AddTag, AddVendor, AddRecipe } = composeStories(stories)

describe('AddNameDialog stories smoke tests', () => {
  it('AddTag renders without error', () => {
    render(<AddTag />)
    expect(screen.getByRole('button', { name: 'Add Tag' })).toBeInTheDocument()
  })

  it('AddVendor renders without error', () => {
    render(<AddVendor />)
    expect(screen.getByRole('button', { name: 'New Vendor' })).toBeInTheDocument()
  })

  it('AddRecipe renders without error', () => {
    render(<AddRecipe />)
    expect(screen.getByRole('button', { name: 'New Recipe' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests**

```bash
pnpm test --run src/components/AddNameDialog/AddNameDialog.stories.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/AddNameDialog/AddNameDialog.stories.test.tsx
git commit -m "test(AddNameDialog): add story smoke tests"
```

---

### Task 3: `DeleteButton.stories.test.tsx`

**Files:**
- Create: `src/components/DeleteButton/DeleteButton.stories.test.tsx`

Stories: `TextButton`, `WithImpact`, `NoImpact`, `IconButton`, `TrashIcon`, `AsyncDelete`, `WithAriaLabel`.

- `TextButton`, `WithImpact`, `NoImpact`: trigger text is `'Delete'` → `getByRole('button', { name: 'Delete' })`
- `IconButton`, `TrashIcon`: trigger is icon-only (no text, no aria-label) → `getByRole('button')` (at least one button exists)
- `AsyncDelete`: trigger text is `'Delete (Async)'`
- `WithAriaLabel`: button has `aria-label="Delete Costco"`

Tier 1 (no providers needed).

- [ ] **Step 1: Create the test file**

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './DeleteButton.stories'

const {
  TextButton,
  WithImpact,
  NoImpact,
  IconButton,
  TrashIcon,
  AsyncDelete,
  WithAriaLabel,
} = composeStories(stories)

describe('DeleteButton stories smoke tests', () => {
  it('TextButton renders without error', () => {
    render(<TextButton />)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('WithImpact renders without error', () => {
    render(<WithImpact />)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('NoImpact renders without error', () => {
    render(<NoImpact />)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('IconButton renders without error', () => {
    const { container } = render(<IconButton />)
    expect(container.firstChild).not.toBeNull()
  })

  it('TrashIcon renders without error', () => {
    const { container } = render(<TrashIcon />)
    expect(container.firstChild).not.toBeNull()
  })

  it('AsyncDelete renders without error', () => {
    render(<AsyncDelete />)
    expect(screen.getByRole('button', { name: 'Delete (Async)' })).toBeInTheDocument()
  })

  it('WithAriaLabel renders without error', () => {
    render(<WithAriaLabel />)
    expect(screen.getByRole('button', { name: 'Delete Costco' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests**

```bash
pnpm test --run src/components/DeleteButton/DeleteButton.stories.test.tsx
```

Expected: 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/DeleteButton/DeleteButton.stories.test.tsx
git commit -m "test(DeleteButton): add story smoke tests"
```

---

### Task 4: `FilterStatus.stories.test.tsx`

**Files:**
- Create: `src/components/FilterStatus/FilterStatus.stories.test.tsx`

Component renders `"Showing {filteredCount} of {totalCount} items"` (hardcoded English). Tier 1.

- [ ] **Step 1: Create the test file**

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './FilterStatus.stories'

const {
  WithActiveFilters,
  NoActiveFilters,
  AllFiltered,
  EmptyList,
  DisabledWithActiveFilters,
  DisabledNoActiveFilters,
} = composeStories(stories)

describe('FilterStatus stories smoke tests', () => {
  it('WithActiveFilters renders without error', () => {
    render(<WithActiveFilters />)
    expect(screen.getByText('Showing 5 of 10 items')).toBeInTheDocument()
  })

  it('NoActiveFilters renders without error', () => {
    render(<NoActiveFilters />)
    expect(screen.getByText('Showing 10 of 10 items')).toBeInTheDocument()
  })

  it('AllFiltered renders without error', () => {
    render(<AllFiltered />)
    expect(screen.getByText('Showing 0 of 10 items')).toBeInTheDocument()
  })

  it('EmptyList renders without error', () => {
    render(<EmptyList />)
    expect(screen.getByText('Showing 0 of 0 items')).toBeInTheDocument()
  })

  it('DisabledWithActiveFilters renders without error', () => {
    render(<DisabledWithActiveFilters />)
    expect(screen.getByText('Showing 5 of 10 items')).toBeInTheDocument()
  })

  it('DisabledNoActiveFilters renders without error', () => {
    render(<DisabledNoActiveFilters />)
    expect(screen.getByText('Showing 10 of 10 items')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests**

```bash
pnpm test --run src/components/FilterStatus/FilterStatus.stories.test.tsx
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/FilterStatus/FilterStatus.stories.test.tsx
git commit -m "test(FilterStatus): add story smoke tests"
```

---

### Task 5: `Toolbar.stories.test.tsx`

**Files:**
- Create: `src/components/Toolbar/Toolbar.stories.test.tsx`

Stories: `Default` (renders "Add item" text), `WithJustifyBetween` (renders "Page Title" text). Tier 1.

- [ ] **Step 1: Create the test file**

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './Toolbar.stories'

const { Default, WithJustifyBetween } = composeStories(stories)

describe('Toolbar stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Add item')).toBeInTheDocument()
  })

  it('WithJustifyBetween renders without error', () => {
    render(<WithJustifyBetween />)
    expect(screen.getByText('Page Title')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests**

```bash
pnpm test --run src/components/Toolbar/Toolbar.stories.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/Toolbar/Toolbar.stories.test.tsx
git commit -m "test(Toolbar): add story smoke tests"
```

---

## Chunk 2: UI primitives

### Task 6: `button.stories.test.tsx`, `badge.stories.test.tsx`, `card.stories.test.tsx`

**Files:**
- Create: `src/components/ui/button.stories.test.tsx`
- Create: `src/components/ui/badge.stories.test.tsx`
- Create: `src/components/ui/card.stories.test.tsx`

All Tier 1 (no providers).

- [ ] **Step 1: Create `button.stories.test.tsx`**

Stories: `Default` (button text "Button"), `Variants` (heading "Semantic Variants"), `Sizes` (button text "XSmall"), `Disabled` (button text "Disabled").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './button.stories'

const { Default, Variants, Sizes, Disabled } = composeStories(stories)

describe('Button stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByRole('button', { name: 'Button' })).toBeInTheDocument()
  })

  it('Variants renders without error', () => {
    render(<Variants />)
    expect(screen.getByText('Semantic Variants')).toBeInTheDocument()
  })

  it('Sizes renders without error', () => {
    render(<Sizes />)
    expect(screen.getByRole('button', { name: 'XSmall' })).toBeInTheDocument()
  })

  it('Disabled renders without error', () => {
    render(<Disabled />)
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Create `badge.stories.test.tsx`**

Stories: `Default` (text "Badge"), `Variants` (text "red").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './badge.stories'

const { Default, Variants } = composeStories(stories)

describe('Badge stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Badge')).toBeInTheDocument()
  })

  it('Variants renders without error', () => {
    render(<Variants />)
    expect(screen.getAllByText('red').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Create `card.stories.test.tsx`**

Stories: `Default` (text "Card Title"), `Simple` (text "Simple card with just content"), `HeaderOnly` (text "Header Only"), `WithDescenders` (text "Yogurt (plain) — g p q y j"), `Variants` (text "Default Card").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './card.stories'

const { Default, Simple, HeaderOnly, WithDescenders, Variants } = composeStories(stories)

describe('Card stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Card Title')).toBeInTheDocument()
  })

  it('Simple renders without error', () => {
    render(<Simple />)
    expect(screen.getByText('Simple card with just content.')).toBeInTheDocument()
  })

  it('HeaderOnly renders without error', () => {
    render(<HeaderOnly />)
    expect(screen.getByText('Header Only')).toBeInTheDocument()
  })

  it('WithDescenders renders without error', () => {
    render(<WithDescenders />)
    expect(screen.getByText('Yogurt (plain) — g p q y j')).toBeInTheDocument()
  })

  it('Variants renders without error', () => {
    render(<Variants />)
    expect(screen.getByText('Default Card')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run tests**

```bash
pnpm test --run src/components/ui/button.stories.test.tsx src/components/ui/badge.stories.test.tsx src/components/ui/card.stories.test.tsx
```

Expected: 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/button.stories.test.tsx src/components/ui/badge.stories.test.tsx src/components/ui/card.stories.test.tsx
git commit -m "test(ui): add story smoke tests for button, badge, card"
```

---

### Task 7: `input.stories.test.tsx`, `label.stories.test.tsx`, `progress.stories.test.tsx`

**Files:**
- Create: `src/components/ui/input.stories.test.tsx`
- Create: `src/components/ui/label.stories.test.tsx`
- Create: `src/components/ui/progress.stories.test.tsx`

All Tier 1.

- [ ] **Step 1: Create `input.stories.test.tsx`**

Stories: `Default` (placeholder "Enter text..."), `WithLabel` (label "Email"), `Disabled` (placeholder "Disabled input"), `WithValue` (input value "Prefilled value").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './input.stories'

const { Default, WithLabel, Disabled, WithValue } = composeStories(stories)

describe('Input stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByPlaceholderText('Enter text...')).toBeInTheDocument()
  })

  it('WithLabel renders without error', () => {
    render(<WithLabel />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('Disabled renders without error', () => {
    render(<Disabled />)
    expect(screen.getByPlaceholderText('Disabled input')).toBeInTheDocument()
  })

  it('WithValue renders without error', () => {
    render(<WithValue />)
    expect(screen.getByDisplayValue('Prefilled value')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Create `label.stories.test.tsx`**

Stories: `Default` (text "Label text"), `WithInput` (label "Name").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './label.stories'

const { Default, WithInput } = composeStories(stories)

describe('Label stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Label text')).toBeInTheDocument()
  })

  it('WithInput renders without error', () => {
    render(<WithInput />)
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Create `progress.stories.test.tsx`**

Stories: `Default` (text "0% Complete"), `WithCustomColor` (text "Primary (default)"), `Sizes` (text "Small (h-2)").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './progress.stories'

const { Default, WithCustomColor, Sizes } = composeStories(stories)

describe('Progress stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('0% Complete')).toBeInTheDocument()
  })

  it('WithCustomColor renders without error', () => {
    render(<WithCustomColor />)
    expect(screen.getByText('Primary (default)')).toBeInTheDocument()
  })

  it('Sizes renders without error', () => {
    render(<Sizes />)
    expect(screen.getByText('Small (h-2)')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run tests**

```bash
pnpm test --run src/components/ui/input.stories.test.tsx src/components/ui/label.stories.test.tsx src/components/ui/progress.stories.test.tsx
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/input.stories.test.tsx src/components/ui/label.stories.test.tsx src/components/ui/progress.stories.test.tsx
git commit -m "test(ui): add story smoke tests for input, label, progress"
```

---

### Task 8: `select.stories.test.tsx` + dialog/dropdown tests

**Files:**
- Create: `src/components/ui/select.stories.test.tsx`
- Create: `src/components/ui/alert-dialog.stories.test.tsx`
- Create: `src/components/ui/confirm-dialog.stories.test.tsx`
- Create: `src/components/ui/dialog.stories.test.tsx`
- Create: `src/components/ui/dropdown-menu.stories.test.tsx`

All dialog/dropdown stories assert on the trigger button (dialog closed by default — content not in DOM until opened). Tier 1.

- [ ] **Step 1: Create `select.stories.test.tsx`**

Stories: `Default` (placeholder "Select a fruit"), `WithDefaultValue` (same placeholder, initial value "banana" shown), `Disabled` (same placeholder), `LongList` (placeholder "Select a country").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './select.stories'

const { Default, WithDefaultValue, Disabled, LongList } = composeStories(stories)

describe('Select stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Select a fruit')).toBeInTheDocument()
  })

  it('WithDefaultValue renders without error', () => {
    render(<WithDefaultValue />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('Disabled renders without error', () => {
    render(<Disabled />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('LongList renders without error', () => {
    render(<LongList />)
    expect(screen.getByText('Select a country')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Create `alert-dialog.stories.test.tsx`**

Stories: `Default` (trigger "Open Alert"), `Destructive` (trigger "Delete Item").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './alert-dialog.stories'

const { Default, Destructive } = composeStories(stories)

describe('AlertDialog stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByRole('button', { name: 'Open Alert' })).toBeInTheDocument()
  })

  it('Destructive renders without error', () => {
    render(<Destructive />)
    expect(screen.getByRole('button', { name: 'Delete Item' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Create `confirm-dialog.stories.test.tsx`**

Stories: `Default` (trigger "Open Confirm"), `Destructive` (trigger "Delete").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './confirm-dialog.stories'

const { Default, Destructive } = composeStories(stories)

describe('ConfirmDialog stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByRole('button', { name: 'Open Confirm' })).toBeInTheDocument()
  })

  it('Destructive renders without error', () => {
    render(<Destructive />)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Create `dialog.stories.test.tsx`**

Stories: `Default` (trigger "Open Dialog"), `WithForm` (trigger "Edit Profile").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './dialog.stories'

const { Default, WithForm } = composeStories(stories)

describe('Dialog stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByRole('button', { name: 'Open Dialog' })).toBeInTheDocument()
  })

  it('WithForm renders without error', () => {
    render(<WithForm />)
    expect(screen.getByRole('button', { name: 'Edit Profile' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Create `dropdown-menu.stories.test.tsx`**

Stories: `Default` (trigger "Open Menu"), `WithCheckboxItems` (trigger "View Options"), `WithRadioItems` (trigger "Panel Position"), `WithSubMenu` (trigger "Open Menu"), `WithSeparatorsAndLabels` (trigger "Open Menu").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './dropdown-menu.stories'

const {
  Default,
  WithCheckboxItems,
  WithRadioItems,
  WithSubMenu,
  WithSeparatorsAndLabels,
} = composeStories(stories)

describe('DropdownMenu stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByRole('button', { name: 'Open Menu' })).toBeInTheDocument()
  })

  it('WithCheckboxItems renders without error', () => {
    render(<WithCheckboxItems />)
    expect(screen.getByRole('button', { name: 'View Options' })).toBeInTheDocument()
  })

  it('WithRadioItems renders without error', () => {
    render(<WithRadioItems />)
    expect(screen.getByRole('button', { name: 'Panel Position' })).toBeInTheDocument()
  })

  it('WithSubMenu renders without error', () => {
    render(<WithSubMenu />)
    expect(screen.getAllByRole('button', { name: 'Open Menu' })[0]).toBeInTheDocument()
  })

  it('WithSeparatorsAndLabels renders without error', () => {
    render(<WithSeparatorsAndLabels />)
    expect(screen.getByRole('button', { name: 'Open Menu' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run tests**

```bash
pnpm test --run src/components/ui/select.stories.test.tsx src/components/ui/alert-dialog.stories.test.tsx src/components/ui/confirm-dialog.stories.test.tsx src/components/ui/dialog.stories.test.tsx src/components/ui/dropdown-menu.stories.test.tsx
```

Expected: 15 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/select.stories.test.tsx src/components/ui/alert-dialog.stories.test.tsx src/components/ui/confirm-dialog.stories.test.tsx src/components/ui/dialog.stories.test.tsx src/components/ui/dropdown-menu.stories.test.tsx
git commit -m "test(ui): add story smoke tests for select, alert-dialog, confirm-dialog, dialog, dropdown-menu"
```

---

## Chunk 3: ItemCard stories

All 5 ItemCard story files use `sharedDecorator` which wraps in `RouterProvider` + `QueryClientProvider`. Use `waitFor` (Tier 2). The mock item name is `'Yogurt (plain)'` from the shared fixture unless overridden per-story.

### Task 9: `ItemCard.assignment.stories.test.tsx` + `ItemCard.cooking.stories.test.tsx`

**Files:**
- Create: `src/components/item/ItemCard/ItemCard.assignment.stories.test.tsx`
- Create: `src/components/item/ItemCard/ItemCard.cooking.stories.test.tsx`

- [ ] **Step 1: Create `ItemCard.assignment.stories.test.tsx`**

Stories: `TagChecked`, `TagUnchecked`, `RecipeAssigned`, `RecipeUnassigned`. All use `mockItem` (name "Yogurt (plain)").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemCard.assignment.stories'

const {
  TagChecked,
  TagUnchecked,
  RecipeAssigned,
  RecipeUnassigned,
} = composeStories(stories)

describe('ItemCard assignment stories smoke tests', () => {
  it('TagChecked renders without error', async () => {
    render(<TagChecked />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })

  it('TagUnchecked renders without error', async () => {
    render(<TagUnchecked />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })

  it('RecipeAssigned renders without error', async () => {
    render(<RecipeAssigned />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })

  it('RecipeUnassigned renders without error', async () => {
    render(<RecipeUnassigned />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 2: Create `ItemCard.cooking.stories.test.tsx`**

Stories: `ItemIncluded` (item name "Flour"), `ItemExcluded` (item name "Bacon").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemCard.cooking.stories'

const { ItemIncluded, ItemExcluded } = composeStories(stories)

describe('ItemCard cooking stories smoke tests', () => {
  it('ItemIncluded renders without error', async () => {
    render(<ItemIncluded />)
    await waitFor(() =>
      expect(screen.getByText('Flour')).toBeInTheDocument()
    )
  })

  it('ItemExcluded renders without error', async () => {
    render(<ItemExcluded />)
    await waitFor(() =>
      expect(screen.getByText('Bacon')).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 3: Run tests**

```bash
pnpm test --run src/components/item/ItemCard/ItemCard.assignment.stories.test.tsx src/components/item/ItemCard/ItemCard.cooking.stories.test.tsx
```

Expected: 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/item/ItemCard/ItemCard.assignment.stories.test.tsx src/components/item/ItemCard/ItemCard.cooking.stories.test.tsx
git commit -m "test(ItemCard): add story smoke tests for assignment and cooking stories"
```

---

### Task 10: `ItemCard.pantry.stories.test.tsx`

**Files:**
- Create: `src/components/item/ItemCard/ItemCard.pantry.stories.test.tsx`

Stories: `StatusInactive`, `StatusInactiveWithThreshold`, `StatusOK`, `StatusWarning`, `StatusError`, `ExpiringSoon`, `ExpiringRelative`, `WithAmountButtons`.

Most use `mockItem` (name "Yogurt (plain)"). `ExpiringRelative` uses `mockDualUnitItem` (name "Purple grapes").

- [ ] **Step 1: Create the test file**

```tsx
import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemCard.pantry.stories'

const {
  StatusInactive,
  StatusInactiveWithThreshold,
  StatusOK,
  StatusWarning,
  StatusError,
  ExpiringSoon,
  ExpiringRelative,
  WithAmountButtons,
} = composeStories(stories)

describe('ItemCard pantry stories smoke tests', () => {
  it('StatusInactive renders without error', async () => {
    render(<StatusInactive />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })

  it('StatusInactiveWithThreshold renders without error', async () => {
    render(<StatusInactiveWithThreshold />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })

  it('StatusOK renders without error', async () => {
    render(<StatusOK />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })

  it('StatusWarning renders without error', async () => {
    render(<StatusWarning />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })

  it('StatusError renders without error', async () => {
    render(<StatusError />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })

  it('ExpiringSoon renders without error', async () => {
    render(<ExpiringSoon />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })

  it('ExpiringRelative renders without error', async () => {
    render(<ExpiringRelative />)
    await waitFor(() =>
      expect(screen.getByText('Purple grapes')).toBeInTheDocument()
    )
  })

  it('WithAmountButtons renders without error', async () => {
    render(<WithAmountButtons />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 2: Run tests**

```bash
pnpm test --run src/components/item/ItemCard/ItemCard.pantry.stories.test.tsx
```

Expected: 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/item/ItemCard/ItemCard.pantry.stories.test.tsx
git commit -m "test(ItemCard): add story smoke tests for pantry stories"
```

---

### Task 11: `ItemCard.shopping.stories.test.tsx` + `ItemCard.variants.stories.test.tsx`

**Files:**
- Create: `src/components/item/ItemCard/ItemCard.shopping.stories.test.tsx`
- Create: `src/components/item/ItemCard/ItemCard.variants.stories.test.tsx`

- [ ] **Step 1: Read the story files to confirm item names**

Check the shopping and variants stories for item name overrides:
- `ItemCard.shopping.stories.tsx` — check for name overrides in each story's item args
- `ItemCard.variants.stories.tsx` — check for name overrides

The base `mockItem.name` is `'Yogurt (plain)'`. Override names to use:
- Shopping: `PackageDisplayDualUnit` uses `mockDualUnitItem` → `'Purple grapes'`; check others
- Variants: check for overrides

- [ ] **Step 2: Create `ItemCard.shopping.stories.test.tsx`**

Stories: `NotInCart`, `InCart`, `PackageDisplayDualUnit`, `PackageDisplayDualUnitWithUnpacked`, `PackageDisplaySingleUnit`.

```tsx
import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemCard.shopping.stories'

const {
  NotInCart,
  InCart,
  PackageDisplayDualUnit,
  PackageDisplayDualUnitWithUnpacked,
  PackageDisplaySingleUnit,
} = composeStories(stories)

describe('ItemCard shopping stories smoke tests', () => {
  it('NotInCart renders without error', async () => {
    render(<NotInCart />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })

  it('InCart renders without error', async () => {
    render(<InCart />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })

  it('PackageDisplayDualUnit renders without error', async () => {
    render(<PackageDisplayDualUnit />)
    await waitFor(() =>
      expect(screen.getByText('Purple grapes')).toBeInTheDocument()
    )
  })

  it('PackageDisplayDualUnitWithUnpacked renders without error', async () => {
    render(<PackageDisplayDualUnitWithUnpacked />)
    await waitFor(() =>
      expect(screen.getByText('Purple grapes')).toBeInTheDocument()
    )
  })

  it('PackageDisplaySingleUnit renders without error', async () => {
    render(<PackageDisplaySingleUnit />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })
})
```

> **Note:** If `PackageDisplayDualUnit` or `PackageDisplayDualUnitWithUnpacked` override the item name, update the assertion accordingly. Read the story file first.

- [ ] **Step 3: Create `ItemCard.variants.stories.test.tsx`**

Stories: `TagsHidden`, `MultipleTags`, `VendorsAndRecipesCollapsed`, `VendorsAndRecipesExpanded`, `ActiveTagFilter`, `ActiveVendorFilter`.

Read `ItemCard.variants.stories.tsx` first to confirm item names.

```tsx
import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemCard.variants.stories'

const {
  TagsHidden,
  MultipleTags,
  VendorsAndRecipesCollapsed,
  VendorsAndRecipesExpanded,
  ActiveTagFilter,
  ActiveVendorFilter,
} = composeStories(stories)

describe('ItemCard variants stories smoke tests', () => {
  it('TagsHidden renders without error', async () => {
    render(<TagsHidden />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })

  it('MultipleTags renders without error', async () => {
    render(<MultipleTags />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })

  it('VendorsAndRecipesCollapsed renders without error', async () => {
    render(<VendorsAndRecipesCollapsed />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })

  it('VendorsAndRecipesExpanded renders without error', async () => {
    render(<VendorsAndRecipesExpanded />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })

  it('ActiveTagFilter renders without error', async () => {
    render(<ActiveTagFilter />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })

  it('ActiveVendorFilter renders without error', async () => {
    render(<ActiveVendorFilter />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    )
  })
})
```

> **Note:** Read `ItemCard.variants.stories.tsx` first to verify the item name used in each story. If any story overrides `name`, update the assertion.

- [ ] **Step 4: Run tests**

```bash
pnpm test --run src/components/item/ItemCard/ItemCard.shopping.stories.test.tsx src/components/item/ItemCard/ItemCard.variants.stories.test.tsx
```

Expected: 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/item/ItemCard/ItemCard.shopping.stories.test.tsx src/components/item/ItemCard/ItemCard.variants.stories.test.tsx
git commit -m "test(ItemCard): add story smoke tests for shopping and variants stories"
```

---

## Chunk 4: Item component stories (non-card)

### Task 12: `ItemProgressBar.stories.test.tsx`

**Files:**
- Create: `src/components/item/ItemProgressBar/ItemProgressBar.stories.test.tsx`

Stories with wrapper text: `SegmentedBar` (text "Small target (3/8) - Default"), `ContinuousBar` (text "Large target (45/60) - Default"), `ThresholdBehavior` (text "Segmented (≤15 units)"), `EdgeCases` (text "Empty (0/12)"), `PartialSegment` (text "Partial segment (1.7/2)..."), `MultiplePartials` (text "Multiple partials (2.3/5)...").

Stories with no wrapper text (bare `args`): `Interactive`, `Inactive`, `InactiveWithStock` → use `container.firstChild` check.

Tier 1 (no providers).

- [ ] **Step 1: Create the test file**

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemProgressBar.stories'

const {
  Interactive,
  SegmentedBar,
  ContinuousBar,
  ThresholdBehavior,
  EdgeCases,
  PartialSegment,
  MultiplePartials,
  Inactive,
  InactiveWithStock,
} = composeStories(stories)

describe('ItemProgressBar stories smoke tests', () => {
  it('Interactive renders without error', () => {
    const { container } = render(<Interactive />)
    expect(container.firstChild).not.toBeNull()
  })

  it('SegmentedBar renders without error', () => {
    render(<SegmentedBar />)
    expect(screen.getByText('Small target (3/8) - Default')).toBeInTheDocument()
  })

  it('ContinuousBar renders without error', () => {
    render(<ContinuousBar />)
    expect(screen.getByText('Large target (45/60) - Default')).toBeInTheDocument()
  })

  it('ThresholdBehavior renders without error', () => {
    render(<ThresholdBehavior />)
    expect(screen.getByText('Segmented (≤15 units)')).toBeInTheDocument()
  })

  it('EdgeCases renders without error', () => {
    render(<EdgeCases />)
    expect(screen.getByText('Empty (0/12)')).toBeInTheDocument()
  })

  it('PartialSegment renders without error', () => {
    render(<PartialSegment />)
    expect(
      screen.getByText('Partial segment (1.7/2) - 70% fill in second segment')
    ).toBeInTheDocument()
  })

  it('MultiplePartials renders without error', () => {
    render(<MultiplePartials />)
    expect(screen.getByText('Multiple partials (2.3/5) - Warning')).toBeInTheDocument()
  })

  it('Inactive renders without error', () => {
    const { container } = render(<Inactive />)
    expect(container.firstChild).not.toBeNull()
  })

  it('InactiveWithStock renders without error', () => {
    const { container } = render(<InactiveWithStock />)
    expect(container.firstChild).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests**

```bash
pnpm test --run src/components/item/ItemProgressBar/ItemProgressBar.stories.test.tsx
```

Expected: 9 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/item/ItemProgressBar/ItemProgressBar.stories.test.tsx
git commit -m "test(ItemProgressBar): add story smoke tests"
```

---

### Task 13: `ItemFilters.stories.test.tsx` + `ItemForm.stories.test.tsx` + `ItemListToolbar.stories.test.tsx`

**Files:**
- Create: `src/components/item/ItemFilters/ItemFilters.stories.test.tsx`
- Create: `src/components/item/ItemForm/ItemForm.stories.test.tsx`
- Create: `src/components/item/ItemListToolbar/ItemListToolbar.stories.test.tsx`

All wrap with `RouterProvider` + `QueryClientProvider`. Use Tier 2 (`waitFor` + `container.firstChild`).

- [ ] **Step 1: Create `ItemFilters.stories.test.tsx`**

Stories: `Default`, `EmptyItems`, `Disabled`, `WithVendors`, `WithRecipes`, `WithVendorsAndRecipes`, `HideVendorFilter`, `HideRecipeFilter`. All use Tier 2.

```tsx
import { composeStories } from '@storybook/react'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemFilters.stories'

const {
  Default,
  EmptyItems,
  Disabled,
  WithVendors,
  WithRecipes,
  WithVendorsAndRecipes,
  HideVendorFilter,
  HideRecipeFilter,
} = composeStories(stories)

describe('ItemFilters stories smoke tests', () => {
  it('Default renders without error', async () => {
    const { container } = render(<Default />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('EmptyItems renders without error', async () => {
    const { container } = render(<EmptyItems />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('Disabled renders without error', async () => {
    const { container } = render(<Disabled />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('WithVendors renders without error', async () => {
    const { container } = render(<WithVendors />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('WithRecipes renders without error', async () => {
    const { container } = render(<WithRecipes />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('WithVendorsAndRecipes renders without error', async () => {
    const { container } = render(<WithVendorsAndRecipes />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('HideVendorFilter renders without error', async () => {
    const { container } = render(<HideVendorFilter />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('HideRecipeFilter renders without error', async () => {
    const { container } = render(<HideRecipeFilter />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })
})
```

- [ ] **Step 2: Create `ItemForm.stories.test.tsx`**

Stories: `CreateMode`, `EditMode`, `EditMeasurementMode`, `EditValidationError`. All use router context.

```tsx
import { composeStories } from '@storybook/react'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemForm.stories'

const {
  CreateMode,
  EditMode,
  EditMeasurementMode,
  EditValidationError,
} = composeStories(stories)

describe('ItemForm stories smoke tests', () => {
  it('CreateMode renders without error', async () => {
    const { container } = render(<CreateMode />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('EditMode renders without error', async () => {
    const { container } = render(<EditMode />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('EditMeasurementMode renders without error', async () => {
    const { container } = render(<EditMeasurementMode />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('EditValidationError renders without error', async () => {
    const { container } = render(<EditValidationError />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })
})
```

- [ ] **Step 3: Create `ItemListToolbar.stories.test.tsx`**

Stories: `Default`, `WithTagsToggle`, `WithAddButton`, `WithLeadingSlot`, `SortedByStock`, `DescendingSort`, `WithVendors`, `WithRecipes`, `WithVendorsAndRecipes`, `HideVendorFilter`, `HideRecipeFilter`. All use Tier 2.

```tsx
import { composeStories } from '@storybook/react'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemListToolbar.stories'

const {
  Default,
  WithTagsToggle,
  WithAddButton,
  WithLeadingSlot,
  SortedByStock,
  DescendingSort,
  WithVendors,
  WithRecipes,
  WithVendorsAndRecipes,
  HideVendorFilter,
  HideRecipeFilter,
} = composeStories(stories)

describe('ItemListToolbar stories smoke tests', () => {
  it('Default renders without error', async () => {
    const { container } = render(<Default />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('WithTagsToggle renders without error', async () => {
    const { container } = render(<WithTagsToggle />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('WithAddButton renders without error', async () => {
    const { container } = render(<WithAddButton />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('WithLeadingSlot renders without error', async () => {
    const { container } = render(<WithLeadingSlot />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('SortedByStock renders without error', async () => {
    const { container } = render(<SortedByStock />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('DescendingSort renders without error', async () => {
    const { container } = render(<DescendingSort />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('WithVendors renders without error', async () => {
    const { container } = render(<WithVendors />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('WithRecipes renders without error', async () => {
    const { container } = render(<WithRecipes />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('WithVendorsAndRecipes renders without error', async () => {
    const { container } = render(<WithVendorsAndRecipes />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('HideVendorFilter renders without error', async () => {
    const { container } = render(<HideVendorFilter />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('HideRecipeFilter renders without error', async () => {
    const { container } = render(<HideRecipeFilter />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })
})
```

- [ ] **Step 4: Run tests**

```bash
pnpm test --run src/components/item/ItemFilters/ItemFilters.stories.test.tsx src/components/item/ItemForm/ItemForm.stories.test.tsx src/components/item/ItemListToolbar/ItemListToolbar.stories.test.tsx
```

Expected: 23 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/item/ItemFilters/ItemFilters.stories.test.tsx src/components/item/ItemForm/ItemForm.stories.test.tsx src/components/item/ItemListToolbar/ItemListToolbar.stories.test.tsx
git commit -m "test(item): add story smoke tests for ItemFilters, ItemForm, ItemListToolbar"
```

---

## Chunk 5: Tag, recipe, vendor components

### Task 14: Tag component stories

**Files:**
- Create: `src/components/tag/TagBadge/TagBadge.stories.test.tsx`
- Create: `src/components/tag/TagNameForm/TagNameForm.stories.test.tsx`
- Create: `src/components/tag/TagTypeDropdown/TagTypeDropdown.stories.test.tsx`
- Create: `src/components/tag/EditTagTypeDialog/EditTagTypeDialog.stories.test.tsx`
- Create: `src/components/tag/TagDetailDialog/TagDetailDialog.stories.test.tsx`

- [ ] **Step 1: Create `TagBadge.stories.test.tsx`**

Stories: `Default` (text "Dairy"), `DifferentColors` (text "red").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TagBadge.stories'

const { Default, DifferentColors } = composeStories(stories)

describe('TagBadge stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Dairy')).toBeInTheDocument()
  })

  it('DifferentColors renders without error', () => {
    render(<DifferentColors />)
    expect(screen.getAllByText('red').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Create `TagNameForm.stories.test.tsx`**

Stories: `Empty` (Save button disabled, no initial value), `WithName` (input value "Dairy"), `Pending` (input value "Dairy", Save button disabled). Assert on input value for `WithName`/`Pending`, and the Save button for `Empty`.

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TagNameForm.stories'

const { Empty, WithName, Pending } = composeStories(stories)

describe('TagNameForm stories smoke tests', () => {
  it('Empty renders without error', () => {
    render(<Empty />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('WithName renders without error', () => {
    render(<WithName />)
    expect(screen.getByDisplayValue('Dairy')).toBeInTheDocument()
  })

  it('Pending renders without error', () => {
    render(<Pending />)
    expect(screen.getByDisplayValue('Dairy')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Create `TagTypeDropdown.stories.test.tsx`**

Stories: `Default` (trigger shows "Category"), `WithSelections` (trigger "Category"), `MultipleTagsWithCounts` (trigger "Store"), `EmptyState` (trigger "Brand").

The dropdown trigger renders the tag type name. Use `waitFor` since these may have async router context.

```tsx
import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TagTypeDropdown.stories'

const {
  Default,
  WithSelections,
  MultipleTagsWithCounts,
  EmptyState,
} = composeStories(stories)

describe('TagTypeDropdown stories smoke tests', () => {
  it('Default renders without error', async () => {
    render(<Default />)
    await waitFor(() =>
      expect(screen.getByText('Category')).toBeInTheDocument()
    )
  })

  it('WithSelections renders without error', async () => {
    render(<WithSelections />)
    await waitFor(() =>
      expect(screen.getByText('Category')).toBeInTheDocument()
    )
  })

  it('MultipleTagsWithCounts renders without error', async () => {
    render(<MultipleTagsWithCounts />)
    await waitFor(() =>
      expect(screen.getByText('Store')).toBeInTheDocument()
    )
  })

  it('EmptyState renders without error', async () => {
    render(<EmptyState />)
    await waitFor(() =>
      expect(screen.getByText('Brand')).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 4: Create `EditTagTypeDialog.stories.test.tsx`**

Story: `Default` (trigger button "Edit Tag Type").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './EditTagTypeDialog.stories'

const { Default } = composeStories(stories)

describe('EditTagTypeDialog stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByRole('button', { name: 'Edit Tag Type' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Create `TagDetailDialog.stories.test.tsx`**

Story: `Default` (trigger button "View Tag Details").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TagDetailDialog.stories'

const { Default } = composeStories(stories)

describe('TagDetailDialog stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByRole('button', { name: 'View Tag Details' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run tests**

```bash
pnpm test --run src/components/tag/TagBadge/TagBadge.stories.test.tsx src/components/tag/TagNameForm/TagNameForm.stories.test.tsx src/components/tag/TagTypeDropdown/TagTypeDropdown.stories.test.tsx src/components/tag/EditTagTypeDialog/EditTagTypeDialog.stories.test.tsx src/components/tag/TagDetailDialog/TagDetailDialog.stories.test.tsx
```

Expected: 12 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/tag/TagBadge/TagBadge.stories.test.tsx src/components/tag/TagNameForm/TagNameForm.stories.test.tsx src/components/tag/TagTypeDropdown/TagTypeDropdown.stories.test.tsx src/components/tag/EditTagTypeDialog/EditTagTypeDialog.stories.test.tsx src/components/tag/TagDetailDialog/TagDetailDialog.stories.test.tsx
git commit -m "test(tag): add story smoke tests for tag components"
```

---

### Task 15: Recipe + vendor + ColorSelect stories

**Files:**
- Create: `src/components/recipe/RecipeNameForm/RecipeNameForm.stories.test.tsx`
- Create: `src/components/vendor/VendorNameForm/VendorNameForm.stories.test.tsx`
- Create: `src/components/ColorSelect/ColorSelect.stories.test.tsx`

- [ ] **Step 1: Create `RecipeNameForm.stories.test.tsx`**

Stories: `Empty` (Save button), `WithName` (input "Pasta Dinner"), `Pending` (input "Pasta Dinner").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './RecipeNameForm.stories'

const { Empty, WithName, Pending } = composeStories(stories)

describe('RecipeNameForm stories smoke tests', () => {
  it('Empty renders without error', () => {
    render(<Empty />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('WithName renders without error', () => {
    render(<WithName />)
    expect(screen.getByDisplayValue('Pasta Dinner')).toBeInTheDocument()
  })

  it('Pending renders without error', () => {
    render(<Pending />)
    expect(screen.getByDisplayValue('Pasta Dinner')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Create `VendorNameForm.stories.test.tsx`**

Stories: `Empty` (Save button), `WithName` (input "Costco"), `Pending` (input "Costco").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './VendorNameForm.stories'

const { Empty, WithName, Pending } = composeStories(stories)

describe('VendorNameForm stories smoke tests', () => {
  it('Empty renders without error', () => {
    render(<Empty />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('WithName renders without error', () => {
    render(<WithName />)
    expect(screen.getByDisplayValue('Costco')).toBeInTheDocument()
  })

  it('Pending renders without error', () => {
    render(<Pending />)
    expect(screen.getByDisplayValue('Costco')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Create `ColorSelect.stories.test.tsx`**

Stories: `Default` (renders a combobox), `AllColors` (renders multiple comboboxes), `WithLabel` (label "Tag Color"), `InForm` (label "Tag Name").

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ColorSelect.stories'

const { Default, AllColors, WithLabel, InForm } = composeStories(stories)

describe('ColorSelect stories smoke tests', () => {
  it('Default renders without error', () => {
    const { container } = render(<Default />)
    expect(container.firstChild).not.toBeNull()
  })

  it('AllColors renders without error', () => {
    render(<AllColors />)
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0)
  })

  it('WithLabel renders without error', () => {
    render(<WithLabel />)
    expect(screen.getByText('Tag Color')).toBeInTheDocument()
  })

  it('InForm renders without error', () => {
    render(<InForm />)
    expect(screen.getByText('Tag Name')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run tests**

```bash
pnpm test --run src/components/recipe/RecipeNameForm/RecipeNameForm.stories.test.tsx src/components/vendor/VendorNameForm/VendorNameForm.stories.test.tsx src/components/ColorSelect/ColorSelect.stories.test.tsx
```

Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/recipe/RecipeNameForm/RecipeNameForm.stories.test.tsx src/components/vendor/VendorNameForm/VendorNameForm.stories.test.tsx src/components/ColorSelect/ColorSelect.stories.test.tsx
git commit -m "test(recipe,vendor,color): add story smoke tests for RecipeNameForm, VendorNameForm, ColorSelect"
```

---

## Chunk 6: Settings components + page routes + Colors

### Task 16: Settings component stories

**Files:**
- Create: `src/components/settings/ExportCard/index.stories.test.tsx`
- Create: `src/components/settings/LanguageCard/index.stories.test.tsx`
- Create: `src/components/settings/SettingsNavCard/index.stories.test.tsx`
- Create: `src/components/settings/ThemeCard/index.stories.test.tsx`

- [ ] **Step 1: Create `ExportCard/index.stories.test.tsx`**

Story: `Default`. Renders the "Download" button (i18n key `settings.export.button` = "Download"). Tier 1.

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default } = composeStories(stories)

describe('ExportCard stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Create `LanguageCard/index.stories.test.tsx`**

Stories: `AutoLanguage`, `ExplicitEnglish`, `ExplicitChineseTraditional`.

These use Storybook-native `beforeEach` to set localStorage. `composeStories()` does NOT run those hooks. Replicate localStorage setup as Vitest `beforeEach`/`afterEach` per story.

- `AutoLanguage`: removes `i18n-language` key → renders with auto-detected language
- `ExplicitEnglish`: sets `i18n-language = 'en'` → renders "Language" label
- `ExplicitChineseTraditional`: sets `i18n-language = 'tw'` → renders "Language" label

All stories render the i18n key `settings.language.label` = "Language". Assert on that text.

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { AutoLanguage, ExplicitEnglish, ExplicitChineseTraditional } =
  composeStories(stories)

const LANGUAGE_STORAGE_KEY = 'i18n-language'

describe('LanguageCard stories smoke tests', () => {
  describe('AutoLanguage', () => {
    beforeEach(() => localStorage.removeItem(LANGUAGE_STORAGE_KEY))
    afterEach(() => localStorage.removeItem(LANGUAGE_STORAGE_KEY))

    it('renders without error', () => {
      render(<AutoLanguage />)
      expect(screen.getByText('Language')).toBeInTheDocument()
    })
  })

  describe('ExplicitEnglish', () => {
    beforeEach(() => localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en'))
    afterEach(() => localStorage.removeItem(LANGUAGE_STORAGE_KEY))

    it('renders without error', () => {
      render(<ExplicitEnglish />)
      expect(screen.getByText('Language')).toBeInTheDocument()
    })
  })

  describe('ExplicitChineseTraditional', () => {
    beforeEach(() => localStorage.setItem(LANGUAGE_STORAGE_KEY, 'tw'))
    afterEach(() => localStorage.removeItem(LANGUAGE_STORAGE_KEY))

    it('renders without error', () => {
      render(<ExplicitChineseTraditional />)
      expect(screen.getByText('Language')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 3: Create `SettingsNavCard/index.stories.test.tsx`**

Stories: `TagsLink` (text "Tags"), `VendorsLink` (text "Vendors"), `RecipesLink` (text "Recipes"), `AllLinks` (text "Tags" + "Vendors" + "Recipes"). The decorator uses `getRouterContext()` (synchronous). Tier 1.

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { TagsLink, VendorsLink, RecipesLink, AllLinks } = composeStories(stories)

describe('SettingsNavCard stories smoke tests', () => {
  it('TagsLink renders without error', () => {
    render(<TagsLink />)
    expect(screen.getByText('Tags')).toBeInTheDocument()
  })

  it('VendorsLink renders without error', () => {
    render(<VendorsLink />)
    expect(screen.getByText('Vendors')).toBeInTheDocument()
  })

  it('RecipesLink renders without error', () => {
    render(<RecipesLink />)
    expect(screen.getByText('Recipes')).toBeInTheDocument()
  })

  it('AllLinks renders without error', () => {
    render(<AllLinks />)
    expect(screen.getByText('Manage your tags')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Create `ThemeCard/index.stories.test.tsx`**

Stories: `LightPreference`, `DarkPreference`, `SystemPreference`. Each sets `theme-preference` in localStorage. `composeStories()` does NOT run story `beforeEach`. Replicate as Vitest `beforeEach`/`afterEach`.

All render the i18n key `settings.theme.label` = "Theme" and buttons "Light", "System", "Dark".

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { LightPreference, DarkPreference, SystemPreference } = composeStories(stories)

const THEME_STORAGE_KEY = 'theme-preference'

describe('ThemeCard stories smoke tests', () => {
  describe('LightPreference', () => {
    beforeEach(() => localStorage.setItem(THEME_STORAGE_KEY, 'light'))
    afterEach(() => localStorage.removeItem(THEME_STORAGE_KEY))

    it('renders without error', () => {
      render(<LightPreference />)
      expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument()
    })
  })

  describe('DarkPreference', () => {
    beforeEach(() => localStorage.setItem(THEME_STORAGE_KEY, 'dark'))
    afterEach(() => localStorage.removeItem(THEME_STORAGE_KEY))

    it('renders without error', () => {
      render(<DarkPreference />)
      expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument()
    })
  })

  describe('SystemPreference', () => {
    beforeEach(() => localStorage.removeItem(THEME_STORAGE_KEY))
    afterEach(() => localStorage.removeItem(THEME_STORAGE_KEY))

    it('renders without error', () => {
      render(<SystemPreference />)
      expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 5: Run tests**

```bash
pnpm test --run src/components/settings/ExportCard/index.stories.test.tsx src/components/settings/LanguageCard/index.stories.test.tsx src/components/settings/SettingsNavCard/index.stories.test.tsx src/components/settings/ThemeCard/index.stories.test.tsx
```

Expected: 11 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/ExportCard/index.stories.test.tsx src/components/settings/LanguageCard/index.stories.test.tsx src/components/settings/SettingsNavCard/index.stories.test.tsx src/components/settings/ThemeCard/index.stories.test.tsx
git commit -m "test(settings): add story smoke tests for settings card components"
```

---

### Task 17: Page-level route stories + Colors

**Files:**
- Create: `src/routes/settings/index.stories.test.tsx`
- Create: `src/routes/settings/tags/index.stories.test.tsx`
- Create: `src/routes/settings/tags/$id/index.stories.test.tsx`
- Create: `src/stories/Colors.stories.test.tsx`

Page routes use Dexie seeding via `useEffect` and show "Loading..." on initial render (Tier 3). Colors is Tier 1 with a static heading.

- [ ] **Step 1: Create `src/routes/settings/index.stories.test.tsx`**

Stories: `Default`, `TraditionalChinese`, `ExplicitEnglish`. All show "Loading..." on mount.

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default, TraditionalChinese, ExplicitEnglish } = composeStories(stories)

describe('Settings index stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('TraditionalChinese renders without error', () => {
    render(<TraditionalChinese />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('ExplicitEnglish renders without error', () => {
    render(<ExplicitEnglish />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Create `src/routes/settings/tags/index.stories.test.tsx`**

Story: `Default`. Shows "Loading..." on mount.

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default } = composeStories(stories)

describe('Settings tags index stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Create `src/routes/settings/tags/$id/index.stories.test.tsx`**

Story: `Default`. Shows "Loading..." on mount.

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default } = composeStories(stories)

describe('Settings tags $id index stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Create `src/stories/Colors.stories.test.tsx`**

Story: `AllColors` (exported name — NOT `Default`). Renders static headings synchronously; color value strings are async via `useEffect`. Assert on the static heading `'Colors by Hue'`. Tier 1.

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './Colors.stories'

const { AllColors } = composeStories(stories)

describe('Colors stories smoke tests', () => {
  it('AllColors renders without error', () => {
    render(<AllColors />)
    expect(screen.getByText('Colors by Hue')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run tests**

```bash
pnpm test --run src/routes/settings/index.stories.test.tsx src/routes/settings/tags/index.stories.test.tsx "src/routes/settings/tags/\$id/index.stories.test.tsx" src/stories/Colors.stories.test.tsx
```

Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/routes/settings/index.stories.test.tsx src/routes/settings/tags/index.stories.test.tsx "src/routes/settings/tags/\$id/index.stories.test.tsx" src/stories/Colors.stories.test.tsx
git commit -m "test(routes,stories): add story smoke tests for settings routes and Colors"
```

---

## Final verification

### Task 18: Run full test suite

- [ ] **Step 1: Run all tests**

```bash
pnpm test --run
```

Expected: All 64 test files pass (original 64 + 40 new = 104 total files). Verify 0 failures.

- [ ] **Step 2: Build check**

```bash
pnpm build 2>&1 | tee /tmp/p1i-build.log && grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports" || echo "OK: no deprecated imports"
```

Expected: Build succeeds, no TS6385 warnings.

- [ ] **Step 3: Lint check**

```bash
pnpm lint
```

Expected: No errors.
