import { describe, expect, it, vi } from 'vitest'
import { runInTransaction } from './stockFake.js'
import type { UserRow } from './userFake.js'
import {
  createUserFake,
  UnknownWhereKeyError,
  UnsupportedWhereFilterError,
} from './userFake.js'

// The double's OWN contract.
//
// `userFake` is the thing under test here. Tasks 2.3 and 2.4 of the households
// plan (docs/global/permissions/2026-10-31-households-plan.md) write their
// webhook and safety-net tests on top of it. If the fake is wrong, those tests
// pass against wrong code, so each constraint it claims is pinned here, one
// `describe` per row of the table in task 2.2.

const DAY = 24 * 60 * 60 * 1000
const START_OF_TODAY = new Date('2026-10-31T00:00:00.000Z')
const YESTERDAY = new Date(START_OF_TODAY.getTime() - DAY / 2)
const TODAY = new Date(START_OF_TODAY.getTime() + DAY / 2)

function userRow(id: string, extra: Partial<UserRow> = {}): UserRow {
  return {
    id,
    displayName: id,
    email: null,
    lastSeenAt: null,
    deletedAt: null,
    householdSetupAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...extra,
  }
}

describe('userFake applies where key by key, and throws on a key it does not know', () => {
  it('findUnique returns the row whose id matches, and no other', async () => {
    // Given two users
    const fake = createUserFake([userRow('user_a'), userRow('user_b')])

    // When one id is read, and an id no row holds is read
    const found = await fake.client.findUnique({ where: { id: 'user_b' } })
    const missing = await fake.client.findUnique({ where: { id: 'user_none' } })

    // Then the right row comes back, and nothing for the free id
    expect(found?.id).toBe('user_b')
    expect(missing).toBeNull()
  })

  it('a where key the fake does not model throws instead of being ignored', async () => {
    // Given one user whose email is set
    const fake = createUserFake([userRow('user_a', { email: 'a@example.com' })])

    // When a where names a column the fake does not model
    // Then it throws. Ignoring the key would match every row, so a test could
    // pass against code that filters on something the fake never applied.
    await expect(
      fake.client.updateMany({
        where: { email: 'other@example.com' },
        data: { displayName: 'X' },
      }),
    ).rejects.toThrow(/does not model/)
    expect(fake.state.rows[0]?.displayName).toBe('user_a')
  })

  it('a filter shape the fake does not model throws instead of matching everything', async () => {
    // Given one user
    const fake = createUserFake([userRow('user_a', { lastSeenAt: YESTERDAY })])

    // When `lastSeenAt` carries `{ gt }`, which is not modelled
    // Then it throws the shared filter error, which names the key
    await expect(
      fake.client.updateMany({
        where: { lastSeenAt: { gt: START_OF_TODAY } },
        data: { lastSeenAt: TODAY },
      }),
    ).rejects.toThrow(UnsupportedWhereFilterError)
    await expect(
      fake.client.updateMany({
        where: { lastSeenAt: { gt: START_OF_TODAY } },
        data: { lastSeenAt: TODAY },
      }),
    ).rejects.toThrow(/userFake models 'lastSeenAt'/)
  })

  it('an unknown where key throws even on an EMPTY store', async () => {
    // Given an empty store. A per-row check never runs here, because
    // `Array.filter` never calls the matcher on an empty array.
    const fake = createUserFake()

    // When a where names a column the fake does not model
    // Then it still throws, because the check runs once per call
    await expect(fake.client.findMany({ where: { email: 'a@example.com' } })).rejects.toThrow(
      UnknownWhereKeyError,
    )
  })

  it('an unknown key inside OR throws even when no row passes the outer keys', async () => {
    // Given one user. The outer `id` matches no row, so a per-row matcher
    // returns early and never reaches the OR.
    const fake = createUserFake([userRow('user_a')])

    // When an OR branch names a column the fake does not model
    // Then it throws, and names the path to the key
    await expect(
      fake.client.updateMany({
        where: { id: 'user_none', OR: [{ deletedAt: null }] },
        data: { lastSeenAt: TODAY },
      }),
    ).rejects.toThrow(/'OR\[0\]\.deletedAt'/)
  })
})

