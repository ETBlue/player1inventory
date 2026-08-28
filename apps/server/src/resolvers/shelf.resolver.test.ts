import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

// ─── Fake stateful Prisma double for applyShelfFilterPicks ───────────────────
//
// A plain vi.fn() mock (mockResolvedValue / mockRejectedValue) cannot prove
// rollback: both "wrapped in prisma.$transaction" and "sequential prisma.X
// calls with no transaction" record the exact same calls before the callback
// throws. To make the rollback test actually sensitive to whether the
// resolver uses prisma.$transaction, this fake keeps an in-memory item/recipe
// store and implements $transaction by snapshotting the store before running
// the callback and restoring the snapshot if the callback throws — which is
// what Postgres does, and what a `tx`-less sequential rewrite would not do.
//
// Everything the mock needs — state, the fake client, and the snapshot
// helper — is built inside one vi.hoisted() block. vi.mock() factories are
// hoisted above the rest of the module, so a plain top-level `const` merely
// spread inside the factory (not just closed over) would hit the
// temporal-dead-zone; vi.hoisted() is the escape hatch Vitest provides for
// exactly this.

interface FakeItemRow {
  id: string
  name: string
  userId: string
  consumeAmount: number
  tagIds: string[]
  vendorIds: string[]
}

interface FakeRecipeRow {
  id: string
  userId: string
  items: { itemId: string; defaultAmount: number }[]
}

const { state, sharedClient, snapshot } = vi.hoisted(() => {
  const state = {
    items: [] as FakeItemRow[],
    recipes: [] as FakeRecipeRow[],
    // Test control: when true, the fake recipeItem.create rejects, simulating
    // a genuine write failure (not an ownership/not-found guard).
    recipeItemShouldFail: false,
  }

  function projectItem(row: FakeItemRow) {
    return {
      id: row.id,
      name: row.name,
      userId: row.userId,
      consumeAmount: row.consumeAmount,
      packageUnit: null,
      measurementUnit: null,
      amountPerPackage: null,
      targetUnit: 'package',
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
      dueDate: null,
      estimatedDueDays: null,
      expirationThreshold: null,
      expirationMode: 'disabled',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      tags: row.tagIds.map((tagId) => ({ itemId: row.id, tagId })),
      vendors: row.vendorIds.map((vendorId) => ({ itemId: row.id, vendorId })),
    }
  }

  // The one client instance used both as the `tx` handed to the
  // $transaction callback and spread onto the top-level mocked `prisma`
  // object. Both read/write the same `state` — the only thing that
  // distinguishes "transactional" from "sequential direct prisma.X calls" is
  // whether $transaction's snapshot/restore wraps the calls, not which
  // client object issued them. This is what makes the mutation check
  // meaningful: if the resolver is rewritten to call `prisma.X` sequentially
  // instead of going through `prisma.$transaction`, writes land immediately
  // with no snapshot to restore from.
  const sharedClient = {
    item: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const row = state.items.find((i) => i.id === where.id && i.userId === where.userId)
        return row ? projectItem(row) : null
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = state.items.find((i) => i.id === where.id)
        if (!row) throw new Error(`Item not found: ${where.id}`)
        return projectItem(row)
      },
    },
    itemTag: {
      deleteMany: async ({ where }: { where: { itemId: string } }) => {
        const row = state.items.find((i) => i.id === where.itemId)
        const count = row ? row.tagIds.length : 0
        if (row) row.tagIds = []
        return { count }
      },
      createMany: async ({ data }: { data: { itemId: string; tagId: string }[] }) => {
        for (const { itemId, tagId } of data) {
          const row = state.items.find((i) => i.id === itemId)
          if (row && !row.tagIds.includes(tagId)) row.tagIds.push(tagId)
        }
        return { count: data.length }
      },
    },
    itemVendor: {
      deleteMany: async ({ where }: { where: { itemId: string } }) => {
        const row = state.items.find((i) => i.id === where.itemId)
        const count = row ? row.vendorIds.length : 0
        if (row) row.vendorIds = []
        return { count }
      },
      createMany: async ({ data }: { data: { itemId: string; vendorId: string }[] }) => {
        for (const { itemId, vendorId } of data) {
          const row = state.items.find((i) => i.id === itemId)
          if (row && !row.vendorIds.includes(vendorId)) row.vendorIds.push(vendorId)
        }
        return { count: data.length }
      },
    },
    recipe: {
      // Filters only on the fields actually present in `where`, like real
      // Prisma does — NOT hardcoded to require `userId` to match. If this
      // silently re-enforced ownership regardless of what the resolver
      // passed, the "delete userId from the where clause" mutation check
      // for the ownership guard would be meaningless: the fake would keep
      // rejecting cross-user access even when the resolver itself no
      // longer asks it to.
      findFirst: async ({ where }: { where: { id: string; userId?: string } }) => {
        const row = state.recipes.find(
          (r) => r.id === where.id && (where.userId === undefined || r.userId === where.userId),
        )
        return row ? { id: row.id, userId: row.userId, items: row.items } : null
      },
    },
    recipeItem: {
      create: async ({
        data,
      }: { data: { recipeId: string; itemId: string; defaultAmount: number } }) => {
        if (state.recipeItemShouldFail) {
          throw new Error('simulated recipeItem write failure')
        }
        const recipe = state.recipes.find((r) => r.id === data.recipeId)
        if (recipe) recipe.items.push({ itemId: data.itemId, defaultAmount: data.defaultAmount })
        return data
      },
    },
  }

  function snapshot() {
    return {
      items: state.items.map((i) => ({ ...i, tagIds: [...i.tagIds], vendorIds: [...i.vendorIds] })),
      recipes: state.recipes.map((r) => ({ ...r, items: r.items.map((ri) => ({ ...ri })) })),
    }
  }

  return { state, sharedClient, snapshot }
})

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    ...sharedClient,
    $transaction: vi.fn(async (fn: (tx: typeof sharedClient) => Promise<unknown>) => {
      const before = snapshot()
      try {
        return await fn(sharedClient)
      } catch (err) {
        state.items = before.items
        state.recipes = before.recipes
        throw err
      }
    }),
  },
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeItemRow(overrides: Partial<FakeItemRow> = {}): FakeItemRow {
  return {
    id: overrides.id ?? 'item_1',
    name: overrides.name ?? 'Milk',
    userId: overrides.userId ?? 'user_test123',
    consumeAmount: overrides.consumeAmount ?? 2,
    tagIds: overrides.tagIds ?? [],
    vendorIds: overrides.vendorIds ?? [],
  }
}

