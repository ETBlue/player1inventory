import type { Item, Recipe, Shelf, ShoppingCart, Vendor } from '@/types'

// GraphQL returns dueDate/createdAt/updatedAt as ISO strings; convert to Date.
export function deserializeItem(raw: Record<string, unknown>): Item {
  return {
    ...raw,
    dueDate: raw.dueDate ? new Date(raw.dueDate as string) : undefined,
    createdAt: new Date(raw.createdAt as string),
    updatedAt: new Date(raw.updatedAt as string),
  } as Item
}

// GraphQL returns createdAt as ISO string; convert to Date.
export function deserializeVendor(raw: Record<string, unknown>): Vendor {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt as string),
  } as Vendor
}

// GraphQL returns createdAt/updatedAt/lastCookedAt as ISO strings; convert to Date.
export function deserializeRecipe(raw: Record<string, unknown>): Recipe {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt as string),
    updatedAt: new Date(raw.updatedAt as string),
    lastCookedAt: raw.lastCookedAt
      ? new Date(raw.lastCookedAt as string)
      : undefined,
  } as Recipe
}

// GraphQL Shelf has no createdAt/updatedAt; use epoch as a safe fallback.
// GraphQL may return null for filterConfig array fields when no filters are set;
// normalize nulls to empty arrays so callers can safely call .length / .includes.
export function deserializeShelf(raw: Record<string, unknown>): Shelf {
  const filterConfig = raw.filterConfig as
    | {
        tagIds: string[] | null
        vendorIds: string[] | null
        recipeIds: string[] | null
      }
    | undefined
    | null

  return {
    ...raw,
    createdAt: raw.createdAt ? new Date(raw.createdAt as string) : new Date(0),
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt as string) : new Date(0),
    ...(filterConfig != null && {
      filterConfig: {
        ...filterConfig,
        tagIds: filterConfig.tagIds ?? [],
        vendorIds: filterConfig.vendorIds ?? [],
        recipeIds: filterConfig.recipeIds ?? [],
      },
    }),
  } as Shelf
}

// GraphQL returns createdAt/completedAt as ISO strings; convert to Date.
export function deserializeCart(raw: Record<string, unknown>): ShoppingCart {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt as string),
    completedAt: raw.completedAt
      ? new Date(raw.completedAt as string)
      : undefined,
  } as ShoppingCart
}