describe('userFake create honours data.id and raises P2002 on a taken id', () => {
  it('create stores the row under the id it was given', async () => {
    // Given an empty store
    const fake = createUserFake()

    // When a row is created with a Clerk user id
    const row = await fake.client.create({ data: { id: 'user_clerk_1', displayName: 'ET' } })

    // Then the row carries exactly that id
    expect(row.id).toBe('user_clerk_1')
    expect(fake.state.rows.map((r) => r.id)).toEqual(['user_clerk_1'])
  })

  it('a second create with the same id raises P2002 and writes nothing', async () => {
    // Given a user row
    const fake = createUserFake([userRow('user_a', { displayName: 'First' })])

    // When a second create uses the same id — two first requests racing
    // Then the second fails with P2002, the way the primary key does in Postgres
    await expect(
      fake.client.create({ data: { id: 'user_a', displayName: 'Second' } }),
    ).rejects.toMatchObject({ code: 'P2002' })
    expect(fake.state.rows).toHaveLength(1)
    expect(fake.state.rows[0]?.displayName).toBe('First')
  })

  it('create with no id throws, because User.id has no default', async () => {
    // Given an empty store
    const fake = createUserFake()

    // When create gets no id
    // Then it throws instead of making one up
    await expect(fake.client.create({ data: { displayName: 'No id' } })).rejects.toThrow(
      /no id/,
    )
    expect(fake.state.rows).toHaveLength(0)
  })

  it('create with no displayName throws, because the column is NOT NULL', async () => {
    // Given an empty store
    const fake = createUserFake()

    // When create gets no displayName
    // Then it throws
    await expect(fake.client.create({ data: { id: 'user_a' } })).rejects.toThrow(
      /displayName/,
    )
    expect(fake.state.rows).toHaveLength(0)
  })
})

describe('userFake upsert keeps create and update apart', () => {
  it('upsert on a free id writes the create payload and ignores update', async () => {
    // Given an empty store
    const fake = createUserFake()

    // When upsert runs for an id no row holds
    const row = await fake.client.upsert({
      where: { id: 'user_a' },
      create: { id: 'user_a', displayName: 'From create', email: 'a@example.com' },
      update: { displayName: 'From update' },
    })

    // Then the create payload is what was stored
    expect(row.displayName).toBe('From create')
    expect(fake.state.rows[0]?.displayName).toBe('From create')
    expect(fake.state.rows[0]?.email).toBe('a@example.com')
  })

  it('upsert on a taken id writes the update payload and ignores create', async () => {
    // Given a user with a deletedAt
    const deletedAt = new Date('2026-10-01T00:00:00.000Z')
    const fake = createUserFake([userRow('user_a', { displayName: 'Old', deletedAt })])

    // When upsert runs with a create payload that would clear deletedAt
    const row = await fake.client.upsert({
      where: { id: 'user_a' },
      create: { id: 'user_a', displayName: 'From create', deletedAt: null },
      update: { displayName: 'From update' },
    })

    // Then only the update payload was applied, so deletedAt survives
    expect(row.displayName).toBe('From update')
    expect(fake.state.rows[0]?.displayName).toBe('From update')
    expect(fake.state.rows[0]?.deletedAt).toEqual(deletedAt)
    expect(fake.state.rows).toHaveLength(1)
  })

  it('an undefined value in update leaves the column alone, and null is written', async () => {
    // Given a user with a name and an email
    const fake = createUserFake([
      userRow('user_a', { displayName: 'Kept', email: 'a@example.com' }),
    ])

    // When update carries `displayName: undefined` and `email: null`
    await fake.client.upsert({
      where: { id: 'user_a' },
      create: { id: 'user_a', displayName: 'unused' },
      update: { displayName: undefined, email: null },
    })

    // Then undefined means "not mentioned" (Prisma's rule) and null is a real value
    expect(fake.state.rows[0]?.displayName).toBe('Kept')
    expect(fake.state.rows[0]?.email).toBeNull()
  })
})

