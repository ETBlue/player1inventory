import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Prisma } from '@prisma/client'
import type { Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `DELETE /e2e/cleanup` (lib/e2eCleanup.ts), called directly with a fake
// request and response, and the SQL function it calls (lib/e2eCleanupSql.ts),
// read as text.
//
// What these tests pin, and what they do not:
// - The handler sends ONE query, `SELECT e2e_cleanup($1::text[])`, with the
//   user ids as a BOUND value, never as text in the SQL. No `$transaction`
//   and no `deleteMany` (E2E speed plan, task S.2: one round trip instead of
//   about 25).
// - Each of the 22 counts the function returns lands under its own key, in
//   the order of `CLEANUP_MODEL_KEYS`. A missing or wrong key is a 500 that
//   names the key.
// - `forgetSeenToday` runs once per user, only AFTER the query has resolved,
//   and not when it throws.
// - The SQL text: the 22 `DELETE FROM "<Model>"` statements are exactly the
//   22 models, in the order the route must delete them, each once, and each
//   is followed by its own count key. The owner read asks for `owner` rows
//   only. The exact WHERE text of each statement is checked in
//   resolvers/purge-coverage.test.ts.
// - They do NOT run SQL. Whether each filter matches the right rows in
//   Postgres is checked by e2e/tests/cleanup-endpoint.spec.ts (every count at
//   least 1), e2e/tests/household-member-cleanup.spec.ts and
//   e2e/tests/purge-two-households.spec.ts.
//
// Until task S.2 this file pinned 22 `deleteMany` calls and the array form of
// `$transaction`. Those calls are now SQL statements in one function.

// `vi.mock` factories are hoisted above every other line, so what they share
// with the tests is built in `vi.hoisted`.
const shared = vi.hoisted(() => ({
  /** Every call this file sees, in order: `query`, `resolved`, `forget:<id>`. */
  events: [] as string[],
  /** The 22 Prisma client names, in the order the route must delete them. */
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
    'locationPreference',
    'location',
    'householdInvite',
    'householdActivity',
    'ownershipOffer',
    'householdMember',
    'household',
    'user',
  ] as const,
  /** `CLEANUP_MODEL_KEYS`, copied in `beforeEach` (the factory runs before the import). */
  keys: [] as string[],
  /** What the fake `$queryRaw` answers. `undefined` means: the 22 counts. */
  answer: undefined as unknown,
  /** Lets a test hold the query open, to check what runs before it finishes. */
  queryGate: null as Promise<void> | null,
  queryError: null as Error | null,
}))
const { events, MODELS } = shared

vi.mock('./prisma.js', () => {
  // A `deleteMany` on any model, and `$transaction`, would mean the route
  // went back to one round trip per statement. Each records an event, and
  // the tests check that none is there.
  const client: Record<string, unknown> = {}
  for (const model of shared.MODELS) {
    client[model] = {
      deleteMany: vi.fn(() => {
        shared.events.push(`deleteMany:${model}`)
        return { count: 0 }
      }),
    }
  }
  const $transaction = vi.fn(async () => {
    shared.events.push('transaction')
    return []
  })
  // The function's answer: the model at position i in MODELS gets a count of
  // i + 1, so a count that lands under the wrong key is seen.
  const $queryRaw = vi.fn(async () => {
    shared.events.push('query')
    if (shared.queryGate) await shared.queryGate
    if (shared.queryError) throw shared.queryError
    shared.events.push('resolved')
    const deleted =
      shared.answer === undefined
        ? Object.fromEntries(shared.keys.map((key, index) => [key, index + 1]))
        : shared.answer
    return [{ deleted }]
  })
  const $executeRawUnsafe = vi.fn(async () => 0)
  return { prisma: { ...client, $transaction, $queryRaw, $executeRawUnsafe } }
})

vi.mock('./userRow.js', () => ({
  forgetSeenToday: vi.fn((userId: string) => {
    shared.events.push(`forget:${userId}`)
  }),
}))

import { prisma } from './prisma.js'
import { forgetSeenToday } from './userRow.js'
import {
  CLEANUP_MODEL_KEYS,
  e2eCleanupHandler,
  errorCodeOf,
  installE2eCleanupFunction,
} from './e2eCleanup.js'
import { E2E_CLEANUP_FUNCTION_SQL } from './e2eCleanupSql.js'

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

/** The one argument the handler passed to `$queryRaw`. */
function sentQuery(): Prisma.Sql {
  const calls = vi.mocked(prisma.$queryRaw).mock.calls
  expect(calls).toHaveLength(1)
  const [query, ...rest] = calls[0] as unknown[]
  // One `Prisma.Sql` object and nothing else, so no value travels outside it.
  expect(rest).toEqual([])
  // The same class `Prisma.sql` builds (`Prisma.Sql` is a type only at run
  // time in this Prisma version, so `toBeInstanceOf` cannot be used).
  expect(Object.getPrototypeOf(query)).toBe(Object.getPrototypeOf(Prisma.sql`x`))
  return query as Prisma.Sql
}

