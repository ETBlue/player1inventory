# Cooking Feature — Plan A: Data Layer

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Recipe and RecipeItem types, Dexie schema migration, DB operations, TanStack Query hooks, and cascade deletion into deleteItem.

**Architecture:** New `recipes` Dexie table (schema v4). `Recipe` stores items inline as `RecipeItem[]`. Cascade: `deleteItem` removes the item from all recipe item lists. All patterns mirror the existing vendor implementation.

**Tech Stack:** Dexie.js (IndexedDB), TanStack Query, TypeScript strict, Vitest

---

### Task 1: Add Recipe and RecipeItem types

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Add the types**

Open `src/types/index.ts` and append after the `Vendor` interface at the bottom:

```ts
export interface RecipeItem {
  itemId: string
  defaultAmount: number // in item's native unit (measurement or package)
}

export interface Recipe {
  id: string
  name: string
  items: RecipeItem[]
  createdAt: Date
  updatedAt: Date
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm build 2>&1 | head -20`
Expected: No type errors related to new types.

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(recipes): add Recipe and RecipeItem types"
```

---

### Task 2: Add recipes table — Dexie schema v4

**Files:**
- Modify: `src/db/index.ts`

**Step 1: Read the current file**

Read `src/db/index.ts` to confirm current schema version is 3 and the `vendors` table was added in v3.

**Step 2: Add Recipe import and v4 schema**

In `src/db/index.ts`, add `Recipe` to the import and extend the Dexie instance and add version 4:

```ts
import Dexie, { type EntityTable } from 'dexie'
import type {
  CartItem,
  InventoryLog,
  Item,
  Recipe,
  ShoppingCart,
  Tag,
  TagType,
  Vendor,
} from '@/types'

const db = new Dexie('Player1Inventory') as Dexie & {
  items: EntityTable<Item, 'id'>
  tags: EntityTable<Tag, 'id'>
  tagTypes: EntityTable<TagType, 'id'>
  inventoryLogs: EntityTable<InventoryLog, 'id'>
  shoppingCarts: EntityTable<ShoppingCart, 'id'>
  cartItems: EntityTable<CartItem, 'id'>
  vendors: EntityTable<Vendor, 'id'>
  recipes: EntityTable<Recipe, 'id'>
}
```

Then add version 4 at the bottom (after the existing `db.version(3)` block):

```ts
// Version 4: Add recipes table
db.version(4).stores({
  items: 'id, name, targetUnit, createdAt, updatedAt',
  tags: 'id, name, typeId',
  tagTypes: 'id, name',
  inventoryLogs: 'id, itemId, occurredAt, createdAt',
  shoppingCarts: 'id, status, createdAt, completedAt',
  cartItems: 'id, cartId, itemId',
  vendors: 'id, name',
  recipes: 'id, name',
})
```

**Step 3: Verify build**

Run: `pnpm build 2>&1 | head -20`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/db/index.ts
git commit -m "feat(recipes): add recipes table (Dexie schema v4)"
```

---

### Task 3: Write failing tests for Recipe DB operations

**Files:**
- Modify: `src/db/operations.test.ts`

**Step 1: Add Recipe operations import block (at the top of the test file)**

