import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'

interface FakeLocation {
  id: string
  name: string
  order: number
  isDefault: boolean
  userId: string
  createdAt: Date
  updatedAt: Date
}

const { state, client } = vi.hoisted(() => {
  const state = {
    locations: [] as FakeLocation[],
    itemStocks: [] as { id: string; locationId: string }[],
    // One-shot control for the ensureDefaultLocation race test below: makes the
    // next findFirst({ where: { userId } }) for this userId return null even
    // though a default row already exists in the store — exactly what the
    // loser of a concurrent ensureDefaultLocation race sees.
    simulateDefaultRaceOnce: null as string | null,
  }
  let seq = 0

  function matches(l: FakeLocation, where: Record<string, unknown>): boolean {
    // Filters only on keys present in `where`, like real Prisma. Hardcoding a
    // userId check would leave every ownership mutation check meaningless.
    if (where.id !== undefined && l.id !== where.id) return false
    if (where.userId !== undefined && l.userId !== where.userId) return false
    if (where.isDefault !== undefined && l.isDefault !== where.isDefault) return false
    return true
  }

  const client = {
    location: {
      findFirst: async ({ where = {}, orderBy }: { where?: Record<string, unknown>; orderBy?: { order: 'asc' | 'desc' } }) => {
        // Only the ensureDefaultLocation lookup queries by userId alone (no id) —
        // trip the one-shot race flag only for that shape, so requireLocationRole's
        // findFirst({ where: { id, userId } }) calls are unaffected.
        if (where.id === undefined && where.userId !== undefined && where.userId === state.simulateDefaultRaceOnce) {
          state.simulateDefaultRaceOnce = null
          return null
        }
        const rows = state.locations.filter((l) => matches(l, where))
        if (orderBy?.order === 'asc') rows.sort((a, b) => a.order - b.order)
        return rows[0] ?? null
      },
      findMany: async ({ where = {}, orderBy }: { where?: Record<string, unknown>; orderBy?: { order: 'asc' | 'desc' } }) => {
        const rows = state.locations.filter((l) => matches(l, where))
        if (orderBy?.order === 'asc') rows.sort((a, b) => a.order - b.order)
        return rows
      },
      create: async ({ data }: { data: Omit<FakeLocation, 'id' | 'createdAt' | 'updatedAt'> }) => {
        // Models the partial unique index from the migration. Without this the
        // "drop the isDefault guard" mutation check would stay green.
        if (data.isDefault && state.locations.some((l) => l.userId === data.userId && l.isDefault)) {
          throw new Error('Unique constraint failed on the fields: (`userId`)')
        }
        const row: FakeLocation = { ...data, id: `loc-${++seq}`, createdAt: new Date(), updatedAt: new Date() }
        state.locations.push(row)
        return row
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeLocation> }) => {
        const row = state.locations.find((l) => l.id === where.id)
        if (!row) throw new Error('Location not found')
        Object.assign(row, data, { updatedAt: new Date() })
        return row
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const i = state.locations.findIndex((l) => l.id === where.id)
        if (i === -1) throw new Error('Location not found')
        const [row] = state.locations.splice(i, 1)
        // FK ON DELETE CASCADE
        state.itemStocks = state.itemStocks.filter((s) => s.locationId !== row.id)
        return row
      },
      count: async ({ where = {} }: { where?: Record<string, unknown> }) =>
        state.locations.filter((l) => matches(l, where)).length,
    },
    $transaction: async (arg: unknown) => {
      const snapshot = JSON.parse(JSON.stringify(state))
      try {
        return typeof arg === 'function' ? await (arg as (tx: unknown) => Promise<unknown>)(client) : await Promise.all(arg as Promise<unknown>[])
      } catch (err) {
        state.locations = snapshot.locations.map((l: FakeLocation) => ({
          ...l,
          createdAt: new Date(l.createdAt),
          updatedAt: new Date(l.updatedAt),
        }))
        state.itemStocks = snapshot.itemStocks
        throw err
      }
    },
  }
  return { state, client }
})

