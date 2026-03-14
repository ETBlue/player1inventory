# Cooking Search Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement search in the cooking page — toggle search input row, filter recipes and items by query with text highlighting, and navigate to new recipe with pre-filled name when no exact match exists.

**Architecture:** Changes span two files: `src/routes/cooking.tsx` (search state, filter logic, input row, updated render) and `src/routes/settings/recipes/new.tsx` (add `?name=` search param support for pre-fill). The `searchVisible` state from the toolbar plan already exists. This plan adds `searchQuery` state, a `highlight()` helper, filter logic, and the search input row UI.

**Tech Stack:** React, TypeScript, TanStack Router (`validateSearch`, `useNavigate`), lucide-react (`Plus` — already imported for serving stepper)

**Prerequisite:** The cooking-toolbar plan must be implemented first (provides `searchVisible` state and the `🔍` toggle button).

---

### Task 1: Support `?name=` pre-fill in new recipe page

**Files:**
- Modify: `src/routes/settings/recipes/new.tsx`

**Step 1: Read `src/routes/settings/recipes/new.tsx`** in full.

**Step 2: Add `validateSearch` to the route definition** and initialize the `name` state from it:

```ts
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'

// In the route definition:
export const Route = createFileRoute('/settings/recipes/new')({
  validateSearch: z.object({
    name: z.string().optional(),
  }),
  component: NewRecipePage,
})

// In the component, replace:
//   const [name, setName] = useState('')
// with:
const { name: prefillName = '' } = Route.useSearch()
const [name, setName] = useState(prefillName)
```

Check if `zod` is already used elsewhere — run:

```bash
grep -r "from 'zod'" src/routes/settings/recipes/new.tsx
```

If not used in that file, check if it's available in the project:

```bash
grep -r "from 'zod'" src/ --include="*.ts" --include="*.tsx" -l | head -3
```

If `zod` is not used anywhere, use inline type assertion instead:

```ts
export const Route = createFileRoute('/settings/recipes/new')({
  validateSearch: (search: Record<string, unknown>) => ({
    name: typeof search.name === 'string' ? search.name : '',
  }),
  component: NewRecipePage,
})
```

**Step 3: Run existing tests to confirm no breakage**

```bash
pnpm test src/routes/settings/recipes/new.test.tsx
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/routes/settings/recipes/new.tsx
git commit -m "feat(recipes): support ?name= pre-fill on new recipe page"
```

---

### Task 2: Write failing tests for search behavior

**Files:**
- Modify: `src/routes/cooking.test.tsx`

**Step 1: Read the full `src/routes/cooking.test.tsx`** to understand existing helpers and structure.

**Step 2: Add tests inside the existing `describe('Use (Cooking) Page', ...)` block**

