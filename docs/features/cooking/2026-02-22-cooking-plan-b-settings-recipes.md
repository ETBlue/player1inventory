# Cooking Feature — Plan B: Settings → Recipes Management

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Recipes section to Settings with a list page, new-recipe page, and detail page (Info tab + Items tab), mirroring the Vendors pattern.

**Architecture:** New routes under `/settings/recipes/`. `RecipeCard` and `RecipeNameForm` components mirror `VendorCard` and `VendorNameForm`. The Items tab stores recipe membership and `defaultAmount` directly on the `Recipe.items` array (not on items). Mutation goes through `useUpdateRecipe`.

**Tech Stack:** TanStack Router (file-based routes), TanStack Query, React 19, Tailwind CSS v4, shadcn/ui, Vitest + React Testing Library

**Prerequisite:** Plan A (data layer) must be complete before starting Plan B.

---

### Important: Route Tree Regeneration

TanStack Router auto-generates `src/routeTree.gen.ts` when the dev server starts. After creating new route files, regenerate the route tree before running tests:

```bash
pnpm exec tsr generate
```

If that command doesn't work, run the dev server briefly:
```bash
pnpm dev &
sleep 3
kill %1
```

Tests import from `@/routeTree.gen`, so an up-to-date route tree is required.

---

### Task 1: Create RecipeNameForm component

**Files:**
- Create: `src/components/RecipeNameForm.tsx`

**Step 1: Create the component** (mirrors `src/components/VendorNameForm.tsx` exactly, with Recipe substitutions)

```tsx
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface RecipeNameFormProps {
  name: string
  onNameChange: (name: string) => void
  onSave: () => void
  isDirty: boolean
  isPending?: boolean
}

export function RecipeNameForm({
  name,
  onNameChange,
  onSave,
  isDirty,
  isPending,
}: RecipeNameFormProps) {
  return (
    <form
      className="space-y-4 max-w-md"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="recipe-name">Name</Label>
        <Input
          id="recipe-name"
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

**Step 2: Verify build**

Run: `pnpm build 2>&1 | head -20`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/components/RecipeNameForm.tsx
git commit -m "feat(recipes): add RecipeNameForm component"
```

---

### Task 2: Create RecipeCard component

**Files:**
- Create: `src/components/RecipeCard.tsx`

**Step 1: Create the component** (mirrors `src/components/VendorCard.tsx` with Recipe-specific link)

```tsx
import { Link } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Recipe } from '@/types'

interface RecipeCardProps {
  recipe: Recipe
  itemCount?: number
  onDelete: () => void
}

export function RecipeCard({ recipe, itemCount, onDelete }: RecipeCardProps) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            to="/settings/recipes/$id"
            params={{ id: recipe.id }}
            className="font-medium hover:underline"
          >
            {recipe.name}
          </Link>
          {itemCount !== undefined && (
            <span className="text-sm text-foreground-muted">
              · {itemCount} items
            </span>
          )}
        </div>
        <Button
          variant="neutral-ghost"
          size="icon"
          className="h-8 w-8 text-destructive"
          aria-label={`Delete ${recipe.name}`}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/RecipeCard.tsx
git commit -m "feat(recipes): add RecipeCard component"
```

---

### Task 3: Add Recipes link to Settings index

**Files:**
- Modify: `src/routes/settings/index.tsx`

**Step 1: Add `UtensilsCrossed` to the lucide-react import**

Find the existing import:
```ts
import { ChevronRight, Moon, Store, Sun, Tags } from 'lucide-react'
```

Replace with:
```ts
import { ChevronRight, Moon, Store, Sun, Tags, UtensilsCrossed } from 'lucide-react'
```

**Step 2: Add the Recipes card after the Vendors card**

Find the closing of the Vendors card link block (`</Link>` after the Vendors card). After it, add:

```tsx
{/* Recipes Card */}
<Link to="/settings/recipes">
  <Card className="hover:bg-background-surface/50 transition-colors">
    <CardContent className="p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <UtensilsCrossed className="h-5 w-5 text-foreground-muted" />
        <div>
          <p className="font-medium">Recipes</p>
          <p className="text-sm text-foreground-muted">
            Manage recipes
          </p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-foreground-muted" />
    </CardContent>
  </Card>
</Link>
```

