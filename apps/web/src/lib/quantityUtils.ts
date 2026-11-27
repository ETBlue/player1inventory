import {
  DEFAULT_PACKAGE_UNIT,
  decimalPlaces,
  getCurrentQuantity,
  isStockActive,
  roundToStep,
} from '@p1i/types'
import type { StockConfigFields, StockFields } from '@/types'

// `getPackedTotal`, `consumeItem`, `roundToStep`, `getCurrentQuantity` and
// `decimalPlaces` live in `packages/types/src/quantity.ts` since households
// H3b task B.1, because the server needs the same rules. The first four are
// re-exported here so every web import and every web test keeps working
// unchanged. `decimalPlaces` was never exported from this file, so it is only
// imported (for `addItem`). The tests stay in this folder and run against the
// shared code.
export {
  consumeItem,
  getCurrentQuantity,
  getPackedTotal,
  roundToStep,
} from '@p1i/types'

// Quantity/expiration helpers operate on the whole joined stock shape: the
// per-location state (StockFields, on ItemStock) plus the global configuration
// (StockConfigFields, on Item since v16). A joined PantryItem satisfies both.
type Stock = StockFields & StockConfigFields

export function getStockStatus(
  quantity: number,
  refillThreshold: number,
): 'error' | 'warning' | 'ok' {
  if (refillThreshold > 0 && quantity === refillThreshold) return 'warning'
  if (quantity < refillThreshold) return 'error'
  return 'ok'
}

export function getItemPackUnits(item: Stock): {
  packed: number
  target: number
  refill: number
} {
  if (item.targetUnit === 'package') {
    // In package mode, one unpack removes 1 packed and adds 1 unpacked — both are in package units
    const packed = item.packedQuantity + item.unpackedQuantity
    return { packed, target: item.targetQuantity, refill: item.refillThreshold }
  }
  if (
    item.targetUnit === 'measurement' &&
    item.amountPerPackage &&
    item.amountPerPackage > 0
  ) {
    const packed =
      item.packedQuantity + item.unpackedQuantity / item.amountPerPackage
    return {
      packed,
      target: item.targetQuantity / item.amountPerPackage,
      refill: item.refillThreshold / item.amountPerPackage,
    }
  }
  // Fallback: no targetUnit, or a measurement item with amountPerPackage
  // unset / 0.
  //
  // An UNCONVERTIBLE MEASUREMENT item contributes 0 packs, not its raw
  // measurement amount. Both quantities here are in measurement units (ml, g,
  // …) and there is no rate to divide by, so summing them into a PACK total
  // mixes units: a 750 ml item used to push a group card to "750 / 20 pack".
  // Zero is the only honest answer, and it matches the target 0 / refill 0
  // this branch already returns for the same item.
  //
  // The zeroing is gated on `targetUnit === 'measurement'` so a row that
  // reaches this branch for the OTHER reason — no `targetUnit` at all, which
  // the type forbids but legacy stored rows can still carry — keeps its
  // existing packed + unpacked sum.
  if (item.targetUnit === 'measurement') {
    return { packed: 0, target: 0, refill: 0 }
  }
  const packed = item.packedQuantity + item.unpackedQuantity
  return { packed, target: 0, refill: 0 }
}

export interface PackUnpackState {
  packedQuantity: number
  unpackedQuantity: number
}

/**
 * Computes new quantities after opening one package (packed → unpacked).
 * Mirrors the Unpack button logic in ItemForm and QuickUpdateDialog.
 */
export function computeUnpack(
  item: {
    targetUnit: string
    amountPerPackage?: number
    consumeAmount: number
  },
  state: PackUnpackState,
): PackUnpackState {
  if (state.packedQuantity < 1) return state // guard: nothing to unpack
  const amount = Number(item.amountPerPackage)
  if (item.targetUnit === 'package') {
    return {
      packedQuantity: state.packedQuantity - 1,
      unpackedQuantity: Math.round((state.unpackedQuantity + 1) * 1000) / 1000,
    }
  } else if (item.targetUnit === 'measurement' && amount > 0) {
    return {
      packedQuantity: state.packedQuantity - 1,
      unpackedQuantity:
        Math.round((state.unpackedQuantity + amount) * 1000) / 1000,
    }
  }
  return state
}

/**
 * Computes new quantities after packing one unit (unpacked → packed).
 * For package-unit items: moves exactly 1 unit.
 * For measurement items: consolidates all whole packages based on amountPerPackage.
 */
