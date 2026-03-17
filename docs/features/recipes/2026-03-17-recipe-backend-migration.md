# Recipe Backend Migration — Implementation Plan

**Date:** 2026-03-17
**Branch:** `feature/backend-recipes-migration`
**Design doc:** `2026-03-17-recipe-backend-migration-design.md`
**Milestone:** `v0.2.0 — Cloud Foundation`

## Steps

---

### Step 1 — Server: Recipe model, schema, resolver

**Files:**
- `apps/server/src/models/Recipe.model.ts` (new)
- `apps/server/src/schema/recipe.graphql` (new)
- `apps/server/src/resolvers/recipe.resolver.ts` (new)
- `apps/server/src/resolvers/index.ts` (register recipeResolvers)
- `apps/server/src/schema/index.ts` (register recipe.graphql)

**Recipe.model.ts** — mirrors Vendor.model.ts pattern, with embedded `RecipeItem`:
```ts
import { getModelForClass, index, modelOptions, prop } from '@typegoose/typegoose'

class RecipeItemClass {
  @prop({ required: true })
  itemId!: string

  @prop({ required: true })
  defaultAmount!: number
}

@modelOptions({ schemaOptions: { timestamps: false, collection: 'recipes' } })
@index({ userId: 1, name: 1 })
@index({ familyId: 1, name: 1 })
class RecipeClass {
  @prop({ required: true })
  name!: string

  @prop({ type: () => [RecipeItemClass], default: [] })
  items!: RecipeItemClass[]

  @prop()
  lastCookedAt?: Date

  @prop({ required: true })
  userId!: string

  @prop()
  familyId?: string

  createdAt!: Date
  updatedAt!: Date
}

export const RecipeModel = getModelForClass(RecipeClass)
```

Note: `timestamps: false` — `createdAt`/`updatedAt` are managed manually in the resolver (same as Vendor).

**recipe.graphql:**
```graphql
type RecipeItem {
  itemId: String!
  defaultAmount: Float!
}

input RecipeItemInput {
  itemId: String!
  defaultAmount: Float!
}

type Recipe {
  id: ID!
  name: String!
  items: [RecipeItem!]!
  lastCookedAt: String
  userId: String!
  familyId: String
}

extend type Query {
  recipes: [Recipe!]!
}

extend type Mutation {
  createRecipe(name: String!, items: [RecipeItemInput!]): Recipe!
  updateRecipe(id: ID!, name: String, items: [RecipeItemInput!]): Recipe!
  updateRecipeLastCookedAt(id: ID!): Recipe!
  deleteRecipe(id: ID!): Boolean!
}
```

