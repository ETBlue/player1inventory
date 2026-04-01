import type { Item, Recipe, ShoppingCart, Vendor } from '@/types'

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