export function computePack(
  item: {
    targetUnit: string
    amountPerPackage?: number
    consumeAmount: number
  },
  state: PackUnpackState,
): PackUnpackState {
  const amount = Number(item.amountPerPackage)
  if (item.targetUnit === 'package') {
    if (state.unpackedQuantity < 1) return state
    return {
      packedQuantity: state.packedQuantity + 1,
      unpackedQuantity: Math.round((state.unpackedQuantity - 1) * 1000) / 1000,
    }
  }
  if (item.targetUnit === 'measurement' && amount > 0) {
    const packs = Math.floor(state.unpackedQuantity / amount)
    if (packs <= 0) return state
    return {
      packedQuantity: state.packedQuantity + packs,
      unpackedQuantity:
        Math.round((state.unpackedQuantity - packs * amount) * 1000) / 1000,
    }
  }
  return state
}

/**
 * Computes packed/unpacked quantities for "Fill to Full".
 * For measurement-unit items, converts targetQuantity (in measurement units)
 * to packages using amountPerPackage, putting any remainder in unpackedQuantity.
 * For package-unit items (or measurement items lacking amountPerPackage),
 * sets packed = targetQuantity and unpacked = 0.
 */
export function computeFillToFull(item: {
  targetUnit: string
  targetQuantity: number
  amountPerPackage?: number
  consumeAmount: number
}): PackUnpackState {
  if (
    item.targetUnit === 'measurement' &&
    item.amountPerPackage &&
    item.amountPerPackage > 0
  ) {
    const packed = Math.floor(item.targetQuantity / item.amountPerPackage)
    const unpacked = roundToStep(
      item.targetQuantity - packed * item.amountPerPackage,
      item.consumeAmount,
    )
    return { packedQuantity: packed, unpackedQuantity: unpacked }
  }
  return { packedQuantity: item.targetQuantity, unpackedQuantity: 0 }
}

/**
 * The three per-location quantities that are expressed in the item's TRACKING
 * unit, and therefore stop meaning the same thing when that unit changes.
 *
 * `packedQuantity` is deliberately NOT one of them: it counts sealed packages,
 * which are packages whichever unit the item is tracked in.
 */
export interface TrackedQuantities {
  unpackedQuantity: number
  targetQuantity: number
  refillThreshold: number
}

// IEEE-754 dust guard. A single multiply/divide can leave an error in the last
// couple of significant digits (0.3 * 3 === 0.8999999999999999), which would
// make a package → measurement → package round trip lose the original value
// and would surface as junk digits in the Stock tab's inputs. Twelve
// significant figures is far more precision than any quantity input carries,
// so this removes only the dust.
//
// Deliberately NOT roundToStep() and not the 3-decimal rounding ItemForm uses
// for its in-form conversion: both are absolute, so they destroy small
// fractions (0.5 g with 1000 g per package is 0.0005 packages, which 3-decimal
// rounding doubles to 0.001) and break the round trip. Converting stock must
// not invent or lose inventory.
function stripFloatDust(value: number): number {
  if (!Number.isFinite(value) || value === 0) return value
  return Number(value.toPrecision(12))
}

/**
 * Re-expresses the three tracked quantities of ONE stock row after the item's
 * global `targetUnit` switches, using the (also global) `amountPerPackage`:
 * package → measurement multiplies, measurement → package divides.
 *
 * Because `amountPerPackage` is global since v16, the same factor applies to
 * every location — which is what makes converting every ItemStock row of an
 * item well defined.
 *
 * Returns `null` when `amountPerPackage` is unusable (missing, zero, negative
 * or NaN) — the same bail as the recipe-rescale branch, since without a factor
 * there is no defensible conversion. Callers must leave the row untouched.
 */
export function convertTrackedQuantities(
  quantities: TrackedQuantities,
  amountPerPackage: number | undefined,
  newTargetUnit: 'package' | 'measurement',
): TrackedQuantities | null {
  if (!amountPerPackage || amountPerPackage <= 0) return null
  // Divide rather than multiply by a reciprocal: division is exactly rounded,
  // whereas 1/amountPerPackage introduces an error before the value is used.
  const convert = (value: number) =>
    stripFloatDust(
      newTargetUnit === 'measurement'
        ? value * amountPerPackage
        : value / amountPerPackage,
    )
  return {
    unpackedQuantity: convert(quantities.unpackedQuantity),
    targetQuantity: convert(quantities.targetQuantity),
    refillThreshold: convert(quantities.refillThreshold),
  }
}

