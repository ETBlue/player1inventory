import { describe, expect, it } from 'vitest'
import {
  createLocationPreferenceFake,
  LocationPreferenceForeignKeyError,
  LocationPreferenceUniqueError,
  LocationPreferenceUnsupportedError,
} from './locationPreferenceFake.js'
import { UnknownWhereKeyError, UnsupportedWhereFilterError } from './whereKeys.js'

// The rules of `locationPreferenceFake` (households H7b, task M.1, decision
// T75), pinned one by one. M.2 and M.3 test their resolvers on top of this
// fake, so a rule that is wrong here makes those tests pass against wrong
// code. Several rules are not reached by any resolver yet; they are pinned
// here so nobody deletes them as dead code.

const T0 = new Date('2026-11-01T00:00:00.000Z')
const T1 = new Date('2026-11-02T00:00:00.000Z')

const LOCATIONS = [{ id: 'loc-a' }, { id: 'loc-b' }, { id: 'loc-c' }]

function fixture(now: Date = T0) {
  let clock = now
  const fake = createLocationPreferenceFake({ locations: () => LOCATIONS, now: () => clock })
  return {
    fake,
    setNow(next: Date) {
      clock = next
    },
  }
}

/** Mia has rows at loc-a and loc-b; Bea at loc-a. */
async function seeded() {
  const f = fixture()
  const { client } = f.fake
  for (const [userId, locationId, customOrder] of [
    ['mia', 'loc-a', 1],
    ['mia', 'loc-b', 0],
    ['bea', 'loc-a', null],
  ] as const) {
    await client.upsert({
      where: { userId_locationId: { userId, locationId } },
      create: { userId, locationId, customOrder },
      update: {},
    })
  }
  return f
}

function keys(rows: { userId: string; locationId: string }[]): string[] {
  return rows.map((r) => `${r.userId}@${r.locationId}`).sort()
}

