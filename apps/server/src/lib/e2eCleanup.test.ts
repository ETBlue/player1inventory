import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `DELETE /e2e/cleanup` (lib/e2eCleanup.ts), called directly with a fake
// request and response.
//
// What these tests pin, and what they do not:
// - They pin WHICH models are deleted, in WHICH order, with the EXACT filter
//   of each of the 21 (18 since households H3a task 3.10, plus the invites
//   since H5b task G.6, plus the activity rows since H6 task J.1, plus the
//   ownership offers since H6b task K.1), and that
//   exactly those 21 operations, in that
//   order, are what reaches `$transaction`.
// - They pin which households count as the user's: only those with an
//   `owner` row. A household the user only belongs to is never deleted.
// - They pin that each count lands under its own key, and that
//   `forgetSeenToday` runs once, for this user, and only AFTER the
//   transaction has finished.
// - They do NOT run SQL. Whether each filter matches the right rows in
//   Postgres is checked by e2e/tests/cleanup-endpoint.spec.ts (every count at
//   least 1) and e2e/tests/purge-two-households.spec.ts.

// `vi.mock` factories are hoisted above every other line, so what they share
// with the tests is built in `vi.hoisted`.
const shared = vi.hoisted(() => ({
  /** Every call this file sees, in order: `read:owners`, `delete:<model>`, `commit`, `forget:<id>`. */
  events: [] as string[],
  /** The 21 Prisma client names, in the order the route must delete them. */
  MODELS: [
    'inventoryLog',
    'cartItem',
    'cart',
    'itemTag',
    'itemVendor',
    'recipeItem',
    'itemStock',
    'item',
    'tag',
    'tagType',
    'vendor',
    'recipe',
    'shelf',
    'locationMember',
    'location',
    'householdInvite',
    'householdActivity',
    'ownershipOffer',
    'householdMember',
    'household',
    'user',
  ] as const,
  /**
   * The `HouseholdMember` rows the route's owner read searches. Each test
   * sets them. The read applies `userId` and `role` key by key, and throws
   * on any other key, so a read that drops `role` returns MORE rows here,
   * not the same rows.
   */
  memberRows: [] as { householdId: string; userId: string; role: string }[],
  /**
   * Lets a test hold the transaction open, to check what runs before it
   * finishes. `null` means the transaction finishes at once.
   */
  transactionGate: null as Promise<void> | null,
  transactionError: null as Error | null,
}))
const { events, MODELS } = shared

vi.mock('./prisma.js', () => {
  // Each model's count is its position in MODELS plus 1, so a count that
  // lands under the wrong key is seen. Each deleteMany returns a marker
  // naming its model and holding its argument, so the array that reaches
  // `$transaction` says which operations it holds.
  const client: Record<string, Record<string, unknown>> = {}
  shared.MODELS.forEach((model, index) => {
    client[model] = {
      deleteMany: vi.fn((args: unknown) => {
        shared.events.push(`delete:${model}`)
        return { model, args, count: index + 1 }
      }),
    }
  })
  const householdMember = client.householdMember as Record<string, unknown>
  householdMember.findMany = vi.fn(
    async (args: { where: Record<string, unknown>; select?: unknown }) => {
      shared.events.push('read:owners')
      for (const key of Object.keys(args.where)) {
        if (key !== 'userId' && key !== 'role') {
          throw new Error(`e2eCleanup.test: householdMember.findMany does not model where.${key}`)
        }
      }
      return shared.memberRows
        .filter((row) => args.where.userId === undefined || row.userId === args.where.userId)
        .filter((row) => args.where.role === undefined || row.role === args.where.role)
        .map((row) => ({ householdId: row.householdId }))
    },
  )
  // The ARRAY form only, like the route. The array's items are the values the
  // deleteMany fakes returned, already in call order.
  const $transaction = vi.fn(async (ops: unknown) => {
    if (!Array.isArray(ops)) throw new Error('this fake models only the array form of $transaction')
    if (shared.transactionGate) await shared.transactionGate
    if (shared.transactionError) throw shared.transactionError
    shared.events.push('commit')
    return ops
  })
  return { prisma: { ...client, $transaction } }
})

vi.mock('./userRow.js', () => ({
  forgetSeenToday: vi.fn((userId: string) => {
    shared.events.push(`forget:${userId}`)
  }),
}))

import { prisma } from './prisma.js'
import { forgetSeenToday } from './userRow.js'
import { CLEANUP_MODEL_KEYS, e2eCleanupHandler } from './e2eCleanup.js'

function fakeRequest(userId?: string): Request {
  return { headers: userId === undefined ? {} : { 'x-e2e-user-id': userId } } as unknown as Request
}

function fakeResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(body: unknown) {
      res.body = body
      return res
    },
  }
  return res
}

