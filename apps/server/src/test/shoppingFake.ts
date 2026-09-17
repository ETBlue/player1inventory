// A stateful Prisma double for `vendor` + `cart`, used by
// `resolvers/cartBootstrap.test.ts` to run createVendor and bootstrapCarts
// against one another end to end.
//
// NOT a test file, so `tsc` type-checks it — the same reasoning
// `src/test/stockFake.ts` records.
//
// Why a stateful fake and not the call recorders the other cart specs use:
// Task 2's question is "does this vendor have a cart at the location I just
// switched to", and that is an END STATE spanning two mutations. A recorder can
// only answer "was createMany called with these arguments", which restates the
// implementation instead of testing it, and would stay green if the two halves
// wrote ids that did not match each other.
//
// It models CONSTRAINTS, not the happy path (root CLAUDE.md → "Write test
// doubles to model the constraint, not the happy path"):
//
//   - `Cart.id` is a PRIMARY KEY. A second `create` or an un-flagged
//     `createMany` on an existing id throws the way Postgres raises P2002.
//     A fake that silently overwrote would hide exactly the bug PR 3b's
//     re-key introduces — two writers producing the same cart id.
//   - `createMany({ skipDuplicates: true })` skips instead, which is real
//     Prisma behaviour on PostgreSQL, so the resolver's race tolerance is a
//     tested choice rather than an untested assumption.
//   - `where` matching models Prisma's own semantics
//     (`where.x === undefined || row.x === where.x`), never a hardcoded
//     ownership match. A fake that hardcoded `c.userId === where.userId` would
//     keep a scoping assertion green after the resolver dropped the scope.
//
// What it deliberately does NOT model: transactions, cart items, and
// `lastPurchasedAt` updates. Those belong to `cart.resolver.test.ts`.

export interface FakeVendor {
  id: string
  name: string
  userId: string
}

export interface FakeCart {
  id: string
  userId: string
  locationId: string
  lastPurchasedAt: Date | null
}

export interface ShoppingFakeState {
  vendors: FakeVendor[]
  carts: FakeCart[]
}

type Where = Record<string, unknown>

/** Prisma's P2002, as Postgres raises it for a duplicate `Cart.id`. */
export class CartIdConstraintError extends Error {
  code = 'P2002'
  constructor(id: string) {
    super(`Unique constraint failed on the fields: (\`id\`) — (${id})`)
  }
}

// `undefined ||` on every key, deliberately: that is Prisma's semantics, and it
// is what makes dropping a key from a resolver's where clause visible.
function matchesVendor(row: FakeVendor, where: Where): boolean {
  if (where.id !== undefined && row.id !== where.id) return false
  if (where.userId !== undefined && row.userId !== where.userId) return false
  return true
}

function matchesCart(row: FakeCart, where: Where): boolean {
  if (where.userId !== undefined && row.userId !== where.userId) return false
  if (where.locationId !== undefined && row.locationId !== where.locationId) return false
  const id = where.id
  if (id !== undefined) {
    if (typeof id === 'string') return row.id === id
    const list = (id as { in?: string[] }).in
    if (list !== undefined && !list.includes(row.id)) return false
  }
  return true
}

export function createShoppingFake() {
  const state: ShoppingFakeState = { vendors: [], carts: [] }
  let seq = 0

  function insertCart(data: Record<string, unknown>): FakeCart {
    const id = data.id as string
    if (state.carts.some((c) => c.id === id)) throw new CartIdConstraintError(id)
    const row: FakeCart = {
      id,
      userId: data.userId as string,
      locationId: data.locationId as string,
      lastPurchasedAt: (data.lastPurchasedAt as Date | null) ?? null,
    }
    state.carts.push(row)
    return row
  }

  const client = {
    vendor: {
      findMany: async ({ where = {} }: { where?: Where } = {}) =>
        state.vendors.filter((v) => matchesVendor(v, where)),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: FakeVendor = {
          id: `vendor-${++seq}`,
          name: data.name as string,
          userId: data.userId as string,
        }
        state.vendors.push(row)
        return row
      },
      delete: async ({ where }: { where: Where }) => {
        const idx = state.vendors.findIndex((v) => matchesVendor(v, where))
        if (idx === -1) throw new Error('Vendor not found')
        return state.vendors.splice(idx, 1)[0]
      },
    },
    cart: {
      findUnique: async ({ where }: { where: Where }) =>
        state.carts.find((c) => matchesCart(c, where)) ?? null,
      findFirst: async ({ where = {} }: { where?: Where } = {}) =>
        state.carts.find((c) => matchesCart(c, where)) ?? null,
      findMany: async ({
        where = {},
        orderBy,
      }: { where?: Where; orderBy?: unknown } = {}) => {
        const rows = state.carts.filter((c) => matchesCart(c, where))
        // Only `[{ id: 'asc' }]` is used by the resolvers, so that is the only
        // order modelled. Anything else is left unsorted rather than quietly
        // pretending to have applied it.
        if (Array.isArray(orderBy) && (orderBy[0] as { id?: string })?.id === 'asc') {
          rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        }
        return rows
      },
      create: async ({ data }: { data: Record<string, unknown> }) => insertCart(data),
      createMany: async ({
        data,
        skipDuplicates = false,
      }: {
        data: Record<string, unknown>[]
        skipDuplicates?: boolean
      }) => {
        let count = 0
        for (const row of data) {
          const id = row.id as string
          if (state.carts.some((c) => c.id === id)) {
            if (skipDuplicates) continue
            throw new CartIdConstraintError(id)
          }
          insertCart(row)
          count++
        }
        return { count }
      },
      upsert: async ({
        where,
        create,
      }: {
        where: Where
        create: Record<string, unknown>
        update: Record<string, unknown>
      }) => {
        const existing = state.carts.find((c) => matchesCart(c, where))
        // `update: {}` is the only update any resolver passes, so an existing
        // row is returned unchanged rather than run through a merge that no
        // caller exercises.
        return existing ?? insertCart(create)
      },
      deleteMany: async ({ where = {} }: { where?: Where } = {}) => {
        const before = state.carts.length
        state.carts = state.carts.filter((c) => !matchesCart(c, where))
        return { count: before - state.carts.length }
      },
    },
  }

  function reset(vendors: FakeVendor[] = [], carts: FakeCart[] = []) {
    state.vendors = vendors
    state.carts = carts
    seq = 0
  }

  return { state, client, reset }
}

export type ShoppingFake = ReturnType<typeof createShoppingFake>