describe('locationPreferenceFake: the store keyed on (userId, locationId)', () => {
  it('upsert creates a row with the defaults and returns a copy', async () => {
    const { fake } = fixture()
    const row = await fake.client.upsert({
      where: { userId_locationId: { userId: 'mia', locationId: 'loc-a' } },
      create: { userId: 'mia', locationId: 'loc-a' },
      update: { customOrder: 5 },
    })

    // The create branch ran, not the update branch
    expect(row).toEqual({
      userId: 'mia',
      locationId: 'loc-a',
      customOrder: null,
      lastVisitedAt: null,
      updatedAt: T0,
    })
    // And the result is a copy: changing it does not change the store
    row.customOrder = 99
    expect(fake.state.rows[0]?.customOrder).toBeNull()
  })

  it('upsert on an existing key runs the update branch only, and moves updatedAt', async () => {
    const { fake, setNow } = await seeded()
    setNow(T1)

    const row = await fake.client.upsert({
      where: { userId_locationId: { userId: 'mia', locationId: 'loc-a' } },
      create: { userId: 'mia', locationId: 'loc-a', customOrder: 42 },
      update: { lastVisitedAt: T1 },
    })

    // The update payload was applied, the create payload was not
    expect(row).toEqual({
      userId: 'mia',
      locationId: 'loc-a',
      customOrder: 1,
      lastVisitedAt: T1,
      updatedAt: T1,
    })
    expect(fake.state.rows).toHaveLength(3)
  })

  it('an update value of undefined leaves the column alone, as Prisma does', async () => {
    const { fake } = await seeded()
    await fake.client.upsert({
      where: { userId_locationId: { userId: 'mia', locationId: 'loc-a' } },
      create: { userId: 'mia', locationId: 'loc-a' },
      update: { customOrder: undefined, lastVisitedAt: T1 },
    })
    const row = fake.state.rows.find((r) => r.userId === 'mia' && r.locationId === 'loc-a')
    expect(row?.customOrder).toBe(1)
    expect(row?.lastVisitedAt).toEqual(T1)
  })

  it('a second row with the same (userId, locationId) raises P2002', async () => {
    const { fake } = await seeded()
    // A create that names another key than its where: Prisma inserts the
    // create data, and the primary key refuses it.
    const write = fake.client.upsert({
      where: { userId_locationId: { userId: 'mia', locationId: 'loc-c' } },
      create: { userId: 'bea', locationId: 'loc-a' },
      update: {},
    })
    await expect(write).rejects.toBeInstanceOf(LocationPreferenceUniqueError)
    await expect(write).rejects.toMatchObject({ code: 'P2002' })
  })

  it('a row for a location that does not exist raises P2003', async () => {
    const { fake } = fixture()
    const write = fake.client.upsert({
      where: { userId_locationId: { userId: 'mia', locationId: 'loc-gone' } },
      create: { userId: 'mia', locationId: 'loc-gone' },
      update: {},
    })
    await expect(write).rejects.toBeInstanceOf(LocationPreferenceForeignKeyError)
    await expect(write).rejects.toMatchObject({ code: 'P2003' })
  })

  it('findUnique finds one row by the compound key, or null', async () => {
    const { fake } = await seeded()
    const found = await fake.client.findUnique({
      where: { userId_locationId: { userId: 'bea', locationId: 'loc-a' } },
    })
    expect(found).toMatchObject({ userId: 'bea', locationId: 'loc-a', customOrder: null })
    const none = await fake.client.findUnique({
      where: { userId_locationId: { userId: 'bea', locationId: 'loc-b' } },
    })
    expect(none).toBeNull()
  })

  it('findUnique refuses anything but the compound key', async () => {
    const { fake } = await seeded()
    await expect(
      fake.client.findUnique({ where: { userId: 'bea' } } as never),
    ).rejects.toBeInstanceOf(LocationPreferenceUnsupportedError)
    await expect(
      fake.client.findUnique({
        where: { userId_locationId: { userId: 'bea', locationId: { in: ['loc-a'] } } },
      } as never),
    ).rejects.toBeInstanceOf(UnsupportedWhereFilterError)
  })
})

describe('locationPreferenceFake: where', () => {
  it('applies userId and locationId, each a value or { in }', async () => {
    const { fake } = await seeded()
    expect(keys(await fake.client.findMany({ where: { userId: 'mia' } }))).toEqual([
      'mia@loc-a',
      'mia@loc-b',
    ])
    expect(keys(await fake.client.findMany({ where: { locationId: 'loc-a' } }))).toEqual([
      'bea@loc-a',
      'mia@loc-a',
    ])
    expect(
      keys(await fake.client.findMany({ where: { userId: 'mia', locationId: { in: ['loc-b', 'loc-c'] } } })),
    ).toEqual(['mia@loc-b'])
    expect(keys(await fake.client.findMany({ where: { userId: { in: ['bea'] } } }))).toEqual([
      'bea@loc-a',
    ])
  })

  it('a key set to undefined filters nothing, as in Prisma', async () => {
    const { fake } = await seeded()
    expect(await fake.client.findMany({ where: { userId: undefined } })).toHaveLength(3)
  })

  it('THROWS on any other where key, also on an empty store', async () => {
    // An empty store first: a per-row check would never run here, and the
    // read would answer [] with no error.
    const { fake: empty } = fixture()
    await expect(
      empty.client.findMany({ where: { customOrder: 1 } } as never),
    ).rejects.toBeInstanceOf(UnknownWhereKeyError)

    const { fake } = await seeded()
    for (const where of [
      { customOrder: null },
      { lastVisitedAt: null },
      { location: { householdId: 'hh' } },
      { user: { deletedAt: null } },
      { OR: [{ userId: 'mia' }] },
    ]) {
      await expect(fake.client.findMany({ where } as never), JSON.stringify(where)).rejects.toBeInstanceOf(
        UnknownWhereKeyError,
      )
      await expect(fake.client.deleteMany({ where } as never), JSON.stringify(where)).rejects.toBeInstanceOf(
        UnknownWhereKeyError,
      )
    }
    // Nothing was deleted by the refused calls
    expect(fake.state.rows).toHaveLength(3)
  })

  it('refuses a filter shape it does not model on a known key', async () => {
    const { fake } = await seeded()
    await expect(
      fake.client.findMany({ where: { userId: { not: 'mia' } } } as never),
    ).rejects.toBeInstanceOf(UnsupportedWhereFilterError)
  })
})