function deleteArgsOf(model: (typeof MODELS)[number]): unknown {
  const client = prisma as unknown as Record<string, { deleteMany: ReturnType<typeof vi.fn> }>
  return client[model]?.deleteMany.mock.calls[0]?.[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  events.length = 0
  shared.transactionGate = null
  shared.transactionError = null
  // The user `e2e-user-1` owns hh-own and is only a MEMBER of hh-other,
  // which `e2e-user-2` owns. `e2e-user-2` also has a member row in hh-own.
  shared.memberRows = [
    { householdId: 'hh-own', userId: 'e2e-user-1', role: 'owner' },
    { householdId: 'hh-other', userId: 'e2e-user-1', role: 'member' },
    { householdId: 'hh-other', userId: 'e2e-user-2', role: 'owner' },
    { householdId: 'hh-own', userId: 'e2e-user-2', role: 'manager' },
  ]
})

/** The filter each of the 21 deletes must carry, for `e2e-user-1` who owns hh-own. */
const OWNED = { in: ['hh-own'] }
const EXPECTED_FILTERS: Record<(typeof MODELS)[number], unknown> = {
  inventoryLog: { where: { location: { householdId: OWNED } } },
  cartItem: { where: { cart: { location: { householdId: OWNED } } } },
  cart: { where: { location: { householdId: OWNED } } },
  itemTag: { where: { item: { householdId: OWNED } } },
  itemVendor: { where: { item: { householdId: OWNED } } },
  recipeItem: { where: { recipe: { householdId: OWNED } } },
  itemStock: { where: { location: { householdId: OWNED } } },
  item: { where: { householdId: OWNED } },
  tag: { where: { householdId: OWNED } },
  tagType: { where: { householdId: OWNED } },
  vendor: { where: { householdId: OWNED } },
  recipe: { where: { householdId: OWNED } },
  shelf: { where: { householdId: OWNED } },
  locationMember: {
    where: { OR: [{ userId: 'e2e-user-1' }, { location: { householdId: OWNED } }] },
  },
  location: { where: { householdId: OWNED } },
  // Every invite of hh-own, and the invites e2e-user-1 made anywhere else
  // (`createdById` is RESTRICT, so they would block the User delete).
  householdInvite: {
    where: { OR: [{ householdId: OWNED }, { createdById: 'e2e-user-1' }] },
  },
  // Every activity row of hh-own (households H6, task J.1). Only the owned
  // households: a log row of hh-other that names e2e-user-1 stays, because
  // `actorId` and `targetUserId` have no foreign key to block the User
  // delete (decision T46).
  householdActivity: { where: { householdId: OWNED } },
  // Every offer of hh-own, and every offer TO e2e-user-1 in any household
  // (households H6b, task K.1, decision T58). `toUserId` is ON DELETE
  // CASCADE, so the User delete would remove the second half anyway; it is
  // deleted here so the count says so. An offer e2e-user-1 MADE in hh-other
  // stays: `fromUserId` has no foreign key.
  ownershipOffer: { where: { OR: [{ householdId: OWNED }, { toUserId: 'e2e-user-1' }] } },
  householdMember: { where: { OR: [{ userId: 'e2e-user-1' }, { householdId: OWNED }] } },
  household: { where: { id: OWNED } },
  user: { where: { id: 'e2e-user-1' } },
}

