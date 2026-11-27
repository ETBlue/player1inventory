import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import {
  formatLogDelta,
  formatLogNumber,
  formatLogTime,
  type LogNameLookup,
  logAmountsOf,
  logKindOf,
  logLabelOf,
  logUnitOf,
} from '@/lib/inventoryLogDisplay'
import { stockCountChange } from '@/types'

const en = i18n.getFixedT('en')
const tw = i18n.getFixedT('tw')
const NO_VENDOR = [en('shopping.noVendor'), tw('shopping.noVendor')]

// Current names: vendor `v-costco` was renamed, recipe `r-bread` was renamed.
// `v-gone` and `r-gone` were deleted.
const NAMES: LogNameLookup = {
  vendorName: (id) => (id === 'v-costco' ? 'Costco Wholesale' : undefined),
  recipeName: (id) => (id === 'r-bread' ? 'Sourdough' : undefined),
}

// 500 g per bag, tracked in grams.
const FLOUR = {
  targetUnit: 'measurement' as const,
  measurementUnit: 'g',
  amountPerPackage: 500,
  packageUnit: 'bag',
}
// Tracked in bottles.
const JUICE = { targetUnit: 'package' as const, packageUnit: 'bottle' }

describe('the kind of a log row', () => {
  it.each([
    ['purchase', 'purchase'],
    ['shopping.log.purchasedAt', 'purchase'],
    ['cooking', 'cooking'],
    ['cooking.log.consumedVia', 'cooking'],
    ['cooking.log.consumedViaRecipe', 'cooking'],
    ['stockCount', 'stockCount'],
    ['log.purchased', null],
    [undefined, null],
  ])('logKey %s is %s', (logKey, kind) => {
    expect(logKindOf(logKey === undefined ? {} : { logKey })).toBe(kind)
  })
})

describe('the unit and the amounts of a log row', () => {
  it('an item tracked in measurement shows grams; one tracked in packages its package unit', () => {
    expect(logUnitOf(FLOUR)).toEqual({ unit: 'g', perPackage: 500 })
    expect(logUnitOf(JUICE)).toEqual({ unit: 'bottle', perPackage: 1 })
  })

  it('an item set to measurement but with no amountPerPackage falls back to packages, as consumeItem does', () => {
    expect(
      logUnitOf({
        targetUnit: 'measurement',
        measurementUnit: 'g',
        packageUnit: 'bag',
      }),
    ).toEqual({ unit: 'bag', perPackage: 1 })
  })

  it('user sees a stock count stored in packs converted to grams', () => {
    // Stored: −0.06 packs, 0.94 packs after
    const amounts = logAmountsOf(
      { logKey: 'stockCount', delta: -0.06, quantity: 0.94 },
      FLOUR,
    )
    expect(formatLogDelta(amounts.delta, amounts.unit)).toBe('−30 g')
    expect(formatLogNumber(amounts.quantity)).toBe('470')
  })

  it('user sees a purchase stored in packs converted to grams', () => {
    const amounts = logAmountsOf(
      { logKey: 'purchase', delta: 2, quantity: 3 },
      FLOUR,
    )
    expect(formatLogDelta(amounts.delta, amounts.unit)).toBe('+1000 g')
    expect(formatLogNumber(amounts.quantity)).toBe('1500')
  })

  it('user sees a cook as stored, because its delta is already in grams; only the total is converted', () => {
    const amounts = logAmountsOf(
      { logKey: 'cooking', delta: -200, quantity: 2.6 },
      FLOUR,
    )
    expect(formatLogDelta(amounts.delta, amounts.unit)).toBe('−200 g')
    expect(formatLogNumber(amounts.quantity)).toBe('1300')
  })

  it('an old cooking row is read the same way as a new one', () => {
    const amounts = logAmountsOf(
      { logKey: 'cooking.log.consumedVia', delta: -200, quantity: 2.6 },
      FLOUR,
    )
    expect(amounts.delta).toBe(-200)
  })

  it('an item tracked in packages is not converted at all', () => {
    const amounts = logAmountsOf(
      { logKey: 'stockCount', delta: 3, quantity: 5 },
      JUICE,
    )
    expect(formatLogDelta(amounts.delta, amounts.unit)).toBe('+3 bottle')
    expect(formatLogNumber(amounts.quantity)).toBe('5')
  })
})

describe('number formatting', () => {
  it.each([
    [3, '3'],
    [1.94, '1.94'],
    [0.333333, '0.33'],
    [469.99999999, '470'],
    [-0.001, '0'],
  ])('%s shows as %s', (n, text) => {
    expect(formatLogNumber(n)).toBe(text)
  })
})