**recipe.resolver.ts** — full CRUD:
- `recipes` — `RecipeModel.find({ $or: [{ userId }, { familyId: ctx.familyId }] })` (filter by userId or shared familyId)
- `createRecipe` — create with `userId` from context, optional `familyId`
- `updateRecipe` — `RecipeModel.findOneAndUpdate({ _id: id, userId }, ...)`
- `updateRecipeLastCookedAt` — `RecipeModel.findOneAndUpdate({ _id: id, userId }, { lastCookedAt: new Date() })`
- `deleteRecipe` — delete only; no cascade outward (items don't reference recipes)

Register in `resolvers/index.ts` and `schema/index.ts` (same pattern as vendors).

**Verification gate:**
```bash
(cd apps/server && pnpm build)
(cd apps/server && pnpm test)
```

---

### Step 2 — Server: `itemCountByRecipe` + cascade `deleteItem`

**Files:**
- `apps/server/src/schema/item.graphql` (add query)
- `apps/server/src/resolvers/item.resolver.ts` (add resolver + update deleteItem)

**item.graphql addition:**
```graphql
itemCountByRecipe(recipeId: String!): Int!
```

**item.resolver.ts — add `itemCountByRecipe`:**
```ts
itemCountByRecipe: async (_, { recipeId }, ctx) => {
  const userId = requireAuth(ctx)
  return RecipeModel.countDocuments({ userId, 'items.itemId': recipeId })
  // Note: counts recipes containing this item, not items — misnamed in local ops too.
  // Match existing local behavior: getItemCountByRecipe returns count of items in recipe.
  // Correct implementation:
  return RecipeModel.findOne({ _id: recipeId, userId }).then(r => r?.items.length ?? 0)
},
```

Wait — `getItemCountByRecipe(recipeId)` in local ops returns the count of **items in that recipe** (i.e. `recipe.items.length`), not the count of recipes containing an item. Update accordingly:

```ts
itemCountByRecipe: async (_, { recipeId }, ctx) => {
  const userId = requireAuth(ctx)
  const recipe = await RecipeModel.findOne({
    _id: recipeId,
    $or: [{ userId }, { familyId: ctx.familyId }],
  })
  return recipe?.items.length ?? 0
},
```

**item.resolver.ts — update `deleteItem` cascade:**

After deleting the item, remove it from all recipes:
```ts
// Cascade: remove itemId from all recipes
await RecipeModel.updateMany(
  { userId, 'items.itemId': id },
  { $pull: { items: { itemId: id } } }
)
```

This mirrors the local `deleteItem` behavior in `db/operations.ts`.

**Verification gate:**
```bash
(cd apps/server && pnpm build)
(cd apps/server && pnpm test)
```

---

### Step 3 — Server: Model + resolver tests

**Files:**
- `apps/server/src/models/Recipe.model.test.ts` (new)
- `apps/server/src/resolvers/recipe.resolver.test.ts` (new)
- `apps/server/src/resolvers/item.resolver.test.ts` (update)

Mirror `Vendor.model.test.ts` and `vendor.resolver.test.ts` patterns.

**Recipe.model.test.ts:**
- `user can create a recipe` — assert id, name, items, createdAt
- `recipe with items stores itemId and defaultAmount`
- `rejects a recipe without a name`

**recipe.resolver.test.ts:**
- `user can list their recipes`
- `user can create a recipe` (with and without items)
- `user can update a recipe name`
- `user can update recipe items`
- `user can mark a recipe as last cooked`
- `user can delete a recipe`
- `deleting a recipe does not affect items` (no outward cascade)
- `itemCountByRecipe returns item count for a recipe`

**item.resolver.test.ts additions:**
- `deleting an item removes it from all recipe items arrays` — create recipe with items, delete one item, assert recipe.items no longer contains that itemId

**Verification gate:**
```bash
(cd apps/server && pnpm build)
(cd apps/server && pnpm test)
```

---

### Step 4 — Frontend: Apollo operations + codegen

**Files:**
- `apps/web/src/apollo/operations/recipes.graphql` (new)
- `apps/web/src/apollo/operations/items.graphql` (add `ItemCountByRecipe`)
- Run codegen to update `apps/web/src/generated/graphql.ts`

**recipes.graphql:**
```graphql
query GetRecipes {
  recipes {
    id
    name
    items { itemId defaultAmount }
    lastCookedAt
    userId
    familyId
  }
}

query GetRecipe($id: ID!) {
  recipe(id: $id) {
    id
    name
    items { itemId defaultAmount }
    lastCookedAt
    userId
    familyId
  }
}

mutation CreateRecipe($name: String!, $items: [RecipeItemInput!]) {
  createRecipe(name: $name, items: $items) {
    id
    name
    items { itemId defaultAmount }
  }
}

mutation UpdateRecipe($id: ID!, $name: String, $items: [RecipeItemInput!]) {
  updateRecipe(id: $id, name: $name, items: $items) {
    id
    name
    items { itemId defaultAmount }
  }
}

mutation UpdateRecipeLastCookedAt($id: ID!) {
  updateRecipeLastCookedAt(id: $id) {
    id
    lastCookedAt
  }
}

mutation DeleteRecipe($id: ID!) {
  deleteRecipe(id: $id)
}
```

Add to `items.graphql`:
```graphql
query ItemCountByRecipe($recipeId: String!) {
  itemCountByRecipe(recipeId: $recipeId)
}
```

Note: `GetRecipe` requires adding a `recipe(id: ID!)` query to the server schema and resolver if not already present. Check and add if needed.

**Run codegen:**
```bash
(cd apps/web && pnpm codegen)
```

**Verification gate:**
```bash
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK"
```

---

### Step 5 — Frontend: Dual-mode `useRecipes.ts` hooks

**Files:**
- `apps/web/src/hooks/useRecipes.ts` (update)

Extend each hook to branch on `useDataMode()` — identical pattern to `useVendors.ts`.

**useRecipes():**
```ts
export function useRecipes() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['recipes'],
    queryFn: getRecipes,
    enabled: !isCloud,
  })

  const cloud = useGetRecipesQuery({ skip: !isCloud })

  if (isCloud) {
    return { data: cloud.data?.recipes, isLoading: cloud.loading, isError: !!cloud.error }
  }
  return { data: local.data, isLoading: local.isPending, isError: local.isError }
}
```

**useCreateRecipe():**
```ts
export function useCreateRecipe() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: (input: { name: string; items?: RecipeItem[] }) => createRecipe(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] }),
  })

  const [cloudCreate] = useCreateRecipeMutation({
    refetchQueries: [{ query: GetRecipesDocument }],
  })

  if (mode === 'cloud') {
    return {
      mutate: (input: { name: string; items?: RecipeItemInput[] }) =>
        cloudCreate({ variables: input }),
      mutateAsync: (input: { name: string; items?: RecipeItemInput[] }) =>
        cloudCreate({ variables: input }).then(r => r.data?.createRecipe),
      isPending: false,
    }
  }
  return localMutation
}
```

Apply the same dual-mode pattern to all remaining hooks:
- `useRecipe(id)` — local: TanStack Query + `getRecipe`; cloud: `useGetRecipeQuery`
- `useUpdateRecipe()` — local: useMutation; cloud: `useUpdateRecipeMutation`
- `useDeleteRecipe()` — local: useMutation; cloud: `useDeleteRecipeMutation`
- `useUpdateRecipeLastCookedAt()` — local: useMutation; cloud: `useUpdateRecipeLastCookedAtMutation`
- `useItemCountByRecipe(id)` — local: TanStack Query; cloud: `useItemCountByRecipeQuery`

**Verification gate:**
```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK"
```

---

### Step 6 — Frontend: Hook tests + E2E cloud tests

**Files:**
- `apps/web/src/hooks/useRecipes.test.ts` (update — add cloud path tests)
- `e2e/tests/settings/recipes.spec.ts` (update — add cloud mode tests)
- `e2e/tests/cooking.spec.ts` (update — add cloud mode tests)

**useRecipes.test.ts** — add cloud path tests for all 7 hooks, mirroring `useVendors.test.ts` structure. Mock Apollo client responses. Verify local paths still pass.

**recipes.spec.ts cloud tests:**
- `user can create a recipe in cloud mode`
- `user can rename a recipe in cloud mode`
- `user can delete a recipe in cloud mode`
- `deleting an item removes it from recipe in cloud mode` (cascade)
- `itemCountByRecipe displays correct count in cloud mode`

**cooking.spec.ts cloud tests:**
- `user can view recipes in cloud mode`
- `user can mark recipe as last cooked in cloud mode` (calls `updateRecipeLastCookedAt`)

**Final verification gate (full quality gate):**
```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK"
pnpm test:e2e --grep "recipes|cooking"
```

---

## Commit Plan

| Commit | Files |
|--------|-------|
| `feat(recipes): add Typegoose model, GraphQL schema, and resolver` | Recipe.model.ts, recipe.graphql, recipe.resolver.ts, index registrations |
| `feat(recipes): add itemCountByRecipe query and cascade deleteItem in item resolver` | item.graphql, item.resolver.ts |
| `test(recipes): add server-side model and resolver tests` | Recipe.model.test.ts, recipe.resolver.test.ts, item.resolver.test.ts (cascade test) |
| `feat(recipes): add Apollo operations and run codegen` | recipes.graphql, items.graphql, generated/ |
| `feat(recipes): add dual-mode useRecipes hooks` | useRecipes.ts |
| `test(recipes): add cloud path hook tests and E2E recipe + cooking cloud tests` | useRecipes.test.ts, recipes.spec.ts, cooking.spec.ts |
