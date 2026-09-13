import type {
  ItemStock,
  Location,
  PantryItem,
  Recipe,
  Shelf,
  ShoppingCart,
  Vendor,
} from '@/types'

// GraphQL returns dueDate/createdAt/updatedAt as ISO strings; convert to Date.
//
// The return type is `PantryItem`, not `Item`, because the cloud `Item` type
// still declares the five stock STATE fields (`apps/server/src/schema/
// item.graphql`) — they are not dropped from it until PR 5. They are a
// leftover, not a data source: since the pantry moved onto `ItemStock`, every
// read site runs this result through `stripStockFields` before joining it with
// the active location's row (`hooks/useItems.ts`), so a quantity or a due date
// only ever comes from an `ItemStock`.
export function deserializeItem(raw: Record<string, unknown>): PantryItem {
  return {
    ...raw,
    dueDate: raw.dueDate ? new Date(raw.dueDate as string) : undefined,
    createdAt: new Date(raw.createdAt as string),
    updatedAt: new Date(raw.updatedAt as string),
  } as PantryItem
}

// GraphQL declares ItemStock's createdAt/updatedAt as `String!` and dueDate as
// `String` (`apps/server/src/schema/itemStock.graphql`), all ISO — the same
// wire shape `deserializeLocation` handles, and parsed the same way, so a
// missing or epoch-millis value cannot become an Invalid Date (issue #263).
//
// `__typename` is dropped rather than spread through: the joined result is an
// `Item` shape, and `joinItemStock` spreads the row's remaining keys onto it,
// so keeping it would stamp `__typename: 'ItemStock'` onto a pantry item.
export function deserializeItemStock(raw: Record<string, unknown>): ItemStock {
  const { __typename, ...rest } = raw as Record<string, unknown> & {
    __typename?: string
  }
  void __typename
  return {
    ...rest,
    dueDate: parseWireDate(rest.dueDate),
    createdAt: parseWireDate(rest.createdAt) ?? new Date(0),
    updatedAt: parseWireDate(rest.updatedAt) ?? new Date(0),
  } as ItemStock
}

// GraphQL Vendor has no createdAt (absent from the SDL, from Prisma, and from
// every selection set); only a local backup carries one, as an ISO string. Use
// epoch as a safe fallback. See `parseWireDate` below for why an Invalid Date
// is never an acceptable outcome here.
export function deserializeVendor(raw: Record<string, unknown>): Vendor {
  return {
    ...raw,
    createdAt: parseWireDate(raw.createdAt) ?? new Date(0),
  } as Vendor
}

// GraphQL Recipe has no createdAt/updatedAt (absent from the SDL, from Prisma,
// and from every selection set); only a local backup carries them, as ISO
// strings. Use epoch as a safe fallback. `lastCookedAt` *is* in the schema and
// arrives as an ISO string.
export function deserializeRecipe(raw: Record<string, unknown>): Recipe {
  return {
    ...raw,
    createdAt: parseWireDate(raw.createdAt) ?? new Date(0),
    updatedAt: parseWireDate(raw.updatedAt) ?? new Date(0),
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
    createdAt: parseWireDate(raw.createdAt) ?? new Date(0),
    updatedAt: parseWireDate(raw.updatedAt) ?? new Date(0),
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

// GraphQL Location declares createdAt/updatedAt as `String!`
// (apps/server/src/schema/location.graphql), so both are present on the live
// wire as ISO strings. They still go through `parseWireDate` rather than
// `new Date(raw)`: a local backup or an older payload can carry a missing or
// epoch-millis value, and `new Date(undefined)` yields an *Invalid Date* whose
// NaN `getTime()` survives `??` and silently no-ops every comparator that
// touches it. That is issue #263 exactly. Epoch is the safe fallback, matching
// `deserializeShelf` / `deserializeVendor`.
export function deserializeLocation(raw: Record<string, unknown>): Location {
  return {
    ...raw,
    createdAt: parseWireDate(raw.createdAt) ?? new Date(0),
    updatedAt: parseWireDate(raw.updatedAt) ?? new Date(0),
  } as Location
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
