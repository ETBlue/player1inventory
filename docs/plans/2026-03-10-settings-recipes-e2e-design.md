# Settings Recipes E2E Test Design

## Overview

Add end-to-end tests for the full recipe management flow: recipes list page (`/settings/recipes`), new recipe page (`/settings/recipes/new`), and recipe detail page (`/settings/recipes/$id` — Info + Items tabs).

## File Structure

```
e2e/
  pages/
    settings/
      RecipesPage.ts       # New: recipes list + new recipe page object
      RecipeDetailPage.ts  # New: recipe detail page object (/settings/recipes/$id)
  tests/
    settings/
      recipes.spec.ts      # New: all recipes e2e tests
```

Mirrors the structure established by `settings/tags.spec.ts`.

## Page Objects

### `RecipesPage.ts`

Methods for `/settings/recipes` and `/settings/recipes/new`:

```ts
navigateTo()                  // goto /settings/recipes
clickNewRecipe()              // click "New Recipe" button in toolbar (src/routes/settings/recipes/index.tsx:33)
fillRecipeName(name)          // fill name input on new-recipe page (RecipeNameForm)
clickSave()                   // click Save button on new-recipe page
getRecipeCard(name)           // locator: recipe card by name
clickDeleteRecipe(name)       // click delete button on a RecipeCard
confirmDelete()               // click "Delete" in AlertDialog (confirmLabel defaults to 'Delete')
```

### `RecipeDetailPage.ts`

Methods for `/settings/recipes/$id`:

```ts
navigateTo(id)                // goto /settings/recipes/${id}
navigateToItems(id)           // goto /settings/recipes/${id}/items
fillName(name)                // fill name input on Info tab
clickSave()                   // click Save button on Info tab
getItemCheckbox(name)         // locator: aria-label="Add ${name}" (unchecked)
getAssignedItemCheckbox(name) // locator: aria-label="Remove ${name}" (checked)
toggleItem(name)              // click whichever checkbox is currently visible
getDefaultAmountDisplay(name) // locator: the amount number shown for an assigned item
clickIncreaseAmount(name)     // click + button for item's default amount
clickDecreaseAmount(name)     // click − button for item's default amount
```

## Test Scenarios

Seven tests in `e2e/tests/settings/recipes.spec.ts`:

### Recipes List Page

1. **`user can create a recipe`**
   - Given: recipes list is empty
   - When: click "New Recipe", fill "Pancakes", save
   - Then: "Pancakes" card appears in the recipes list

2. **`user can navigate to recipe detail after creating`**
   - Given: recipes list is empty
   - When: click "New Recipe", fill "Pancakes", save
   - Then: URL is `/settings/recipes/<id>` (detail page, not list)

3. **`user can delete a recipe`**
   - Given: recipe "Pancakes" seeded via IndexedDB
   - When: click delete button on "Pancakes" card, confirm
   - Then: "Pancakes" card is gone

### Recipe Detail — Info Tab

4. **`user can edit recipe name on Info tab`**
   - Given: recipe "Pancakes" seeded via IndexedDB
   - When: navigate to detail, change name to "Waffles", save
   - Then: re-navigate to detail — name input shows "Waffles"

### Recipe Detail — Items Tab

5. **`user can assign and unassign an item`**
   - Given: recipe + item "Eggs" seeded (unassigned)
   - When: navigate to Items tab, check "Eggs" checkbox
   - Then: "Remove Eggs" checkbox visible (assigned)
   - When: uncheck "Eggs"
   - Then: "Add Eggs" checkbox visible (unassigned)

6. **`user can adjust default amount for an assigned item`**
   - Given: recipe + item "Flour" seeded with Flour assigned (`defaultAmount: 2`)
   - When: navigate to Items tab, click + on Flour
   - Then: amount display shows 3 (or increases by consumeAmount step)
   - When: click − twice
   - Then: amount display shows 1

## Setup Strategy

- Tests 1–2: UI-driven (testing the new-recipe creation page flow)
- Tests 3–6: `page.evaluate()` IndexedDB seeding — navigate to `/` first so Dexie initialises the schema

### IndexedDB Schema for Recipes

```ts
// Recipe record
{
  id: string,
  name: string,
  items: { itemId: string, defaultAmount: number }[],
  createdAt: Date,
  updatedAt: Date,
}
```

The relationship is recipe-centric: `Recipe.items[]` stores `{ itemId, defaultAmount }`. Unlike tags, toggling an item updates the recipe, not the item.

## Key Selectors

- **"New Recipe" button:** `getByRole('button', { name: /new recipe/i })` (`src/routes/settings/recipes/index.tsx:33`)
- **Recipe name input:** `getByLabel('Name')` via `RecipeNameForm` label (`src/components/recipe/RecipeNameForm/index.tsx`)
- **Save button:** `getByRole('button', { name: 'Save' })`
- **Recipe card:** `getByText(name)` scoped to a card, or link/heading containing the name
- **Delete button on card:** `getByRole('button', { name: \`Delete ${name}\` })` or similar
- **Delete confirm:** `getByRole('button', { name: 'Delete' })` (DeleteButton default `confirmLabel`)
- **Item checkbox (unchecked):** `getByLabel(\`Add ${itemName}\`)` (`src/components/item/ItemCard/index.tsx:143`)
- **Item checkbox (checked):** `getByLabel(\`Remove ${itemName}\`)`
- **Default amount ± buttons:** locate the ItemCard for the item, find `+`/`−` buttons within it

## Teardown

All tests share the same `afterEach` teardown (clear IndexedDB + localStorage + sessionStorage), matching the pattern in `shopping.spec.ts`, `cooking.spec.ts`, and `settings/tags.spec.ts`.
