// The drift guard for the two copies of the cart id rules.
//
// `src/lib/cartId.ts` explains why the server carries its own copy: the shared
// `@p1i/types` package ships raw TypeScript, so `node dist/index.js` cannot
// load it. Vitest CAN load it, so this file compares the two copies directly.
//
// If someone edits one copy and not the other, these tests go red.
import { describe, expect, it } from 'vitest'
import { cartIdFor as sharedCartIdFor, parseCartId as sharedParseCartId } from '@p1i/types'
import { cartIdFor, parseCartId } from './cartId.js'

// Every case below is run against both copies. The list covers the rules that
// are easy to get wrong, not just the common shape.
const CASES: { locationId: string; vendorId: string | null; label: string }[] = [
  { locationId: 'loc_kitchen', vendorId: 'vendor_costco', label: 'a normal vendor cart' },
  { locationId: 'loc_kitchen', vendorId: null, label: 'the no-vendor cart' },
  { locationId: 'loc_kitchen', vendorId: 'a:b', label: 'a vendor id containing one colon' },
  { locationId: 'loc_kitchen', vendorId: 'a:b:c', label: 'a vendor id containing two colons' },
  { locationId: 'loc_kitchen', vendorId: 'no-vendor:x', label: "a vendor id starting with 'no-vendor:'" },
]

describe('cartIdFor matches the copy in @p1i/types', () => {
  for (const { locationId, vendorId, label } of CASES) {
    it(label, () => {
      expect(cartIdFor(locationId, vendorId)).toBe(sharedCartIdFor(locationId, vendorId))
    })
  }
})

describe('parseCartId matches the copy in @p1i/types', () => {
  const ids = [
    ...CASES.map((c) => sharedCartIdFor(c.locationId, c.vendorId)),
    // A pre-migration id: no colon at all.
    'vendor_costco',
    'no-vendor',
    // A trailing colon — an empty vendor id, not the no-vendor cart.
    'loc_kitchen:',
  ]
  for (const id of ids) {
    it(`parses ${JSON.stringify(id)} the same way`, () => {
      expect(parseCartId(id)).toEqual(sharedParseCartId(id))
    })
  }
})

describe('the rules the migration and the resolvers depend on', () => {
  it('the no-vendor cart id is the location id plus ":no-vendor"', () => {
    // The migration's phase A builds this id in SQL as `l."id" || ':no-vendor'`.
    // If this rule changes, that SQL is wrong.
    expect(cartIdFor('loc_kitchen', null)).toBe('loc_kitchen:no-vendor')
  })

  it('a vendor id containing ":" survives the round trip', () => {
    // Given a vendor id that itself contains a colon
    const vendorId = 'weird:vendor:id'

    // When it is built into a cart id and parsed back
    const parsed = parseCartId(cartIdFor('loc_kitchen', vendorId))

    // Then both halves come back whole — the split is on the FIRST colon only
    expect(parsed).toEqual({ locationId: 'loc_kitchen', vendorId })
  })

  it('a pre-migration id parses to a location nobody owns', () => {
    // Given a cart id written before the re-key (a bare vendor id)
    // When it is parsed
    const parsed = parseCartId('vendor_costco')

    // Then the whole id is read as a location id. No Location row has that id,
    // so requireLocationRole rejects it — an old client fails loudly instead of
    // reading some other location's cart.
    expect(parsed).toEqual({ locationId: 'vendor_costco', vendorId: null })
  })
})
