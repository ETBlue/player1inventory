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

**Item assignment UI** (`$id/items.tsx`): Searchable checklist of all items showing current recipe assignments. Saves immediately on checkbox click (no staged state). Typing a name that matches no items reveals a `+ Create "<name>"` row — clicking it or pressing Enter creates the item inline (no dialog) and attaches it to the recipe with `defaultAmount = item.consumeAmount`. Each assigned item has a `defaultAmount` stepper (step = `item.consumeAmount`; 0 = optional ingredient).

This tab is a **global** assignment surface: rows carry `showStock={false}`, order is assigned-then-unassigned with no active/inactive split, and create-from-search calls `useCreateItem({ catalogOnly: true })` directly so the new item is stocked in no location. See `settings/CLAUDE.md` for the three rules.

**Map-shaped item counts**: `useRecipeItemCounts()` (`src/hooks/useRecipeItemCounts.ts`) returns `Map<recipeId, number>` for badge lists — used by the shelf filters tab. It counts from the **item** side rather than reading `recipe.items.length`, so `RecipeItem` entries pointing at deleted items do not inflate the count. The per-id `useItemCountByRecipe` remains for single-entity call sites (confirmation dialogs, the recipe list).

**Settings link**: `src/routes/settings/index.tsx` (UtensilsCrossed icon)

**Dirty state**: `src/hooks/useRecipeLayout.tsx` — navigation guard on parent layout applies only to the Info tab (recipe name editing); Items tab has no unsaved state.

**Navigation:**

Back button and post-action navigation use smart history tracking (same pattern as item/vendor detail pages). After successful save or delete, automatically navigates back to previous page. Uses `useAppNavigation()` hook.
