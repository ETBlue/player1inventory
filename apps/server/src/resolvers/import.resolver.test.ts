import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    item: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    itemTag: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    itemVendor: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    tag: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    tagType: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    vendor: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    recipe: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    recipeItem: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    inventoryLog: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    cart: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    cartItem: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    shelf: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    itemStock: {
      deleteMany: vi.fn(),
      // Kept ARMED so the two "no stock row from the item import" tests can
      // assert `not.toHaveBeenCalled()`. Cloud locations PR 4b deleted the
      // dual-write that used to call it; stock now arrives through
      // `bulkCreateItemStocks` / `bulkUpsertItemStocks`, which this file does
      // not exercise (see `import-itemStock.resolver.test.ts`).
      //
      // Those two assertions are LABELLED NEGATIVE CONTROLS, and they are not
      // the vacuous kind: an armed recorder records, so re-adding a mirror
      // call to either resolver turns both of them red. What they cannot see
      // is WHICH location a row would have landed in — see the long comment
      // above the first of them.
      upsert: vi.fn(),
    },
    location: {
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '../lib/prisma.js'

const p = prisma as unknown as {
  item: {
    findUnique: ReturnType<typeof vi.fn>
    findUniqueOrThrow: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  itemTag: {
    createMany: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  itemVendor: {
    createMany: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  tag: {
    createMany: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
  }
  tagType: {
    createMany: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
  }
  vendor: {
    createMany: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
  }
  recipe: {
    findUnique: ReturnType<typeof vi.fn>
    findUniqueOrThrow: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
  }
  recipeItem: {
    createMany: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  inventoryLog: {
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  cart: {
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  cartItem: {
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  shelf: {
    findMany: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  itemStock: {
    deleteMany: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
  }
  location: {
    deleteMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
  }
  $transaction: ReturnType<typeof vi.fn>
}

// ─── Server ──────────────────────────────────────────────────────────────────

let server: ApolloServer<Context>

beforeAll(async () => {
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

afterAll(async () => {
  await server.stop()
})

// A default location for `ensureDefaultLocation` (lib/defaultLocation.ts) to
// find, so `resolveLogLocations` and `resolveCartLocations` have a fallback.
//
// The mock is ARMED on purpose even though no test in this file expects it to
// be called any more: the two "no stock row from the item import" tests assert
// `p.location.findFirst` was NOT called, and an armed mock makes that fail with
// "expected not to be called" instead of crashing on an undefined result.
//
// It answers "yes, that location is yours" for ANY id (ground rule 3 of the
// PR 4b plan), so NO ownership or which-location assertion can fail in this
// file. Those live in `import-itemStock.resolver.test.ts`,
// `import-inventoryLog-location.resolver.test.ts` and the resolver tests that
// use `src/test/stockFake.ts`.
const DEFAULT_LOCATION = { id: 'loc_default', userId: 'user_import_test' }

beforeEach(() => {
  vi.clearAllMocks()
  p.location.findFirst.mockResolvedValue(DEFAULT_LOCATION)
  p.itemStock.upsert.mockImplementation(async (args: unknown) => args)
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CONTEXT: Context = { userId: 'user_import_test' }

function makeItemInput(overrides: Partial<Record<string, unknown>> & { id: string }) {
  const { id, ...rest } = overrides
  return {
    id,
    name: 'Milk',
    tagIds: [],
    targetUnit: 'package',
    consumeAmount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...rest,
  }
}

function makePrismaItem(id: string, name = 'Milk') {
  return {
    id,
    name,
    targetUnit: 'package',
    consumeAmount: 1,
    expirationMode: 'disabled',
    userId: 'user_import_test',
    packageUnit: null,
    measurementUnit: null,
    amountPerPackage: null,
    estimatedDueDays: null,
    expirationThreshold: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: [],
    vendors: [],
  }
}

const BULK_CREATE_ITEMS = `
  mutation BulkCreateItems($items: [ItemInput!]!) {
    bulkCreateItems(items: $items) { id name userId }
  }
`

const BULK_UPSERT_ITEMS = `
  mutation BulkUpsertItems($items: [ItemInput!]!) {
    bulkUpsertItems(items: $items) { id name }
  }
`

const CLEAR_ALL_DATA = `mutation { clearAllData }`

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('bulkCreateItems', () => {
  it('user can bulk-create items with original IDs', async () => {
    // Given no existing item
    p.item.findUnique.mockResolvedValue(null)
    const prismaItem = makePrismaItem('item_abc123', 'Milk')
    p.item.create.mockResolvedValue(prismaItem)
    p.itemTag.createMany.mockResolvedValue({ count: 0 })
    p.itemVendor.createMany.mockResolvedValue({ count: 0 })
    p.item.findUniqueOrThrow.mockResolvedValue(prismaItem)

    // When calling bulkCreateItems
    const response = await server.executeOperation(
      {
        query: BULK_CREATE_ITEMS,
        variables: { items: [makeItemInput({ id: 'item_abc123', name: 'Milk' })] },
      },
      { contextValue: CONTEXT },
    )

    // Then the item is returned
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const items = response.body.singleResult.data?.bulkCreateItems as Array<{ id: string; name: string; userId: string }>
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe('item_abc123')
      expect(items[0].name).toBe('Milk')
      expect(items[0].userId).toBe('user_import_test')
    }
  })

  it('skips duplicate IDs instead of throwing', async () => {
    // Given item_existing already exists and item_new does not
    p.item.findUnique
      .mockResolvedValueOnce({ id: 'item_existing' }) // exists — skip
      .mockResolvedValueOnce(null) // new — create
    const prismaItem = makePrismaItem('item_new', 'New Item')
    p.item.create.mockResolvedValue(prismaItem)
    p.itemTag.createMany.mockResolvedValue({ count: 0 })
    p.itemVendor.createMany.mockResolvedValue({ count: 0 })
    p.item.findUniqueOrThrow.mockResolvedValue(prismaItem)

    // When bulk-creating with one conflicting and one new ID
    const response = await server.executeOperation(
      {
        query: BULK_CREATE_ITEMS,
        variables: {
          items: [
            makeItemInput({ id: 'item_existing', name: 'Duplicate' }),
            makeItemInput({ id: 'item_new', name: 'New Item' }),
          ],
        },
      },
      { contextValue: CONTEXT },
    )

    // Then only the new item is returned
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const items = response.body.singleResult.data?.bulkCreateItems as Array<{ id: string }>
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe('item_new')
    }
  })

  it('assigns the authenticated userId to imported items', async () => {
    // Given a new item
    p.item.findUnique.mockResolvedValue(null)
    const prismaItem = { ...makePrismaItem('item_xyz', 'Eggs'), userId: 'new_user' }
    p.item.create.mockResolvedValue(prismaItem)
    p.itemTag.createMany.mockResolvedValue({ count: 0 })
    p.itemVendor.createMany.mockResolvedValue({ count: 0 })
    p.item.findUniqueOrThrow.mockResolvedValue(prismaItem)

    // When a different user imports
    const response = await server.executeOperation(
      {
        query: BULK_CREATE_ITEMS,
        variables: { items: [makeItemInput({ id: 'item_xyz', name: 'Eggs' })] },
      },
      { contextValue: { userId: 'new_user' } },
    )

    // Then userId on the returned item matches the authenticated user
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const items = response.body.singleResult.data?.bulkCreateItems as Array<{ userId: string }>
      expect(items[0].userId).toBe('new_user')
    }
  })

  // ── NO STOCK COMES FROM THE ITEM IMPORT (cloud locations PR 4b) ───────────
  //
  // THIS TEST REPLACES `user importing items has each one stocked in their
  // default location`, which asserted the opposite. Until PR 4b both item
  // import resolvers mirrored the payload's inline stock into an `ItemStock`
  // in the CALLER'S DEFAULT location, because the import surface was flat and
  // the cloud pantry reads `ItemStock`. The client now uploads real
  // `ItemStock` rows through `bulkCreateItemStocks` / `bulkUpsertItemStocks`
  // (PR 4a), each row naming its own location. A mirror here would collapse a
  // multi-location pantry onto one location and overwrite those real rows, so
  // writing no stock is now the contract.
  //
  // WHAT THIS FILE CAN AND CANNOT PROVE. Every Prisma model here is a plain
  // `vi.fn()` call recorder, and `p.location.findFirst` answers
  // `DEFAULT_LOCATION` for ANY id (`:195`), so no assertion about WHICH
  // location a row landed in can fail in this file. "This resolver touched
  // `itemStock` not at all" needs no `where` matching, which is exactly what
  // a recorder can carry. The positive half of the contract — each stock row
  // lands in the location its own payload names — is pinned in
  // `import-itemStock.resolver.test.ts` against the stateful fake, whose
  // fixture holds three locations so a hardcoded default is visible.
  it('user importing items gets no stock row from the item import itself', async () => {
    // Given an item to import. Since cloud locations PR 5 the payload CANNOT
    // carry stock values — `ItemInput` no longer declares the five state
    // fields — so there is nothing left for a mirror to read. Until PR 5 this
    // test handed the resolver real quantities to prove it ignored them.
    const prismaItem = makePrismaItem('item_abc123', 'Milk')
    p.item.findUnique.mockResolvedValue(null)
    p.item.create.mockResolvedValue(prismaItem)
    p.itemTag.createMany.mockResolvedValue({ count: 0 })
    p.itemVendor.createMany.mockResolvedValue({ count: 0 })
    p.item.findUniqueOrThrow.mockResolvedValue(prismaItem)

    // When it is imported
    const response = await server.executeOperation(
      {
        query: BULK_CREATE_ITEMS,
        variables: {
          items: [
            makeItemInput({ id: 'item_abc123' }),
          ],
        },
      },
      { contextValue: CONTEXT },
    )

    // Then the item is created and NO `ItemStock` row is written
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
    }
    expect(p.item.create).toHaveBeenCalledTimes(1)
    expect(p.itemStock.upsert).not.toHaveBeenCalled()
    // And the caller's default location is not even looked up. A second,
    // independent guard: `mirrorStockToDefaultLocation` resolved it through
    // `ensureDefaultLocation`, which is this `findFirst`. No other code path
    // in `bulkCreateItems` reads a location.
    expect(p.location.findFirst).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated bulk-create requests', async () => {
    // Given no userId in context
    const response = await server.executeOperation(
      {
        query: BULK_CREATE_ITEMS,
        variables: { items: [makeItemInput({ id: 'item_abc' })] },
      },
      { contextValue: { userId: null } },
    )

    // Then it is rejected with UNAUTHENTICATED
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors?.[0].extensions?.code).toBe('UNAUTHENTICATED')
    }
  })
})

describe('bulkUpsertItems', () => {
  it('user can upsert items — creates if absent, replaces if present', async () => {
    // Given both items upserted successfully
    const item1 = makePrismaItem('item_existing', 'Updated Name')
    const item2 = makePrismaItem('item_new', 'Brand New')
    p.item.upsert.mockResolvedValueOnce(item1).mockResolvedValueOnce(item2)
    p.itemTag.deleteMany.mockResolvedValue({ count: 0 })
    p.itemVendor.deleteMany.mockResolvedValue({ count: 0 })
    p.itemTag.createMany.mockResolvedValue({ count: 0 })
    p.itemVendor.createMany.mockResolvedValue({ count: 0 })
    p.item.findUniqueOrThrow.mockResolvedValueOnce(item1).mockResolvedValueOnce(item2)

    // When upserting both
    const response = await server.executeOperation(
      {
        query: BULK_UPSERT_ITEMS,
        variables: {
          items: [
            makeItemInput({ id: 'item_existing', name: 'Updated Name' }),
            makeItemInput({ id: 'item_new', name: 'Brand New' }),
          ],
        },
      },
      { contextValue: CONTEXT },
    )

    // Then both items are returned
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      const items = response.body.singleResult.data?.bulkUpsertItems as Array<{ id: string; name: string }>
      expect(items).toHaveLength(2)
      expect(items[0].name).toBe('Updated Name')
      expect(items[1].name).toBe('Brand New')
    }
  })

  // The second half of the PR 4b removal. `bulkCreateItems` and
  // `bulkUpsertItems` each held their OWN byte-identical
  // `mirrorStockToDefaultLocation` call, so one test cannot pin both: with
  // only the create-side test, putting the upsert-side mirror back would stay
  // green. See the long comment above the create-side test for why writing no
  // stock is the contract and for what this file's recorders can prove.
  it('user replacing items gets no stock row from the item import itself', async () => {
    // Given an item to upsert — same shape as `bulkCreateItems` above, and
    // since PR 5 the payload cannot carry stock values at all.
    const prismaItem = makePrismaItem('item_abc123', 'Milk')
    p.item.upsert.mockResolvedValue(prismaItem)
    p.itemTag.deleteMany.mockResolvedValue({ count: 0 })
    p.itemVendor.deleteMany.mockResolvedValue({ count: 0 })
    p.itemTag.createMany.mockResolvedValue({ count: 0 })
    p.itemVendor.createMany.mockResolvedValue({ count: 0 })
    p.item.findUniqueOrThrow.mockResolvedValue(prismaItem)

    // When it is upserted
    const response = await server.executeOperation(
      {
        query: BULK_UPSERT_ITEMS,
        variables: {
          items: [
            makeItemInput({ id: 'item_abc123' }),
          ],
        },
      },
      { contextValue: CONTEXT },
    )

    // Then the item is upserted and NO `ItemStock` row is written
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
    }
    expect(p.item.upsert).toHaveBeenCalledTimes(1)
    expect(p.itemStock.upsert).not.toHaveBeenCalled()
    // And the caller's default location is not even looked up
    expect(p.location.findFirst).not.toHaveBeenCalled()
  })
})

describe('clearAllData', () => {
  it('user can clear all their data', async () => {
    // Given transaction resolves
    p.$transaction.mockResolvedValue([
      { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 },
      { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 },
      { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 },
      { count: 0 }, { count: 0 },
    ])

    // When calling clearAllData
    const response = await server.executeOperation(
      { query: CLEAR_ALL_DATA },
      { contextValue: CONTEXT },
    )

    // Then it returns true
    expect(response.body.kind).toBe('single')
    if (response.body.kind === 'single') {
      expect(response.body.singleResult.errors).toBeUndefined()
      expect(response.body.singleResult.data?.clearAllData).toBe(true)
    }
    // And every user-owned table was asked to delete this user's rows —
    // shelves and locations included (see purge-coverage.test.ts and issue #250).
    // itemStock has no userId — scoped through its location, like recipeItem.
    expect(p.shelf.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user_import_test' } })
    expect(p.location.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user_import_test' } })
    expect(p.itemStock.deleteMany).toHaveBeenCalledWith({
      where: { location: { userId: 'user_import_test' } },
    })
    // And itemStock is deleted before item and before location — real
    // ItemStock_itemId_fkey is ON DELETE CASCADE, so deleting items first would
    // destroy ItemStock rows before this deleteMany runs. Each deleteMany(...)
    // call executes synchronously while the $transaction array literal is built,
    // so mock.invocationCallOrder reflects source order.
    expect(p.itemStock.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      p.item.deleteMany.mock.invocationCallOrder[0],
    )
    expect(p.itemStock.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      p.location.deleteMany.mock.invocationCallOrder[0],
    )
  })
})
