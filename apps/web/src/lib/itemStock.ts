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
export const STOCK_FIELD_KEYS: (keyof StockFields)[] = [
  'targetQuantity',
  'refillThreshold',
  'packedQuantity',
  'unpackedQuantity',
  'dueDate',
]

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
