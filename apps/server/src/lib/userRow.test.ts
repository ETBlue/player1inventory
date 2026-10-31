import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `ensureUser` writes through `prisma.user`. Here that is the stateful `User`
// double from src/test/userFake.ts, with every method wrapped in a `vi.fn()`
// so a test can COUNT queries (the same way as lib/defaultLocation.test.ts).
// `userRowFromClerk` does not touch prisma, so this mock does not change its
// tests.
vi.mock('./prisma.js', async () => {
  const { createUserFake } = await import('../test/userFake.js')
  const userFake = createUserFake()
  const user = {
    findUnique: vi.fn(userFake.client.findUnique),
    findMany: vi.fn(userFake.client.findMany),
    create: vi.fn(userFake.client.create),
    upsert: vi.fn(userFake.client.upsert),
    updateMany: vi.fn(userFake.client.updateMany),
  }
  return { prisma: { user, $userFake: userFake } }
})

import { prisma } from './prisma.js'
import type { UserFake, UserRow } from '../test/userFake.js'
import type { ClerkUserJSON, ClerkUserLookup } from './userRow.js'
import {
  CLERK_LOOKUP_TIMEOUT_MS,
  FALLBACK_DISPLAY_NAME,
  MEMORY_LIMIT,
  ensureUser,
  ensureUserOrLog,
  forgetSeenToday,
  resetSeenTodayMemory,
  userRowFromClerk,
} from './userRow.js'

// The Clerk user JSON with only the fields `userRowFromClerk` reads. Every
// test starts from this and changes one thing.
function clerkUser(extra: Partial<ClerkUserJSON> = {}): ClerkUserJSON {
  return {
    id: 'user_abc',
    first_name: 'ET',
    last_name: 'Blue',
    primary_email_address_id: 'idn_primary',
    email_addresses: [
      { id: 'idn_other', email_address: 'other@example.com' },
      { id: 'idn_primary', email_address: 'etblue@example.com' },
    ],
    ...extra,
  }
}

describe('userRowFromClerk', () => {
  it('joins the first and last name into the display name', () => {
    // Given a Clerk user with a first and a last name
    // When it is turned into a User row
    const row = userRowFromClerk(clerkUser())

    // Then the display name is both names with one space
    expect(row).toEqual({ id: 'user_abc', displayName: 'ET Blue', email: 'etblue@example.com' })
  })

  it('uses only the first name when there is no last name', () => {
    // Given a Clerk user with a first name and an empty last name
    const row = userRowFromClerk(clerkUser({ last_name: '' }))

    // Then the display name has no trailing space
    expect(row.displayName).toBe('ET')
  })

  it('picks the email named by primary_email_address_id, not the first one in the list', () => {
    // Given two email addresses, where the primary one is listed SECOND
    const row = userRowFromClerk(clerkUser())

    // Then the primary one is stored
    expect(row.email).toBe('etblue@example.com')
  })

  it('stores no email when the primary id names no address in the list', () => {
    // Given a primary id that matches none of the addresses
    const row = userRowFromClerk(clerkUser({ primary_email_address_id: 'idn_gone' }))

    // Then no email is stored (P10: email is optional)
    expect(row.email).toBeNull()
  })

  it('falls back to the part of the email before @ when there is no name', () => {
    // Given a Clerk user with no first or last name
    const row = userRowFromClerk(clerkUser({ first_name: null, last_name: null }))

    // Then the display name is the email's local part (P10)
    expect(row.displayName).toBe('etblue')
  })

  it('falls back to "User" when there is no name and no email', () => {
    // Given a Clerk user with no name and no email address (phone sign-in)
    const row = userRowFromClerk(
      clerkUser({
        first_name: null,
        last_name: null,
        primary_email_address_id: null,
        email_addresses: [],
      }),
    )

    // Then the display name is "User" and no email is stored (P10)
    expect(row).toEqual({ id: 'user_abc', displayName: 'User', email: null })
  })

  it('treats a name of only spaces as no name', () => {
    // Given names that are only spaces
    const row = userRowFromClerk(clerkUser({ first_name: '  ', last_name: ' ' }))

    // Then the email fallback is used, not a blank display name
    expect(row.displayName).toBe('etblue')
  })
})

