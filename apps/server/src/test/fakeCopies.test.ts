import { describe, expect, it } from 'vitest'
import { createInventoryLogFake, makeInventoryLog } from './inventoryLogFake.js'
import { createShoppingFake } from './shoppingFake.js'

// `inventoryLogFake` and `shoppingFake` have no test file of their own. This
// one pins a single rule for both: every read and write returns a COPY, never
// the stored row (since 2026-11-15), as Prisma does. Before that date both
// returned the live row, the same flaw `stockFake` had (households H3b task
// B.6).
//
// Each case changes the returned object, a value AND the time inside a `Date`,
// then reads the store. A shallow copy (`{ ...row }`) would keep the stored
// `Date` and fail, so the check proves a deep copy.

const T = new Date('2026-03-01T00:00:00.000Z')

describe('inventoryLogFake returns copies, not the stored rows', () => {
  function seeded() {
    const fake = createInventoryLogFake()
    fake.reset([
      makeInventoryLog({
        id: 'log_1',
        itemId: 'item_1',
        userId: 'user_1',
        locationId: 'loc_a',
        quantity: 2,
        occurredAt: new Date(T),
      }),
    ])
    return fake
  }
  type Fake = ReturnType<typeof seeded>
  type LogLike = { quantity: number | null; occurredAt: Date | null }

  const CASES: { name: string; call: (f: Fake) => Promise<LogLike | null | undefined> }[] = [
    { name: 'findUnique', call: (f) => f.client.findUnique({ where: { id: 'log_1' } }) },
    { name: 'findFirst', call: (f) => f.client.findFirst({ where: { id: 'log_1' } }) },
    { name: 'findMany', call: async (f) => (await f.client.findMany({ where: { id: 'log_1' } }))[0] },
    {
      name: 'upsert (row exists)',
      call: (f) => f.client.upsert({ where: { id: 'log_1' }, update: { note: 'x' }, create: {} }),
    },
  ]

  for (const c of CASES) {
    it(`${c.name}: changing the returned row leaves the stored row alone`, async () => {
      // Given one stored log with quantity 2
      const fake = seeded()

      // When the caller changes the row it got back
      const row = await c.call(fake)
      if (!row?.occurredAt) throw new Error('expected a row with occurredAt')
      row.quantity = 99
      row.occurredAt.setTime(0)

      // Then the stored row still holds the old values
      const stored = fake.state.logs.find((l) => l.id === 'log_1')
      expect(stored?.quantity).toBe(2)
      expect(stored?.occurredAt).toEqual(T)
    })
  }

  it('create: the returned row is not the stored one', async () => {
    // Given an empty store
    const fake = createInventoryLogFake()

    // When a log is created and the caller changes what came back
    const row = await fake.client.create({
      data: { id: 'log_2', itemId: 'item_1', userId: 'user_1', locationId: 'loc_a', quantity: 1 },
    })
    row.quantity = 99

    // Then the stored row keeps its quantity
    expect(fake.state.logs.find((l) => l.id === 'log_2')?.quantity).toBe(1)
  })
})

describe('shoppingFake returns copies, not the stored rows', () => {
  function seeded() {
    const fake = createShoppingFake()
    fake.reset(
      [{ id: 'vendor_1', name: 'Costco', householdId: 'hh_1' }],
      [{ id: 'loc_a:no-vendor', locationId: 'loc_a', lastPurchasedAt: new Date(T) }],
    )
    return fake
  }
  type Fake = ReturnType<typeof seeded>
  type CartLike = { locationId: string; lastPurchasedAt: Date | null }

  const CASES: { name: string; call: (f: Fake) => Promise<CartLike | null | undefined> }[] = [
    { name: 'cart.findUnique', call: (f) => f.client.cart.findUnique({ where: { id: 'loc_a:no-vendor' } }) },
    { name: 'cart.findFirst', call: (f) => f.client.cart.findFirst({ where: { id: 'loc_a:no-vendor' } }) },
    {
      name: 'cart.findMany',
      call: async (f) => (await f.client.cart.findMany({ where: { id: 'loc_a:no-vendor' } }))[0],
    },
    {
      name: 'cart.upsert (row exists)',
      call: (f) =>
        f.client.cart.upsert({
          where: { id: 'loc_a:no-vendor' },
          update: {},
          create: { id: 'loc_a:no-vendor', locationId: 'loc_a' },
        }),
    },
  ]

  for (const c of CASES) {
    it(`${c.name}: changing the returned row leaves the stored row alone`, async () => {
      // Given one stored cart at loc_a
      const fake = seeded()

      // When the caller changes the row it got back
      const row = await c.call(fake)
      if (!row?.lastPurchasedAt) throw new Error('expected a row with lastPurchasedAt')
      row.locationId = 'loc_z'
      row.lastPurchasedAt.setTime(0)

      // Then the stored row still holds the old values
      const stored = fake.state.carts.find((r) => r.id === 'loc_a:no-vendor')
      expect(stored?.locationId).toBe('loc_a')
      expect(stored?.lastPurchasedAt).toEqual(T)
    })
  }

  it('cart.create, vendor.create and vendor.findMany: the returned row is not the stored one', async () => {
    // Given a store with one vendor
    const fake = seeded()

    // When the caller changes rows it got back
    const cart = await fake.client.cart.create({ data: { id: 'loc_b:no-vendor', locationId: 'loc_b' } })
    cart.locationId = 'loc_z'
    const vendor = await fake.client.vendor.create({ data: { name: 'iHerb', householdId: 'hh_1' } })
    vendor.name = 'Changed'
    const [listed] = await fake.client.vendor.findMany({ where: { id: 'vendor_1' } })
    if (!listed) throw new Error('expected vendor_1')
    listed.name = 'Changed'

    // Then the stored rows are unchanged
    expect(fake.state.carts.find((r) => r.id === 'loc_b:no-vendor')?.locationId).toBe('loc_b')
    expect(fake.state.vendors.map((v) => v.name)).toEqual(['Costco', 'iHerb'])
  })
})