The test file imports from `./operations`. Add these to the import list (they don't exist yet — the tests will fail until Task 4 implements them):

```ts
import {
  // ... existing imports ...
  createRecipe,
  deleteRecipe,
  getItemCountByRecipe,
  getRecipe,
  getRecipes,
  updateRecipe,
} from './operations'
```

**Step 2: Add a new describe block at the bottom of the test file**

```ts
describe('Recipe operations', () => {
  beforeEach(async () => {
    await db.recipes.clear()
    await db.items.clear()
  })

  it('user can create a recipe', async () => {
    // Given a recipe name
    // When creating the recipe
    const recipe = await createRecipe({ name: 'Pasta Dinner' })

    // Then the recipe is stored with id and timestamps
    expect(recipe.id).toBeDefined()
    expect(recipe.name).toBe('Pasta Dinner')
    expect(recipe.items).toEqual([])
    expect(recipe.createdAt).toBeInstanceOf(Date)
    expect(recipe.updatedAt).toBeInstanceOf(Date)
  })

  it('user can create a recipe with initial items', async () => {
    // Given a recipe with items
    const recipe = await createRecipe({
      name: 'Omelette',
      items: [{ itemId: 'item-1', defaultAmount: 2 }],
    })

    // Then items are stored
    expect(recipe.items).toHaveLength(1)
    expect(recipe.items[0].itemId).toBe('item-1')
    expect(recipe.items[0].defaultAmount).toBe(2)
  })

  it('user can retrieve a recipe by id', async () => {
    // Given a recipe exists
    const created = await createRecipe({ name: 'Salad' })

    // When retrieving by id
    const retrieved = await getRecipe(created.id)

    // Then the recipe is returned
    expect(retrieved?.name).toBe('Salad')
  })

  it('user can list all recipes', async () => {
    // Given two recipes exist
    await createRecipe({ name: 'Pasta Dinner' })
    await createRecipe({ name: 'Omelette' })

    // When listing recipes
    const recipes = await getRecipes()

    // Then both are returned
    expect(recipes).toHaveLength(2)
  })

  it('user can update a recipe name', async () => {
    // Given a recipe exists
    const recipe = await createRecipe({ name: 'Pasta' })

    // When updating the name
    await updateRecipe(recipe.id, { name: 'Pasta Carbonara' })

    // Then the name is updated
    const updated = await getRecipe(recipe.id)
    expect(updated?.name).toBe('Pasta Carbonara')
  })

  it('user can update recipe items', async () => {
    // Given a recipe exists
    const recipe = await createRecipe({ name: 'Pasta' })

    // When updating the items
    const newItems = [{ itemId: 'item-1', defaultAmount: 3 }]
    await updateRecipe(recipe.id, { items: newItems })

    // Then items are updated
    const updated = await getRecipe(recipe.id)
    expect(updated?.items).toEqual(newItems)
  })

  it('user can delete a recipe', async () => {
    // Given a recipe exists
    const recipe = await createRecipe({ name: 'Pasta' })

    // When deleting the recipe
    await deleteRecipe(recipe.id)

    // Then the recipe is gone
    const retrieved = await getRecipe(recipe.id)
    expect(retrieved).toBeUndefined()
  })

  it('getItemCountByRecipe returns number of items in recipe', async () => {
    // Given a recipe with 2 items
    const recipe = await createRecipe({
      name: 'Pasta',
      items: [
        { itemId: 'item-1', defaultAmount: 1 },
        { itemId: 'item-2', defaultAmount: 2 },
      ],
    })

    // When getting item count
    const count = await getItemCountByRecipe(recipe.id)

    // Then count is 2
    expect(count).toBe(2)
  })

  it('deleteItem removes item from recipe items arrays', async () => {
    // Given an item exists
    const item = await createItem({
      name: 'Flour',
      targetUnit: 'package',
      tagIds: [],
      targetQuantity: 1,
      refillThreshold: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
      consumeAmount: 1,
    })

    // And a recipe contains that item
    const recipe = await createRecipe({
      name: 'Pasta',
      items: [{ itemId: item.id, defaultAmount: 2 }],
    })

    // When the item is deleted
    await deleteItem(item.id)

    // Then the recipe no longer contains the item
    const updated = await getRecipe(recipe.id)
    expect(updated?.items).toEqual([])
  })
})
```

**Step 3: Run tests to verify they fail**

Run: `pnpm test src/db/operations.test.ts 2>&1 | tail -20`
Expected: FAIL — "createRecipe is not a function" or similar import errors.

---

### Task 4: Implement Recipe DB operations

**Files:**
- Modify: `src/db/operations.ts`

**Step 1: Add Recipe import to operations.ts**

In `src/db/operations.ts`, add `Recipe` and `RecipeItem` to the types import:

```ts
import type {
  CartItem,
  InventoryLog,
  Item,
  Recipe,
  RecipeItem,
  ShoppingCart,
  Tag,
  TagType,
  Vendor,
} from '@/types'
```

**Step 2: Add Recipe operations at the bottom of operations.ts**

```ts
// Recipe operations

export async function getRecipes(): Promise<Recipe[]> {
  return db.recipes.toArray()
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  return db.recipes.get(id)
}

export async function createRecipe(input: {
  name: string
  items?: RecipeItem[]
}): Promise<Recipe> {
  const now = new Date()
  const recipe: Recipe = {
    id: crypto.randomUUID(),
    name: input.name,
    items: input.items ?? [],
    createdAt: now,
    updatedAt: now,
  }
  await db.recipes.add(recipe)
  return recipe
}

export async function updateRecipe(
  id: string,
  updates: Partial<Omit<Recipe, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.recipes.update(id, { ...updates, updatedAt: new Date() })
}

export async function deleteRecipe(id: string): Promise<void> {
  await db.recipes.delete(id)
}

export async function getItemCountByRecipe(recipeId: string): Promise<number> {
  const recipe = await db.recipes.get(recipeId)
  return recipe?.items.length ?? 0
}
```

**Step 3: Update deleteItem to cascade into recipes**

Find the existing `deleteItem` function (currently at line 43–45):

```ts
export async function deleteItem(id: string): Promise<void> {
  await db.items.delete(id)
}
```

Replace it with:

```ts
export async function deleteItem(id: string): Promise<void> {
  // Cascade: remove item from all recipes
  const recipes = await db.recipes
    .filter((recipe) => recipe.items.some((ri) => ri.itemId === id))
    .toArray()
  const now = new Date()
  for (const recipe of recipes) {
    await db.recipes.update(recipe.id, {
      items: recipe.items.filter((ri) => ri.itemId !== id),
      updatedAt: now,
    })
  }
  await db.items.delete(id)
}
```

**Step 4: Run tests**

Run: `pnpm test src/db/operations.test.ts 2>&1 | tail -20`
Expected: All Recipe operation tests PASS. All existing tests still PASS.

**Step 5: Commit**

```bash
git add src/db/operations.ts
git commit -m "feat(recipes): add Recipe CRUD operations and deleteItem cascade"
```

---

### Task 5: Write failing tests for Recipe hooks

**Files:**
- Create: `src/hooks/useRecipes.test.ts`

Note: Hook tests require a React render context. This project tests hooks indirectly through route integration tests (see Plan B/C). Skip unit tests for hooks — the DB operation tests above cover the data layer, and route tests in Plans B and C cover hook behavior end-to-end.

This task is intentionally skipped. The hooks in Task 6 follow the same proven pattern as `useVendors.ts` which is already well-tested via integration tests.

---

### Task 6: Implement Recipe hooks

**Files:**
- Create: `src/hooks/useRecipes.ts`

**Step 1: Create the hooks file**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createRecipe,
  deleteRecipe,
  getItemCountByRecipe,
  getRecipe,
  getRecipes,
  updateRecipe,
} from '@/db/operations'
import type { Recipe, RecipeItem } from '@/types'

