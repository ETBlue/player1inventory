### Recipe Management

Recipe CRUD at `/settings/household/recipes`. Recipes group items with per-item default amounts and track `lastCookedAt` for sorting in the cooking page.

**Recipe type** (`src/types/index.ts`): `id`, `name`, `items: RecipeItem[]`, `lastCookedAt?: Date`, `createdAt`

**RecipeItem type** (`src/types/index.ts`): `itemId: string`, `defaultAmount: number`

**Operations** (`src/db/operations.ts`): `getRecipes`, `getRecipe(id)`, `createRecipe`, `updateRecipe(id, updates)`, `deleteRecipe`, `getItemCountByRecipe`

**Hooks** (`src/hooks/useRecipes.ts`): `useRecipes`, `useRecipe`, `useCreateRecipe`, `useUpdateRecipe` (takes `{ id, updates }`), `useDeleteRecipe`, `useUpdateRecipeLastCookedAt`, `useItemCountByRecipe` — all dual-mode (local: TanStack Query + Dexie; cloud: Apollo GraphQL)

**Cloud mode notes:**
- `useUpdateRecipe` sends the mutation, then awaits `refetchAfterWrite` (`apps/web/src/apollo/refetchAfterWrite.ts`) over `{ query: GetRecipesDocument }` and `{ query: GetRecipeDocument, variables: { id } }`, so the call resolves only after both lists are read again. A failed read does not reject a save that worked. Until 2026-11-18 it used `refetchQueries` + `awaitRefetchQueries: true`, which rejected the save when a read failed (`docs/global/bugs/2026-11-18-bug-failed-refetch-rejects-saved-write.md`)
- `toVars` strips `__typename` from `RecipeItem` objects before passing as `RecipeItemInput` — Apollo attaches `__typename: 'RecipeItem'` to query results but the input type doesn't accept it

**Routes**:
- `src/routes/settings/household/recipes/index.tsx` — recipe list with item counts. Its New button opens `NewRecipeDialog`, which goes to the detail page after save
- `src/routes/settings/household/recipes/$id.tsx` — tabbed layout (Info + Items)
- `src/routes/settings/household/recipes/$id/index.tsx` — Info tab: edit recipe name + delete recipe
- `src/routes/settings/household/recipes/$id/items.tsx` — Items tab: assign/unassign items with default amount control

**Components**:
- `src/components/recipe/RecipeCard/index.tsx` — displays one recipe with item count; recipe name links to detail page
- `src/components/recipe/RecipeInfoForm/index.tsx` — presentational form (name input + save button) used by new recipe page and Info tab

**Item assignment UI** (`$id/items.tsx`): Searchable checklist of all items showing current recipe assignments. Saves immediately on checkbox click (no staged state). Typing a name that matches no items reveals a `+ Create "<name>"` row — clicking it or pressing Enter creates the item inline (no dialog) and attaches it to the recipe with `defaultAmount = item.consumeAmount`. Each assigned item has a `defaultAmount` stepper (step = `item.consumeAmount`; 0 = optional ingredient).

