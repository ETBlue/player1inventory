// The mode-neutral description of a seeded fixture.
//
// A fixture is written ONCE as plain data and translated per data mode:
// `seedLocalFixture` (helpers/localSeed.ts) writes it to IndexedDB, and
// `seedCloudFixture` (helpers/cloudSeed.ts) writes it through GraphQL. Both
// return the same `Record<locationKey, realLocationId>` map.
//
// Describing it once is what keeps the two paths from drifting. A cloud fixture
// that has quietly stopped matching its local twin still passes, while proving
// something different — the failure root `CLAUDE.md` calls a vacuous test.
//
// LOCATIONS ARE REFERENCED BY A SYMBOLIC `key`, NEVER BY AN ID. Local ids are
// the spec's own constants (the default location is the `'local'` sentinel);
// cloud ids are server-generated cuids, because the import schema has no
// `LocationInput` until PR 4. A spec that hardcoded `'local'` as the home
// location id would silently name nothing in cloud mode.

export type FixtureLocation = {
  /** Symbolic name used by `stocks[].location`. Not an id in either mode. */
  key: string
  name: string
  /** Exactly one location must set this. */
  isDefault?: boolean
}

export type FixtureItem = {
  id: string
  name: string
  vendorIds?: string[]
  /**
   * The item's global step size. Omitting it gives **1** in both modes — the
   * product default (`createItem` writes `consumeAmount ?? 1`, Prisma declares
   * `@default(1)`). Set it only when the spec needs a different step.
   *
   * 0 means "no step size configured" and is NOT the same as 1. `ItemForm`
   * (apps/web/src/components/item/ItemForm/ItemForm.tsx line 355) computes
   * `quantityStep = consumeAmount > 0 ? consumeAmount : 'any'`, and that value
   * becomes the `step` attribute of three number inputs: Unpacked (line 802),
   * Target Quantity (line 921, only while `targetUnit === 'measurement'`) and
   * Refill When Below (line 956). A 0 also makes the form show the
   * "Must be greater than 0." error (line 342), which no app-created item hits.
   *
   * Do NOT set 0 to make a decimal-input test pass. Measured 2026-09-24: the
   * decimal test in `item-stock-input.spec.ts` is green at 0 and at 1. `step`
   * does not change the text the browser keeps while the field has focus.
   */
  consumeAmount?: number
  /**
   * 'package' or 'measurement'. Omitting it gives **'package'** in both modes,
   * matching `createItem`. Set it only when the spec needs 'measurement'.
   */
  targetUnit?: 'package' | 'measurement'
}

export type FixtureStock = {
  itemId: string
  /** A `locations[].key`. */
  location: string
  targetQuantity?: number
  refillThreshold?: number
  packedQuantity?: number
  unpackedQuantity?: number
}

export type Fixture = {
  locations: FixtureLocation[]
  vendors: { id: string; name: string }[]
  items: FixtureItem[]
  stocks: FixtureStock[]
  shelves: {
    id: string
    name: string
    type: string
    order: number
    itemIds: string[]
  }[]
  recipes: {
    id: string
    name: string
    items: { itemId: string; defaultAmount: number }[]
  }[]
}

// Quantities a stock row opens at unless the fixture overrides them. 3 of a
// target of 4, above a refill threshold of 1 — neither empty nor low, so no
// health badge text competes with a "N not stocked here" assertion.
export const STOCK_DEFAULTS = {
  targetQuantity: 4,
  refillThreshold: 1,
  packedQuantity: 3,
  unpackedQuantity: 0,
} as const

export function stockQuantities(stock: FixtureStock): {
  targetQuantity: number
  refillThreshold: number
  packedQuantity: number
  unpackedQuantity: number
} {
  return {
    targetQuantity: stock.targetQuantity ?? STOCK_DEFAULTS.targetQuantity,
    refillThreshold: stock.refillThreshold ?? STOCK_DEFAULTS.refillThreshold,
    packedQuantity: stock.packedQuantity ?? STOCK_DEFAULTS.packedQuantity,
    unpackedQuantity: stock.unpackedQuantity ?? STOCK_DEFAULTS.unpackedQuantity,
  }
}

/** The one location the fixture marks `isDefault`. Throws if there is not exactly one. */
export function defaultFixtureLocation(fixture: Fixture): FixtureLocation {
  const defaults = fixture.locations.filter((loc) => loc.isDefault)
  if (defaults.length !== 1) {
    throw new Error(
      `Fixture must mark exactly one location isDefault, found ${defaults.length}`,
    )
  }
  return defaults[0]
}
