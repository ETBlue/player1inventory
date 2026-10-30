import { describe, expect, it } from 'vitest'
import type { ExpirationMode, StockConfigFields, StockFields } from '@/types'
import { computeExpiryDate } from './expiration'

// `computeExpiryDate` takes the stock slice, NOT an `Item`: since the v15/v16
// split `dueDate` lives on `ItemStock` while `expirationMode` and
// `estimatedDueDays` live on `Item`, so `Pick<Item, 'dueDate' | …>` names a key
// `Item` does not have and does not type-check at all. The function's own
// parameter type (lib/expiration.ts:4-7 and :19-22) is this.
type ItemSlice = Pick<
  StockFields & StockConfigFields,
  'expirationMode' | 'dueDate' | 'estimatedDueDays'
>

// Every test below states all three fields, because all three are read:
// `inferExpirationMode` (lib/expiration.ts:10-16) reads `expirationMode`,
// `estimatedDueDays` and `dueDate` to pick the mode, and `computeExpiryDate`
// (lib/expiration.ts:26-32) reads them again to produce the date. A default
// would let a fixture quietly describe a different case from its title.
//
// WHY A FACTORY AND NOT A PLAIN OBJECT LITERAL. All three keys are OPTIONAL on
// `ItemSlice`, and `exactOptionalPropertyTypes` is on, so a literal cannot hold
// an explicit `undefined` — "not configured" is spelled as an absent key. This
// builder lets each test keep writing `undefined` and drops those keys on the
// way out. The two forms are indistinguishable to the module under test: it
// reads the fields with `??`, `!= null` and truthiness only, never with `in` or
// `Object.keys`.
const makeSlice = (fields: {
  expirationMode: ExpirationMode | undefined
  dueDate: Date | undefined
  estimatedDueDays: number | undefined
}): ItemSlice => {
  const slice: ItemSlice = {}
  if (fields.expirationMode !== undefined) {
    slice.expirationMode = fields.expirationMode
  }
  if (fields.dueDate !== undefined) slice.dueDate = fields.dueDate
  if (fields.estimatedDueDays !== undefined) {
    slice.estimatedDueDays = fields.estimatedDueDays
  }
  return slice
}

describe('computeExpiryDate', () => {
  const dueDate = new Date('2026-06-01')
  const lastPurchase = new Date('2026-01-01')

  it('returns undefined when mode is disabled', () => {
    const item = makeSlice({
      expirationMode: 'disabled',
      dueDate,
      estimatedDueDays: 30,
    })
    expect(computeExpiryDate(item, lastPurchase)).toBeUndefined()
  })

  it('returns undefined when mode is undefined and all data is missing (truly disabled)', () => {
    const item = makeSlice({
      expirationMode: undefined,
      dueDate: undefined,
      estimatedDueDays: undefined,
    })
    expect(computeExpiryDate(item, lastPurchase)).toBeUndefined()
  })

  it('infers days from purchase mode when expirationMode is undefined but estimatedDueDays is set', () => {
    const item = makeSlice({
      expirationMode: undefined,
      estimatedDueDays: 30,
      dueDate: undefined,
    })
    const result = computeExpiryDate(item, lastPurchase)
    const expected = new Date(lastPurchase.getTime() + 30 * 24 * 60 * 60 * 1000)
    expect(result).toEqual(expected)
  })

  it('infers date mode when expirationMode is undefined but dueDate is set', () => {
    const item = makeSlice({
      expirationMode: undefined,
      dueDate,
      estimatedDueDays: undefined,
    })
    expect(computeExpiryDate(item)).toEqual(dueDate)
  })

  it('returns dueDate when mode is date', () => {
    const item = makeSlice({
      expirationMode: 'date',
      dueDate,
      estimatedDueDays: undefined,
    })
    expect(computeExpiryDate(item)).toEqual(dueDate)
  })

  it('returns undefined when mode is date but dueDate is missing', () => {
    const item = makeSlice({
      expirationMode: 'date',
      dueDate: undefined,
      estimatedDueDays: undefined,
    })
    expect(computeExpiryDate(item)).toBeUndefined()
  })

  it('returns lastPurchase + estimatedDueDays when mode is days from purchase', () => {
    const item = makeSlice({
      expirationMode: 'days from purchase',
      dueDate: undefined,
      estimatedDueDays: 30,
    })
    const result = computeExpiryDate(item, lastPurchase)
    const expected = new Date(lastPurchase.getTime() + 30 * 24 * 60 * 60 * 1000)
    expect(result).toEqual(expected)
  })

  it('returns undefined when mode is days from purchase but lastPurchaseDate is missing', () => {
    const item = makeSlice({
      expirationMode: 'days from purchase',
      dueDate: undefined,
      estimatedDueDays: 30,
    })
    expect(computeExpiryDate(item, undefined)).toBeUndefined()
  })

  it('returns undefined when mode is days from purchase but estimatedDueDays is missing', () => {
    const item = makeSlice({
      expirationMode: 'days from purchase',
      dueDate: undefined,
      estimatedDueDays: undefined,
    })
    expect(computeExpiryDate(item, lastPurchase)).toBeUndefined()
  })
})
