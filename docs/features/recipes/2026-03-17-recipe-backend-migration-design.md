# Recipe Backend Migration — Design

**Date:** 2026-03-17
**Branch:** `feature/backend-recipes-migration`
**Brainstorming:** `2026-03-17-brainstorming-recipe-backend-migration.md`

## Goal

Add cloud (GraphQL/MongoDB) support for recipes so the cooking and settings/recipes pages work in cloud mode. Follows the vendor migration pattern (PR #118) exactly.

## Data Model

### Recipe (MongoDB / Typegoose)

```ts
interface RecipeItem {
  itemId: string        // plain string — same as local mode
  defaultAmount: number
}

interface Recipe {
  id: string            // MongoDB _id
  name: string
  items: RecipeItem[]   // embedded array
  lastCookedAt?: Date   // user-specific or family-specific (see below)
  userId: string        // required — individual ownership
  familyId?: string     // optional — family group sharing
  createdAt: Date
  updatedAt: Date
}
```

### `lastCookedAt` scoping

- No `familyId` → document owned by one user → `lastCookedAt` is user-specific
- `familyId` set → document shared by family members → `lastCookedAt` reflects when any family member last cooked it (last-write-wins)

No extra logic needed; scoping falls naturally from document ownership.

## GraphQL Schema

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
  lastCookedAt: String        # ISO 8601, nullable
  userId: String!
  familyId: String
}

extend type Query {
  recipes: [Recipe!]!
}

extend type Query {
  itemCountByRecipe(recipeId: String!): Int!
}

extend type Mutation {
  createRecipe(name: String!, items: [RecipeItemInput!]): Recipe!
  updateRecipe(id: ID!, name: String, items: [RecipeItemInput!]): Recipe!
  updateRecipeLastCookedAt(id: ID!): Recipe!
  deleteRecipe(id: ID!): Boolean!
}
```

`itemCountByRecipe` lives in `item.graphql` / `item.resolver.ts` — consistent with `itemCountByVendor`.

## Cascade Deletion

### deleteRecipe (recipe resolver)

No outward cascade — items do not reference recipes by ID.

### deleteItem (item resolver) — **updated in this PR**

When an item is deleted in cloud mode, remove it from all recipes:
```ts
await RecipeModel.updateMany(
  { userId, 'items.itemId': id },
  { $pull: { items: { itemId: id } } }
)
```

## Frontend Dual-Mode Hooks

Each hook in `useRecipes.ts` branches on `useDataMode()`:

| Hook | Local | Cloud |
|------|-------|-------|
| `useRecipes()` | TanStack Query + `getRecipes` | `useGetRecipesQuery` |
| `useRecipe(id)` | TanStack Query + `getRecipe` | `useGetRecipeQuery` |
| `useCreateRecipe()` | useMutation | `useCreateRecipeMutation` |
| `useUpdateRecipe()` | useMutation | `useUpdateRecipeMutation` |
| `useDeleteRecipe()` | useMutation | `useDeleteRecipeMutation` |
| `useUpdateRecipeLastCookedAt()` | useMutation | `useUpdateRecipeLastCookedAtMutation` |
| `useItemCountByRecipe(id)` | TanStack Query | `useItemCountByRecipeQuery` |

## File Inventory

### Server (new/modified)

| File | Change |
|------|--------|
| `apps/server/src/models/Recipe.model.ts` | New |
| `apps/server/src/schema/recipe.graphql` | New |
| `apps/server/src/resolvers/recipe.resolver.ts` | New |
| `apps/server/src/resolvers/index.ts` | Register recipeResolvers |
| `apps/server/src/schema/index.ts` | Register recipe.graphql |
| `apps/server/src/schema/item.graphql` | Add `itemCountByRecipe` |
| `apps/server/src/resolvers/item.resolver.ts` | Add `itemCountByRecipe` + cascade in `deleteItem` |
| `apps/server/src/models/Recipe.model.test.ts` | New |
| `apps/server/src/resolvers/recipe.resolver.test.ts` | New |
| `apps/server/src/resolvers/item.resolver.test.ts` | Update — add cascade and count tests |

### Frontend (new/modified)

| File | Change |
|------|--------|
| `apps/web/src/apollo/operations/recipes.graphql` | New |
| `apps/web/src/apollo/operations/items.graphql` | Add `ItemCountByRecipe` |
| `apps/web/src/generated/graphql.ts` | Regenerated |
| `apps/web/src/hooks/useRecipes.ts` | Update — add dual-mode branching |
| `apps/web/src/hooks/useRecipes.test.ts` | Update — add cloud path tests |
| `e2e/tests/settings/recipes.spec.ts` | New — cloud mode E2E |
| `e2e/tests/cooking.spec.ts` | Update — cloud mode E2E |

## Milestone

`v0.2.0 — Cloud Foundation`