export function addItem(
  item: Stock,
  amount: number,
  purchaseDate: Date = new Date(),
): void {
  // Always add to unpacked (removed mode branching)
  // Use roundToStep only when consumeAmount has sub-unit precision (e.g. 0.1) to fix
  // float drift (0.1 + 0.1 + 0.1 = 0.30000000000000004). Integer consumeAmounts and
  // undefined consumeAmount skip rounding so existing unpacked fractions are preserved.
  const consumePlaces = item.consumeAmount
    ? decimalPlaces(item.consumeAmount)
    : 0
  item.unpackedQuantity =
    consumePlaces > 0
      ? roundToStep(item.unpackedQuantity + amount, item.consumeAmount)
      : item.unpackedQuantity + amount

  // Recalculate dueDate if quantity was 0 and estimatedDueDays exists
  if (item.estimatedDueDays && !item.dueDate && getCurrentQuantity(item) > 0) {
    const expirationMs =
      purchaseDate.getTime() + item.estimatedDueDays * 86400000
    item.dueDate = new Date(expirationMs)
  }
}

// "Inactive" is the "Active here" switch, `ItemStock.isActive`, read through
// `isStockActive` from `@p1i/types` (the one rule, shared with the server).
// A boolean decides, whatever the target is: an active row with target 0 has
// "no target", and an inactive row keeps its target. Only a row with no value
// (old data, or `ZERO_STOCK` for an item not stocked here) falls back to the
// old rule, target 0 = inactive.
//
// Narrowed to `Pick<Stock, 'targetQuantity' | 'isActive'>` rather than the
// full `Stock`: these are the only fields it reads, and a caller previewing
// live (not-yet-saved) values passes just those. Any full Stock value
// (PantryItem, etc.) still satisfies the narrower type.
export function isInactive(
  item: Pick<Stock, 'targetQuantity' | 'isActive'>,
): boolean {
  return !isStockActive(item)
}

// The stock CONFIGURATION half of the progress-row preview: the global fields
// that decide how the four live values are interpreted and displayed. Mirrors
// StockConfigFields but narrowed to what the preview actually reads, and
// `amountPerPackage` stays a plain `number` here — each caller already holds
// (or coerces to) that shape before calling, since QuickUpdateDialog's PantryItem
// field and ItemForm's `string | number` form field convert differently.
export interface StockPreviewConfig {
  targetUnit: 'package' | 'measurement'
  measurementUnit?: string
  packageUnit?: string
  amountPerPackage?: number
  consumeAmount: number
  // `false` for a non-consumable item (cups): the preview counts whole pieces
  // in the package unit (`getPieceCounts`). Left out means consumable.
  consumable?: boolean
}

// The live values driving the preview — never the stored/saved ones, so
// callers can pass in-progress edits before they are submitted.
export interface StockPreviewValues {
  packedQuantity: number
  unpackedQuantity: number
  targetQuantity: number
  refillThreshold: number
  // The live "Active here" switch, so the bar turns grey before Save. Left
  // out, the preview falls back to `isStockActive`'s old rule on the live
  // target (target 0 = inactive), which is what it did before the switch.
  isActive?: boolean
}

export interface StockPreview {
  /**
   * Total quantity in the item's tracking unit (measurement-aware). For a
   * non-consumable item: the whole pieces in stock.
   */
  current: number
  /**
   * The bar's target and refill threshold. For a consumable item these are
   * the values passed in, unchanged. For a non-consumable item they are whole
   * pieces (`getPieceCounts`).
   */
  target: number
  refillThreshold: number
  /** `packedQuantity` re-expressed in the tracking unit, for the label. */
  displayPacked: number
  unitLabel: string
  quantityLabel: string
  status: 'inactive' | 'error' | 'warning' | 'ok'
  isAtZero: boolean
  isAtFull: boolean
}

/**
 * Derives every display value `StockProgressRow` needs from the stock
 * configuration plus the four live quantities. Pure — no React, no hook —
 * so both QuickUpdateDialog (local dialog state) and ItemForm (form state)
 * can call it with their own in-progress values and stay byte-identical in
 * behaviour. `StockProgressRow` itself stays presentational and does not call
 * this; each caller derives these fields and passes them down as props.
 */
