# consumeRecipes Batch Mutation — Implementation Plan

See design: `2026-06-01-consume-recipes-batch-design.md`

## Step 1 — Server: schema + resolver + codegen

### 1a. Schema (`apps/server/src/schema/recipe.graphql`)

Add after the existing `RecipeItemInput` type:

```graphql
input ConsumeRecipesItemInput {
  itemId: ID!
  packedQuantity: Float!
  unpackedQuantity: Float!
  delta: Float!
  quantity: Float!
  note: String
}

input ConsumeRecipesInput {
  occurredAt: String!
  recipeIds: [ID!]!
  items: [ConsumeRecipesItemInput!]!
}

type ConsumeRecipesItemResult {
  itemId: ID!
  success: Boolean!
  error: String
}

type ConsumeRecipesResult {
  itemResults: [ConsumeRecipesItemResult!]!
  allSucceeded: Boolean!
}
```

Add to `Mutation`:
```graphql
consumeRecipes(input: ConsumeRecipesInput!): ConsumeRecipesResult!
```

### 1b. Resolver (`apps/server/src/resolvers/recipe.resolver.ts`)

Add `consumeRecipes` to `Mutation`:

```ts
consumeRecipes: async (_, { input }, ctx) => {
  const userId = requireAuth(ctx)
  const { occurredAt, recipeIds, items } = input
  const occurredAtDate = new Date(occurredAt)

  const itemResults = []

  for (const item of items) {
    try {
      await prisma.item.updateMany({
        where: { id: item.itemId, userId },
        data: {
          packedQuantity: item.packedQuantity,
          unpackedQuantity: item.unpackedQuantity,
          updatedAt: occurredAtDate,
        },
      })
      await prisma.inventoryLog.create({
        data: {
          itemId: item.itemId,
          delta: item.delta,
          quantity: item.quantity,
          occurredAt: occurredAtDate,
          userId,
          ...(item.note ? { note: item.note } : {}),
        },
      })
      itemResults.push({ itemId: item.itemId, success: true })
    } catch (err) {
      itemResults.push({ itemId: item.itemId, success: false, error: String(err) })
    }
  }

  for (const recipeId of recipeIds) {
    try {
      await prisma.recipe.updateMany({
        where: { id: recipeId, userId },
        data: { lastCookedAt: new Date() },
      })
    } catch {
      // best-effort — ignore
    }
  }

  return {
    itemResults,
    allSucceeded: itemResults.every((r) => r.success),
  }
},
```

### 1c. Server codegen

```bash
(cd apps/server && pnpm codegen)
```

### Verification gate

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

---

## Step 2 — Client: GQL operation + codegen + local DB function

### 2a. GraphQL operation (`apps/web/src/apollo/operations/recipes.graphql`)

Add:

```graphql
mutation ConsumeRecipes($input: ConsumeRecipesInput!) {
  consumeRecipes(input: $input) {
    itemResults {
      itemId
      success
      error
    }
    allSucceeded
  }
}
```

### 2b. Client codegen

```bash
(cd apps/web && pnpm codegen)
```

### 2c. Local DB function (`apps/web/src/db/operations.ts`)

Add `consumeRecipesBatch`:

```ts
type ConsumeRecipesBatchInput = {
  occurredAt: Date
  recipeIds: string[]
  items: Array<{
    itemId: string
    packedQuantity: number
    unpackedQuantity: number
    delta: number
    quantity: number
    note?: string
  }>
}

export async function consumeRecipesBatch(
  input: ConsumeRecipesBatchInput,
): Promise<void> {
  await db.transaction('rw', [db.items, db.inventoryLogs, db.recipes], async () => {
    for (const item of input.items) {
      await db.items.update(item.itemId, {
        packedQuantity: item.packedQuantity,
        unpackedQuantity: item.unpackedQuantity,
        updatedAt: input.occurredAt,
      })
      await db.inventoryLogs.add({
        id: crypto.randomUUID(),
        itemId: item.itemId,
        delta: item.delta,
        quantity: item.quantity,
        occurredAt: input.occurredAt,
        createdAt: input.occurredAt,
        ...(item.note ? { note: item.note } : {}),
      })
    }
    for (const recipeId of input.recipeIds) {
      await db.recipes.update(recipeId, { lastCookedAt: input.occurredAt })
    }
  })
}
```