// ── ensureUser: the request-path safety net and lastSeenAt ──

const userFake = (prisma as unknown as { $userFake: UserFake }).$userFake
const user = vi.mocked(prisma.user)

/** Every query `ensureUser` can make. The 0- and 1-query tests sum these. */
function queryCount(): number {
  return (
    user.findUnique.mock.calls.length +
    user.findMany.mock.calls.length +
    user.create.mock.calls.length +
    user.upsert.mock.calls.length +
    user.updateMany.mock.calls.length
  )
}

const TODAY_NOON = new Date('2026-10-31T12:00:00.000Z')
const YESTERDAY_NOON = new Date('2026-10-30T12:00:00.000Z')

function storedRow(id: string, extra: Partial<UserRow> = {}): UserRow {
  return {
    id,
    displayName: 'Stored Name',
    email: 'stored@example.com',
    lastSeenAt: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...extra,
  }
}

function clerkLookup(json: ClerkUserJSON | null = clerkUser({ id: 'user_new' })) {
  return vi.fn<ClerkUserLookup>(async () => json)
}

function rowOf(id: string): UserRow | undefined {
  return userFake.state.rows.find((r) => r.id === id)
}

describe('ensureUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userFake.reset()
    resetSeenTodayMemory()
    // A time zone far from UTC, so the UTC day tests fail if the code uses
    // the server's local day. On a machine set to UTC, local and UTC days are
    // the same, and that mistake would pass. Node reads TZ when it changes.
    vi.stubEnv('TZ', 'Asia/Taipei')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('makes 0 queries for a user already seen today in this process', async () => {
    // Given a row seen earlier today, and one call that has already run
    userFake.reset([storedRow('user_a', { lastSeenAt: new Date('2026-10-31T08:00:00.000Z') })])
    const lookup = clerkLookup()
    await ensureUser('user_a', { kind: 'clerk', lookup }, TODAY_NOON)
    vi.clearAllMocks()

    // When a second request for the same user arrives later the same day
    await ensureUser('user_a', { kind: 'clerk', lookup }, new Date('2026-10-31T18:00:00.000Z'))

    // Then no query runs at all (P12)
    expect(queryCount()).toBe(0)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('makes 1 query for a user seen yesterday, and moves lastSeenAt to now', async () => {
    // Given a row last seen yesterday
    userFake.reset([storedRow('user_a', { lastSeenAt: YESTERDAY_NOON })])
    const lookup = clerkLookup()

    // When the first request today arrives
    await ensureUser('user_a', { kind: 'clerk', lookup }, TODAY_NOON)

    // Then one updateMany ran, and lastSeenAt is now
    expect(queryCount()).toBe(1)
    expect(user.updateMany).toHaveBeenCalledTimes(1)
    expect(rowOf('user_a')?.lastSeenAt).toEqual(TODAY_NOON)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('makes 1 query for a row whose lastSeenAt is null, and sets it', async () => {
    // Given a row the webhook wrote, never seen on a request. In SQL,
    // `lastSeenAt < x` is not true for NULL, so `{ lt }` alone misses it.
    userFake.reset([storedRow('user_a', { lastSeenAt: null })])
    const lookup = clerkLookup()

    // When the first request arrives
    await ensureUser('user_a', { kind: 'clerk', lookup }, TODAY_NOON)

    // Then one updateMany set lastSeenAt, and Clerk was not asked
    expect(queryCount()).toBe(1)
    expect(rowOf('user_a')?.lastSeenAt).toEqual(TODAY_NOON)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('the day ends at midnight UTC', async () => {
    // Given a row seen one millisecond before midnight UTC
    userFake.reset([storedRow('user_a', { lastSeenAt: new Date('2026-10-30T23:59:59.999Z') })])
    const lookup = clerkLookup()
    const midnight = new Date('2026-10-31T00:00:00.000Z')

    // When a request arrives at exactly midnight UTC
    await ensureUser('user_a', { kind: 'clerk', lookup }, midnight)

    // Then that counts as a new day: lastSeenAt moves
    expect(rowOf('user_a')?.lastSeenAt).toEqual(midnight)

    // And a request later the same UTC day does not write again, even with
    // the memory cleared (so the database condition is what is tested)
    resetSeenTodayMemory()
    await ensureUser('user_a', { kind: 'clerk', lookup }, new Date('2026-10-31T23:59:59.999Z'))
    expect(rowOf('user_a')?.lastSeenAt).toEqual(midnight)
  })

  it('the per-process memory also ends at midnight UTC', async () => {
    // Given a user seen at 23:59 UTC, remembered by this process
    userFake.reset([storedRow('user_a', { lastSeenAt: null })])
    const lookup = clerkLookup()
    await ensureUser('user_a', { kind: 'clerk', lookup }, new Date('2026-10-30T23:59:00.000Z'))
    vi.clearAllMocks()

    // When the next request arrives two minutes later, on the next UTC day
    const next = new Date('2026-10-31T00:01:00.000Z')
    await ensureUser('user_a', { kind: 'clerk', lookup }, next)

    // Then the memory does not skip it: lastSeenAt moves to the new day
    expect(user.updateMany).toHaveBeenCalledTimes(1)
    expect(rowOf('user_a')?.lastSeenAt).toEqual(next)
  })

  it('creates a missing row with the values from Clerk, and asks Clerk once', async () => {
    // Given no row for the user
    const lookup = clerkLookup(clerkUser({ id: 'user_new' }))

    // When their first request arrives
    await ensureUser('user_new', { kind: 'clerk', lookup }, TODAY_NOON)

    // Then the row has Clerk's name and email, and lastSeenAt is now
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledWith('user_new')
    expect(rowOf('user_new')).toMatchObject({
      displayName: 'ET Blue',
      email: 'etblue@example.com',
      lastSeenAt: TODAY_NOON,
      deletedAt: null,
    })
  })

  it('uses the id it was asked for, not the id in the Clerk reply', async () => {
    // Given a Clerk reply that names a different id
    const lookup = clerkLookup(clerkUser({ id: 'user_other' }))

    // When the row is created
    await ensureUser('user_new', { kind: 'clerk', lookup }, TODAY_NOON)

    // Then the row has the id of the signed-in user
    expect(userFake.state.rows.map((r) => r.id)).toEqual(['user_new'])
  })

  it('creates the row with fallback values when the Clerk lookup throws, and does not throw', async () => {
    // Given a Clerk API that fails
    // whose error message names the user
    const lookup = vi.fn<ClerkUserLookup>(async () => {
      throw new Error('Clerk API is down for etblue@example.com')
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    // When the first request arrives
    await expect(
      ensureUser('user_new', { kind: 'clerk', lookup }, TODAY_NOON),
    ).resolves.toBeUndefined()

    // Then the row exists with the fallback name and no email (P11)
    expect(rowOf('user_new')).toMatchObject({
      displayName: FALLBACK_DISPLAY_NAME,
      email: null,
      lastSeenAt: TODAY_NOON,
    })
    // And the failure was logged, without the error's message
    expect(log).toHaveBeenCalled()
    const logged = log.mock.calls
      .flat()
      .map((part) => String(part))
      .join('\n')
    expect(logged).not.toContain('etblue@example.com')
    log.mockRestore()
  })

  it('creates the row with fallback values when Clerk returns no raw JSON', async () => {
    // Given a Clerk lookup that answers null (`User.raw` is typed `UserJSON | null`)
    const lookup = clerkLookup(null)

    // When the first request arrives
    await ensureUser('user_new', { kind: 'clerk', lookup }, TODAY_NOON)

    // Then the row uses the fallback name
    expect(rowOf('user_new')).toMatchObject({ displayName: FALLBACK_DISPLAY_NAME, email: null })
  })

  describe('the Clerk lookup timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it(`gives up after CLERK_LOOKUP_TIMEOUT_MS (${CLERK_LOOKUP_TIMEOUT_MS} ms) and uses the fallback values`, async () => {
      // Given a Clerk lookup that never answers
      const lookup = vi.fn<ClerkUserLookup>(() => new Promise(() => {}))
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      let settled = false
      const run = ensureUser('user_new', { kind: 'clerk', lookup }, TODAY_NOON).then(() => {
        settled = true
      })

      // When almost the whole timeout has passed, the request is still waiting
      await vi.advanceTimersByTimeAsync(CLERK_LOOKUP_TIMEOUT_MS - 1)
      expect(settled).toBe(false)

      // And when the timeout is reached
      await vi.advanceTimersByTimeAsync(1)
      await run

      // Then the row is created with the fallback values (P11)
      expect(rowOf('user_new')).toMatchObject({
        displayName: FALLBACK_DISPLAY_NAME,
        email: null,
        lastSeenAt: TODAY_NOON,
      })
      expect(log.mock.calls.flat().map(String)).toContain('ClerkLookupTimeout')
      log.mockRestore()
    })

    it('uses the timeoutMs given in the source', async () => {
      // Given a lookup that never answers, and a 50 ms timeout
      const lookup = vi.fn<ClerkUserLookup>(() => new Promise(() => {}))
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const run = ensureUser('user_new', { kind: 'clerk', lookup, timeoutMs: 50 }, TODAY_NOON)

      // When 50 ms pass
      await vi.advanceTimersByTimeAsync(50)
      await run

      // Then the fallback row exists
      expect(rowOf('user_new')?.displayName).toBe(FALLBACK_DISPLAY_NAME)
      vi.mocked(console.error).mockRestore()
    })

    it('a lookup that fails after the timeout leaves no unhandled rejection', async () => {
      // Given a Clerk lookup that answers only after the timeout, with an error
      let failLookup: (err: Error) => void = () => {}
      const lookup = vi.fn<ClerkUserLookup>(
        () =>
          new Promise((_resolve, reject) => {
            failLookup = reject
          }),
      )
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const unhandled: unknown[] = []
      const onUnhandled = (reason: unknown) => unhandled.push(reason)
      process.on('unhandledRejection', onUnhandled)
      try {
        const run = ensureUser('user_new', { kind: 'clerk', lookup, timeoutMs: 50 }, TODAY_NOON)
        await vi.advanceTimersByTimeAsync(50)
        await run

        // When the lookup fails later
        failLookup(new Error('Clerk answered late with an error'))
        // Node reports an unhandled rejection after the microtask queue is
        // empty. setImmediate is not faked here, so two turns are real.
        await new Promise((resolve) => setImmediate(resolve))
        await new Promise((resolve) => setImmediate(resolve))

        // Then nothing is reported as unhandled, and the fallback row exists
        expect(unhandled).toEqual([])
        expect(rowOf('user_new')?.displayName).toBe(FALLBACK_DISPLAY_NAME)
      } finally {
        process.off('unhandledRejection', onUnhandled)
        vi.mocked(console.error).mockRestore()
      }
    })

    it('a lookup that answers in time leaves no timer running', async () => {
      // Given a Clerk lookup that answers at once
      const lookup = clerkLookup(clerkUser({ id: 'user_new' }))

      // When the row is created
      await ensureUser('user_new', { kind: 'clerk', lookup }, TODAY_NOON)

      // Then Clerk's values were used, and the timeout timer was cleared
      expect(rowOf('user_new')?.displayName).toBe('ET Blue')
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('in E2E mode creates the row named by the user id, without Clerk', async () => {
    // Given E2E mode and no row
    // When the first request arrives
    await ensureUser('e2e-user-1', { kind: 'e2e' }, TODAY_NOON)

    // Then the display name is the user id, and there is no email
    expect(rowOf('e2e-user-1')).toMatchObject({
      displayName: 'e2e-user-1',
      email: null,
      lastSeenAt: TODAY_NOON,
    })
  })

  it('ten parallel first requests give one row and no error', async () => {
    // Given no row, and ten requests for the same new user at once
    const lookup = clerkLookup(clerkUser({ id: 'user_new' }))

    // When they all run together
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        ensureUser('user_new', { kind: 'clerk', lookup }, TODAY_NOON),
      ),
    )

    // Then none failed, and there is exactly one row
    expect(results.filter((r) => r.status === 'rejected')).toEqual([])
    expect(userFake.state.rows.map((r) => r.id)).toEqual(['user_new'])
  })

  it('ten parallel first requests ask Clerk once and try one create', async () => {
    // Given no row, and ten requests for the same new user at once, the way
    // the web app sends several queries when a page loads
    const lookup = clerkLookup(clerkUser({ id: 'user_new' }))

    // When they all run together
    await Promise.all(
      Array.from({ length: 10 }, () =>
        ensureUser('user_new', { kind: 'clerk', lookup }, TODAY_NOON),
      ),
    )

    // Then they shared one run: one Clerk call and one create
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(user.create).toHaveBeenCalledTimes(1)
    expect(user.updateMany).toHaveBeenCalledTimes(1)
  })

  it('a parallel call for ANOTHER user does not share the run', async () => {
    // Given two new users whose first requests arrive at the same time
    const lookup = vi.fn<ClerkUserLookup>(async (id) => clerkUser({ id }))

    // When both run together
    await Promise.all([
      ensureUser('user_a', { kind: 'clerk', lookup }, TODAY_NOON),
      ensureUser('user_b', { kind: 'clerk', lookup }, TODAY_NOON),
    ])

    // Then each user got their own row and their own Clerk call
    expect(lookup.mock.calls.map(([id]) => id).sort()).toEqual(['user_a', 'user_b'])
    expect(userFake.state.rows.map((r) => r.id).sort()).toEqual(['user_a', 'user_b'])
  })

  it('a failed run is not shared with the next request, which tries again', async () => {
    // Given a database that fails once, then works
    user.updateMany.mockRejectedValueOnce(Object.assign(new Error('down'), { code: 'P1001' }))
    const lookup = clerkLookup(clerkUser({ id: 'user_new' }))

    // When the first request fails
    await expect(
      ensureUser('user_new', { kind: 'clerk', lookup }, TODAY_NOON),
    ).rejects.toThrow('down')

    // Then the next request runs again and creates the row
    await ensureUser('user_new', { kind: 'clerk', lookup }, TODAY_NOON)
    expect(userFake.state.rows.map((r) => r.id)).toEqual(['user_new'])
    expect(user.updateMany).toHaveBeenCalledTimes(2)
  })

  it('does not throw when another process creates the row first (P2002)', async () => {
    // Given no row when this process looks, but another server process (or
    // the webhook) creates it while this one is asking Clerk
    const lookup = vi.fn<ClerkUserLookup>(async (id) => {
      userFake.state.rows.push(storedRow(id, { displayName: 'From Webhook' }))
      return clerkUser({ id })
    })

    // When this process then tries to create the row
    await expect(
      ensureUser('user_new', { kind: 'clerk', lookup }, TODAY_NOON),
    ).resolves.toBeUndefined()

    // Then the create really failed with P2002, and the other row is kept
    expect(user.create).toHaveBeenCalledTimes(1)
    await expect(user.create.mock.results[0]?.value).rejects.toMatchObject({ code: 'P2002' })
    expect(userFake.state.rows).toHaveLength(1)
    expect(rowOf('user_new')?.displayName).toBe('From Webhook')
  })

  // The P13 tests run once for each `lastSeenAt` state, because each state
  // takes a different path through `ensureUser`: never seen and yesterday stop
  // after `updateMany`; earlier today goes on to `findUnique`.
  const LAST_SEEN_STATES = [
    ['never seen', null],
    ['last seen yesterday', YESTERDAY_NOON],
    ['seen earlier today by another process', new Date('2026-10-31T08:00:00.000Z')],
  ] as const

  it.each(LAST_SEEN_STATES)(
    'never brings a deleted user back and never overwrites their name (%s)',
    async (_label, lastSeenAt) => {
      // Given a row the webhook marked deleted
      const deletedAt = new Date('2026-10-30T09:00:00.000Z')
      userFake.reset([
        storedRow('user_a', { displayName: 'Deleted user', deletedAt, lastSeenAt }),
      ])
      const lookup = clerkLookup(clerkUser({ id: 'user_a' }))

      // When a request for that user still arrives
      await ensureUser('user_a', { kind: 'clerk', lookup }, TODAY_NOON)

      // Then deletedAt and the name are unchanged, and Clerk was not asked (P13)
      expect(rowOf('user_a')).toMatchObject({
        displayName: 'Deleted user',
        email: 'stored@example.com',
        deletedAt,
      })
      expect(lookup).not.toHaveBeenCalled()
    },
  )

  it.each(LAST_SEEN_STATES)(
    'never overwrites a name the webhook wrote (%s)',
    async (_label, lastSeenAt) => {
      // Given a live row with the webhook's name
      userFake.reset([storedRow('user_a', { displayName: 'From Webhook', lastSeenAt })])
      const lookup = clerkLookup(clerkUser({ id: 'user_a', first_name: 'Other' }))

      // When the first request arrives
      await ensureUser('user_a', { kind: 'clerk', lookup }, TODAY_NOON)

      // Then the name and email stay
      expect(rowOf('user_a')).toMatchObject({
        displayName: 'From Webhook',
        email: 'stored@example.com',
      })
    },
  )

  it('a row seen today by another process costs 2 queries and is not changed', async () => {
    // Given a row another server process already stamped today
    const earlier = new Date('2026-10-31T08:00:00.000Z')
    userFake.reset([storedRow('user_a', { lastSeenAt: earlier })])
    const lookup = clerkLookup()

    // When this process sees the user for the first time
    await ensureUser('user_a', { kind: 'clerk', lookup }, TODAY_NOON)

    // Then updateMany matched nothing, one read found the row, nothing was
    // created and Clerk was not asked
    expect(user.updateMany).toHaveBeenCalledTimes(1)
    expect(user.findUnique).toHaveBeenCalledTimes(1)
    expect(user.create).not.toHaveBeenCalled()
    expect(lookup).not.toHaveBeenCalled()
    expect(rowOf('user_a')?.lastSeenAt).toEqual(earlier)
  })

  it('the per-process memory is dropped when it reaches its size limit', async () => {
    // Given a limit of 3 (production uses MEMORY_LIMIT), and 3 users already
    // remembered today
    expect(MEMORY_LIMIT).toBe(10_000)
    resetSeenTodayMemory(3)
    for (let i = 0; i < 3; i++) {
      await ensureUser(`user_${i}`, { kind: 'e2e' }, TODAY_NOON)
    }
    vi.clearAllMocks()
    await ensureUser('user_0', { kind: 'e2e' }, TODAY_NOON)
    expect(queryCount()).toBe(0) // still remembered: the limit is not reached yet

    // When one more user arrives
    await ensureUser('user_extra', { kind: 'e2e' }, TODAY_NOON)
    vi.clearAllMocks()

    // Then the memory was dropped, so user_0 is checked in the database again
    await ensureUser('user_0', { kind: 'e2e' }, TODAY_NOON)
    expect(user.updateMany).toHaveBeenCalledTimes(1)
  })

  it('forgetSeenToday makes the next call check the database again', async () => {
    // Given a user remembered as seen today, whose row is then removed
    // (what /e2e/cleanup will do to the User row from task 2.6 on)
    await ensureUser('e2e-user-1', { kind: 'e2e' }, TODAY_NOON)
    userFake.reset()

    // When the memory for that user is cleared and a request arrives
    forgetSeenToday('e2e-user-1')
    await ensureUser('e2e-user-1', { kind: 'e2e' }, TODAY_NOON)

    // Then the row is created again
    expect(userFake.state.rows.map((r) => r.id)).toEqual(['e2e-user-1'])
  })

  // ── forgetSeenToday while a run is in progress (/e2e/cleanup, task 2.6) ──

  /**
   * Make the next `findUnique` read the store at once, then wait until the
   * test calls `release()` before it answers. So a run can find the row, and
   * the test can delete the row before the run goes on.
   */
  function pauseNextFindUniqueAfterRead() {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const pausedFindUnique = async (args: Parameters<typeof userFake.client.findUnique>[0]) => {
      const row = await userFake.client.findUnique(args)
      await gate
      return row
    }
    // The cast: Prisma types `findUnique` as returning its own promise-like
    // client class, not a plain Promise. The fake returns a plain Promise.
    user.findUnique.mockImplementationOnce(pausedFindUnique as never)
    return { release: () => release() }
  }

  it('a run that found the row before a cleanup does not remember the user afterwards', async () => {
    // Given a row already seen today, so the run reaches findUnique, and a
    // findUnique that reads the row and then waits
    userFake.reset([storedRow('e2e-user-1', { lastSeenAt: TODAY_NOON })])
    const find = pauseNextFindUniqueAfterRead()
    const oldRun = ensureUser('e2e-user-1', { kind: 'e2e' }, TODAY_NOON)
    await vi.waitFor(() => expect(user.findUnique).toHaveBeenCalledTimes(1))

    // When /e2e/cleanup deletes the row and forgets the user, and only then
    // the old run finishes (it found the row before the delete)
    userFake.reset()
    forgetSeenToday('e2e-user-1')
    find.release()
    await oldRun

    // Then the next request still checks the database, and creates the row again
    await ensureUser('e2e-user-1', { kind: 'e2e' }, TODAY_NOON)
    expect(userFake.state.rows.map((r) => r.id)).toEqual(['e2e-user-1'])
  })

  it('a request after a cleanup does not join a run that started before it', async () => {
    // Given a run that found the row and is now waiting
    userFake.reset([storedRow('e2e-user-1', { lastSeenAt: TODAY_NOON })])
    const find = pauseNextFindUniqueAfterRead()
    const oldRun = ensureUser('e2e-user-1', { kind: 'e2e' }, TODAY_NOON)
    await vi.waitFor(() => expect(user.findUnique).toHaveBeenCalledTimes(1))

    // When /e2e/cleanup deletes the row and forgets the user, and a new
    // request arrives while the old run is still waiting
    userFake.reset()
    forgetSeenToday('e2e-user-1')
    let newRunSettled = false
    const newRun = ensureUser('e2e-user-1', { kind: 'e2e' }, TODAY_NOON).then(() => {
      newRunSettled = true
    })

    // Then the new request runs on its own and creates the row. If it had
    // joined the old run, it would still be waiting on the old findUnique.
    await vi.waitFor(() => expect(newRunSettled).toBe(true))
    expect(userFake.state.rows.map((r) => r.id)).toEqual(['e2e-user-1'])

    find.release()
    await Promise.all([oldRun, newRun])
  })

  it('a run that crosses midnight UTC does not move the memory back to the old day', async () => {
    // Given a run for user_a that starts one second before midnight UTC and
    // then waits in findUnique
    userFake.reset([
      storedRow('user_a', { lastSeenAt: new Date('2026-10-30T23:00:00.000Z') }),
      storedRow('user_b', { lastSeenAt: null }),
    ])
    const find = pauseNextFindUniqueAfterRead()
    const lateRun = ensureUser('user_a', { kind: 'e2e' }, new Date('2026-10-30T23:59:59.000Z'))
    await vi.waitFor(() => expect(user.findUnique).toHaveBeenCalledTimes(1))

    // And user_b is remembered on the new day while user_a's run still waits
    const newDay = new Date('2026-10-31T00:00:01.000Z')
    await ensureUser('user_b', { kind: 'e2e' }, newDay)

    // When the old run finishes, with its old-day time
    find.release()
    await lateRun
    vi.clearAllMocks()

    // Then the new day's memory is still there: user_b costs 0 queries
    await ensureUser('user_b', { kind: 'e2e' }, new Date('2026-10-31T00:00:02.000Z'))
    expect(queryCount()).toBe(0)
  })
})

describe('ensureUserOrLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userFake.reset()
    resetSeenTodayMemory()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.mocked(console.error).mockRestore()
  })

  it('does not throw when the database fails, and logs no email', async () => {
    // Given a database write that fails with an error whose MESSAGE holds an
    // email, the way a Prisma validation error prints the whole call
    const failure = Object.assign(new Error('create({ email: "etblue@example.com" }) failed'), {
      code: 'P1001',
    })
    user.updateMany.mockRejectedValueOnce(failure)

    // When the safety net runs
    await expect(
      ensureUserOrLog('user_a', { kind: 'clerk', lookup: clerkLookup() }),
    ).resolves.toBeUndefined()

    // Then the error was logged by name and code, without the email
    expect(console.error).toHaveBeenCalled()
    const logged = vi
      .mocked(console.error)
      .mock.calls.flat()
      .map((part) => String(part))
      .join('\n')
    expect(logged).toContain('P1001')
    expect(logged).not.toContain('etblue@example.com')
  })
})