describe('userFake updateMany supports id, lastSeenAt null, lastSeenAt { lt } and OR', () => {
  // The query task 2.4 sends: "this user, and not seen yet today".
  const notSeenToday = {
    OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: START_OF_TODAY } }],
  }

  it('OR matches a row never seen and a row seen yesterday, but not one seen today', async () => {
    // Given three users: never seen, seen yesterday, seen today
    const fake = createUserFake([
      userRow('user_never'),
      userRow('user_yesterday', { lastSeenAt: YESTERDAY }),
      userRow('user_today', { lastSeenAt: TODAY }),
    ])

    // When updateMany runs with the "not seen today" condition
    const now = new Date(TODAY.getTime() + 1000)
    const result = await fake.client.updateMany({
      where: notSeenToday,
      data: { lastSeenAt: now },
    })

    // Then two rows changed, and the row seen today was not written
    expect(result).toEqual({ count: 2 })
    const byId = Object.fromEntries(fake.state.rows.map((r) => [r.id, r.lastSeenAt]))
    expect(byId.user_never).toEqual(now)
    expect(byId.user_yesterday).toEqual(now)
    expect(byId.user_today).toEqual(TODAY)
  })

  it('id together with OR matches only that user', async () => {
    // Given two users, neither seen today
    const fake = createUserFake([
      userRow('user_a', { lastSeenAt: YESTERDAY }),
      userRow('user_b', { lastSeenAt: YESTERDAY }),
    ])

    // When updateMany names one id plus the "not seen today" condition
    const result = await fake.client.updateMany({
      where: { id: 'user_a', ...notSeenToday },
      data: { lastSeenAt: TODAY },
    })

    // Then only that user changed
    expect(result).toEqual({ count: 1 })
    expect(fake.state.rows.find((r) => r.id === 'user_b')?.lastSeenAt).toEqual(YESTERDAY)
  })

  it('lastSeenAt { lt } does not match a null lastSeenAt, as in SQL', async () => {
    // Given a user never seen
    const fake = createUserFake([userRow('user_never')])

    // When updateMany uses only `{ lt }`, with no OR
    const result = await fake.client.updateMany({
      where: { lastSeenAt: { lt: START_OF_TODAY } },
      data: { lastSeenAt: TODAY },
    })

    // Then nothing matched. NULL < date is not true in SQL, which is why
    // task 2.4 needs the OR at all.
    expect(result).toEqual({ count: 0 })
    expect(fake.state.rows[0]?.lastSeenAt).toBeNull()
  })

  it('lastSeenAt null matches only a row never seen', async () => {
    // Given one user never seen and one seen yesterday
    const fake = createUserFake([
      userRow('user_never'),
      userRow('user_yesterday', { lastSeenAt: YESTERDAY }),
    ])

    // When updateMany uses `lastSeenAt: null`
    const result = await fake.client.updateMany({
      where: { lastSeenAt: null },
      data: { lastSeenAt: TODAY },
    })

    // Then only the never-seen row matched
    expect(result).toEqual({ count: 1 })
    expect(fake.state.rows.find((r) => r.id === 'user_yesterday')?.lastSeenAt).toEqual(
      YESTERDAY,
    )
  })
})

describe('userFake models the first sign-in claim on householdSetupAt (decision H1)', () => {
  // The statement task 3.5's `ensureHousehold` sends first in its transaction.
  const claim = (id: string, now: Date) => ({
    where: { id, householdSetupAt: null },
    data: { householdSetupAt: now },
  })

  it('the first claim on a user never set up returns count 1 and sets the column', async () => {
    // Given a user never set up
    const fake = createUserFake([userRow('user_a')])

    // When the claim runs
    const result = await fake.client.updateMany(claim('user_a', TODAY))

    // Then this request won, and the column is set
    expect(result).toEqual({ count: 1 })
    expect(fake.state.rows[0]?.householdSetupAt).toEqual(TODAY)
  })

  it('a second claim returns count 0 and does not move the column', async () => {
    // Given a user whose claim already ran
    const fake = createUserFake([userRow('user_a', { householdSetupAt: YESTERDAY })])

    // When a second claim runs
    const result = await fake.client.updateMany(claim('user_a', TODAY))

    // Then it lost: nothing changed. Without the null check it would return 1,
    // and two requests would each create a household.
    expect(result).toEqual({ count: 0 })
    expect(fake.state.rows[0]?.householdSetupAt).toEqual(YESTERDAY)
  })

  it('the claim touches only the named user', async () => {
    // Given two users never set up
    const fake = createUserFake([userRow('user_a'), userRow('user_b')])

    // When one user's claim runs
    await fake.client.updateMany(claim('user_a', TODAY))

    // Then the other user is still unset
    expect(fake.state.rows.find((r) => r.id === 'user_b')?.householdSetupAt).toBeNull()
  })

  it('householdSetupAt accepts only null as a filter', async () => {
    // Given a user
    const fake = createUserFake([userRow('user_a', { householdSetupAt: YESTERDAY })])

    // When the filter is a date or `{ not: null }`, neither of which is modelled
    // Then it throws rather than matching every row
    await expect(
      fake.client.updateMany({
        where: { id: 'user_a', householdSetupAt: { not: null } },
        data: { householdSetupAt: TODAY },
      }),
    ).rejects.toThrow(UnsupportedWhereFilterError)
  })
})