describe('e2eCleanupHandler', () => {
  it('answers 400 without the user header, deletes nothing and forgets no one', async () => {
    const res = fakeResponse()
    await e2eCleanupHandler(fakeRequest(), res as unknown as Response)

    expect(res.statusCode).toBe(400)
    expect(events).toEqual([])
  })

  it('deletes the 21 models in order, each with its exact filter, and the User row last', async () => {
    // When the cleanup runs for a user who owns one household
    const res = fakeResponse()
    await e2eCleanupHandler(fakeRequest('e2e-user-1'), res as unknown as Response)

    // Then the owned households are read first, then every model is deleted
    // once, children before parents, User last
    expect(events).toEqual([
      'read:owners',
      ...MODELS.map((model) => `delete:${model}`),
      'commit',
      'forget:e2e-user-1',
    ])
    // And each delete carries exactly its filter. Until task 3.10 only 2 of
    // the 15 were checked here (`user` and `shelf`).
    expect(Object.keys(EXPECTED_FILTERS)).toEqual([...MODELS])
    for (const model of MODELS) {
      const client = prisma as unknown as Record<string, { deleteMany: ReturnType<typeof vi.fn> }>
      expect(client[model]?.deleteMany.mock.calls, model).toStrictEqual([[EXPECTED_FILTERS[model]]])
    }
    // And exactly those 21 operations, in that order, are what reaches the
    // one transaction. A real PrismaPromise is lazy: a deleteMany that is
    // built but left out of the array never runs, and its argument above
    // would still look right.
    expect(vi.mocked(prisma.$transaction).mock.calls).toStrictEqual([
      [
        MODELS.map((model, index) => ({
          model,
          args: EXPECTED_FILTERS[model],
          count: index + 1,
        })),
      ],
    ])
  })

  it('never deletes a household the user only belongs to', async () => {
    // Given e2e-user-1 is only a member of hh-other (see beforeEach)
    await e2eCleanupHandler(fakeRequest('e2e-user-1'), fakeResponse() as unknown as Response)

    // Then the owner read asks for owner rows of this user only
    const read = vi.mocked(
      (prisma as unknown as { householdMember: { findMany: ReturnType<typeof vi.fn> } })
        .householdMember.findMany,
    )
    expect(read.mock.calls).toStrictEqual([
      [{ where: { userId: 'e2e-user-1', role: 'owner' }, select: { householdId: true } }],
    ])
    // And hh-other is named by no household-wide filter. Only this user's
    // own member rows go there, through `{ userId }`.
    expect(deleteArgsOf('household')).toEqual({ where: { id: { in: ['hh-own'] } } })
    expect(JSON.stringify(deleteArgsOf('householdMember'))).not.toContain('hh-other')
    expect(JSON.stringify(deleteArgsOf('locationMember'))).not.toContain('hh-other')
  })

  it('a user who owns no household deletes no household data, only their own role rows and User row', async () => {
    // Given e2e-user-3 owns nothing and is a member of hh-other
    shared.memberRows.push({ householdId: 'hh-other', userId: 'e2e-user-3', role: 'member' })

    await e2eCleanupHandler(fakeRequest('e2e-user-3'), fakeResponse() as unknown as Response)

    // Then every household filter is `{ in: [] }`, which matches no row in
    // Prisma. It is never `undefined`, which would match every row.
    expect(deleteArgsOf('household')).toEqual({ where: { id: { in: [] } } })
    expect(deleteArgsOf('item')).toEqual({ where: { householdId: { in: [] } } })
    expect(deleteArgsOf('householdMember')).toEqual({
      where: { OR: [{ userId: 'e2e-user-3' }, { householdId: { in: [] } }] },
    })
    // And only the invites this user made go, because they block the User
    // delete. Invites of hh-other that someone else made stay.
    expect(deleteArgsOf('householdInvite')).toEqual({
      where: { OR: [{ householdId: { in: [] } }, { createdById: 'e2e-user-3' }] },
    })
    // And only the offers TO this user go. Offers of hh-other to anyone else
    // stay with hh-other.
    expect(deleteArgsOf('ownershipOffer')).toEqual({
      where: { OR: [{ householdId: { in: [] } }, { toUserId: 'e2e-user-3' }] },
    })
    expect(deleteArgsOf('user')).toEqual({ where: { id: 'e2e-user-3' } })
  })

  it('returns each count under its own key, users included', async () => {
    const res = fakeResponse()
    await e2eCleanupHandler(fakeRequest('e2e-user-1'), res as unknown as Response)

    // The fake gives the model at position i a count of i + 1
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      ok: true,
      deleted: Object.fromEntries(CLEANUP_MODEL_KEYS.map((key, index) => [key, index + 1])),
    })
    expect(CLEANUP_MODEL_KEYS).toHaveLength(21)
    expect(CLEANUP_MODEL_KEYS[20]).toBe('users')
  })

  it('forgets the user only after the transaction has finished', async () => {
    // Given a transaction that is held open
    let finish: () => void = () => {}
    shared.transactionGate = new Promise<void>((resolve) => {
      finish = resolve
    })
    const res = fakeResponse()
    const run = e2eCleanupHandler(fakeRequest('e2e-user-1'), res as unknown as Response)

    // While it is open, the memory is not touched
    await vi.waitFor(() => expect(prisma.$transaction).toHaveBeenCalledTimes(1))
    expect(forgetSeenToday).not.toHaveBeenCalled()

    // When it finishes
    finish()
    await run

    // Then the user is forgotten once, after the commit
    expect(events.slice(-2)).toEqual(['commit', 'forget:e2e-user-1'])
    expect(forgetSeenToday).toHaveBeenCalledTimes(1)
  })

  it('forgets no one when the transaction fails, because nothing was deleted', async () => {
    shared.transactionError = new Error('connection lost')

    await expect(
      e2eCleanupHandler(fakeRequest('e2e-user-1'), fakeResponse() as unknown as Response),
    ).rejects.toThrow('connection lost')
    expect(forgetSeenToday).not.toHaveBeenCalled()
  })
})

describe('the cleanup keys match the E2E helper', () => {
  it('lists the same keys, in the same order, as CLEANUP_MODEL_KEYS in e2e/helpers/cloudTeardown.ts', () => {
    // The E2E helper cannot import from the server, so it keeps its own copy.
    // This reads that copy as text, so the two lists cannot drift apart.
    const here = dirname(fileURLToPath(import.meta.url))
    const helper = readFileSync(resolve(here, '../../../../e2e/helpers/cloudTeardown.ts'), 'utf8')
    const block = helper.match(/CLEANUP_MODEL_KEYS = \[([\s\S]*?)\] as const/)?.[1]
    expect(block).toBeDefined()
    const keys = [...(block ?? '').matchAll(/'(\w+)'/g)].map((m) => m[1])
    expect(keys).toEqual([...CLEANUP_MODEL_KEYS])
  })
})
