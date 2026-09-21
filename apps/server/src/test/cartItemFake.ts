// Prisma `where` matching for `CartItem`, shared by the two resolver specs
// that filter cart entries by location — `cart.resolver.test.ts`
// (`cartItemCountByItem`) and `itemStock.resolver.test.ts`
// (`removeItemFromLocation`'s cascade).
//
// NOT a test file, so `tsc` type-checks it — the same reasoning
// `src/test/stockFake.ts` records.
//
// ── WHY THIS IS SHARED AND NOT COPIED ──
//
// Both resolvers ask the same question: "which of this item's cart entries
// belong to this location". Since PR 3c both ask it with the SAME relation
// filter, `where: { itemId, userId, cart: { locationId } }`. The Stock tab
// shows the count in its remove-confirmation dialog and the removal then acts
// on it, so a disagreement between the two would show the user a number the
// removal does not match. One matcher keeps the two specs honest about that.
//
// ── THE CONSTRAINT THIS MODELS ──
//
// A hand-written fake that walks `where` key by key silently IGNORES a key it
// does not know about. `cart` is a nested relation filter, so a matcher
// written only for flat columns would return the same rows with it and
// without it — and then every test here would pass against a resolver that
// dropped the location scope entirely. Root CLAUDE.md: "Write test doubles to
// model the constraint, not the happy path."
//
// `cart: { locationId }` is therefore resolved the way Postgres resolves it:
// follow `CartItem.cartId` to its `Cart` row and read that row's
// `locationId` column. NOT the text of the cart id. The id happens to start
// with the location id today (`${locationId}:${vendorId | 'no-vendor'}`), but
// it is DERIVED from the column, and a fake that read the string would keep a
// resolver green after it went back to parsing ids.

/** Only the columns a location filter needs. */
export interface FakeCart {
  id: string
  locationId: string
}

/** `CartItem` has no `locationId` of its own — see the note above. */
export interface FakeCartItem {
  id: string
  cartId: string
  itemId: string
  userId: string
}

/**
 * Raised when a fixture holds a `CartItem` whose `cartId` names no `Cart` in
 * the store. Real Postgres cannot reach that state: `CartItem.cartId` is a
 * NOT NULL foreign key onto `Cart.id`. Returning "no match" instead would let
 * an incomplete fixture quietly shrink a count, so this fails loudly and names
 * the row to fix.
 */
export class MissingCartError extends Error {
  constructor(cartItemId: string, cartId: string) {
    super(
      `Fixture error: CartItem '${cartItemId}' points at cart '${cartId}', which is not in the fake's carts store. ` +
        'CartItem.cartId is a NOT NULL foreign key onto Cart.id, so seed the cart too.',
    )
  }
}

/**
 * Apply Prisma's `where` semantics for `CartItem`.
 *
 * Every key is `where.x === undefined || row.x === where.x`, which is Prisma's
 * own rule. A hardcoded ownership or location match would keep a scoping test
 * green after the resolver dropped the scope.
 *
 * Supported keys: `id` (plain string or `{ in: [...] }`), `cartId`, `itemId`,
 * `userId`, and the relation filter `cart: { locationId }`.
 *
 * @param carts every `Cart` row the fixture holds — the relation filter reads
 *   `locationId` off these, never off the cart id string
 */
export function cartItemMatches(
  row: FakeCartItem,
  where: Record<string, unknown>,
  carts: FakeCart[],
): boolean {
  if (where.itemId !== undefined && row.itemId !== where.itemId) return false
  if (where.userId !== undefined && row.userId !== where.userId) return false
  if (where.cartId !== undefined && row.cartId !== where.cartId) return false

  const id = where.id
  if (typeof id === 'string' && row.id !== id) return false
  if (id !== null && typeof id === 'object') {
    const list = (id as { in?: string[] }).in
    if (list !== undefined && !list.includes(row.id)) return false
  }

  const cartFilter = where.cart as { locationId?: string } | undefined
  if (cartFilter !== undefined) {
    const cart = carts.find((c) => c.id === row.cartId)
    if (!cart) throw new MissingCartError(row.id, row.cartId)
    if (cartFilter.locationId !== undefined && cart.locationId !== cartFilter.locationId) {
      return false
    }
  }
  return true
}