describe('locationPreferenceFake: options and data it does not model', () => {
  it('refuses an option it does not apply', async () => {
    const { fake } = await seeded()
    await expect(
      fake.client.findMany({ where: {}, orderBy: { customOrder: 'asc' } } as never),
    ).rejects.toBeInstanceOf(LocationPreferenceUnsupportedError)
    await expect(
      fake.client.findMany({ include: { location: true } } as never),
    ).rejects.toBeInstanceOf(LocationPreferenceUnsupportedError)
  })

  it('applies select on the columns, and refuses a key that is not a column', async () => {
    const { fake } = await seeded()
    const rows = await fake.client.findMany({
      where: { userId: 'mia' },
      select: { locationId: true, customOrder: true },
    })
    expect(rows).toEqual([
      { locationId: 'loc-a', customOrder: 1 },
      { locationId: 'loc-b', customOrder: 0 },
    ])
    await expect(
      fake.client.findMany({ select: { location: true } } as never),
    ).rejects.toBeInstanceOf(LocationPreferenceUnsupportedError)
  })

  it('refuses a write that names a column the table does not have', async () => {
    const { fake } = fixture()
    await expect(
      fake.client.upsert({
        where: { userId_locationId: { userId: 'mia', locationId: 'loc-a' } },
        create: { userId: 'mia', locationId: 'loc-a', order: 1 },
        update: {},
      } as never),
    ).rejects.toBeInstanceOf(LocationPreferenceUnsupportedError)
  })

  it('refuses an update operator, and an update that moves the key', async () => {
    const { fake } = await seeded()
    for (const update of [{ customOrder: { increment: 1 } }, { locationId: 'loc-c' }, { userId: 'bea' }]) {
      await expect(
        fake.client.upsert({
          where: { userId_locationId: { userId: 'mia', locationId: 'loc-a' } },
          create: { userId: 'mia', locationId: 'loc-a' },
          update,
        } as never),
        JSON.stringify(update),
      ).rejects.toBeInstanceOf(LocationPreferenceUnsupportedError)
    }
  })

  it('refuses a create with no userId or no locationId (NOT NULL)', async () => {
    const { fake } = fixture()
    await expect(
      fake.client.upsert({
        where: { userId_locationId: { userId: 'mia', locationId: 'loc-a' } },
        create: { userId: 'mia' },
        update: {},
      } as never),
    ).rejects.toThrow(/locationId/)
  })
})

describe('locationPreferenceFake: deleteMany and the location cascade', () => {
  it('deleteMany deletes the matching rows and returns a count', async () => {
    const { fake } = await seeded()
    expect(await fake.client.deleteMany({ where: { userId: 'mia' } })).toEqual({ count: 2 })
    expect(keys(fake.state.rows)).toEqual(['bea@loc-a'])
  })

  it('forgetLocations deletes the rows of those locations only (the ON DELETE CASCADE from Location)', async () => {
    const { fake } = await seeded()
    fake.forgetLocations(['loc-a'])
    expect(keys(fake.state.rows)).toEqual(['mia@loc-b'])
  })

  it('reset replaces the rows with copies', () => {
    const { fake } = fixture()
    const row = { userId: 'mia', locationId: 'loc-a', customOrder: 3, lastVisitedAt: null, updatedAt: T0 }
    fake.reset([row])
    row.customOrder = 9
    expect(fake.state.rows).toEqual([{ ...row, customOrder: 3 }])
  })
})