```ts
describe('search', () => {
  it('user can toggle search input via search icon button', async () => {
    // Given cooking page with a recipe
    await createRecipe({ name: 'Pasta' })
    renderPage()

    // When user clicks the search toggle button
    await waitFor(() => screen.getByRole('button', { name: /toggle search/i }))
    await userEvent.click(screen.getByRole('button', { name: /toggle search/i }))

    // Then search input is visible
    expect(screen.getByPlaceholderText(/search recipes/i)).toBeInTheDocument()

    // When user clicks the toggle again
    await userEvent.click(screen.getByRole('button', { name: /toggle search/i }))

    // Then search input is hidden
    expect(screen.queryByPlaceholderText(/search recipes/i)).not.toBeInTheDocument()
  })

  it('user can filter recipes by title', async () => {
    // Given two recipes
    await createRecipe({ name: 'Pasta Dinner' })
    await createRecipe({ name: 'Tomato Salad' })
    renderPage()

    // When user opens search and types "pasta"
    await waitFor(() => screen.getByRole('button', { name: /toggle search/i }))
    await userEvent.click(screen.getByRole('button', { name: /toggle search/i }))
    await userEvent.type(screen.getByPlaceholderText(/search recipes/i), 'pasta')

    // Then only Pasta Dinner is visible
    await waitFor(() => {
      expect(screen.getByText('Pasta Dinner')).toBeInTheDocument()
      expect(screen.queryByText('Tomato Salad')).not.toBeInTheDocument()
    })
  })

  it('user can find a recipe by item name and see the item auto-expanded', async () => {
    // Given a recipe "Salad" with item "Tomato" and a sibling item "Lettuce"
    const tomato = await makeItem('Tomato')
    const lettuce = await makeItem('Lettuce')
    await createRecipe({
      name: 'Salad',
      items: [
        { itemId: tomato.id, defaultAmount: 1 },
        { itemId: lettuce.id, defaultAmount: 1 },
      ],
    })
    renderPage()

    // When user searches "tomato"
    await waitFor(() => screen.getByRole('button', { name: /toggle search/i }))
    await userEvent.click(screen.getByRole('button', { name: /toggle search/i }))
    await userEvent.type(screen.getByPlaceholderText(/search recipes/i), 'tomato')

    // Then Salad recipe is visible and Tomato item is shown
    await waitFor(() => {
      expect(screen.getByText('Salad')).toBeInTheDocument()
      expect(screen.getByText('Tomato')).toBeInTheDocument()
    })

    // And Lettuce (sibling) is not shown
    expect(screen.queryByText('Lettuce')).not.toBeInTheDocument()
  })

  it('user sees create button when no exact recipe title match exists', async () => {
    // Given one recipe "Pasta"
    await createRecipe({ name: 'Pasta' })
    renderPage()

    // When user types "Pizza" (no exact match)
    await waitFor(() => screen.getByRole('button', { name: /toggle search/i }))
    await userEvent.click(screen.getByRole('button', { name: /toggle search/i }))
    await userEvent.type(screen.getByPlaceholderText(/search recipes/i), 'Pizza')

    // Then Create button is visible
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
    })
  })

  it('user does not see create button when exact title match exists', async () => {
    // Given one recipe "Pasta"
    await createRecipe({ name: 'Pasta' })
    renderPage()

    // When user types "pasta" (exact match, case-insensitive)
    await waitFor(() => screen.getByRole('button', { name: /toggle search/i }))
    await userEvent.click(screen.getByRole('button', { name: /toggle search/i }))
    await userEvent.type(screen.getByPlaceholderText(/search recipes/i), 'pasta')

    // Then Create button is not visible; clear button is shown instead
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /create/i })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /clear search/i })).toBeInTheDocument()
    })
  })
})
```

**Step 3: Run to confirm they fail**

```bash
pnpm test src/routes/cooking.test.tsx
```

Expected: all five new `search` tests FAIL

---

### Task 3: Add `searchQuery` state and `highlight` helper

**Files:**
- Modify: `src/routes/cooking.tsx`

**Step 1: Read the full `src/routes/cooking.tsx`** to locate state declarations and imports.

**Step 2: Add `searchQuery` state** next to `searchVisible` (from toolbar plan):

```ts
const [searchQuery, setSearchQuery] = useState('')
```

**Step 3: Add the `Input` import** at the top (check if already present):

```ts
import { Input } from '@/components/ui/input'
```

**Step 4: Add the `highlight` helper** — define it as a module-level function (outside the component, below the imports):

```tsx
function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-100 dark:bg-yellow-800 rounded-sm not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}
```

---

### Task 4: Add filter logic

**Files:**
- Modify: `src/routes/cooking.tsx`

After `sortedRecipes` is computed (around line 70), add:

```ts
const lowerQuery = searchQuery.toLowerCase().trim()

const displayRecipes = lowerQuery
  ? sortedRecipes.filter((recipe) => {
      const titleMatch = recipe.name.toLowerCase().includes(lowerQuery)
      const itemMatch = recipe.items.some((ri) => {
        const item = items.find((i) => i.id === ri.itemId)
        return item?.name.toLowerCase().includes(lowerQuery)
      })
      return titleMatch || itemMatch
    })
  : sortedRecipes

const hasExactTitleMatch = lowerQuery
  ? sortedRecipes.some((r) => r.name.toLowerCase() === lowerQuery)
  : false

// Returns the set of item IDs to show when searching (null = no search active or title-only match)
const getSearchMatchedItemIds = (recipe: (typeof recipes)[0]): Set<string> | null => {
  if (!lowerQuery) return null
  const matched = recipe.items
    .filter((ri) => {
      const item = items.find((i) => i.id === ri.itemId)
      return item?.name.toLowerCase().includes(lowerQuery)
    })
    .map((ri) => ri.itemId)
  return matched.length > 0 ? new Set(matched) : null
}
```

