import type { PantryItem, Recipe, Shelf, ShoppingCart, Vendor } from '@/types'

// GraphQL returns dueDate/createdAt/updatedAt as ISO strings; convert to Date.
// The cloud Item still carries stock/unit/expiration fields (ItemStock is
// local-only for now — cloud TODO), so the deserialized value is a PantryItem.
export function deserializeItem(raw: Record<string, unknown>): PantryItem {
  return {
    ...raw,
    dueDate: raw.dueDate ? new Date(raw.dueDate as string) : undefined,
    createdAt: new Date(raw.createdAt as string),
    updatedAt: new Date(raw.updatedAt as string),
  } as PantryItem
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

// `Cart.lastPurchasedAt` has reached the client in two wire formats. ISO 8601 is
// the intended one, restored by the server's `Cart` type resolver. Between
// Jun 10 2026 (when that type resolver was dropped) and its restoration, the raw
// Prisma `Date` sat in the schema's `String` slot and graphql-js serialized it
// via `Date.prototype.valueOf()` — shipping epoch millis as a digit-string
// ("1787827334343"). `new Date()` parses ISO but yields an *Invalid Date* for
// the digit form, so parse that form explicitly.
//
// This matters beyond the live wire: every cloud backup exported in that window
// still stores the digit-string, and `importData` re-reads them.
//
// An unparseable value yields `undefined` rather than an Invalid Date — an
// Invalid Date's NaN `getTime()` is not caught by `?? 0`, so it silently turns
// every comparator that touches it into a no-op (which is exactly how the
// shopping page's "last purchased" sort stopped sorting).
export function parseWireDate(raw: unknown): Date | undefined {
  if (raw == null) return undefined
  const date =
    raw instanceof Date
      ? raw
      : typeof raw === 'number'
        ? new Date(raw)
        : /^-?\d+$/.test(String(raw))
          ? new Date(Number(raw))
          : new Date(String(raw))
  return Number.isNaN(date.getTime()) ? undefined : date
}

// Converts lastPurchasedAt to a Date, tolerating both wire formats. See
// `parseWireDate` above.
export function deserializeCart(raw: Record<string, unknown>): ShoppingCart {
  return {
    ...raw,
    lastPurchasedAt: parseWireDate(raw.lastPurchasedAt),
  } as ShoppingCart
}
