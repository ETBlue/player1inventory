# consumeRecipes Batch Mutation — Design

## Problem

When the user confirms cooking done for multiple recipes, `handleConfirmDone` in `cooking.tsx` fires one `updateItem` + one `addInventoryLog` mutation per unique item, plus one `updateRecipeLastCookedAt` per recipe. For N items across M recipes this is 2N + M sequential HTTP requests — visible latency.

## Solution

Replace the per-item sequential mutations with a single `consumeRecipes` GraphQL mutation that handles all item updates, inventory logs, and `lastCookedAt` stamps in one round-trip.

## Design Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Input shape | Client-computed explicit amounts | Client already computes `packedQuantity`, `unpackedQuantity`, `delta`, `quantity` (packed total), and `note`. Server just writes what it receives — no server-side ingredient lookups. |
| Failure behavior | Best-effort (partial success ok) | Matches current per-mutation behavior. Items and logs are retried per-entry; recipe `lastCookedAt` failures are silently ignored. |
| Local (IndexedDB) mode | Batched via Dexie transaction | Wraps all writes in one `db.transaction('rw', ...)` call for consistency. Effectively atomic locally (IndexedDB transactions), which is fine since local failures are rare. |

## API Shape

```graphql
# Input
input ConsumeRecipesItemInput {
  itemId: ID!
  packedQuantity: Float!
  unpackedQuantity: Float!
  delta: Float!          # negative (consumption)
  quantity: Float!       # post-consumption packed total (for log)
  note: String
}

input ConsumeRecipesInput {
  occurredAt: String!            # ISO timestamp shared across all logs
  recipeIds: [ID!]!             # recipes to stamp lastCookedAt on
  items: [ConsumeRecipesItemInput!]!  # pre-deduplicated by client
}

# Result
type ConsumeRecipesItemResult {
  itemId: ID!
  success: Boolean!
  error: String
}

type ConsumeRecipesResult {
  itemResults: [ConsumeRecipesItemResult!]!
  allSucceeded: Boolean!
}

# Mutation
consumeRecipes(input: ConsumeRecipesInput!): ConsumeRecipesResult!
```

## Client Data Flow

`handleConfirmDone` currently builds two data structures the batch hook can use directly:

- `totalByItemId: Map<itemId, totalAmount>` — unique items with pre-summed amounts
- `recipeNamesByItemId: Map<itemId, string[]>` — note strings (already translated)
- `cookedRecipeIds: string[]` — recipes with at least one checked item

The new `useConsumeRecipes` hook accepts:
```ts
{
  occurredAt: Date
  recipeIds: string[]
  items: Array<{
    itemId: string
    packedQuantity: number
    unpackedQuantity: number
    delta: number
    quantity: number  // post-consumption packed total
    note?: string
  }>
}
```

## Files Changed

| File | Change |
|------|--------|
| `apps/server/src/schema/recipe.graphql` | New input types + `consumeRecipes` mutation |
| `apps/server/src/resolvers/recipe.resolver.ts` | `consumeRecipes` resolver |
| `apps/web/src/apollo/operations/recipes.graphql` | `ConsumeRecipes` GQL operation |
| `apps/web/src/db/operations.ts` | `consumeRecipesBatch` local function |
| `apps/web/src/hooks/useRecipes.ts` | `useConsumeRecipes` dual-mode hook |
| `apps/web/src/routes/cooking.tsx` | Replace 3 hooks with `useConsumeRecipes` in `handleConfirmDone` |
| `apps/web/src/routes/cooking.test.tsx` | Tests covering batch path |
