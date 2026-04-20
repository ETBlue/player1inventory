# Bug: Cloud-mode shelf creation crashes on null filterConfig fields

## Bug description
In cloud mode, creating a shelf on settings/shelves page causes a crash:
`TypeError: can't access property "length", vendorIds is null`
in `matchesFilterConfig` (`shelfUtils.ts:45`) called from `getItemCount` (`settings/shelves/index.tsx:212`).

## Root cause
GraphQL returns `filterConfig: { tagIds: null, vendorIds: null, recipeIds: null }` for shelves created without a filter config. JavaScript destructuring defaults (`= []`) only apply when the value is `undefined`, not `null`, so `vendorIds` remains `null` and `.length` throws.

`deserializeShelf` spreads the raw GraphQL response without normalizing null array fields to empty arrays.

## Fix applied
In `deserializeShelf` (`apps/web/src/lib/deserialization.ts`), extract `filterConfig` from the raw response before building the return value. When `filterConfig` is present (non-null), spread it back with each array field coerced via `?? []` so nulls become empty arrays. Undefined `filterConfig` (local-mode shelves) is untouched.

## Test added
Three new cases in `apps/web/src/lib/deserialization.test.ts` under `describe('deserializeShelf')`:
1. `normalizes null filterConfig array fields to empty arrays` — raw shelf with all three fields null; expects `[]` for each.
2. `preserves non-null filterConfig array fields unchanged` — raw shelf with real arrays; expects pass-through.
3. `uses epoch as fallback when createdAt/updatedAt are absent` — guards the existing date-fallback behaviour.

## PR/commit
Commit `8811062` on branch `feature/shelf-cloud`.
