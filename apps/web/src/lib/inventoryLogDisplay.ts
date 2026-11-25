// How the item Log tab shows one inventory log row (design
// `docs/features/items/2026-11-25-inventory-log-layout-design.md`).
//
// Row 1: sign, amount and unit, then the label of the kind; on the right, the
// quantity after the change. Row 2: date, weekday and time.
//
// A row stores DATA, not text. This module is the ONE mapping from a stored
// row to what the reader sees. It reads three row shapes:
//
// | Shape | `logKey` | `logParams` |
// |---|---|---|
// | new | `purchase`, `cooking`, `stockCount` | ids plus a name snapshot |
// | old (before 2026-11-25) | `shopping.log.purchasedAt`, `cooking.log.consumedVia`, `cooking.log.consumedViaRecipe` | plain names, `{ vendor }` or `{ recipes }` as one string |
// | oldest | none | none; only `note`, a sentence translated when it was written |

import type { TFunction } from 'i18next'
import { LANGUAGE_LOCALE, type Language } from '@/lib/language'
import {
  COOKING_LOG_KEY,
  DEFAULT_PACKAGE_UNIT,
  type InventoryLog,
  type Item,
  PURCHASE_LOG_KEY,
  STOCK_COUNT_LOG_KEY,
} from '@/types'

/** The kind of change a row records, or `null` when the row does not say. */
export type LogKind = 'purchase' | 'cooking' | 'stockCount'

// The i18n key paths older rows stored as `logKey`.
const OLD_PURCHASE_KEY = 'shopping.log.purchasedAt'
const OLD_COOKING_KEY = 'cooking.log.consumedVia'
const OLD_COOKING_NO_RECIPE_KEY = 'cooking.log.consumedViaRecipe'

export function logKindOf(log: Pick<InventoryLog, 'logKey'>): LogKind | null {
  switch (log.logKey) {
    case PURCHASE_LOG_KEY:
    case OLD_PURCHASE_KEY:
      return 'purchase'
    case COOKING_LOG_KEY:
    case OLD_COOKING_KEY:
    case OLD_COOKING_NO_RECIPE_KEY:
      return 'cooking'
    case STOCK_COUNT_LOG_KEY:
      return 'stockCount'
    default:
      return null
  }
}

type UnitFields = Pick<
  Item,
  'targetUnit' | 'measurementUnit' | 'amountPerPackage' | 'packageUnit'
>

/**
 * The item's tracking unit, and the factor from packages to it.
 *
 * The same test as `getCurrentQuantity` and `consumeItem` (`@p1i/types`): an
 * item tracks in measurement only when it has a measurement unit AND an
 * `amountPerPackage`. Otherwise the unit is the package unit, factor 1.
 */
export function logUnitOf(item: UnitFields | undefined): {
  unit: string
  perPackage: number
} {
  if (
    item?.targetUnit === 'measurement' &&
    item.measurementUnit &&
    item.amountPerPackage &&
    item.amountPerPackage > 0
  ) {
    return { unit: item.measurementUnit, perPackage: item.amountPerPackage }
  }
  return { unit: item?.packageUnit || DEFAULT_PACKAGE_UNIT, perPackage: 1 }
}

/**
 * The row's two numbers in the item's tracking unit.
 *
 * What each writer stored (checked in the code, 2026-11-25):
 *
 * | Kind | `delta` | `quantity` |
 * |---|---|---|
 * | purchase (checkout) | packages | packages (`getPackedTotal`) |
 * | stock count | packages | packages (`getPackedTotal`) |
 * | cooking | the TRACKING unit (the amount `consumeItem` used) | packages (`getPackedTotal`) |
 * | oldest, `note` only | taken as packages | packages |
 *
 * So `quantity` is always converted, and `delta` is converted unless the row
 * is a cook. Rows written before a unit switch use today's `amountPerPackage`
 * (design, *Not in this design*).
 */
export function logAmountsOf(
  log: Pick<InventoryLog, 'logKey' | 'delta' | 'quantity'>,
  item: UnitFields | undefined,
): { delta: number; quantity: number; unit: string } {
  const { unit, perPackage } = logUnitOf(item)
  const deltaInTrackingUnit = logKindOf(log) === 'cooking'
  return {
    delta: deltaInTrackingUnit ? log.delta : log.delta * perPackage,
    quantity: log.quantity * perPackage,
    unit,
  }
}

