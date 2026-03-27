### Recipe Management

Recipe CRUD at `/settings/recipes`. Recipes group items with per-item default amounts and track `lastCookedAt` for sorting in the cooking page.

**Recipe type** (`src/types/index.ts`): `id`, `name`, `items: RecipeItem[]`, `lastCookedAt?: Date`, `createdAt`

**RecipeItem type** (`src/types/index.ts`): `itemId: string`, `defaultAmount: number`

**Operations** (`src/db/operations.ts`): `getRecipes`, `getRecipe(id)`, `createRecipe`, `updateRecipe(id, updates)`, `deleteRecipe`, `getItemCountByRecipe`

**Hooks** (`src/hooks/useRecipes.ts`): `useRecipes`, `useRecipe`, `useCreateRecipe`, `useUpdateRecipe` (takes `{ id, updates }`), `useDeleteRecipe`, `useUpdateRecipeLastCookedAt`, `useItemCountByRecipe` — all dual-mode (local: TanStack Query + Dexie; cloud: Apollo GraphQL)

**Cloud mode notes:**
- `useUpdateRecipe` uses `refetchQueries: [GetRecipesDocument, GetRecipeDocument]` + `awaitRefetchQueries: true` to ensure UI is consistent after saves
- `toVars` strips `__typename` from `RecipeItem` objects before passing as `RecipeItemInput` — Apollo attaches `__typename: 'RecipeItem'` to query results but the input type doesn't accept it

**Routes**:
- `src/routes/settings/recipes/index.tsx` — recipe list with item counts
- `src/routes/settings/recipes/new.tsx` — create new recipe, redirects to detail page after save
- `src/routes/settings/recipes/$id.tsx` — tabbed layout (Info + Items)
- `src/routes/settings/recipes/$id/index.tsx` — Info tab: edit recipe name + delete recipe
- `src/routes/settings/recipes/$id/items.tsx` — Items tab: assign/unassign items with default amount control

**Components**:
- `src/components/recipe/RecipeCard/index.tsx` — displays one recipe with item count; recipe name links to detail page
- `src/components/recipe/RecipeInfoForm/index.tsx` — presentational form (name input + save button) used by new recipe page and Info tab

**Item assignment UI** (`$id/items.tsx`): Searchable checklist of all items showing current recipe assignments. Saves immediately on checkbox click (no staged state). Typing a name that matches no items reveals a `+ Create "<name>"` row. Each assigned item has a `defaultAmount` stepper (step = `item.consumeAmount`; 0 = optional ingredient).

**Settings link**: `src/routes/settings/index.tsx` (UtensilsCrossed icon)

**Dirty state**: `src/hooks/useRecipeLayout.tsx` — navigation guard on parent layout applies only to the Info tab (recipe name editing); Items tab has no unsaved state.

**Navigation:**

Back button and post-action navigation use smart history tracking (same pattern as item/vendor detail pages). After successful save or delete, automatically navigates back to previous page. Uses `useAppNavigation()` hook.
