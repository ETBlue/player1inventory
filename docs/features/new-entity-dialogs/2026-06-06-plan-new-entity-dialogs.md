# Implementation Plan: New Entity Dialogs

**Date:** 2026-06-06
**Branch:** `feature/new-entity-dialogs`
**Status:** 🔲 Pending

## Goal

Replace the three "new entity" pages (`/items/new`, `/settings/vendors/new`, `/settings/recipes/new`) with dialogs. All trigger points (buttons, search "Create" actions) open a dialog instead of navigating to a separate page. The existing routes are kept as fallbacks with a comment.

## Component APIs

```ts
// NewItemDialog — name + package unit
interface NewItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName?: string          // pre-fill name from search term
  onSuccess?: (item: Item) => void  // called after creation; used by items tabs for entity assignment
}

// NewVendorDialog — name only
interface NewVendorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (vendor: Vendor) => void
}

// NewRecipeDialog — name only
interface NewRecipeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName?: string          // pre-fill from cooking search
  onSuccess?: (recipe: Recipe) => void
}
```

Post-creation default behavior (when `onSuccess` is not provided): navigate to the new entity's detail page.

## Implementation Steps

### Step 1 — NewVendorDialog (TDD)

**Why first:** Simplest form (name only), establishes the pattern.

Create:
- `src/components/vendor/NewVendorDialog/NewVendorDialog.test.tsx` — failing tests first:
  - Renders dialog with name input when `open=true`
  - Calls `onOpenChange(false)` on cancel
  - Calls `onSuccess(vendor)` after creation when provided
  - Navigates to vendor detail page after creation when `onSuccess` not provided
- `src/components/vendor/NewVendorDialog/NewVendorDialog.tsx`
- `src/components/vendor/NewVendorDialog/index.ts`
- `src/components/vendor/NewVendorDialog/NewVendorDialog.stories.tsx` + smoke test

Use `VendorInfoForm` inside a `Dialog` shell with `DialogHeader`, `DialogMain`, `DialogFooter`. Use `useCreateVendor` hook. On success: call `onSuccess(vendor)` if provided, else `navigate({ to: '/settings/vendors/$id', params: { id: vendor.id } })`.

Update `src/routes/settings/vendors/index.tsx`:
- Add `NewVendorDialog` state + render
- Replace `navigate({ to: '/settings/vendors/new' })` with `setOpen(true)`

Add fallback comment to `src/routes/settings/vendors/new.tsx`.

### Step 2 — NewRecipeDialog (TDD)

Same pattern as NewVendorDialog. Use `RecipeInfoForm` inside dialog. Add `initialName` prop to pre-fill the name field.

Create dialog component + tests + stories.

Update:
- `src/routes/settings/recipes/index.tsx` — replace navigate with dialog
- `src/components/recipe/CookingControlBar/CookingControlBar.tsx` — replace `navigate` call with `onCreateRecipe?(name) => void` prop
- `src/routes/cooking.tsx` — add `NewRecipeDialog` state; pass `onCreateRecipe` to `CookingControlBar`; replace empty state `<Link>` with dialog trigger

Add fallback comment to `src/routes/settings/recipes/new.tsx`.

### Step 3 — NewItemDialog (TDD)

More complex: name + package unit fields. Follow `AddShelfDialog` pattern (local state per field, reset on close). Do NOT reuse `ItemForm` — too heavy for a dialog.

Fields:
- **Name** — text input, required, `capitalize` class
- **Package unit** — text input, optional (matches current `new.tsx` behavior)

Create dialog component + tests + stories.

Update:
- `src/routes/index.tsx` (pantry) — add `NewItemDialog` state; replace both `<Link to="/items/new">` occurrences (toolbar button + empty state)
- `src/routes/settings/tags/$id/items.tsx` — change `handleCreateFromSearch` to open `NewItemDialog`; `onSuccess` assigns item to tag
- `src/routes/settings/vendors/$id/items.tsx` — same; `onSuccess` assigns item to vendor
- `src/routes/settings/recipes/$id/items.tsx` — same; `onSuccess` adds item to recipe with `defaultAmount`