export function getStockPreview(
  config: StockPreviewConfig,
  values: StockPreviewValues,
): StockPreview {
  const {
    targetUnit,
    measurementUnit,
    packageUnit,
    amountPerPackage,
    consumeAmount,
    consumable = true,
  } = config
  const {
    packedQuantity,
    unpackedQuantity,
    targetQuantity,
    refillThreshold,
    isActive,
  } = values
  // Built once, so both branches below read the same switch. `isActive` is
  // left out when undefined, because `exactOptionalPropertyTypes` refuses an
  // explicit `undefined` on an optional key.
  const inactive = isInactive({
    targetQuantity,
    ...(isActive !== undefined ? { isActive } : {}),
  })

  // The package unit as the card shows it (`ItemStockSummary`:
  // `item.packageUnit || DEFAULT_PACKAGE_UNIT`). `||`, not `??`: an item
  // created with just a name stores `''`. Until 2026-11-26 this fell back to
  // the literal word 'unit', so the stock row said "3 / 5 unit" where the card
  // said "3 / 5 pack" (owner decision 2026-11-26).
  const packageWord = packageUnit || DEFAULT_PACKAGE_UNIT

  const isAtZero = packedQuantity === 0 && unpackedQuantity === 0

  // A non-consumable item (cups) counts whole pieces in the package unit,
  // whatever its measurement settings say (owner decision 2026-11-26).
  if (!consumable) {
    const pieces = getPieceCounts(
      { targetUnit, ...(amountPerPackage ? { amountPerPackage } : {}) },
      { packedQuantity, targetQuantity, refillThreshold },
    )
    return {
      current: pieces.inStock,
      displayPacked: pieces.inStock,
      target: pieces.wanted,
      refillThreshold: pieces.refillThreshold,
      unitLabel: packageWord,
      quantityLabel: `${pieces.inStock} / ${pieces.wanted}`,
      status: inactive
        ? 'inactive'
        : getStockStatus(pieces.inStock, pieces.refillThreshold),
      isAtZero,
      // Fill to Full for a non-consumable item is the target in whole
      // pieces, with no opened stock.
      isAtFull: packedQuantity === pieces.wanted && unpackedQuantity === 0,
    }
  }

  // `amountPerPackage && amountPerPackage > 0` (not bare truthiness): 0 means
  // "no conversion rate" in this file's convention — see computeFillToFull's
  // identical guard above. Multiplying packed by a zero rate would not
  // produce a meaningful reading, so a measurement item with
  // amountPerPackage 0 falls through to the plain packed+unpacked sum, same
  // as package mode.
  const current =
    targetUnit === 'measurement' && amountPerPackage && amountPerPackage > 0
      ? packedQuantity * amountPerPackage + unpackedQuantity
      : packedQuantity + unpackedQuantity

  const displayPacked =
    targetUnit === 'measurement' && amountPerPackage && amountPerPackage > 0
      ? packedQuantity * amountPerPackage
      : packedQuantity

  const status = inactive
    ? 'inactive'
    : getStockStatus(current, refillThreshold)

  const unitLabel =
    targetUnit === 'measurement' && measurementUnit
      ? measurementUnit
      : packageWord

  const quantityLabel =
    unpackedQuantity > 0
      ? `${displayPacked} (+${unpackedQuantity}) / ${targetQuantity}`
      : `${current} / ${targetQuantity}`

  const fillToFullState = computeFillToFull({
    targetUnit,
    targetQuantity,
    consumeAmount,
    ...(amountPerPackage ? { amountPerPackage } : {}),
  })

  const isAtFull =
    packedQuantity === fillToFullState.packedQuantity &&
    unpackedQuantity === fillToFullState.unpackedQuantity

  return {
    current,
    displayPacked,
    target: targetQuantity,
    refillThreshold,
    unitLabel,
    quantityLabel,
    status,
    isAtZero,
    isAtFull,
  }
}

/**
 * How many tracking units make one piece of a non-consumable item.
 *
 * A non-consumable item (cups) counts whole pieces. Such an item normally
 * tracks in packages, so one piece is one package and the scale is 1. An item
 * that still tracks in a measurement unit (for example from a hand-edited
 * backup) has `amountPerPackage` units per piece. A missing or 0 rate gives 1,
 * the same "no conversion rate" rule as `getStockPreview`.
 */
export function getPieceScale(config: {
  targetUnit: 'package' | 'measurement'
  amountPerPackage?: number | undefined
}): number {
  const { targetUnit, amountPerPackage } = config
  return targetUnit === 'measurement' &&
    amountPerPackage &&
    amountPerPackage > 0
    ? amountPerPackage
    : 1
}

// A target or refill threshold in whole pieces: divided by the piece scale,
// then rounded UP (owner decision 2026-11-26). Up, because the person wanted
// at least that much, and because a threshold of 0.4 must not become 0, which
// would turn the low-stock warning off. The dust guard first, so 0.7 / 0.1
// (6.999999999999999) gives 7, and 2.0000000000000004 does not give 3.
function toWholePieces(value: number, scale: number): number {
  return Math.ceil(stripFloatDust(value / scale))
}

