// The inventory log rules that BOTH the web and the server need.
//
// A log row stores DATA, not text (design
// `docs/features/items/2026-11-25-inventory-log-layout-design.md`). `logKey`
// names the kind of change; `logParams` holds ids plus a name snapshot. The
// web turns a row into a label when it shows it, in the reader's language.
//
// This package has no test runner. The tests for these functions live in
// `apps/web/src/lib/inventoryLogDisplay.test.ts`, which imports them through
// `@/types`.
//
// Nothing here may import from `apps/web` or `apps/server`.

import { getPackedTotal } from './quantity'

/** A purchase. `logParams`: `{ vendorId, vendorName }`, both `null` for the no-vendor cart. */
export const PURCHASE_LOG_KEY = 'purchase'

/** A cook. `logParams`: `{ recipes: [{ id, name }] }`, maybe empty. */
export const COOKING_LOG_KEY = 'cooking'

/**
 * A manual correction of the amount (盤點). No `logParams`. Written by the
 * server's `upsertItemStock` and by local `updateItem`, only when the on-hand
 * total changed.
 */
export const STOCK_COUNT_LOG_KEY = 'stockCount'

/** `logParams` of a new purchase row. */
export type PurchaseLogParams = {
  vendorId: string | null
  vendorName: string | null
}

/** `logParams` of a new cooking row. */
export type CookingLogParams = {
  recipes: Array<{ id: string; name: string }>
}

type StockAmounts = { packedQuantity: number; unpackedQuantity: number }

/**
 * The stock count row a manual save writes, or `null` when the on-hand total
 * did not change.
 *
 * Both numbers are in PACKAGES, like a checkout row: `quantity` is the new
 * packed total (`getPackedTotal`), and `delta` is the new total minus the old
 * one. A missing old row counts as 0.
 *
 * One `amountPerPackage` for both totals, on purpose. The server reads it
 * once, after the item's configuration was saved, so a save that changes only
 * `amountPerPackage` is not a stock count. Local mode does the same.
 *
 * A difference smaller than 1e-9 counts as no change, so float noise from the
 * division in `getPackedTotal` cannot write a row of "+0".
 */
export function stockCountChange(
  before: StockAmounts | null | undefined,
  after: StockAmounts,
  amountPerPackage: number | null | undefined,
): { delta: number; quantity: number } | null {
  const total = (s: StockAmounts) =>
    getPackedTotal(
      amountPerPackage != null
        ? {
            packedQuantity: s.packedQuantity,
            unpackedQuantity: s.unpackedQuantity,
            amountPerPackage,
          }
        : { packedQuantity: s.packedQuantity, unpackedQuantity: s.unpackedQuantity },
    )
  const oldTotal = before ? total(before) : 0
  const newTotal = total(after)
  const delta = newTotal - oldTotal
  if (Math.abs(delta) < 1e-9) return null
  return { delta, quantity: newTotal }
}
