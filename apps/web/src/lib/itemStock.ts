import type { Item, ItemStock, PantryItem, StockFields } from '@/types'

// ── ItemStock helpers ──────────────────────────────────────────────────────
//
// Pure functions over plain objects — no Dexie, no Apollo. They live here
// rather than in `db/operations.ts` so the cloud path can call the *same* join
// local mode calls instead of a parallel implementation. `db/operations.ts`
// re-exports `stripStockFields` and `joinItemStock`, so local call sites are
// unchanged.

// The default stock state used when an item has no ItemStock in the requested
// location (so a joined PantryItem still reads sensible zeroed values).
export const ZERO_STOCK: StockFields = {
  targetQuantity: 0,
  refillThreshold: 0,
  packedQuantity: 0,
  unpackedQuantity: 0,
}

// Every field `joinItemStock` copies from an ItemStock onto an Item. The eight
// configuration fields are deliberately absent — they are the Item's own.
//
// **`as const satisfies` is required, not stylistic.** `satisfies` rejects a key
// that is not in `StockFields`; `as const` keeps the literal tuple so the
// exhaustiveness check below can read the keys back out. The former annotation,
// `: (keyof StockFields)[]`, widened the element type to `keyof StockFields`
// and made any exhaustiveness check vacuous — `Exclude<K, K>` is `never`
// whatever the array holds, so a sixth `StockFields` field missing from this
// list compiled clean and then leaked into `updateItem` / `toConfigInput`.
export const STOCK_FIELD_KEYS = [
  'targetQuantity',
  'refillThreshold',
  'packedQuantity',
  'unpackedQuantity',
  'dueDate',
] as const satisfies readonly (keyof StockFields)[]

// Type-level exhaustiveness check — zero runtime cost, no emitted code.
//
// `MissingStockFieldKey` is `never` only while STOCK_FIELD_KEYS lists every key
// of `StockFields`. Add a sixth field to `StockFields` without adding it here
// and `tsc` fails on the line below, naming the key:
//   Type '"newField"' does not satisfy the constraint 'never'.
type MissingStockFieldKey = Exclude<
  keyof StockFields,
  (typeof STOCK_FIELD_KEYS)[number]
>
type AssertNever<T extends never> = T

// Exported only because `noUnusedLocals` is on: as a local alias `tsc` reports
// `TS6196: declared but never used` and the check is deleted as dead. Nothing
// imports this, and it emits no JavaScript.
export type StockFieldKeysAreExhaustive = AssertNever<MissingStockFieldKey>

// Pull just the stock fields off an object (drops join keys / metadata / undefined).
export function pickStockFields(source: Record<string, unknown>): StockFields {
  const out: StockFields = { ...ZERO_STOCK }
  const keys = STOCK_FIELD_KEYS
  for (const key of keys) {
    const value = source[key]
    if (value !== undefined) {
      // biome-ignore lint/suspicious/noExplicitAny: assigning across the union of stock field types
      ;(out as any)[key] = value
    }
  }
  return out
}

// Reduce an already-joined PantryItem back to its global Item.
//
// One caller since cloud locations PR 5: `withLocationStock` in
// `routes/items/$id/stock.tsx`, the Stock tab's all-locations pager, which
// re-joins an item that `useItem` already joined with the ACTIVE location. It
// is needed in BOTH modes — the input is a joined `PantryItem`, not a raw
// catalog row, so this has nothing to do with the cloud `Item`'s old state
// columns. PR 5 deleted the three cloud-only call sites in `hooks/useItems.ts`
// that existed only to undo those columns.
//
// Re-joining a PantryItem with a DIFFERENT location's row without this is a
// data-correctness bug, not a tidiness one: an ItemStock omits its unset
// optional keys entirely (see ZERO_STOCK / pickStockFields), so spreading the
// second row over the first join leaves the FIRST location's `dueDate` showing
// through — and a form fed that shape saves one location's expiry into
// another location's row. (Before v16 the same trap covered the unit and
// expiration-config keys too; those are global now and are meant to survive.)
export function stripStockFields(item: PantryItem): Item {
  // Typed as Partial<PantryItem> so the deletes type-check (every key being
  // removed is optional there) and the result still converts to Item.
  const out: Partial<PantryItem> = { ...item }
  for (const key of STOCK_FIELD_KEYS) delete out[key]
  delete out.stockId
  delete out.locationId
  return out as Item
}

// Join an Item with a stock row into the runtime PantryItem shape.
export function joinItemStock(
  item: Item,
  stock: ItemStock | undefined,
  locationId: string,
): PantryItem {
  if (!stock) {
    return { ...item, ...ZERO_STOCK, locationId }
  }
  const { id, itemId, createdAt, updatedAt, ...stockFields } = stock
  void itemId
  void createdAt
  void updatedAt
  return { ...item, ...stockFields, stockId: id, locationId: stock.locationId }
}