Add fallback comment to `src/routes/items/new.tsx`.

### Step 4 — Quality gate

```bash
(cd apps/web && pnpm lint)
(cd apps/web && pnpm build) 2>&1 | tee /tmp/p1i-build3.log
(cd apps/web && pnpm build-storybook)
(cd apps/web && pnpm check)
grep 'TS6385' /tmp/p1i-build3.log && echo "FAIL" || echo "OK"
pnpm test:e2e --grep "items|vendors|recipes|cooking|tags|a11y"
```

### Step 5 — Update docs and CLAUDE.md

- `src/components/CLAUDE.md` — add `NewItemDialog`, `NewVendorDialog`, `NewRecipeDialog` entries
- `docs/INDEX.md` — add this feature as ✅ Done
- Update `docs/features/new-entity-dialogs/2026-06-06-plan-new-entity-dialogs.md` status to ✅

## Files Created

- `src/components/vendor/NewVendorDialog/NewVendorDialog.tsx`
- `src/components/vendor/NewVendorDialog/index.ts`
- `src/components/vendor/NewVendorDialog/NewVendorDialog.test.tsx`
- `src/components/vendor/NewVendorDialog/NewVendorDialog.stories.tsx`
- `src/components/vendor/NewVendorDialog/NewVendorDialog.stories.test.tsx`
- `src/components/recipe/NewRecipeDialog/NewRecipeDialog.tsx`
- `src/components/recipe/NewRecipeDialog/index.ts`
- `src/components/recipe/NewRecipeDialog/NewRecipeDialog.test.tsx`
- `src/components/recipe/NewRecipeDialog/NewRecipeDialog.stories.tsx`
- `src/components/recipe/NewRecipeDialog/NewRecipeDialog.stories.test.tsx`
- `src/components/item/NewItemDialog/NewItemDialog.tsx`
- `src/components/item/NewItemDialog/index.ts`
- `src/components/item/NewItemDialog/NewItemDialog.test.tsx`
- `src/components/item/NewItemDialog/NewItemDialog.stories.tsx`
- `src/components/item/NewItemDialog/NewItemDialog.stories.test.tsx`

## Files Modified

- `src/routes/settings/vendors/index.tsx`
- `src/routes/settings/vendors/new.tsx` (fallback comment)
- `src/routes/settings/recipes/index.tsx`
- `src/routes/settings/recipes/new.tsx` (fallback comment)
- `src/components/recipe/CookingControlBar/CookingControlBar.tsx` (add `onCreateRecipe` prop)
- `src/routes/cooking.tsx`
- `src/routes/index.tsx`
- `src/routes/items/new.tsx` (fallback comment)
- `src/routes/settings/tags/$id/items.tsx`
- `src/routes/settings/vendors/$id/items.tsx`
- `src/routes/settings/recipes/$id/items.tsx`
- `src/components/CLAUDE.md`
- `docs/INDEX.md`

## Commit plan

1. `feat(vendors): add NewVendorDialog; replace /settings/vendors/new navigation`
2. `feat(recipes): add NewRecipeDialog; replace /settings/recipes/new navigation and cooking create`
3. `feat(items): add NewItemDialog; replace /items/new navigation and items-tab inline creation`
4. `docs: update CLAUDE.md and INDEX for new entity dialogs`

## Notes

- `VendorInfoForm` and `RecipeInfoForm` own their internal state — pass `onSave` and `isPending` props only
- `NewItemDialog` uses local `useState` for name + packageUnit (not a form library) — keep it simple
- Items tabs: `onSuccess` for tag tab does `updateItem` to add tagId; for recipe tab uses the existing `addItemToRecipe` mutation
- `CookingControlBar` stories may need updating after the `onCreateRecipe` prop is added
- The cooking empty state `<Link>` does not pre-fill a name — dialog opens with empty name
