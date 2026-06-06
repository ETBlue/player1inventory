# Brainstorming: New Entity Dialogs

**Date:** 2026-06-06
**Topic:** Replace "new entity" pages with dialogs

---

## Questions & Answers

**Q: Which "new" pages are in scope?**
A: All three — `/items/new`, `/settings/vendors/new`, `/settings/recipes/new`.

**Q: What fields does each dialog show?**
A: Item dialog shows name + package unit. Vendor and recipe dialogs show name only.

**Q: Where do the "New X" buttons live, and do they move?**
A: Same locations — just replace navigate behavior with opening a dialog. No button moves.

**Q: What about the cooking page "Create" button (search → navigate to /settings/recipes/new)?**
A: Becomes a NewRecipeDialog with the search term pre-filled as the name.

**Q: What about item creation from search in tag/vendor/recipe items tabs?**
A: These already create items inline (no navigation). User wants them to open a NewItemDialog pre-filled with the search term instead, so the user can also set package unit.

**Q: What happens after creation?**
A: Navigate to the new entity's detail page — same as current behavior.

**Q: What happens to the existing `/items/new`, `/settings/vendors/new`, `/settings/recipes/new` routes?**
A: Kept as fallbacks. Add a comment in each file noting that users won't reach these pages through normal app navigation.

---

## Final Decisions

### New components
- **`NewItemDialog`** (`src/components/item/NewItemDialog/`) — name + package unit fields; props: `open`, `onOpenChange`, `initialName?`, `onSuccess?(item)`
- **`NewVendorDialog`** (`src/components/vendor/NewVendorDialog/`) — name only; props: `open`, `onOpenChange`, `onSuccess?(vendor)`
- **`NewRecipeDialog`** (`src/components/recipe/NewRecipeDialog/`) — name only; props: `open`, `onOpenChange`, `initialName?`, `onSuccess?(recipe)`

### Trigger point changes
| Location | Before | After |
|----------|--------|-------|
| Pantry toolbar "Add" button | `<Link to="/items/new">` | opens `NewItemDialog` |
| Pantry empty state button | `<Link to="/items/new">` | opens `NewItemDialog` |
| Vendor list "New Vendor" button | `navigate('/settings/vendors/new')` | opens `NewVendorDialog` |
| Recipe list "New Recipe" button | `navigate('/settings/recipes/new')` | opens `NewRecipeDialog` |
| Cooking "Create" button (search) | `navigate('/settings/recipes/new', { name })` | opens `NewRecipeDialog` with `initialName` |
| Cooking empty state button | `<Link to="/settings/recipes/new">` | opens `NewRecipeDialog` |
| Tag items tab "Create" (search) | inline `createItem.mutateAsync` | opens `NewItemDialog` with `initialName`; `onSuccess` assigns item to tag |
| Vendor items tab "Create" (search) | inline `createItem.mutateAsync` | opens `NewItemDialog` with `initialName`; `onSuccess` assigns item to vendor |
| Recipe items tab "Create" (search) | inline `createItem.mutateAsync` | opens `NewItemDialog` with `initialName`; `onSuccess` adds item to recipe |

### CookingControlBar approach
`CookingControlBar` currently calls `navigate` internally. Replace with an `onCreateRecipe?(name: string) => void` prop. `cooking.tsx` receives the callback and manages the `NewRecipeDialog` state.

### Items tab approach
`onCreateFromSearch` handler in each items tab changes from directly calling `createItem.mutateAsync` to opening `NewItemDialog` with `initialName`. `onSuccess` in the dialog callback handles the entity assignment.