/**
 * The stock of a NON-consumable item, in whole pieces of the package unit.
 *
 * - `inStock` is the whole packed packages. Opened stock (`unpackedQuantity`)
 *   does not count: a non-consumable item has no opened packs, and its one
 *   "Amount" field edits `packedQuantity` (owner decision 2026-11-26). An old
 *   row that still holds opened stock is shown without it, and the next save
 *   writes `unpackedQuantity: 0`.
 * - `wanted` and `refillThreshold` are the target and the threshold divided
 *   by `getPieceScale` and rounded up (`toWholePieces`).
 *
 * `ItemStockSummary` (the card and the cart dialog) and `getStockPreview`
 * (the quick edit dialog and the Stock tab) both use it, so they agree.
 */
export function getPieceCounts(
  config: {
    targetUnit: 'package' | 'measurement'
    amountPerPackage?: number | undefined
  },
  values: {
    packedQuantity: number
    targetQuantity: number
    refillThreshold: number
  },
): { inStock: number; wanted: number; refillThreshold: number } {
  const scale = getPieceScale(config)
  return {
    inStock: Math.max(0, Math.floor(values.packedQuantity)),
    wanted: toWholePieces(values.targetQuantity, scale),
    refillThreshold: toWholePieces(values.refillThreshold, scale),
  }
}

/**
 * One location's tracked quantities after the item is switched from
 * consumable to non-consumable (owner decision 2026-11-26): opened stock is
 * dropped (`unpackedQuantity: 0`), and the target and the refill threshold
 * become whole packs. `config` is the item's unit BEFORE the switch, the unit
 * the stored numbers are in. A measurement item divides by `amountPerPackage`,
 * the same rule as a unit switch (`convertTrackedQuantities`), then rounds up
 * like `getPieceCounts`. `packedQuantity` is not part of it: it stays.
 */
export function toNonConsumableQuantities(
  before: TrackedQuantities,
  config: {
    targetUnit: 'package' | 'measurement'
    amountPerPackage?: number | undefined
  },
): TrackedQuantities {
  const scale = getPieceScale(config)
  return {
    unpackedQuantity: 0,
    targetQuantity: toWholePieces(before.targetQuantity, scale),
    refillThreshold: toWholePieces(before.refillThreshold, scale),
  }
}

// Location predicates — guard against the ZERO_STOCK trap: joinItemStock()
// returns targetQuantity: 0, no `isActive` and no stockId for an item with no
// ItemStock row in the active location, so isInactive() alone reports a
// merely-unstocked item as inactive (the fallback of `isStockActive`). Every
// location-scoped count must check stockId first.

// True when the item has a real ItemStock row in the active location (as
// opposed to the zeroed join result for an item not stocked here).
export function isStockedHere(item: { stockId?: string }): boolean {
  return item.stockId !== undefined
}

// Strict "inactive" for the active location: stocked here AND its "Active
// here" switch is off (see isInactive). An item that is simply not stocked
// here is neither active nor inactive here — it is absent, so this returns
// false for it.
export function isInactiveHere(item: { stockId?: string } & Stock): boolean {
  return isStockedHere(item) && isInactive(item)
}

// Health predicates — shared by every surface that summarises a group of items
// (the pantry group cards and the cooking recipe card). Inactive items are
// excluded from both, also when they keep a target: the person turned the
// item off here, so it is not "empty" or "low" here.

// True when the item's current quantity has fallen BELOW its refill threshold.
// Displayed as "empty".
export function isEmptyStock(item: Stock): boolean {
  return !isInactive(item) && getCurrentQuantity(item) < item.refillThreshold
}

// True when the item's current quantity sits exactly AT its refill threshold.
// A refill threshold of 0 never counts as low stock.
export function isLowStock(item: Stock): boolean {
  return (
    !isInactive(item) &&
    item.refillThreshold > 0 &&
    getCurrentQuantity(item) === item.refillThreshold
  )
}

/**
 * The amount the cart amount dialog suggests when an item is ticked into a
 * cart: the whole packs still missing to reach the target at this location,
 * and at least 1.
 *
 * A cart amount counts PACKAGES, but the target and the stock are in the
 * item's TRACKING unit. For a measurement item (for example 750 ml a bottle,
 * target 2000 ml) both are turned into packs first, with `getItemPackUnits`,
 * so "ceil(target − stock)" is not 1250 bottles. An item whose amounts cannot
 * be turned into packs (a measurement item with no amount per package) has a
 * pack target of 0, so it gets 1.
 *
 * The difference is rounded to 6 places before `Math.ceil`, so a float error
 * such as 2.0000000000000004 does not become 3.
 */
export function suggestedCartAmount(item: Stock): number {
  const { packed, target } = getItemPackUnits(item)
  const missing = Math.round((target - packed) * 1e6) / 1e6
  return Math.max(1, Math.ceil(missing))
}