describe('userFake never invents a timestamp except createdAt and updatedAt', () => {
  it('create leaves lastSeenAt and deletedAt null, and sets createdAt and updatedAt', async () => {
    // Given an empty store
    const fake = createUserFake()
    const before = Date.now()

    // When a row is created with only the required columns
    const row = await fake.client.create({ data: { id: 'user_a', displayName: 'A' } })

    // Then lastSeenAt and deletedAt stay null, so a test can see a missing write,
    // and the two @default / @updatedAt columns are set
    expect(row.lastSeenAt).toBeNull()
    expect(row.deletedAt).toBeNull()
    expect(row.email).toBeNull()
    expect(row.createdAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(row.updatedAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('an update that does not name lastSeenAt leaves it null, and moves updatedAt', async () => {
    // Given a user never seen, with an old updatedAt
    const fake = createUserFake([userRow('user_a')])
    const before = Date.now()

    // When upsert updates only the name
    await fake.client.upsert({
      where: { id: 'user_a' },
      create: { id: 'user_a', displayName: 'unused' },
      update: { displayName: 'New' },
    })

    // Then lastSeenAt is still null and updatedAt moved, as @updatedAt does
    expect(fake.state.rows[0]?.lastSeenAt).toBeNull()
    expect(fake.state.rows[0]?.deletedAt).toBeNull()
    expect(fake.state.rows[0]?.updatedAt.getTime()).toBeGreaterThanOrEqual(before)
  })
})

describe('userFake works with the shared helpers', () => {
  it('a returned row is a copy, so changing it does not change the store', async () => {
    // Given a user
    const fake = createUserFake([userRow('user_a', { displayName: 'Stored' })])

    // When the caller changes the row it got back
    const row = await fake.client.findUnique({ where: { id: 'user_a' } })
    if (row) row.displayName = 'Changed by caller'

    // Then the store is unchanged, as with a real database
    expect(fake.state.rows[0]?.displayName).toBe('Stored')
  })

  it('runInTransaction rolls the store back when the callback throws', async () => {
    // Given a user, and the fake's state registered as a rollback store
    const fake = createUserFake([userRow('user_a', { displayName: 'Before' })])

    // When a transaction writes and then throws
    await expect(
      runInTransaction([fake.state], fake.client, async () => {
        await fake.client.upsert({
          where: { id: 'user_a' },
          create: { id: 'user_a', displayName: 'unused' },
          update: { displayName: 'Inside' },
        })
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    // Then the write is undone
    expect(fake.state.rows[0]?.displayName).toBe('Before')
  })

  it('methods can be wrapped in vi.fn to count queries', async () => {
    // Given a fake whose updateMany is wrapped, the way task 2.4 counts queries
    const fake = createUserFake([userRow('user_a')])
    const updateMany = vi.fn(fake.client.updateMany)

    // When the wrapped method is called
    await updateMany({ where: { id: 'user_a' }, data: { lastSeenAt: TODAY } })

    // Then the call is counted and the store is still written
    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(fake.state.rows[0]?.lastSeenAt).toEqual(TODAY)
  })
})