/** The table name of a model: `inventoryLog` → `InventoryLog`. No model has `@@map`. */
function tableOf(model: string): string {
  return model.charAt(0).toUpperCase() + model.slice(1)
}

/** The SQL text with every `--` comment removed. */
function withoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '')
}

/**
 * Every `DELETE FROM "<table>" WHERE …;` with the count key right after it.
 * A delete written in another shape is not matched, and the test that counts
 * every `DELETE FROM` then fails, so a statement cannot hide from this list.
 */
function deletesWithKeys(sql: string): { table: string; key: string }[] {
  const pattern =
    /DELETE FROM "(\w+)"\s+WHERE\s[^;]*;\s*GET DIAGNOSTICS c = ROW_COUNT;\s*result := result \|\| jsonb_build_object\('(\w+)', c\);/g
  return [...withoutComments(sql).matchAll(pattern)].map((m) => ({
    table: m[1] ?? '',
    key: m[2] ?? '',
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  events.length = 0
  shared.keys = [...CLEANUP_MODEL_KEYS]
  shared.answer = undefined
  shared.queryGate = null
  shared.queryError = null
})

describe('e2eCleanupHandler', () => {
  it('answers 400 without the user header, queries nothing and forgets no one', async () => {
    const res = fakeResponse()
    await e2eCleanupHandler(fakeRequest(), res as unknown as Response)

    expect(res.statusCode).toBe(400)
    expect(events).toEqual([])
  })

  it('sends ONE query, with no $transaction and no deleteMany', async () => {
    // When the cleanup runs for one user
    await e2eCleanupHandler(fakeRequest('e2e-user-1'), fakeResponse() as unknown as Response)

    // Then the database sees one query, and the user is forgotten after it
    expect(events).toEqual(['query', 'resolved', 'forget:e2e-user-1'])
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('sends the user ids as a bound value, never as text in the SQL', async () => {
    await e2eCleanupHandler(fakeRequest('e2e-user-1'), fakeResponse() as unknown as Response)

    const query = sentQuery()
    // The SQL text holds a placeholder, and the ids are its one value
    expect(query.text).toBe('SELECT e2e_cleanup($1::text[]) AS deleted')
    expect(query.values).toEqual([['e2e-user-1']])
    // And no part of the text holds the id
    expect(query.strings.join('')).not.toContain('e2e-user-1')
  })

  it('returns each count under its own key, in the order of CLEANUP_MODEL_KEYS', async () => {
    const res = fakeResponse()
    await e2eCleanupHandler(fakeRequest('e2e-user-1'), res as unknown as Response)

    // The fake gives the key at position i a count of i + 1
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      ok: true,
      deleted: Object.fromEntries(CLEANUP_MODEL_KEYS.map((key, index) => [key, index + 1])),
    })
    // Same order as the keys, whatever order the function's JSON had. jsonb
    // sorts its keys by length, so the database's order is not this one.
    const body = res.body as { deleted: Record<string, number> }
    expect(Object.keys(body.deleted)).toEqual([...CLEANUP_MODEL_KEYS])
    expect(CLEANUP_MODEL_KEYS).toHaveLength(22)
    expect(CLEANUP_MODEL_KEYS[21]).toBe('users')
    // The new key sits between the role rows and the locations, the same place
    // as its delete (households H7b, task M.1).
    expect(CLEANUP_MODEL_KEYS.indexOf('locationPreferences')).toBe(
      CLEANUP_MODEL_KEYS.indexOf('locationMembers') + 1,
    )
  })

  it('answers 500 and names the key when a count is missing', async () => {
    // Given a function answer with no `itemTags`
    const counts: Record<string, number> = Object.fromEntries(
      CLEANUP_MODEL_KEYS.map((key) => [key, 1]),
    )
    delete counts.itemTags
    shared.answer = counts

    const res = fakeResponse()
    await e2eCleanupHandler(fakeRequest('e2e-user-1'), res as unknown as Response)

    expect(res.statusCode).toBe(500)
    expect(JSON.stringify(res.body)).toContain('itemTags')
  })

  it('answers 500 and names the key when a count is not a whole number, or a key is unknown', async () => {
    const counts: Record<string, unknown> = Object.fromEntries(
      CLEANUP_MODEL_KEYS.map((key) => [key, 1]),
    )
    counts.carts = '1'
    shared.answer = counts
    const res = fakeResponse()
    await e2eCleanupHandler(fakeRequest('e2e-user-1'), res as unknown as Response)
    expect(res.statusCode).toBe(500)
    expect(JSON.stringify(res.body)).toContain('carts')

    vi.clearAllMocks()
    shared.answer = { ...Object.fromEntries(CLEANUP_MODEL_KEYS.map((key) => [key, 1])), widgets: 1 }
    const res2 = fakeResponse()
    await e2eCleanupHandler(fakeRequest('e2e-user-1'), res2 as unknown as Response)
    expect(res2.statusCode).toBe(500)
    expect(JSON.stringify(res2.body)).toContain('widgets')

    vi.clearAllMocks()
    shared.answer = null
    const res3 = fakeResponse()
    await e2eCleanupHandler(fakeRequest('e2e-user-1'), res3 as unknown as Response)
    expect(res3.statusCode).toBe(500)
  })

  it('forgets the user only after the query has resolved', async () => {
    // Given a query that is held open
    let finish: () => void = () => {}
    shared.queryGate = new Promise<void>((resolve) => {
      finish = resolve
    })
    const res = fakeResponse()
    const run = e2eCleanupHandler(fakeRequest('e2e-user-1'), res as unknown as Response)

    // While it is open, the memory is not touched
    await vi.waitFor(() => expect(prisma.$queryRaw).toHaveBeenCalledTimes(1))
    expect(forgetSeenToday).not.toHaveBeenCalled()

    // When it finishes
    finish()
    await run

    // Then the user is forgotten once, after the query
    expect(events).toEqual(['query', 'resolved', 'forget:e2e-user-1'])
    expect(forgetSeenToday).toHaveBeenCalledTimes(1)
  })

  it('forgets no one when the query fails, because nothing was deleted', async () => {
    shared.queryError = new Error('connection lost')

    await expect(
      e2eCleanupHandler(fakeRequest('e2e-user-1'), fakeResponse() as unknown as Response),
    ).rejects.toThrow('connection lost')
    expect(forgetSeenToday).not.toHaveBeenCalled()
  })
})

describe('installE2eCleanupFunction', () => {
  it('sends the function text once, as it is', async () => {
    await installE2eCleanupFunction()

    expect(vi.mocked(prisma.$executeRawUnsafe).mock.calls).toEqual([[E2E_CLEANUP_FUNCTION_SQL]])
  })
})

describe('errorCodeOf', () => {
  it('names the error class and its codes, never the message', () => {
    // A Prisma raw query error carries the Postgres code in `meta.code`, and
    // a message that can hold the database host.
    const err = Object.assign(new Error('could not reach db.example.host:5432'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2010',
      meta: { code: '42601', message: 'syntax error at db.example.host' },
    })

    const text = errorCodeOf(err)

    expect(text).toBe('PrismaClientKnownRequestError P2010 42601')
    expect(text).not.toContain('host')
  })

  it('works for a value that is not an Error', () => {
    expect(errorCodeOf('boom')).toBe('unknown error')
  })
})

describe('the SQL function text (E2E_CLEANUP_FUNCTION_SQL)', () => {
  it('creates or replaces e2e_cleanup(user_ids text[]) RETURNS jsonb, in PL/pgSQL', () => {
    expect(E2E_CLEANUP_FUNCTION_SQL).toContain(
      'CREATE OR REPLACE FUNCTION e2e_cleanup(user_ids text[]) RETURNS jsonb',
    )
    expect(E2E_CLEANUP_FUNCTION_SQL).toContain('LANGUAGE plpgsql')
  })

  it('deletes exactly the 22 models, in order, each once, each followed by its own count key', () => {
    const deletes = deletesWithKeys(E2E_CLEANUP_FUNCTION_SQL)

    // Every DELETE is in the shape the pattern reads, so none is missed
    const allDeletes = withoutComments(E2E_CLEANUP_FUNCTION_SQL).match(/DELETE FROM/g) ?? []
    expect(allDeletes).toHaveLength(22)
    expect(deletes).toHaveLength(22)

    // Children before parents, User last, and each count under its own key
    expect(deletes).toEqual(
      MODELS.map((model, index) => ({ table: tableOf(model), key: CLEANUP_MODEL_KEYS[index] })),
    )
  })

  it('reads the owned households by owner rows of the listed users only', () => {
    // A household a user only belongs to is never deleted: `owned` holds only
    // households where a listed user has the `owner` role.
    const sql = withoutComments(E2E_CLEANUP_FUNCTION_SQL).replace(/\s+/g, ' ')
    expect(sql).toContain(
      `SELECT COALESCE(array_agg(DISTINCT "householdId"), '{}'::text[]) INTO owned FROM "HouseholdMember" WHERE "userId" = ANY(user_ids) AND "role" = 'owner';`,
    )
    // And `owned` is written nowhere else
    expect(sql.match(/INTO owned/g)).toHaveLength(1)
    expect(sql.match(/owned :=/g)).toBeNull()
  })

  it('refuses an empty or missing list of users', () => {
    expect(withoutComments(E2E_CLEANUP_FUNCTION_SQL)).toContain(
      'IF user_ids IS NULL OR cardinality(user_ids) = 0 THEN',
    )
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