function makeRecipeRow(overrides: Partial<FakeRecipeRow> = {}): FakeRecipeRow {
  return {
    id: overrides.id ?? 'recipe_1',
    userId: overrides.userId ?? 'user_test123',
    items: overrides.items ?? [],
  }
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let server: ApolloServer<Context>
const ctx: Context = { userId: 'user_test123' }

beforeEach(async () => {
  vi.clearAllMocks()
  state.items = []
  state.recipes = []
  state.recipeItemShouldFail = false
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const APPLY_PICKS_MUTATION = `mutation ApplyShelfFilterPicks($input: ApplyShelfFilterPicksInput!) {
  applyShelfFilterPicks(input: $input) {
    id
    tagIds
    vendorIds
    consumeAmount
  }
}`

async function execOp(query: string, variables?: Record<string, unknown>, context = ctx) {
  const r = await server.executeOperation({ query, variables }, { contextValue: context })
  return r.body.kind === 'single' ? r.body.singleResult : null
}

// ─── applyShelfFilterPicks ─────────────────────────────────────────────────────

describe('applyShelfFilterPicks resolver', () => {
  it('user can apply tag, vendor, and recipe picks in one call', async () => {
    // Given an item with no tags/vendors and a recipe it does not belong to yet
    state.items = [makeItemRow({ id: 'item_1', tagIds: [], vendorIds: [] })]
    state.recipes = [makeRecipeRow({ id: 'recipe_1', items: [] })]

    // When applying tag, vendor, and recipe picks together
    const result = await execOp(APPLY_PICKS_MUTATION, {
      input: {
        itemId: 'item_1',
        addTagIds: ['tag_new'],
        addVendorIds: ['vendor_new'],
        addRecipeId: 'recipe_1',
      },
    })

    // Then all three writes land: the item carries the new tag and vendor,
    // and the recipe now includes the item
    expect(result?.errors).toBeUndefined()
    const data = result?.data?.applyShelfFilterPicks as { tagIds: string[]; vendorIds: string[] }
    expect(data.tagIds).toEqual(['tag_new'])
    expect(data.vendorIds).toEqual(['vendor_new'])
    expect(state.recipes[0].items).toEqual([{ itemId: 'item_1', defaultAmount: 2 }])
  })

  it('a failing recipe write rolls back the item write', async () => {
    // Given an item with no tags and a recipe write that will fail
    state.items = [makeItemRow({ id: 'item_1', tagIds: [] })]
    state.recipes = [makeRecipeRow({ id: 'recipe_1', items: [] })]
    state.recipeItemShouldFail = true

    // When applying a tag pick together with a recipe pick that fails
    const result = await execOp(APPLY_PICKS_MUTATION, {
      input: {
        itemId: 'item_1',
        addTagIds: ['tag_new'],
        addVendorIds: [],
        addRecipeId: 'recipe_1',
      },
    })

    // Then the call errors, and the earlier tag write is rolled back — the
    // item is left exactly as it was before the call, not half-updated
    expect(result?.errors).toBeDefined()
    expect(state.items[0].tagIds).toEqual([])
  })

  it('re-applying the same picks duplicates nothing', async () => {
    // Given an item that already has the tag and already belongs to the recipe
    state.items = [makeItemRow({ id: 'item_1', tagIds: ['tag_existing'] })]
    state.recipes = [
      makeRecipeRow({ id: 'recipe_1', items: [{ itemId: 'item_1', defaultAmount: 2 }] }),
    ]

    // When re-applying the exact same picks
    const result = await execOp(APPLY_PICKS_MUTATION, {
      input: {
        itemId: 'item_1',
        addTagIds: ['tag_existing'],
        addVendorIds: [],
        addRecipeId: 'recipe_1',
      },
    })

    // Then the tag is not duplicated and the recipe membership is not
    // duplicated (the recipe write is skipped entirely)
    expect(result?.errors).toBeUndefined()
    const data = result?.data?.applyShelfFilterPicks as { tagIds: string[] }
    expect(data.tagIds).toEqual(['tag_existing'])
    expect(state.recipes[0].items).toEqual([{ itemId: 'item_1', defaultAmount: 2 }])
  })

  it('consumeAmount 0 becomes defaultAmount 1 on the recipe entry', async () => {
    // Given an item whose consumeAmount is explicitly 0
    state.items = [makeItemRow({ id: 'item_1', consumeAmount: 0 })]
    state.recipes = [makeRecipeRow({ id: 'recipe_1', items: [] })]

    // When applying a recipe pick
    const result = await execOp(APPLY_PICKS_MUTATION, {
      input: { itemId: 'item_1', addTagIds: [], addVendorIds: [], addRecipeId: 'recipe_1' },
    })

    // Then 0 is treated as falsy and the recipe entry gets defaultAmount 1,
    // not 0 (0 || 1 === 1, unlike 0 ?? 1 === 0)
    expect(result?.errors).toBeUndefined()
    expect(state.recipes[0].items).toEqual([{ itemId: 'item_1', defaultAmount: 1 }])
  })

  it('rejects a call naming another user\'s item', async () => {
    // Given an item owned by a different user
    state.items = [makeItemRow({ id: 'item_1', userId: 'user_other', tagIds: [] })]

    // When the authenticated user targets that item
    const result = await execOp(APPLY_PICKS_MUTATION, {
      input: { itemId: 'item_1', addTagIds: ['tag_new'], addVendorIds: [], addRecipeId: null },
    })

    // Then the call is rejected and nothing is written
    expect(result?.errors).toBeDefined()
    expect(result?.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
    expect(state.items[0].tagIds).toEqual([])
  })

  it('unions newly added ids with pre-existing ones instead of overwriting them', async () => {
    // Given an item that already has a different tag and a different vendor
    state.items = [
      makeItemRow({ id: 'item_1', tagIds: ['tag_existing'], vendorIds: ['vendor_existing'] }),
    ]

    // When adding a new tag and a new vendor
    const result = await execOp(APPLY_PICKS_MUTATION, {
      input: {
        itemId: 'item_1',
        addTagIds: ['tag_new'],
        addVendorIds: ['vendor_new'],
        addRecipeId: null,
      },
    })

    // Then the pre-existing ids survive alongside the new ones — a union of
    // the item's current rows with the client's additions, not an overwrite
    // of one by the other
    expect(result?.errors).toBeUndefined()
    const data = result?.data?.applyShelfFilterPicks as { tagIds: string[]; vendorIds: string[] }
    expect(data.tagIds).toEqual(['tag_existing', 'tag_new'])
    expect(data.vendorIds).toEqual(['vendor_existing', 'vendor_new'])
  })

  it("rejects a call naming another user's recipe", async () => {
    // Given an item the caller owns, but a recipe owned by someone else
    state.items = [makeItemRow({ id: 'item_1', tagIds: [] })]
    state.recipes = [makeRecipeRow({ id: 'recipe_1', userId: 'user_other', items: [] })]

    // When applying picks that name that recipe
    const result = await execOp(APPLY_PICKS_MUTATION, {
      input: { itemId: 'item_1', addTagIds: [], addVendorIds: [], addRecipeId: 'recipe_1' },
    })

    // Then the call is rejected and the other user's recipe is untouched
    expect(result?.errors).toBeDefined()
    expect(result?.errors?.[0]?.extensions?.code).toBe('NOT_FOUND')
    expect(state.recipes[0].items).toEqual([])
  })
})