### Verification gate

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
```

---

## Step 3 — Client: hook + cooking page wire-up

### 3a. Hook (`apps/web/src/hooks/useRecipes.ts`)

Add `useConsumeRecipes` after `useUpdateRecipeLastCookedAt`:

```ts
export function useConsumeRecipes() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()
  const [cloudConsumeRecipes] = useConsumeRecipesMutation()

  return useMutation({
    mutationFn: async (input: {
      occurredAt: Date
      recipeIds: string[]
      items: Array<{
        itemId: string
        packedQuantity: number
        unpackedQuantity: number
        delta: number
        quantity: number
        note?: string
      }>
    }) => {
      if (mode === 'cloud') {
        return cloudConsumeRecipes({
          variables: {
            input: {
              occurredAt: input.occurredAt.toISOString(),
              recipeIds: input.recipeIds,
              items: input.items.map((item) => ({
                itemId: item.itemId,
                packedQuantity: item.packedQuantity,
                unpackedQuantity: item.unpackedQuantity,
                delta: item.delta,
                quantity: item.quantity,
                ...(item.note !== undefined ? { note: item.note } : {}),
              })),
            },
          },
        })
      }
      return consumeRecipesBatch(input)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}
```

### 3b. Cooking page (`apps/web/src/routes/cooking.tsx`)

Replace:
```ts
const updateItem = useUpdateItem()
const addInventoryLog = useAddInventoryLog()
const updateRecipeLastCookedAt = useUpdateRecipeLastCookedAt()
```

With:
```ts
const consumeRecipes = useConsumeRecipes()
```

Replace `handleConfirmDone` body (the item loop + recipe loop) with:

```ts
const itemInputs = Array.from(totalByItemId.entries()).flatMap(([itemId, totalAmount]) => {
  const item = items.find((i) => i.id === itemId)
  if (!item) return []
  const updatedItem = { ...item }
  consumeItem(updatedItem, totalAmount)
  const recipeNames = recipeNamesByItemId.get(itemId) ?? []
  const note = recipeNames.length > 0
    ? t('cooking.log.consumedVia', { recipes: recipeNames.join(', ') })
    : t('cooking.log.consumedViaRecipe')
  return [{
    itemId,
    packedQuantity: updatedItem.packedQuantity,
    unpackedQuantity: updatedItem.unpackedQuantity,
    delta: -totalAmount,
    quantity: getPackedTotal(updatedItem),
    note,
  }]
})

await consumeRecipes.mutateAsync({
  occurredAt: now,
  recipeIds: cookedRecipeIds,
  items: itemInputs,
})
```

### 3c. Tests (`apps/web/src/routes/cooking.test.tsx`)

Review existing tests — check that any that assert on `updateItem`, `addInventoryLog`, or `updateRecipeLastCookedAt` mock calls are updated to assert on `consumeRecipesBatch` or the cloud mutation instead.

### Verification gate (final)

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL" || echo "OK"
pnpm test:e2e --grep "cooking|a11y"
```

---

## Cleanup

After all steps pass:
- Remove `useUpdateRecipeLastCookedAt` import from `cooking.tsx` (if no longer used elsewhere in the file)
- Remove `useUpdateItem` and `useAddInventoryLog` imports from `cooking.tsx` (if no longer used)
- Verify `useUpdateItem`, `useAddInventoryLog`, and `useUpdateRecipeLastCookedAt` are still used in other parts of the app before considering removal
