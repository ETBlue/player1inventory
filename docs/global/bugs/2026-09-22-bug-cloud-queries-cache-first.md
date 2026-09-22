# Bug: cloud data is stale until you open each item

- **Date:** 2026-09-22
- **Environment:** production, cloud mode, iOS home-screen app (standalone PWA)
- **Reported by:** ETBlue
- **Status:** 🔲 In progress

## Bug description

The user installed the app on an iOS home screen. In standalone mode there is no
browser reload button and no pull-to-refresh, so there is no way to ask for fresh
data.

| | |
|---|---|
| **Expected** | Opening the app shows current stock. |
| **Actual** | Stock is stale. The user has to open each item to see a current value. |

## Root cause

Twenty cloud queries run with **no `fetchPolicy`**, so they use Apollo's default
`cache-first`. The cloud Apollo cache is persisted to IndexedDB
(`Player1InventoryCloudCache`) and restored **before React mounts**
(`main.tsx` → `bootstrap.ts` → `persistence.ts`). That snapshot has no TTL and no
expiry. `cache-first` finds a complete result in it and **sends no request at all**.

`usePantryDataQuery` (`useItems.ts:260` and `:313`) is the query behind the pantry
stock display, which is what the user feels.

This is the same root cause as
[the location list bug](../../features/locations/2026-09-21-bug-location-list-stale-on-other-device.md)
(#301), fixed 2026-09-21. That doc states `useLocations` was "the **only** cloud list
hook without a fetch policy". **That is not correct.** Its table covered the
top-level list query in six files; other queries in those same files, and every query
in `useItems.ts`, were missed.

Full list of queries with no policy:

| File | Line | Query |
|---|---|---|
| `useItemSortData.ts` | 33 | `useLastPurchaseDatesQuery` |
| `useItems.ts` | 260 | `usePantryDataQuery` |
| `useItems.ts` | 313 | `usePantryDataQuery` |
| `useItems.ts` | 365 | `useGetItemQuery` |
| `useItems.ts` | 428 | `useLastPurchaseDatesQuery` |
| `useItems.ts` | 1135 | `useInventoryLogCountByItemQuery` |
| `useItems.ts` | 1162 | `useCartItemCountByItemQuery` |
| `useRecipes.ts` | 40 | `useGetRecipesQuery` |
| `useRecipes.ts` | 69 | `useGetRecipeQuery` |
| `useShoppingCart.ts` | 47 | `useCartItemsQuery` |
| `useShoppingCart.ts` | 486 | `useAllCartsQuery` |
| `useItemStocks.ts` | 50 | `useItemStocksForItemQuery` |
| `useTags.ts` | 45 | `useGetTagTypesQuery` |
| `useTags.ts` | 208 | `useGetTagsQuery` |
| `useTags.ts` | 250 | `useGetTagsByTypeQuery` |
| `useTags.ts` | 482 | `useTagCountByTypeQuery` |
| `useVendors.ts` | 33 | `useGetVendorsQuery` |
| `useShelves.ts` | 35 | `useGetShelvesQuery` |
| `useShelves.ts` | 64 | `useGetShelfQuery` |
| `routes/shopping/index.tsx` | 67 | `useAllCartItemsQuery` |

## Scope note

This fixes **a page load, not a live update**. An app already open will still not see
another device's change until something remounts. Refetch-on-resume is separate work.

## Fix applied

*TBD*

## Test added

*TBD*

## PR / commit

*TBD*
