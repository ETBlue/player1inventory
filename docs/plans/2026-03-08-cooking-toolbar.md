# Cooking Toolbar Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the cooking page toolbar to match shopping page patterns — contextual count text on left, conditional Cancel that hides entirely, icons on buttons, search toggle replacing the + button.

**Architecture:** All changes in `src/routes/cooking.tsx`. Add two derived values (`totalCheckedItems`, `totalServings`) and one state variable (`searchVisible`). No new components. The `searchVisible` state is wired here; the actual search input row is implemented in the cooking-search plan.

**Tech Stack:** React, TypeScript, lucide-react (`Check`, `Search`, `X` — keep `Plus` for serving stepper)

---

### Task 1: Write failing tests

**Files:**
- Modify: `src/routes/cooking.test.tsx`

**Step 1: Read the full test file first**

Read `src/routes/cooking.test.tsx` to understand existing test structure and helpers.

**Step 2: Add tests inside the existing `describe('Use (Cooking) Page', ...)` block**

```ts
it('user does not see count text or cancel button when nothing is checked', async () => {
  // Given a recipe exists
  await createRecipe({ name: 'Pasta' })
  renderPage()

  // Then count text is absent and Cancel button is absent
  await waitFor(() => {
    expect(screen.queryByText(/cooking/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
  })
})

it('user sees count text and cancel button after checking a recipe', async () => {
  // Given a recipe with one item
  const item = await makeItem('Tomato')
  const recipe = await createRecipe({ name: 'Salad', items: [{ itemId: item.id, defaultAmount: 1 }] })
  renderPage()

  // When user checks the recipe checkbox
  await waitFor(() => screen.getByLabelText('Salad'))
  await userEvent.click(screen.getByLabelText('Salad'))

  // Then count text appears
  await waitFor(() => {
    expect(screen.getByText(/cooking 1 recipe/i)).toBeInTheDocument()
    expect(screen.getByText(/1 item/i)).toBeInTheDocument()
    expect(screen.getByText(/×1 serving/i)).toBeInTheDocument()
  })

  // Then Cancel button appears
  expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
})

it('user sees done button disabled when nothing is checked', async () => {
  // Given a recipe exists
  await createRecipe({ name: 'Pasta' })
  renderPage()

  // Then Done is disabled
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /done/i })).toBeDisabled()
  })
})

it('user sees search toggle button in toolbar', async () => {
  // Given cooking page renders
  renderPage()

  // Then search toggle button is present
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /toggle search/i })).toBeInTheDocument()
  })
})
```

**Step 3: Run tests to confirm they fail**

```bash
pnpm test src/routes/cooking.test.tsx
```

Expected: the four new tests FAIL (buttons/text not found or found unexpectedly)

---

### Task 2: Add derived values and searchVisible state

**Files:**
- Modify: `src/routes/cooking.tsx`

**Step 1: Read cooking.tsx lines 58–70** to locate where `anyChecked` and `recipesBeingConsumed` are computed (around line 270).

**Step 2: After `recipesBeingConsumed` is computed, add:**

```ts
const totalCheckedItems = [...checkedItemIds.values()].reduce(
  (sum, set) => sum + set.size,
  0,
)
const totalServings = [...checkedItemIds.entries()]
  .filter(([, set]) => set.size > 0)
  .reduce((sum, [recipeId]) => sum + (sessionServings.get(recipeId) ?? 1), 0)
```

**Step 3: Add `searchVisible` state near the other `useState` declarations (around line 60):**

```ts
const [searchVisible, setSearchVisible] = useState(false)
```

**Step 4: Update the lucide-react import line** — add `Check, Search, X` (keep `Plus`, `Minus`, `ChevronDown`, `ChevronLeft`):

```ts
import { Check, ChevronDown, ChevronLeft, Minus, Plus, Search, X } from 'lucide-react'
```

---

### Task 3: Replace the toolbar JSX

**Files:**
- Modify: `src/routes/cooking.tsx`

The current toolbar is approximately lines 277–300. Replace the entire `<Toolbar>` block with:

```tsx
<Toolbar className="justify-between">
  {anyChecked && (
    <span className="text-sm text-foreground-muted">
      Cooking {recipesBeingConsumed} recipe{recipesBeingConsumed !== 1 ? 's' : ''} ·{' '}
      {totalCheckedItems} item{totalCheckedItems !== 1 ? 's' : ''} ·{' '}
      ×{totalServings} serving{totalServings !== 1 ? 's' : ''}
    </span>
  )}
  <div className="flex-1" />
  {anyChecked && (
    <Button
      variant="destructive-ghost"
      onClick={() => setShowCancelDialog(true)}
    >
      <X /> Cancel
    </Button>
  )}
  <Button
    disabled={!anyChecked}
    onClick={() => setShowDoneDialog(true)}
  >
    <Check /> Done
  </Button>
  <Button
    variant={searchVisible ? 'neutral' : 'neutral-outline'}
    size="icon"
    aria-label="Toggle search"
    onClick={() => setSearchVisible((v) => !v)}
  >
    <Search className="h-4 w-4" />
  </Button>
</Toolbar>
```

---

### Task 4: Run tests and verify

```bash
pnpm test src/routes/cooking.test.tsx
```

Expected: all tests PASS including the four new ones.

---

### Task 5: Commit

```bash
git add src/routes/cooking.tsx src/routes/cooking.test.tsx
git commit -m "feat(cooking): redesign toolbar with count text, icons, and search toggle"
```
