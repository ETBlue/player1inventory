import type { StockConfigFields, StockFields } from '@/types'

// Quantity/expiration helpers operate on the whole joined stock shape: the
// per-location state (StockFields, on ItemStock) plus the global configuration
// (StockConfigFields, on Item since v16). A joined PantryItem satisfies both.
type Stock = StockFields & StockConfigFields

function decimalPlaces(n: number): number {
  const s = n.toString()
  const dot = s.indexOf('.')
  return dot === -1 ? 0 : s.length - dot - 1
}

export function roundToStep(value: number, step: number | undefined): number {
  if (step === undefined || step <= 0) return value
  const places = decimalPlaces(step)
  return Math.round(value * 10 ** places) / 10 ** places
}

export function getCurrentQuantity(item: Stock): number {
  if (
    item.targetUnit === 'measurement' &&
    item.measurementUnit &&
    item.amountPerPackage
  ) {
    // Tracking in measurement: convert packed to measurement and add unpacked (already in measurement)
    const packedInMeasurement = item.packedQuantity * item.amountPerPackage
    return packedInMeasurement + item.unpackedQuantity
  }
  // Tracking in packages (or simple mode): packed + unpacked (both in packages)
  return item.packedQuantity + item.unpackedQuantity
}

/**
 * Returns the total quantity in package units, regardless of targetUnit.
 * For dual-unit items, unpacked measurement quantity is converted to fractional packs.
 */
// Takes the three fields it actually reads rather than a whole Stock, because
// `amountPerPackage` is global (on the Item) since v16: a caller holding only
// an ItemStock row has to supply it separately.
export function getPackedTotal(
  item: Pick<Stock, 'packedQuantity' | 'unpackedQuantity'> &
    Partial<Pick<Stock, 'amountPerPackage'>>,
): number {
  if (item.amountPerPackage && item.amountPerPackage > 0) {
    return item.packedQuantity + item.unpackedQuantity / item.amountPerPackage
  }
  return item.packedQuantity + item.unpackedQuantity
}

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
  // Fallback: no targetUnit or amountPerPackage = 0
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

export function consumeItem(item: Stock, amount: number): void {
  if (
    item.targetUnit === 'measurement' &&
    item.measurementUnit &&
    item.amountPerPackage
  ) {
    // Tracking in measurement: amount and unpacked are both in measurement units
    if (item.unpackedQuantity >= amount) {
      item.unpackedQuantity = roundToStep(
        item.unpackedQuantity - amount,
        item.consumeAmount,
      )
    } else {
      // Need to break into packed
      const remaining = amount - item.unpackedQuantity
      item.unpackedQuantity = 0

      const packagesToOpen = Math.ceil(remaining / item.amountPerPackage)
      item.packedQuantity -= packagesToOpen

      // Calculate leftover from opened packages (in measurement units)
      item.unpackedQuantity = roundToStep(
        packagesToOpen * item.amountPerPackage - remaining,
        item.consumeAmount,
      )

      // Prevent negative quantities
      if (item.packedQuantity < 0) {
        item.packedQuantity = 0
        item.unpackedQuantity = 0
      }
    }
  } else {
    // Tracking in packages (or simple mode): amount and unpacked are both in packages
    if (item.unpackedQuantity >= amount) {
      item.unpackedQuantity = roundToStep(
        item.unpackedQuantity - amount,
        item.consumeAmount,
      )
    } else {
      // Need to open packages - open minimum needed
      if (item.packedQuantity > 0) {
        const remaining = amount - item.unpackedQuantity
        const packagesToOpen = Math.ceil(remaining) // In package mode, each package = 1 unit

        if (packagesToOpen <= item.packedQuantity) {
          item.packedQuantity -= packagesToOpen
          item.unpackedQuantity = roundToStep(
            item.unpackedQuantity + packagesToOpen - amount,
            item.consumeAmount,
          )
        } else {
          // Not enough packages - consume everything
          item.packedQuantity = 0
          item.unpackedQuantity = 0
        }
      } else {
        // No packages left, consume what's available
        item.unpackedQuantity = 0
      }
    }
  }

  // Clear expiration date when quantity reaches 0
  if (getCurrentQuantity(item) === 0) {
    delete item.dueDate
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

// Widened to `Pick<Stock, 'targetQuantity'>` rather than the full `Stock`: the
// only field this reads is targetQuantity, and a caller previewing a live
// (not-yet-saved) target — ItemForm's Stock tab progress row — wants to pass
// just that value without assembling an object satisfying every other Stock
// field. Any full Stock value (PantryItem, etc.) still satisfies the narrower
// type, so every existing caller is unaffected.
export function isInactive(item: Pick<Stock, 'targetQuantity'>): boolean {
  return item.targetQuantity === 0
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
}

// The four live values driving the preview — never the stored/saved ones, so
// callers can pass in-progress edits before they are submitted.
export interface StockPreviewValues {
  packedQuantity: number
  unpackedQuantity: number
  targetQuantity: number
  refillThreshold: number
}

export interface StockPreview {
  /** Total quantity in the item's tracking unit (measurement-aware). */
  current: number
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
  } = config
  const { packedQuantity, unpackedQuantity, targetQuantity, refillThreshold } =
    values

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

  const status = isInactive({ targetQuantity })
    ? 'inactive'
    : getStockStatus(current, refillThreshold)

  const unitLabel =
    targetUnit === 'measurement' && measurementUnit
      ? measurementUnit
      : // Falls back to the literal string 'unit', not DEFAULT_PACKAGE_UNIT
        // ('pack') — a pre-existing divergence from QuickUpdateDialog's own
        // `item.packageUnit || DEFAULT_PACKAGE_UNIT` label logic, left as-is
        // deliberately: unifying it would change the dialog's shipped display
        // text for every item with no package unit, which is out of scope here.
        (packageUnit ?? 'unit')

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

  const isAtZero = packedQuantity === 0 && unpackedQuantity === 0
  const isAtFull =
    packedQuantity === fillToFullState.packedQuantity &&
    unpackedQuantity === fillToFullState.unpackedQuantity

  return {
    current,
    displayPacked,
    unitLabel,
    quantityLabel,
    status,
    isAtZero,
    isAtFull,
  }
}

// Location predicates — guard against the ZERO_STOCK trap: joinItemStock()
// returns targetQuantity: 0 (no stockId) for an item with no ItemStock row in
// the active location, so isInactive() alone reports a merely-unstocked item
// as inactive. Every location-scoped count must check stockId first.

// True when the item has a real ItemStock row in the active location (as
// opposed to the zeroed join result for an item not stocked here).
export function isStockedHere(item: { stockId?: string }): boolean {
  return item.stockId !== undefined
}

// Strict "inactive" for the active location: stocked here AND targetQuantity
// is 0. An item that is simply not stocked here is neither active nor
// inactive here — it is absent, so this returns false for it.
export function isInactiveHere(item: { stockId?: string } & Stock): boolean {
  return isStockedHere(item) && isInactive(item)
}

// Health predicates — shared by every surface that summarises a group of items
// (the pantry group cards and the cooking recipe card). Inactive items are
// excluded from both: with targetQuantity 0 there is no level to fall short of.

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
