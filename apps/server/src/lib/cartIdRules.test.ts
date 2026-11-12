// Behaviour tests for the cart id rules in `@p1i/types` (`cartIdFor` and
// `parseCartId`, in `packages/types/src/index.ts`).
//
// The server's resolvers (`cart`, `vendor`, `import`) and the web app both
// import these two functions. There is one copy. These tests pin the exact id
// each case builds and the exact parts each id parses back to, so a change to
// either function goes red here. `packages/types` has no test runner of its
// own, and this file runs in `pnpm test` (the server suite).
import { cartIdFor, parseCartId } from '@p1i/types'
import { describe, expect, it } from 'vitest'

// The rules that are easy to get wrong, not just the common shape. Each case
// states the exact id `cartIdFor` must build.
const CASES: {
  locationId: string
  vendorId: string | null
  label: string
  id: string
}[] = [
  {
    locationId: 'loc_kitchen',
    vendorId: 'vendor_costco',
    label: 'a normal vendor cart',
    id: 'loc_kitchen:vendor_costco',
  },
  {
    locationId: 'loc_kitchen',
    vendorId: null,
    label: 'the no-vendor cart',
    id: 'loc_kitchen:no-vendor',
  },
  {
    locationId: 'loc_kitchen',
    vendorId: 'a:b',
    label: 'a vendor id containing one colon',
    id: 'loc_kitchen:a:b',
  },
  {
    locationId: 'loc_kitchen',
    vendorId: 'a:b:c',
    label: 'a vendor id containing two colons',
    id: 'loc_kitchen:a:b:c',
  },
  {
    locationId: 'loc_kitchen',
    vendorId: 'no-vendor:x',
    label: "a vendor id starting with 'no-vendor:'",
    id: 'loc_kitchen:no-vendor:x',
  },
]

describe('cartIdFor', () => {
  for (const { locationId, vendorId, label, id } of CASES) {
    it(`builds ${JSON.stringify(id)} for ${label}`, () => {
      expect(cartIdFor(locationId, vendorId)).toBe(id)
    })
  }
})

describe('parseCartId', () => {
  // Every id `cartIdFor` builds parses back to the parts it was built from.
  for (const { locationId, vendorId, label, id } of CASES) {
    it(`parses ${JSON.stringify(id)} back to its parts (${label})`, () => {
      expect(parseCartId(id)).toEqual({ locationId, vendorId })
    })
  }

  // Ids `cartIdFor` never builds, but which can still arrive.
  const OTHER_IDS: {
    id: string
    label: string
    parsed: { locationId: string; vendorId: string | null }
  }[] = [
    {
      id: 'vendor_costco',
      label: 'a pre-migration id with no colon',
      parsed: { locationId: 'vendor_costco', vendorId: null },
    },
    {
      id: 'no-vendor',
      label: "the pre-migration bare 'no-vendor' id",
      parsed: { locationId: 'no-vendor', vendorId: null },
    },
    {
      // An empty vendor id, NOT the no-vendor cart.
      id: 'loc_kitchen:',
      label: 'a trailing colon',
      parsed: { locationId: 'loc_kitchen', vendorId: '' },
    },
  ]
  for (const { id, label, parsed } of OTHER_IDS) {
    it(`parses ${JSON.stringify(id)} (${label})`, () => {
      expect(parseCartId(id)).toEqual(parsed)
    })
  }
})

describe('the rules the migration and the resolvers depend on', () => {
  it('the no-vendor cart id is the location id plus ":no-vendor"', () => {
    // The migration's phase A builds this id in SQL as `l."id" || ':no-vendor'`
    // (prisma/migrations/20260917000000_rekey_cart_to_location_vendor).
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
