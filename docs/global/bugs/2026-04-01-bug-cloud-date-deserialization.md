# Bug: Cloud Date Deserialization Missing in Recipe, ShoppingCart, Vendor Hooks

**Date:** 2026-04-01
**Branch:** fix/cloud-date-deserialization

## Bug Description

When the app is in cloud mode (GraphQL), sorting recipes by last cooked time crashes with:

```
TypeError: a.lastCookedAt.getTime is not a function
```

The crash occurs because GraphQL returns date fields as ISO strings, but `useRecipes.ts` casts the response directly `as Recipe[]` without converting string values to `Date` objects. The sort code at `cooking.tsx:106` calls `.getTime()` expecting a `Date`.

## Root Cause

Three cloud hooks cast GraphQL responses without deserializing date string fields to `Date` objects:

| Hook | File | Raw cast line(s) | Affected date fields |
|------|------|-----------------|----------------------|
| `useRecipes.ts` | `apps/web/src/hooks/useRecipes.ts` | 39, 69 | `createdAt`, `updatedAt`, `lastCookedAt?` |
| `useShoppingCart.ts` | `apps/web/src/hooks/useShoppingCart.ts` | 40 | `createdAt`, `completedAt?` |
| `useVendors.ts` | `apps/web/src/hooks/useVendors.ts` | 34 | `createdAt` |

The pattern was already established correctly in `useItems.ts` (`deserializeCloudItem()`) and `useInventoryLogs.ts`, but not replicated to the other hooks.

## Fix Applied

Added `deserializeCloudRecipe()`, `deserializeCloudCart()`, and `deserializeCloudVendor()` helper functions in each respective hook, following the existing `deserializeCloudItem()` pattern from `useItems.ts`. Each helper converts required date fields with `new Date(value)` and optional fields with `value ? new Date(value) : undefined`. Applied via `.map()` for collections and direct call for single-entity queries.

## Test Added

- `useRecipes.test.ts` — 2 tests: `useRecipes` and `useRecipe` return ISO strings as `Date` instances
- `useShoppingCart.test.ts` — 1 test: `useActiveCart` returns ISO strings as `Date` instances  
- `useVendors.test.ts` — 1 test: `useVendors` returns ISO strings as `Date` instances

All written red-first (TDD).

## PR / Commit

- Commit: `967ce20` — `fix(hooks): deserialize ISO date strings to Date objects in cloud mode`
- PR: *TBD*