export function useRecipes() {
  return useQuery({
    queryKey: ['recipes'],
    queryFn: getRecipes,
  })
}

export function useRecipe(id: string) {
  return useQuery({
    queryKey: ['recipes', id],
    queryFn: () => getRecipe(id),
    enabled: !!id,
  })
}

export function useCreateRecipe() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { name: string; items?: RecipeItem[] }) =>
      createRecipe(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string
      updates: Partial<Omit<Recipe, 'id' | 'createdAt'>>
    }) => updateRecipe(id, updates),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      queryClient.invalidateQueries({ queryKey: ['recipes', id] })
    },
  })
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteRecipe,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

export function useItemCountByRecipe(recipeId: string) {
  return useQuery({
    queryKey: ['recipes', 'itemCount', recipeId],
    queryFn: () => getItemCountByRecipe(recipeId),
    enabled: !!recipeId,
  })
}
```

**Step 2: Update useDeleteItem to also invalidate recipes**

Open `src/hooks/useItems.ts` (or wherever `useDeleteItem` is defined — search for `useDeleteItem`).

Find the `useDeleteItem` mutation and add `recipes` invalidation to `onSuccess`:

```ts
export function useDeleteItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['recipes'] }) // cascade invalidation
    },
  })
}
```

**Step 3: Verify build**

Run: `pnpm build 2>&1 | head -20`
Expected: No type errors.

**Step 4: Run all tests**

Run: `pnpm test 2>&1 | tail -20`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/hooks/useRecipes.ts src/hooks/useItems.ts
git commit -m "feat(recipes): add useRecipes hooks and invalidate recipes on item delete"
```

---

### Task 7: Create useRecipeLayout context hook

**Files:**
- Create: `src/hooks/useRecipeLayout.tsx`

**Step 1: Create the file** (exact copy of `useVendorLayout.tsx` with Vendor → Recipe substitution)

```tsx
import { createContext, useCallback, useContext, useState } from 'react'

interface RecipeLayoutContextValue {
  isDirty: boolean
  registerDirtyState: (dirty: boolean) => void
}

const RecipeLayoutContext = createContext<RecipeLayoutContextValue | null>(null)

export function RecipeLayoutProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [isDirty, setIsDirty] = useState(false)

  const registerDirtyState = useCallback((dirty: boolean) => {
    setIsDirty(dirty)
  }, [])

  return (
    <RecipeLayoutContext.Provider value={{ isDirty, registerDirtyState }}>
      {children}
    </RecipeLayoutContext.Provider>
  )
}

export function useRecipeLayout() {
  const context = useContext(RecipeLayoutContext)
  if (!context) {
    throw new Error(
      'useRecipeLayout must be used within RecipeLayoutProvider',
    )
  }
  return context
}
```

**Step 2: Verify build**

Run: `pnpm build 2>&1 | head -20`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/hooks/useRecipeLayout.tsx
git commit -m "feat(recipes): add useRecipeLayout dirty state context"
```

---

### Plan A Complete

Run the full test suite to confirm everything passes:

```bash
pnpm test 2>&1 | tail -10
```

Expected: All tests pass. Proceed to Plan B (Recipe management in Settings).