**Step 3: Commit**

```bash
git add src/routes/settings/index.tsx
git commit -m "feat(recipes): add Recipes link to Settings page"
```

---

### Task 4: Create Recipe list route

**Files:**
- Create: `src/routes/settings/recipes/index.tsx`

**Step 1: Create the directory and route file**

Note: TanStack Router uses file-based routing. Create `src/routes/settings/recipes/index.tsx`.

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { RecipeCard } from '@/components/RecipeCard'
import { Toolbar } from '@/components/Toolbar'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import {
  useDeleteRecipe,
  useItemCountByRecipe,
  useRecipes,
} from '@/hooks/useRecipes'
import type { Recipe } from '@/types'

export const Route = createFileRoute('/settings/recipes/')({
  component: RecipeSettings,
})

function RecipeSettings() {
  const navigate = useNavigate()
  const { goBack } = useAppNavigation('/settings')
  const { data: recipes = [] } = useRecipes()
  const deleteRecipe = useDeleteRecipe()

  const [recipeToDelete, setRecipeToDelete] = useState<Recipe | null>(null)

  const recipeDeleteId = recipeToDelete?.id ?? ''
  const { data: recipeItemCount = 0 } = useItemCountByRecipe(recipeDeleteId)

  const sortedRecipes = [...recipes].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  const handleConfirmDelete = () => {
    if (recipeToDelete) {
      deleteRecipe.mutate(recipeToDelete.id)
      setRecipeToDelete(null)
    }
  }

  return (
    <div className="space-y-4">
      <Toolbar className="justify-between">
        <div className="flex items-center gap-2">
          <Button variant="neutral-ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1>Recipes</h1>
        </div>
        <Button onClick={() => navigate({ to: '/settings/recipes/new' })}>
          <Plus className="h-4 w-4" />
          New Recipe
        </Button>
      </Toolbar>

      {sortedRecipes.length === 0 ? (
        <p className="text-foreground-muted text-sm">
          No recipes yet. Add your first recipe.
        </p>
      ) : (
        <div className="space-y-2">
          {sortedRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              itemCount={recipe.items.length}
              onDelete={() => setRecipeToDelete(recipe)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!recipeToDelete}
        onOpenChange={(open) => !open && setRecipeToDelete(null)}
        title={`Delete "${recipeToDelete?.name}"?`}
        description={`This will delete the recipe "${recipeToDelete?.name}" (${recipeItemCount} item${recipeItemCount === 1 ? '' : 's'}). Your inventory will not be affected.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        destructive
      />
    </div>
  )
}
```

**Step 2: Regenerate route tree**

```bash
pnpm exec tsr generate
```

**Step 3: Commit**

```bash
git add src/routes/settings/recipes/index.tsx src/routeTree.gen.ts
git commit -m "feat(recipes): add recipe list page at /settings/recipes"
```

---

### Task 5: Create New Recipe route

**Files:**
- Create: `src/routes/settings/recipes/new.tsx`

**Step 1: Create the route file** (mirrors `src/routes/settings/vendors/new.tsx`)

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { RecipeNameForm } from '@/components/RecipeNameForm'
import { Button } from '@/components/ui/button'
import { useCreateRecipe } from '@/hooks/useRecipes'

export const Route = createFileRoute('/settings/recipes/new')({
  component: NewRecipePage,
})

function NewRecipePage() {
  const navigate = useNavigate()
  const createRecipe = useCreateRecipe()
  const [name, setName] = useState('')

  const isDirty = name.trim() !== ''

  const handleSave = () => {
    if (!isDirty) return
    createRecipe.mutate(
      { name: name.trim() },
      {
        onSuccess: (recipe) => {
          navigate({
            to: '/settings/recipes/$id',
            params: { id: recipe.id },
          })
        },
      },
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="neutral-ghost"
          size="icon"
          onClick={() => navigate({ to: '/settings/recipes/' })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">New Recipe</h1>
      </div>
      <RecipeNameForm
        name={name}
        onNameChange={setName}
        onSave={handleSave}
        isDirty={isDirty}
        isPending={createRecipe.isPending}
      />
    </div>
  )
}
```

**Step 2: Regenerate route tree**

```bash
pnpm exec tsr generate
```

**Step 3: Write failing tests**

Create `src/routes/settings/recipes/new.test.tsx`:

```tsx
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

describe('New Recipe page', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.recipes.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderPage = () => {
    const history = createMemoryHistory({
      initialEntries: ['/settings/recipes/new'],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  it('user can create a recipe and is redirected to its detail page', async () => {
    // Given the new recipe page
    const router = renderPage()
    const user = userEvent.setup()

    // When user types a name and saves
    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText('Name'), 'Pasta Dinner')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the recipe is created in the database
    await waitFor(async () => {
      const recipes = await db.recipes.toArray()
      expect(recipes).toHaveLength(1)
      expect(recipes[0].name).toBe('Pasta Dinner')
    })

    // And user is redirected to recipe detail page
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/settings\/recipes\//)
      expect(router.state.location.pathname).not.toBe('/settings/recipes/new')
    })
  })

  it('save button is disabled when name is empty', async () => {
    // Given the new recipe page
    renderPage()

    // Then the Save button is disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    })
  })
})
```

**Step 4: Run tests**

```bash
pnpm test src/routes/settings/recipes/new.test.tsx 2>&1 | tail -20
```
Expected: Both tests PASS.

**Step 5: Commit**

```bash
git add src/routes/settings/recipes/new.tsx src/routes/settings/recipes/new.test.tsx src/routeTree.gen.ts
git commit -m "feat(recipes): add new recipe page at /settings/recipes/new"
```

---

### Task 6: Create Recipe detail parent layout

**Files:**
- Create: `src/routes/settings/recipes/$id.tsx`

**Step 1: Create the layout file** (mirrors `src/routes/settings/vendors/$id.tsx`)

```tsx
import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { ArrowLeft, ListTodo, Settings2 } from 'lucide-react'
import { useState } from 'react'
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
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useRecipeLayout, RecipeLayoutProvider } from '@/hooks/useRecipeLayout'
import { useRecipes } from '@/hooks/useRecipes'

export const Route = createFileRoute('/settings/recipes/$id')({
  component: RecipeDetailLayout,
})

function RecipeDetailLayoutInner() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const { data: recipes = [] } = useRecipes()
  const recipe = recipes.find((r) => r.id === id)
  const { isDirty } = useRecipeLayout()
  const { goBack } = useAppNavigation('/settings/recipes')

  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  )

  const handleTabClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    path: string,
  ) => {
    if (isDirty && router.state.location.pathname !== path) {
      e.preventDefault()
      setPendingNavigation(path)
      setShowDiscardDialog(true)
    }
  }

  const handleBackClick = () => {
    if (isDirty) {
      setPendingNavigation('BACK')
      setShowDiscardDialog(true)
    } else {
      goBack()
    }
  }

  const confirmDiscard = () => {
    if (pendingNavigation) {
      setShowDiscardDialog(false)
      if (pendingNavigation === 'BACK') {
        goBack()
      } else {
        navigate({ to: pendingNavigation })
      }
      setPendingNavigation(null)
    }
  }

  const cancelDiscard = () => {
    setShowDiscardDialog(false)
    setPendingNavigation(null)
  }

  if (!recipe) {
    return <div className="p-4">Recipe not found</div>
  }

  return (
    <>
      <div className="min-h-screen">
        {/* Fixed Top Bar */}
        <div
          className={`px-3 flex items-center gap-2
          fixed top-0 left-0 right-0 z-50
          bg-background-elevated
          border-b-2 border-accessory-default`}
        >
          <button
            type="button"
            onClick={handleBackClick}
            className="px-3 py-4 hover:bg-background-surface transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-md font-regular truncate flex-1">
            {recipe.name}
          </h1>

          {/* Tabs */}
          <div className="flex items-center">
            <Link
              to="/settings/recipes/$id"
              params={{ id }}
              activeOptions={{ exact: true }}
              className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
              activeProps={{ className: 'border-foreground-muted' }}
              onClick={(e) => handleTabClick(e, `/settings/recipes/${id}`)}
            >
              <Settings2 className="h-4 w-4" />
            </Link>
            <Link
              to="/settings/recipes/$id/items"
              params={{ id }}
              className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
              activeProps={{ className: 'border-foreground-muted' }}
              onClick={(e) =>
                handleTabClick(e, `/settings/recipes/${id}/items`)
              }
            >
              <ListTodo className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Main Content with padding to clear fixed bar */}
        <div className="pt-16 p-4">
          <Outlet key={router.state.location.pathname} />
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
            <AlertDialogCancel onClick={cancelDiscard}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function RecipeDetailLayout() {
  return (
    <RecipeLayoutProvider>
      <RecipeDetailLayoutInner />
    </RecipeLayoutProvider>
  )
}
```

**Step 2: Regenerate route tree**

```bash
pnpm exec tsr generate
```

**Step 3: Commit**

```bash
git add src/routes/settings/recipes/$id.tsx src/routeTree.gen.ts
git commit -m "feat(recipes): add recipe detail layout with tabs"
```

---

### Task 7: Create Recipe Info tab

**Files:**
- Create: `src/routes/settings/recipes/$id/index.tsx`

**Step 1: Create the route file** (mirrors `src/routes/settings/vendors/$id/index.tsx`)

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { RecipeNameForm } from '@/components/RecipeNameForm'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useRecipeLayout } from '@/hooks/useRecipeLayout'
import { useRecipes, useUpdateRecipe } from '@/hooks/useRecipes'

export const Route = createFileRoute('/settings/recipes/$id/')({
  component: RecipeInfoTab,
})

function RecipeInfoTab() {
  const { id } = Route.useParams()
  const { data: recipes = [] } = useRecipes()
  const recipe = recipes.find((r) => r.id === id)
  const updateRecipe = useUpdateRecipe()
  const { registerDirtyState } = useRecipeLayout()
  const { goBack } = useAppNavigation()

  const [name, setName] = useState('')
  const [savedAt, setSavedAt] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally sync only on id change or after save
  useEffect(() => {
    if (recipe) {
      setName(recipe.name)
    }
  }, [recipe?.id, savedAt])

  const isDirty = recipe ? name !== recipe.name : false

  useEffect(() => {
    registerDirtyState(isDirty)
  }, [isDirty, registerDirtyState])

  const handleSave = () => {
    if (!recipe || !isDirty) return
    updateRecipe.mutate(
      { id, updates: { name } },
      {
        onSuccess: () => {
          setSavedAt((n) => n + 1)
          goBack()
        },
      },
    )
  }

  if (!recipe) return null

  return (
    <RecipeNameForm
      name={name}
      onNameChange={setName}
      onSave={handleSave}
      isDirty={isDirty}
      isPending={updateRecipe.isPending}
    />
  )
}
```

**Step 2: Regenerate route tree**

```bash
pnpm exec tsr generate
```

**Step 3: Write failing tests**

Create `src/routes/settings/recipes/$id.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createRecipe } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Recipe Detail - Info Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.recipes.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    sessionStorage.clear()
  })

  const renderInfoTab = (recipeId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/settings/recipes/${recipeId}`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('user can see the recipe name in the heading', async () => {
    // Given a recipe exists
    const recipe = await createRecipe({ name: 'Pasta Dinner' })

    renderInfoTab(recipe.id)

    // Then the recipe name is shown as the page heading
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Pasta Dinner' }),
      ).toBeInTheDocument()
    })
  })

  it('user can edit the recipe name and save', async () => {
    // Given a recipe exists
    const recipe = await createRecipe({ name: 'Pasta Dinner' })

    renderInfoTab(recipe.id)
    const user = userEvent.setup()

    // When user clears the name field and types a new name
    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toBeInTheDocument()
    })
    const nameInput = screen.getByLabelText('Name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Pasta Carbonara')

    // When user clicks Save
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then the recipe name is updated in the database
    await waitFor(async () => {
      const updated = await db.recipes.get(recipe.id)
      expect(updated?.name).toBe('Pasta Carbonara')
    })
  })

  it('save button is disabled when name has not changed', async () => {
    // Given a recipe exists
    const recipe = await createRecipe({ name: 'Pasta Dinner' })

    renderInfoTab(recipe.id)

    // Then the Save button is disabled when form is clean
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    })
  })
})
```

**Step 4: Run tests**

```bash
pnpm test src/routes/settings/recipes/'$id'.test.tsx 2>&1 | tail -20
```
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/routes/settings/recipes/'$id'/index.tsx src/routes/settings/recipes/'$id'.test.tsx src/routeTree.gen.ts
git commit -m "feat(recipes): add recipe Info tab and tests"
```