describe('the label of a log row, in English', () => {
  const label = (log: Parameters<typeof logLabelOf>[0]) =>
    logLabelOf(log, en, NAMES, NO_VENDOR)

  it('user sees the CURRENT vendor name when the vendor still exists', () => {
    expect(
      label({
        logKey: 'purchase',
        logParams: { vendorId: 'v-costco', vendorName: 'Costco' },
      }),
    ).toBe('Bought at Costco Wholesale')
  })

  it('user sees the stored name of a deleted vendor', () => {
    expect(
      label({
        logKey: 'purchase',
        logParams: { vendorId: 'v-gone', vendorName: 'Old Market' },
      }),
    ).toBe('Bought at Old Market')
  })

  it('user sees "Bought" for the no-vendor cart', () => {
    expect(
      label({
        logKey: 'purchase',
        logParams: { vendorId: null, vendorName: null },
      }),
    ).toBe('Bought')
  })

  it('user sees current recipe names, then stored names, joined', () => {
    expect(
      label({
        logKey: 'cooking',
        logParams: {
          recipes: [
            { id: 'r-bread', name: 'Bread' },
            { id: 'r-gone', name: 'Pizza' },
          ],
        },
      }),
    ).toBe('Used in Sourdough, Pizza')
  })

  it('user sees "Used in cooking" for a cook with no recipe', () => {
    expect(label({ logKey: 'cooking', logParams: { recipes: [] } })).toBe(
      'Used in cooking',
    )
  })

  it('user sees "Stock count" for a stock count row', () => {
    expect(label({ logKey: 'stockCount' })).toBe('Stock count')
  })

  it('an old purchase row shows its stored vendor name', () => {
    expect(
      label({
        logKey: 'shopping.log.purchasedAt',
        logParams: { vendor: 'Costco' },
      }),
    ).toBe('Bought at Costco')
  })

  it('an old no-vendor purchase row, in either language, shows "Bought"', () => {
    for (const noVendor of NO_VENDOR) {
      expect(
        label({
          logKey: 'shopping.log.purchasedAt',
          logParams: { vendor: noVendor },
        }),
      ).toBe('Bought')
    }
  })

  it('old cooking rows show their stored recipe string, or "Used in cooking"', () => {
    expect(
      label({
        logKey: 'cooking.log.consumedVia',
        logParams: { recipes: 'Curry, Soup' },
      }),
    ).toBe('Used in Curry, Soup')
    expect(label({ logKey: 'cooking.log.consumedViaRecipe' })).toBe(
      'Used in cooking',
    )
  })

  it('a row with only a note shows the note', () => {
    expect(label({ note: 'Bought at Costco' })).toBe('Bought at Costco')
  })

  it('an unknown key never shows the raw key', () => {
    expect(label({ logKey: 'log.purchased' })).toBeNull()
    expect(label({ logKey: 'log.purchased', note: 'Bought' })).toBe('Bought')
  })
})

describe('the label of a log row, in Traditional Chinese', () => {
  const label = (log: Parameters<typeof logLabelOf>[0]) =>
    logLabelOf(log, tw, NAMES, NO_VENDOR)

  it('user reads every kind in Chinese', () => {
    expect(
      label({
        logKey: 'purchase',
        logParams: { vendorId: 'v-costco', vendorName: 'Costco' },
      }),
    ).toBe('在 Costco Wholesale 購買')
    expect(
      label({
        logKey: 'purchase',
        logParams: { vendorId: null, vendorName: null },
      }),
    ).toBe('購買')
    expect(
      label({
        logKey: 'cooking',
        logParams: {
          recipes: [
            { id: 'r-bread', name: 'Bread' },
            { id: 'r-gone', name: 'Pizza' },
          ],
        },
      }),
    ).toBe('用於 Sourdough、Pizza')
    expect(label({ logKey: 'cooking', logParams: { recipes: [] } })).toBe(
      '烹飪使用',
    )
    expect(label({ logKey: 'stockCount' })).toBe('盤點')
  })

  it('an English old row is read in Chinese too, because the row stores data', () => {
    expect(
      label({
        logKey: 'shopping.log.purchasedAt',
        logParams: { vendor: 'No vendor' },
      }),
    ).toBe('購買')
  })
})

describe('the date, weekday and time of a log row', () => {
  const when = new Date(2026, 10, 25, 14, 30)

  it('English: Wed, Nov 25, 2026 · 14:30', () => {
    expect(formatLogTime(when, 'en', en)).toBe('Wed, Nov 25, 2026 · 14:30')
  })

  it('Traditional Chinese: 2026/11/25（週三）14:30', () => {
    expect(formatLogTime(when, 'tw', tw)).toBe('2026/11/25（週三）14:30')
  })
})

// `stockCountChange` lives in `@p1i/types`, which has no test runner, and
// both the server's `upsertItemStock` and local `updateItem` call it.
describe('stockCountChange', () => {
  it('a change of the packed total gives the delta and the new total', () => {
    expect(
      stockCountChange(
        { packedQuantity: 2, unpackedQuantity: 0 },
        { packedQuantity: 5, unpackedQuantity: 0 },
        null,
      ),
    ).toEqual({ delta: 3, quantity: 5 })
  })

  it('a missing old row counts as 0', () => {
    expect(
      stockCountChange(
        undefined,
        { packedQuantity: 2, unpackedQuantity: 0 },
        null,
      ),
    ).toEqual({ delta: 2, quantity: 2 })
  })

  it('unpacked grams count as a fraction of a pack', () => {
    const change = stockCountChange(
      { packedQuantity: 1, unpackedQuantity: 0 },
      { packedQuantity: 0, unpackedQuantity: 470 },
      500,
    )
    expect(change?.delta).toBeCloseTo(-0.06, 9)
    expect(change?.quantity).toBeCloseTo(0.94, 9)
  })

  it('opening a pack keeps the total, so there is no change', () => {
    expect(
      stockCountChange(
        { packedQuantity: 2, unpackedQuantity: 0 },
        { packedQuantity: 1, unpackedQuantity: 500 },
        500,
      ),
    ).toBeNull()
  })
})