vi.mock('../lib/prisma.js', () => ({ prisma: client }))

const server = new ApolloServer<Context>({ typeDefs, resolvers })

async function run(query: string, variables: Record<string, unknown> = {}, userId: string | null = 'user-a') {
  const res = await server.executeOperation({ query, variables }, { contextValue: { userId } })
  if (res.body.kind !== 'single') throw new Error('expected single result')
  return res.body.singleResult
}

describe('location resolvers', () => {
  beforeEach(() => {
    state.locations = [
      { id: 'loc-a', name: 'My Home', order: 0, isDefault: true, userId: 'user-a', createdAt: new Date(), updatedAt: new Date() },
      { id: 'loc-a2', name: 'Garage', order: 1, isDefault: false, userId: 'user-a', createdAt: new Date(), updatedAt: new Date() },
      // order: 5 is deliberately above user-a's own max (1) — see the
      // 'appended after the highest order' test, which needs a foreign
      // higher order in the fixture to prove maxOrder is userId-scoped.
      { id: 'loc-b', name: 'Their Home', order: 5, isDefault: true, userId: 'user-b', createdAt: new Date(), updatedAt: new Date() },
    ]
    state.itemStocks = [{ id: 'st-1', locationId: 'loc-a2' }]
  })

  it('user can list only their own locations, in order', async () => {
    // Given user-a owns two locations and user-b owns one
    // When user-a lists locations
    const res = await run(`query { locations { id name order isDefault } }`)

    // Then only user-a's are returned, ordered — user-b's is absent
    expect(res.errors).toBeUndefined()
    expect(res.data?.locations).toEqual([
      expect.objectContaining({ id: 'loc-a', order: 0, isDefault: true }),
      expect.objectContaining({ id: 'loc-a2', order: 1, isDefault: false }),
    ])
  })

  it('user can read createdAt/updatedAt as real ISO-8601 strings, not epoch ms', async () => {
    // Given loc-a's seeded Date objects
    const seeded = state.locations.find((l) => l.id === 'loc-a')
    if (!seeded) throw new Error('fixture missing loc-a')

    // When user-a lists locations
    const res = await run(`query { locations { id createdAt updatedAt } }`)

    // Then createdAt/updatedAt come back as the row's actual ISO string, not
    // Date.valueOf()'s epoch-millisecond coercion (a bare numeric string would
    // also satisfy a looser 'is a non-empty string' assertion, so this pins the
    // exact ISO value instead)
    // `singleResult.data` is untyped (`Record<string, unknown>`), so narrow it
    // before using array methods — `tsc` rejects `.find` on `{}` even though
    // vitest/esbuild strips types and would run it fine. Caught only by the
    // root `pnpm build`, never by `pnpm test`.
    const locations = res.data?.locations as
      | Array<{ id: string; createdAt: string; updatedAt: string }>
      | undefined
    const loc = locations?.find((l) => l.id === 'loc-a')
    expect(loc?.createdAt).toBe(seeded.createdAt.toISOString())
    expect(loc?.updatedAt).toBe(seeded.updatedAt.toISOString())
    expect(loc?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('user with no locations gets a default created lazily', async () => {
    // Given a user who owns nothing
    state.locations = []

    // When they list locations
    const res = await run(`query { locations { name isDefault order } }`, {}, 'user-new')

    // Then exactly one default location was created for them
    expect(res.data?.locations).toEqual([{ name: 'My Home', isDefault: true, order: 0 }])
  })

  it('user can create a location, appended after the highest order', async () => {
    const res = await run(`mutation { createLocation(name: "Cellar") { name order isDefault } }`)
    expect(res.data?.createLocation).toEqual({ name: 'Cellar', order: 2, isDefault: false })
  })

  it('user can rename their own location', async () => {
    const res = await run(
      `mutation Update($id: ID!, $input: UpdateLocationInput!) { updateLocation(id: $id, input: $input) { name } }`,
      { id: 'loc-a2', input: { name: 'Shed' } },
    )
    expect(res.data?.updateLocation).toEqual({ name: 'Shed' })
  })

  it('user cannot rename another user\'s location', async () => {
    const res = await run(
      `mutation Update($id: ID!, $input: UpdateLocationInput!) { updateLocation(id: $id, input: $input) { name } }`,
      { id: 'loc-b', input: { name: 'Hijacked' } },
    )
    expect(res.errors?.[0]?.message).toMatch(/Forbidden/)
    expect(state.locations.find((l) => l.id === 'loc-b')?.name).toBe('Their Home')
  })

  it('user can delete a non-default location, cascading its stock', async () => {
    const res = await run(`mutation { deleteLocation(id: "loc-a2") }`)
    expect(res.data?.deleteLocation).toBe(true)
    expect(state.locations.some((l) => l.id === 'loc-a2')).toBe(false)
    expect(state.itemStocks).toHaveLength(0)
  })

  it('user cannot delete the default location', async () => {
    const res = await run(`mutation { deleteLocation(id: "loc-a") }`)
    expect(res.errors?.[0]?.message).toMatch(/default location cannot be deleted/i)
    expect(state.locations.some((l) => l.id === 'loc-a')).toBe(true)
  })

  it('user cannot delete another user\'s location', async () => {
    // Note: loc-b is also a default here, so even with ownership unchecked
    // the isDefault guard would block this delete too, just with a
    // different error message. Still a valid regression test — it goes red
    // on an ownership regression — but if loc-b ever becomes non-default in
    // this fixture, re-check that the Forbidden assertion still holds.
    const res = await run(`mutation { deleteLocation(id: "loc-b") }`)
    expect(res.errors?.[0]?.message).toMatch(/Forbidden/)
    expect(state.locations.some((l) => l.id === 'loc-b')).toBe(true)
  })

  it('user can reorder their locations', async () => {
    const res = await run(
      `mutation Reorder($ids: [ID!]!) { reorderLocations(orderedIds: $ids) { id order } }`,
      { ids: ['loc-a2', 'loc-a'] },
    )
    expect(res.data?.reorderLocations).toEqual([
      { id: 'loc-a2', order: 0 },
      { id: 'loc-a', order: 1 },
    ])
  })

  it('reorder rejects the whole batch if any id is another user\'s', async () => {
    // Given a batch mixing user-a's location with user-b's
    const res = await run(
      `mutation Reorder($ids: [ID!]!) { reorderLocations(orderedIds: $ids) { id } }`,
      { ids: ['loc-a2', 'loc-b'] },
    )

    // Then nothing is written — user-a's own order is unchanged too
    expect(res.errors?.[0]?.message).toMatch(/Forbidden/)
    expect(state.locations.find((l) => l.id === 'loc-a2')?.order).toBe(1)
  })

  it('ensureDefaultLocation swallows a lost create race and returns the winning row', async () => {
    // Given user-a already has a default location (loc-a, seeded above), and
    // the guard lookup loses the race — it sees null even though the row
    // exists, exactly like the loser of a concurrent ensureDefaultLocation
    // call. Its own create then collides with the fake's partial-unique-index
    // check and must be swallowed, not thrown.
    state.simulateDefaultRaceOnce = 'user-a'

    // When user-a lists locations
    const res = await run(`query { locations { id isDefault order } }`)

    // Then the query does not throw, and no duplicate default was created —
    // still exactly loc-a (default) and loc-a2, not a third row
    expect(res.errors).toBeUndefined()
    expect(res.data?.locations).toEqual([
      expect.objectContaining({ id: 'loc-a', isDefault: true }),
      expect.objectContaining({ id: 'loc-a2', isDefault: false }),
    ])
  })
})
