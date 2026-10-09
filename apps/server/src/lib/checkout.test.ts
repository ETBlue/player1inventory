// The drift guard for the two copies of the "is this cart row being bought?"
// rule.
//
// `src/lib/checkout.ts` explains why the server carries its own copy: the
// shared `@p1i/types` package ships raw TypeScript, so `node dist/index.js`
// cannot load it. Vitest CAN load it, so this file compares the two copies
// directly.
//
// If someone edits one copy and not the other, these tests go red.
import { isBeingBought as sharedIsBeingBought } from '@p1i/types'
import { describe, expect, it } from 'vitest'
import { isBeingBought } from './checkout.js'

// Every case below is run against both copies. The list covers the values that
// are easy to get wrong, not just the common shape.
const CASES: { quantity: number; label: string; expected: boolean }[] = [
  { quantity: 2, label: 'a whole pack bought', expected: true },
  { quantity: 1, label: 'the smallest whole quantity', expected: true },
  { quantity: 0.5, label: 'half a pack bought', expected: true },
  // The boundary. `> 0` and `>= 0` differ here and nowhere else, so this is
  // the one case that tells the two rules apart.
  { quantity: 0, label: 'a pinned row — the boundary between > 0 and >= 0', expected: false },
  { quantity: -1, label: 'a negative quantity', expected: false },
  { quantity: -0.5, label: 'a negative fraction', expected: false },
  // 0 and -0 are `===` in JavaScript, so both rules agree. Listed so a future
  // rule written with `Math.sign` or a string compare is caught.
  { quantity: -0, label: 'negative zero', expected: false },
  {
    quantity: Number.MIN_VALUE,
    label: 'the smallest positive number representable',
    expected: true,
  },
]

describe('isBeingBought matches the copy in @p1i/types', () => {
  for (const { quantity, label } of CASES) {
    it(label, () => {
      expect(isBeingBought({ quantity })).toBe(sharedIsBeingBought({ quantity }))
    })
  }
})

describe('the rule checkout depends on', () => {
  for (const { quantity, label, expected } of CASES) {
    it(`${label} → ${expected}`, () => {
      // Pinning the ANSWER as well as the agreement. Without this, both copies
      // could be changed together and the comparison above would stay green.
      expect(isBeingBought({ quantity })).toBe(expected)
      expect(sharedIsBeingBought({ quantity })).toBe(expected)
    })
  }

  it('a pinned row is excluded from the set checkout buys', () => {
    // Given a cart holding one bought row and one pinned row
    const cartItems = [
      { itemId: 'item_milk', quantity: 2 },
      { itemId: 'item_eggs', quantity: 0 },
    ]

    // When the resolver's filter is applied
    const buyingItems = cartItems.filter(isBeingBought)

    // Then only the bought row is in it. The client builds its `items`
    // argument from the same rule, so the resolver finds a quantity for every
    // row here and never throws BAD_USER_INPUT on a legitimate checkout.
    expect(buyingItems.map((ci) => ci.itemId)).toEqual(['item_milk'])
  })
})