/** At most 2 decimals, no trailing zeros, and never "-0". */
export function formatLogNumber(n: number): string {
  const rounded = Math.round(n * 100) / 100
  // `-0 === 0`, so this also turns a rounded "-0" into "0".
  return rounded === 0 ? '0' : String(rounded)
}

/** `+3 pack`, `−30 g`. The minus is U+2212, as in the design. */
export function formatLogDelta(delta: number, unit: string): string {
  const text = formatLogNumber(Math.abs(delta))
  const sign = text === '0' ? '' : delta > 0 ? '+' : '−'
  return `${sign}${text} ${unit}`
}

/** Current names, so a renamed vendor or recipe shows its new name. */
export interface LogNameLookup {
  vendorName: (id: string) => string | undefined
  recipeName: (id: string) => string | undefined
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function purchaseVendor(
  params: Record<string, unknown>,
  names: LogNameLookup,
  noVendorNames: ReadonlyArray<string>,
): string | null {
  const id = stringOf(params.vendorId)
  if (id !== null) {
    return names.vendorName(id) ?? stringOf(params.vendorName)
  }
  if ('vendorName' in params) return stringOf(params.vendorName)
  // An old row: `{ vendor: name }`, where the no-vendor cart stored the
  // translated text "No vendor" / 「無商家」. That is not a vendor name.
  const old = stringOf(params.vendor)
  if (old === null || noVendorNames.includes(old)) return null
  return old
}

function cookingRecipes(
  params: Record<string, unknown>,
  names: LogNameLookup,
  separator: string,
): string | null {
  const recipes = params.recipes
  // An old row: one string, already joined.
  if (typeof recipes === 'string') return stringOf(recipes)
  if (!Array.isArray(recipes)) return null
  const list = recipes.flatMap((entry) => {
    if (entry === null || typeof entry !== 'object') return []
    const { id, name } = entry as { id?: unknown; name?: unknown }
    const current = typeof id === 'string' ? names.recipeName(id) : undefined
    const shown = current ?? stringOf(name)
    return shown ? [shown] : []
  })
  return list.length > 0 ? list.join(separator) : null
}

/**
 * The label of a row, in the reader's language, or `null` for none.
 *
 * A row with no kind shows its `note` (the oldest rows, and any key this
 * bundle does not know). The raw key is never shown.
 */
export function logLabelOf(
  log: Pick<InventoryLog, 'logKey' | 'logParams' | 'note'>,
  t: TFunction,
  names: LogNameLookup,
  noVendorNames: ReadonlyArray<string>,
): string | null {
  const params = (log.logParams ?? {}) as Record<string, unknown>
  switch (logKindOf(log)) {
    case 'purchase': {
      const vendor = purchaseVendor(params, names, noVendorNames)
      return vendor
        ? t('items.history.kind.purchaseAt', { vendor })
        : t('items.history.kind.purchase')
    }
    case 'cooking': {
      const recipes = cookingRecipes(
        params,
        names,
        t('items.history.listSeparator'),
      )
      return recipes
        ? t('items.history.kind.cookingIn', { recipes })
        : t('items.history.kind.cooking')
    }
    case 'stockCount':
      return t('items.history.kind.stockCount')
    default:
      return log.note ?? null
  }
}

/**
 * Row 2: date, weekday and time in the app language, through `Intl`.
 * English `Wed, Nov 25, 2026 · 14:30`; Traditional Chinese
 * `2026/11/25（週三）14:30`. The order and the punctuation come from the
 * `items.history.when` string of each language.
 */
export function formatLogTime(
  date: Date,
  language: Language,
  t: TFunction,
): string {
  const locale = LANGUAGE_LOCALE[language]
  const dateText = new Intl.DateTimeFormat(
    locale,
    language === 'tw'
      ? { year: 'numeric', month: '2-digit', day: '2-digit' }
      : { year: 'numeric', month: 'short', day: 'numeric' },
  ).format(date)
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(
    date,
  )
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  return t('items.history.when', { date: dateText, weekday, time })
}