---

### Task 8: Create Recipe Items tab

**Files:**
- Create: `src/routes/settings/recipes/$id/items.tsx`

The recipe Items tab differs from the vendor Items tab: it stores `{ itemId, defaultAmount }` on the recipe (not on item.vendorIds). Checked items show an editable `defaultAmount` number input.

**Step 1: Create the route file**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateItem, useItems } from '@/hooks'
import { useRecipes, useUpdateRecipe } from '@/hooks/useRecipes'

export const Route = createFileRoute('/settings/recipes/$id/items')({
  component: RecipeItemsTab,
})

function RecipeItemsTab() {
  const { id: recipeId } = Route.useParams()
  const { data: items = [] } = useItems()
  const { data: recipes = [] } = useRecipes()
  const updateRecipe = useUpdateRecipe()
  const createItem = useCreateItem()

  const recipe = recipes.find((r) => r.id === recipeId)

  const [search, setSearch] = useState('')
  const [savingItemIds, setSavingItemIds] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const getRecipeItem = (itemId: string) =>
    recipe?.items.find((ri) => ri.itemId === itemId)

  const isAssigned = (itemId: string) => !!getRecipeItem(itemId)

  const sortedItems = [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  const filteredItems = sortedItems.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )

  const handleToggle = async (itemId: string) => {
    if (!recipe || savingItemIds.has(itemId)) return

    const recipeItem = getRecipeItem(itemId)
    const item = items.find((i) => i.id === itemId)

    let newItems: typeof recipe.items
    if (recipeItem) {
      // Remove from recipe
      newItems = recipe.items.filter((ri) => ri.itemId !== itemId)
    } else {
      // Add to recipe with default amount = item.consumeAmount (fallback to 1)
      const defaultAmount = (item?.consumeAmount ?? 0) > 0 ? (item?.consumeAmount ?? 1) : 1
      newItems = [...recipe.items, { itemId, defaultAmount }]
    }

    setSavingItemIds((prev) => new Set(prev).add(itemId))
    try {
      await updateRecipe.mutateAsync({ id: recipeId, updates: { items: newItems } })
    } finally {
      setSavingItemIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const handleDefaultAmountChange = async (
    itemId: string,
    newAmount: number,
  ) => {
    if (!recipe || savingItemIds.has(itemId)) return

    const newItems = recipe.items.map((ri) =>
      ri.itemId === itemId ? { ...ri, defaultAmount: newAmount } : ri,
    )

    setSavingItemIds((prev) => new Set(prev).add(itemId))
    try {
      await updateRecipe.mutateAsync({ id: recipeId, updates: { items: newItems } })
    } finally {
      setSavingItemIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const handleCreateFromSearch = async () => {
    const trimmed = search.trim()
    if (!trimmed || !recipe) return
    try {
      const newItem = await createItem.mutateAsync({
        name: trimmed,
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 1,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })
      // Add the new item to the recipe immediately
      const newRecipeItems = [
        ...recipe.items,
        { itemId: newItem.id, defaultAmount: 1 },
      ]
      await updateRecipe.mutateAsync({
        id: recipeId,
        updates: { items: newRecipeItems },
      })
      setSearch('')
      inputRef.current?.focus()
    } catch {
      // input stays populated for retry
    }
  }

  const handleSearchKeyDown = async (e: React.KeyboardEvent) => {
    if (
      e.key === 'Enter' &&
      filteredItems.length === 0 &&
      search.trim() &&
      !createItem.isPending
    ) {
      await handleCreateFromSearch()
    }
    if (e.key === 'Escape') {
      setSearch('')
    }
  }

  if (!recipe) return null

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          placeholder="Search or create item..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
      </div>

      {items.length === 0 && !search.trim() && (
        <p className="text-sm text-foreground-muted">No items yet.</p>
      )}

      <div className="space-y-2">
        {filteredItems.map((item) => {
          const recipeItem = getRecipeItem(item.id)
          const assigned = !!recipeItem

          return (
            <div
              key={item.id}
              className="flex items-center gap-3 py-2 px-1 rounded hover:bg-background-surface transition-colors"
            >
              <Checkbox
                id={`item-${item.id}`}
                checked={assigned}
                onCheckedChange={() => handleToggle(item.id)}
                disabled={savingItemIds.has(item.id)}
              />
              <Label
                htmlFor={`item-${item.id}`}
                className="flex-1 cursor-pointer font-normal"
              >
                {item.name}
              </Label>
              {assigned && recipeItem && (
                <Input
                  type="number"
                  value={recipeItem.defaultAmount}
                  onChange={(e) =>
                    handleDefaultAmountChange(
                      item.id,
                      Number(e.target.value),
                    )
                  }
                  className="w-20 h-8 text-sm"
                  aria-label={`Default amount for ${item.name}`}
                  disabled={savingItemIds.has(item.id)}
                />
              )}
            </div>
          )
        })}
        {filteredItems.length === 0 && search.trim() && (
          <button
            type="button"
            className="flex items-center gap-2 py-2 px-1 w-full text-left rounded hover:bg-background-surface transition-colors text-foreground-muted"
            onClick={handleCreateFromSearch}
            disabled={createItem.isPending}
          >
            <Plus className="h-4 w-4" />
            Create "{search.trim()}"
          </button>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Regenerate route tree**

```bash
pnpm exec tsr generate
```

**Step 3: Write failing tests**

Create `src/routes/settings/recipes/$id/items.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { createItem, createRecipe } from '@/db/operations'
import { routeTree } from '@/routeTree.gen'

describe('Recipe Detail - Items Tab', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    await db.items.clear()
    await db.recipes.clear()
    await db.inventoryLogs.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  const renderItemsTab = (recipeId: string) => {
    const history = createMemoryHistory({
      initialEntries: [`/settings/recipes/${recipeId}/items`],
    })
    const router = createRouter({ routeTree, history })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  const makeItem = (name: string) =>
    createItem({
      name,
      targetUnit: 'package',
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
      tagIds: [],
    })

  it('user can see all items in the checklist', async () => {
    // Given a recipe and two items
    const recipe = await createRecipe({ name: 'Pasta' })
    await makeItem('Flour')
    await makeItem('Eggs')

    renderItemsTab(recipe.id)

    // Then both items appear in the list
    await waitFor(() => {
      expect(screen.getByLabelText('Flour')).toBeInTheDocument()
      expect(screen.getByLabelText('Eggs')).toBeInTheDocument()
    })
  })

  it('user can see already-assigned items as checked', async () => {
    // Given a recipe with one item already assigned
    const item = await makeItem('Flour')
    const recipe = await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })
    await makeItem('Eggs')

    renderItemsTab(recipe.id)

    // Then Flour's checkbox is checked and Eggs' is not
    await waitFor(() => {
      expect(screen.getByLabelText('Flour')).toBeChecked()
      expect(screen.getByLabelText('Eggs')).not.toBeChecked()
    })
  })

  it('user can add an item to the recipe by clicking the checkbox', async () => {
    // Given a recipe and an unassigned item
    const recipe = await createRecipe({ name: 'Pasta' })
    const item = await makeItem('Flour')

    renderItemsTab(recipe.id)
    const user = userEvent.setup()

    // When user clicks the checkbox
    await waitFor(() => {
      expect(screen.getByLabelText('Flour')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('Flour'))

    // Then the recipe now contains the item
    await waitFor(async () => {
      const updated = await db.recipes.get(recipe.id)
      expect(updated?.items.some((ri) => ri.itemId === item.id)).toBe(true)
    })
  })

  it('user can remove an item from the recipe by unchecking', async () => {
    // Given a recipe with an item assigned
    const item = await makeItem('Flour')
    const recipe = await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    renderItemsTab(recipe.id)
    const user = userEvent.setup()

    // When user unchecks the item
    await waitFor(() => {
      expect(screen.getByLabelText('Flour')).toBeChecked()
    })
    await user.click(screen.getByLabelText('Flour'))

    // Then the recipe no longer contains the item
    await waitFor(async () => {
      const updated = await db.recipes.get(recipe.id)
      expect(updated?.items.some((ri) => ri.itemId === item.id)).toBe(false)
    })
  })

  it('user can see the default amount input for assigned items', async () => {
    // Given a recipe with an item assigned
    const item = await makeItem('Flour')
    const recipe = await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 3 }],
    })

    renderItemsTab(recipe.id)

    // Then the default amount input is visible with value 3
    await waitFor(() => {
      const amountInput = screen.getByLabelText(`Default amount for Flour`)
      expect(amountInput).toBeInTheDocument()
      expect(amountInput).toHaveValue(3)
    })
  })

  it('user can change the default amount for a recipe item', async () => {
    // Given a recipe with an item assigned
    const item = await makeItem('Flour')
    const recipe = await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    renderItemsTab(recipe.id)
    const user = userEvent.setup()

    // When user changes the default amount
    await waitFor(() => {
      expect(
        screen.getByLabelText(`Default amount for Flour`),
      ).toBeInTheDocument()
    })
    const amountInput = screen.getByLabelText(`Default amount for Flour`)
    await user.clear(amountInput)
    await user.type(amountInput, '5')

    // Then the recipe's defaultAmount is updated
    await waitFor(async () => {
      const updated = await db.recipes.get(recipe.id)
      const ri = updated?.items.find((r) => r.itemId === item.id)
      expect(ri?.defaultAmount).toBe(5)
    })
  })

  it('user can create a new item by typing a name and pressing Enter', async () => {
    // Given a recipe with no items matching "Butter"
    const recipe = await createRecipe({ name: 'Omelette' })
    renderItemsTab(recipe.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/search or create/i),
      ).toBeInTheDocument()
    })

    // When user types "Butter" (zero matches) and presses Enter
    await user.type(screen.getByPlaceholderText(/search or create/i), 'Butter')
    await user.keyboard('{Enter}')

    // Then Butter appears in the list checked
    await waitFor(() => {
      expect(screen.getByLabelText('Butter')).toBeChecked()
    })

    // And Butter is in the recipe
    await waitFor(async () => {
      const items = await db.items.toArray()
      const butter = items.find((i) => i.name === 'Butter')
      expect(butter).toBeDefined()
      const updatedRecipe = await db.recipes.get(recipe.id)
      expect(updatedRecipe?.items.some((ri) => ri.itemId === butter?.id)).toBe(true)
    })
  })

  it('user can clear the search by pressing Escape', async () => {
    // Given a recipe and the search input has text
    const recipe = await createRecipe({ name: 'Pasta' })
    renderItemsTab(recipe.id)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/search or create/i),
      ).toBeInTheDocument()
    })
    await user.type(screen.getByPlaceholderText(/search or create/i), 'xyz')

    // When user presses Escape
    await user.keyboard('{Escape}')

    // Then the input is cleared
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search or create/i)).toHaveValue('')
    })
  })
})
```

**Step 4: Run tests**

```bash
pnpm test src/routes/settings/recipes/'$id'/items.test.tsx 2>&1 | tail -20
```
Expected: All tests PASS.

**Step 5: Run full test suite**

```bash
pnpm test 2>&1 | tail -10
```
Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/routes/settings/recipes/'$id'/items.tsx src/routes/settings/recipes/'$id'/items.test.tsx src/routeTree.gen.ts
git commit -m "feat(recipes): add recipe Items tab with defaultAmount editing and tests"
```

---

### Plan B Complete

Settings → Recipes is fully implemented. Proceed to Plan C (Use page + navigation).
