import { describe, expect, it } from 'vitest'
import { buildCheckoutLogQuantities } from './checkoutQuantities'

// Every fixture here sets BOTH `amountPerPackage` AND a non-zero
// `unpackedQuantity`. Without both, the right formula and the two wrong ones
// give the same answer and the test cannot fail:
//
//   amountPerPackage 6, packed 2, unpacked 3, bought 1
//     correct  getPackedTotal(stock) + 1  = (2 + 3/6) + 1 = 3.5
//     wrong 1  raw sum                    = 2 + 3 + 1     = 6
//     wrong 2  delta added BEFORE convert = 2 + (3+1)/6   = 2.666…
//
// All three differ, so the assertion tells the correct implementation apart
// from both wrong ones.
const PACKED_ITEM = {
  id: 'item-1',
  packedQuantity: 2,
  unpackedQuantity: 3,
  amountPerPackage: 6,
}

describe('buildCheckoutLogQuantities', () => {
  it('user buying an item sold in packs logs the converted total, not the raw sum', () => {
    // Given one item with 2 packed and 3 unpacked at 6 per package, 1 bought
    const cartItems = [{ itemId: 'item-1', quantity: 1 }]

    // When the checkout payload is built
    const result = buildCheckoutLogQuantities(cartItems, [PACKED_ITEM])

    // Then the unpacked remainder is converted to packs BEFORE the bought
    // quantity is added: (2 + 3/6) + 1
    expect(result).toEqual([{ itemId: 'item-1', quantity: 3.5 }])
    // And not the raw sum the cloud resolver used to write
    expect(result[0].quantity).not.toBe(6)
    // And not the delta folded into the unpacked amount before converting
    expect(result[0].quantity).not.toBeCloseTo(2 + 4 / 6, 5)
  })

  it('user buying a fractional pack quantity gets the delta added in packs', () => {
    // Given the same stock, with a fractional pack quantity bought
    const cartItems = [{ itemId: 'item-1', quantity: 0.5 }]

    // When the checkout payload is built
    const result = buildCheckoutLogQuantities(cartItems, [PACKED_ITEM])

    // Then the delta is added in packs: (2 + 3/6) + 0.5
    expect(result).toEqual([{ itemId: 'item-1', quantity: 3 }])
  })

  it('user buying an item with no amountPerPackage logs the plain sum', () => {
    // Given an item with no conversion rate, 2 packed and 3 unpacked
    const item = { id: 'item-2', packedQuantity: 2, unpackedQuantity: 3 }
    const cartItems = [{ itemId: 'item-2', quantity: 1 }]

    // When the checkout payload is built
    const result = buildCheckoutLogQuantities(cartItems, [item])

    // Then no conversion is applied — packed + unpacked + bought
    expect(result).toEqual([{ itemId: 'item-2', quantity: 6 }])
  })

  it('an item in the cart at quantity 0 gets no entry', () => {
    // Given two cart rows, one of them at quantity 0
    const other = {
      id: 'item-2',
      packedQuantity: 1,
      unpackedQuantity: 0,
      amountPerPackage: 6,
    }
    const cartItems = [
      { itemId: 'item-1', quantity: 1 },
      { itemId: 'item-2', quantity: 0 },
    ]

    // When the checkout payload is built
    const result = buildCheckoutLogQuantities(cartItems, [PACKED_ITEM, other])

    // Then only the bought item has an entry. This matches the server's
    // `buyingItems` filter (cart.resolver.ts:167), which writes a log row for
    // exactly the same set.
    expect(result).toEqual([{ itemId: 'item-1', quantity: 3.5 }])
  })

  it('a cart row whose item is missing from the pantry list is skipped', () => {
    // Given a cart row for an item the page does not hold
    const cartItems = [
      { itemId: 'item-1', quantity: 1 },
      { itemId: 'ghost', quantity: 2 },
    ]

    // When the checkout payload is built
    const result = buildCheckoutLogQuantities(cartItems, [PACKED_ITEM])

    // Then it is skipped rather than sent with a guessed total. The server
    // then rejects the whole checkout with `BAD_USER_INPUT` naming `ghost`,
    // which is the accepted race — it must not silently log a wrong number.
    expect(result).toEqual([{ itemId: 'item-1', quantity: 3.5 }])
  })

  it('an empty cart produces an empty list', () => {
    // Given no cart rows
    // When the checkout payload is built
    const result = buildCheckoutLogQuantities([], [PACKED_ITEM])

    // Then the list is empty — a real, if pointless, checkout
    expect(result).toEqual([])
  })
})