---

### Task 5: Add search input row UI

**Files:**
- Modify: `src/routes/cooking.tsx`

After the closing `</Toolbar>` tag, add the search input row (inside the outer `<div>`):

```tsx
{searchVisible && (
  <div className="flex items-center gap-2 border-b-2 border-accessory-default px-3">
    <Input
      placeholder="Search recipes or items..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setSearchQuery('')
          setSearchVisible(false)
        }
        if (e.key === 'Enter' && searchQuery.trim() && !hasExactTitleMatch) {
          navigate({
            to: '/settings/recipes/new',
            search: { name: searchQuery.trim() },
          })
        }
      }}
      className="border-none shadow-none bg-transparent h-auto py-2 text-sm flex-1"
      autoFocus
    />
    {searchQuery &&
      (!hasExactTitleMatch ? (
        <Button
          variant="primary"
          size="sm"
          onClick={() =>
            navigate({
              to: '/settings/recipes/new',
              search: { name: searchQuery.trim() },
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
          onClick={() => setSearchQuery('')}
        >
          <X />
        </Button>
      ))}
  </div>
)}
```

Also update the search toggle button's `onClick` to clear the query when closing:

```tsx
onClick={() => {
  if (searchVisible) setSearchQuery('')
  setSearchVisible((v) => !v)
}}
```

---

### Task 6: Update recipe render to use filtered list, highlight names, and force-expand on item match

**Files:**
- Modify: `src/routes/cooking.tsx`

**Step 1:** Replace `sortedRecipes.map(...)` with `displayRecipes.map(...)`.

**Step 2:** Inside the map, compute search-matched items and override `isExpanded`:

```ts
const searchMatchedItemIds = getSearchMatchedItemIds(recipe)
// Override isExpanded: force expand when items match the search query
const isExpanded = searchMatchedItemIds
  ? true
  : expandedRecipeIds.has(recipe.id)
```

**Step 3:** In the recipe name button, apply highlighting:

```tsx
{/* Before */}
{recipe.name}

{/* After */}
{highlight(recipe.name, searchQuery)}
```

**Step 4:** When rendering expanded items, filter to matched items only during search. Find the `[...recipe.items].sort(...)` chain and add a filter step after sorting:

```ts
// After sorting recipe.items, filter to search matches if searching
const sortedAndFilteredItems = searchMatchedItemIds
  ? sortedItems.filter((ri) => searchMatchedItemIds.has(ri.itemId))
  : sortedItems
```

Then use `sortedAndFilteredItems` in the `.map()`.

**Step 5:** In each item's `ItemCard`, apply highlighting to the item name. Check `ItemCard`'s props — if it accepts a `name` prop or renders the name internally. If `ItemCard` renders its own name (likely), wrap the item name display. Since `ItemCard` is a shared component, add a `highlightedName?: React.ReactNode` prop or pass a `nameOverride`.

**Simpler approach:** Check if ItemCard accepts children or a name-render prop. If not, apply highlighting at the `ri.itemId → item` lookup level before passing to ItemCard. Review ItemCard's interface first:

```bash
grep -n "highlightedName\|nameOverride\|children" src/components/ItemCard.tsx | head -20
```

If ItemCard has no such prop, add a `highlightedName?: React.ReactNode` prop to ItemCard and render it in place of the item name when provided.

---

### Task 7: Run tests and verify

```bash
pnpm test src/routes/cooking.test.tsx
```

Expected: all tests PASS including the five new `search` tests.

If any test fails, read the error carefully and fix only the failing assertion.

---

### Task 8: Commit

```bash
git add src/routes/cooking.tsx src/routes/cooking.test.tsx src/routes/settings/recipes/new.tsx
git commit -m "feat(cooking): add search with recipe/item filtering, highlighting, and inline create"
```