**Only consumable items can be added** (owner decision 2026-11-26: cooking is only for consumable items). A non-consumable item stays in the list, with its checkbox disabled and the note "Not consumable. Only consumable items can be in a recipe." (`settings.recipes.items.notConsumable`) under the row. A link made before the rule (or an item switched to non-consumable later; the switch never touches links) stays checked and can be removed; its row says "Not used in cooking: this item is not consumable." (`settings.recipes.items.notUsedInCooking`). The checkbox names the note through `ItemCard`'s `controlsDescribedBy`. `handleToggle` also refuses to add one. Shown disabled, not hidden, because this list is where a person looks for the item. The same rule holds on the item page's Recipes tab (`routes/items/$id/recipes.tsx`: a note, the other recipes' badges `aria-disabled`, no New Recipe button; an assigned badge still removes), and in the pantry search tails (`RecipeDetailView`'s **Add to recipe**, and `ShelfDetailView`'s **Add to shelf** on a filter shelf with an unmet recipe axis), where the row shows `items.searchTail.notConsumable` through `blockedNote` in place of the button. No server check. Tests: the `non-consumable items` describe in `$id/items.test.tsx`, `items/$id/recipes.test.tsx`, `RecipeDetailView.test.tsx`, `ShelfDetailView.test.tsx`. Story `NonConsumableItems`.

This tab is a **global** assignment surface: rows carry `showStock={false}`, order is assigned-then-unassigned with no active/inactive split, and create-from-search calls `useCreateItem({ catalogOnly: true })` directly so the new item is stocked in no location. See `settings/CLAUDE.md` for the three rules.

**Map-shaped item counts**: `useRecipeItemCounts()` (`src/hooks/useRecipeItemCounts.ts`) returns `Map<recipeId, number>` for badge lists — used by the shelf filters tab. It counts from the **item** side rather than reading `recipe.items.length`, so `RecipeItem` entries pointing at deleted items do not inflate the count. The per-id `useItemCountByRecipe` remains for single-entity call sites (confirmation dialogs, the recipe list).

**Settings link**: the household sidebar (`src/components/global/Sidebar/HouseholdSidebar.tsx`) and the mobile `/settings` accordion (`src/routes/settings/index.tsx`), both with the `ChefHat` icon

**Dirty state**: `src/hooks/useRecipeLayout.tsx` — navigation guard on parent layout applies only to the Info tab (recipe name editing); Items tab has no unsaved state. Leaving it with edits opens `UnsavedChangesDialog` (Cancel · Discard · Save); see `routes/settings/CLAUDE.md`, *The unsaved-changes dialog on the detail pages*.

**Navigation:**

Back button and post-action navigation use smart history tracking (same pattern as item/vendor detail pages). After successful save or delete, automatically navigates back to previous page. Uses `useAppNavigation()` hook.

### What a household member sees (cloud, households H5 task F.5)

A household `member` may read the catalog but not change it. The server checks every write (`requireCatalogRole`); the page only hides what would fail. All of it reads `usePermissions()` (`src/hooks/usePermissions.ts`). Local mode is unchanged.

- **List page:** no New Recipe and no delete. A `ReadOnlyNote` above a non-empty list says "Only a household owner or manager can add or change these." (`settings.catalogReadOnly`). An empty list says the same instead of "Create your first recipe to get started!".
- **Info tab:** the name is `readOnly`, no Save, no Delete, and the note "Only a household owner or manager can change this." (`settings.catalogReadOnlyItem`).
- **Items tab:** the checkboxes and the amount buttons are disabled. They still show which items are in the recipe, and how much.
- **Cooking is not a catalog write.** Marking a recipe as cooked needs only household `member` (H5 decision O10); see `routes/CLAUDE.md`, *Cooking Page*.

- **While the role is not known** (`usePermissions().roleKnown` is `false`: `GetHousehold` is loading, or it failed with nothing cached), the write controls are hidden too, but no note shows. The note would be untrue for an owner.
- **The Info form waits for the role before it mounts** (`isLoading`). Its name field has `autoFocus={!readOnly}`, and React focuses only on mount, so a form mounted read-only while the role loads would never take the focus for an owner. If the role cannot be read, the form shows read only, with no note.
- **Search on the Items tab:** a member gets no `+ Create`, and a line under the search row says why: `items.createReadOnly` ("Only a household owner or manager can create a new item."). Same trigger as the button: a search with no exact match.
- **Tests:** `routes/settings/household/catalogReadOnly.test.tsx` (list), `catalogDetailReadOnly.test.tsx` and `catalogInfoRoleArrives.test.tsx` (Info tab), `catalogItemsReadOnly.test.tsx` (Items tab). Each role test has a member and a manager who differ only in the household role.
