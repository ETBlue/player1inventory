import { describe, expect, it } from 'vitest'
import { createHouseholdWorld } from './householdWorld.js'

const T = new Date('2026-11-01T00:00:00.000Z')

function household(id: string, ownerId: string) {
  return { id, name: `${id} name`, ownerId, ownerGoneAt: null, createdAt: T, updatedAt: T }
}

// The world's own contract: what it adds on top of the three fakes it joins.
describe('householdWorld', () => {
  it('deleting a location deletes its LocationMember rows, as the foreign key cascade does', async () => {
    // Given two locations in one household, each with role rows
    const world = createHouseholdWorld()
    world.stock.reset(
      [
        { id: 'loc-1', userId: 'u1', isDefault: true, householdId: 'hh-1', name: 'A', order: 0 },
        { id: 'loc-2', userId: 'u1', isDefault: false, householdId: 'hh-1', name: 'B', order: 1 },
      ],
      [],
    )
    world.seedHouseholds({
      households: [household('hh-1', 'u1')],
      householdMembers: [{ householdId: 'hh-1', userId: 'u1', role: 'owner', joinedAt: T }],
      locationMembers: [
        { locationId: 'loc-1', userId: 'u1', role: 'organizer', createdAt: T },
        { locationId: 'loc-2', userId: 'u1', role: 'organizer', createdAt: T },
        { locationId: 'loc-2', userId: 'u2', role: 'viewer', createdAt: T },
      ],
    })

    // When one location is deleted
    await world.client.location.delete({ where: { id: 'loc-2' } })

    // Then that location's role rows are gone, and the other location's stay
    expect(world.households.state.locationMembers.map((m) => m.locationId)).toEqual(['loc-1'])
  })

  it('deleteMany on locations deletes their LocationMember rows too, and no others', async () => {
    // Given two households, each with a location and role rows
    const world = createHouseholdWorld()
    world.stock.reset(
      [
        { id: 'loc-1', userId: 'u1', isDefault: true, householdId: 'hh-1', name: 'A', order: 0 },
        { id: 'loc-2', userId: 'u1', isDefault: false, householdId: 'hh-1', name: 'B', order: 1 },
        { id: 'loc-3', userId: 'u2', isDefault: true, householdId: 'hh-2', name: 'C', order: 0 },
      ],
      [],
    )
    world.seedHouseholds({
      households: [household('hh-1', 'u1'), household('hh-2', 'u2')],
      householdMembers: [
        { householdId: 'hh-1', userId: 'u1', role: 'owner', joinedAt: T },
        { householdId: 'hh-2', userId: 'u2', role: 'owner', joinedAt: T },
      ],
      locationMembers: [
        { locationId: 'loc-1', userId: 'u1', role: 'organizer', createdAt: T },
        { locationId: 'loc-2', userId: 'u1', role: 'organizer', createdAt: T },
        { locationId: 'loc-3', userId: 'u2', role: 'organizer', createdAt: T },
      ],
    })

    // When hh-1's locations are deleted with one deleteMany
    const result = await world.client.location.deleteMany({ where: { householdId: 'hh-1' } })

    // Then the count is the locations, and only hh-2's role row is left
    expect(result).toEqual({ count: 2 })
    expect(world.households.state.locationMembers.map((m) => m.locationId)).toEqual(['loc-3'])
    // And the household rows are not touched
    expect(world.households.state.householdMembers).toHaveLength(2)
  })

  it('a delete that matches no location leaves the LocationMember rows alone', async () => {
    const world = createHouseholdWorld()
    world.stock.reset(
      [{ id: 'loc-1', userId: 'u1', isDefault: true, householdId: 'hh-1', name: 'A', order: 0 }],
      [],
    )
    world.seedHouseholds({
      households: [household('hh-1', 'u1')],
      householdMembers: [{ householdId: 'hh-1', userId: 'u1', role: 'owner', joinedAt: T }],
      locationMembers: [{ locationId: 'loc-1', userId: 'u1', role: 'organizer', createdAt: T }],
    })

    await expect(world.client.location.delete({ where: { id: 'nope' } })).rejects.toMatchObject({
      code: 'P2025',
    })
    expect(world.households.state.locationMembers).toHaveLength(1)
  })

  it('extend adds models to the client and rolls their stores back with the rest', async () => {
    // Given a world with one extra model whose store is registered
    const world = createHouseholdWorld()
    const extra = { rows: [] as { id: string }[] }
    const things = {
      create: async ({ data }: { data: { id: string } }) => {
        extra.rows.push(data)
        return data
      },
    }
    world.extend({ things }, [extra])
    world.stock.reset([{ id: 'loc-1', userId: 'u1', isDefault: true, householdId: 'hh-1' }], [])

    // When a transaction writes the extra model and a stock row, then throws
    const client = world.client as unknown as {
      things: typeof things
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
    }
    await expect(
      client.$transaction(async (tx) => {
        const t = tx as typeof world.client & { things: typeof things }
        await t.things.create({ data: { id: 'thing-1' } })
        await t.itemStock.create({ data: { itemId: 'item-1', locationId: 'loc-1' } })
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    // Then both writes are gone
    expect(extra.rows).toEqual([])
    expect(world.stock.state.itemStocks).toEqual([])

    // And outside a transaction the extra model is on the client
    await client.things.create({ data: { id: 'thing-2' } })
    expect(extra.rows).toEqual([{ id: 'thing-2' }])
  })
})
