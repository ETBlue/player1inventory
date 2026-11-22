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
//   writes its own count key in the same statement (no `GET DIAGNOSTICS`). The owner read asks for `owner` rows
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
  /** The `userIds` the fake `e2e_cleanup_all()` answers. */
  allUserIds: ['e2e-test-user', 'e2e-test-user-2-a'] as unknown,
  /** What the fake `e2e_cleanup_all()` answers as a whole. `undefined` means: counts + `allUserIds`. */
  allAnswer: undefined as unknown,
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
  const $queryRaw = vi.fn(async (query: { text?: string }) => {
    shared.events.push('query')
    if (shared.queryGate) await shared.queryGate
    if (shared.queryError) throw shared.queryError
    shared.events.push('resolved')
    const counts = Object.fromEntries(shared.keys.map((key, index) => [key, index + 1]))
    if (query.text?.includes('e2e_cleanup_all()')) {
      const result =
        shared.allAnswer === undefined
          ? { deleted: counts, userIds: shared.allUserIds }
          : shared.allAnswer
      return [{ result }]
    }
    const deleted = shared.answer === undefined ? counts : shared.answer
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
import {
  E2E_CLEANUP_ALL_FUNCTION_SQL,
  E2E_CLEANUP_FUNCTION_SQL,
  E2E_CLEANUP_INSTALL_SQL,
  E2E_CLEANUP_ROWS_SQL,
} from './e2eCleanupSql.js'

function fakeRequest(userId?: string, body?: unknown): Request {
  return {
    headers: userId === undefined ? {} : { 'x-e2e-user-id': userId },
    body,
  } as unknown as Request
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
 * Every delete statement, in the one shape the function uses, with the count
 * key it writes IN THE SAME STATEMENT:
 * `WITH d AS (DELETE FROM "<table>" WHERE … RETURNING 1)
 *  SELECT result || jsonb_build_object('<key>', count(*)) INTO result FROM d;`
 * A delete written in another shape is not matched, and the test that counts
 * every `DELETE FROM` then fails, so a statement cannot hide from this list.
 */
function deletesWithKeys(sql: string): { table: string; key: string }[] {
  const pattern =
    /WITH d AS \(\s*DELETE FROM "(\w+)"\s+WHERE\s[^;]*?\s+RETURNING 1\s*\)\s*SELECT result \|\| jsonb_build_object\('(\w+)', count\(\*\)\) INTO result FROM d;/g
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
  shared.allUserIds = ['e2e-test-user', 'e2e-test-user-2-a']
  shared.allAnswer = undefined
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

describe('the userIds form (E2E speed plan, task S.4)', () => {
  it('sends several users as ONE bound array, and forgets each after the query', async () => {
    // When a spec cleans two users in one call
    const res = fakeResponse()
    await e2eCleanupHandler(
      fakeRequest(undefined, { userIds: ['e2e-a', 'e2e-b'] }),
      res as unknown as Response,
    )

    // Then the database sees one query, with both ids as its one value
    const query = sentQuery()
    expect(query.text).toBe('SELECT e2e_cleanup($1::text[]) AS deleted')
    expect(query.values).toEqual([['e2e-a', 'e2e-b']])
    expect(query.strings.join('')).not.toContain('e2e-a')
    expect(prisma.$transaction).not.toHaveBeenCalled()
    // And both users are forgotten, after the query
    expect(events).toEqual(['query', 'resolved', 'forget:e2e-a', 'forget:e2e-b'])
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      ok: true,
      deleted: Object.fromEntries(CLEANUP_MODEL_KEYS.map((key, index) => [key, index + 1])),
    })
  })

  it('sends a repeated id once', async () => {
    await e2eCleanupHandler(
      fakeRequest(undefined, { userIds: ['e2e-a', 'e2e-b', 'e2e-a'] }),
      fakeResponse() as unknown as Response,
    )
    expect(sentQuery().values).toEqual([['e2e-a', 'e2e-b']])
    expect(events).toEqual(['query', 'resolved', 'forget:e2e-a', 'forget:e2e-b'])
  })

  it('answers 400, and queries nothing, for a bad userIds body', async () => {
    const cases: [string | undefined, unknown][] = [
      // with the header too: which one is meant?
      ['e2e-a', { userIds: ['e2e-b'] }],
      // empty, not a list, not strings, an empty string
      [undefined, { userIds: [] }],
      [undefined, { userIds: 'e2e-a' }],
      [undefined, { userIds: ['e2e-a', 3] }],
      [undefined, { userIds: ['e2e-a', ''] }],
      // another key next to it
      [undefined, { userIds: ['e2e-a'], extra: true }],
    ]
    for (const [header, body] of cases) {
      const res = fakeResponse()
      await e2eCleanupHandler(fakeRequest(header, body), res as unknown as Response)
      expect(res.statusCode, JSON.stringify(body)).toBe(400)
    }
    expect(events).toEqual([])
  })
})

describe('the allE2eUsers form (E2E speed plan, task S.3)', () => {
  it('sends ONE query to e2e_cleanup_all(), with no bound value, and answers the counts and the ids', async () => {
    // When global-setup asks for every E2E user
    const res = fakeResponse()
    await e2eCleanupHandler(fakeRequest(undefined, { allE2eUsers: true }), res as unknown as Response)

    // Then the database sees one query, and each deleted user is forgotten after it
    expect(events).toEqual([
      'query',
      'resolved',
      'forget:e2e-test-user',
      'forget:e2e-test-user-2-a',
    ])
    const query = sentQuery()
    expect(query.text).toBe('SELECT e2e_cleanup_all() AS result')
    expect(query.values).toEqual([])
    expect(prisma.$transaction).not.toHaveBeenCalled()

    // And the answer carries the 22 counts, in order, and the ids
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      ok: true,
      deleted: Object.fromEntries(CLEANUP_MODEL_KEYS.map((key, index) => [key, index + 1])),
      userIds: ['e2e-test-user', 'e2e-test-user-2-a'],
    })
  })

  it('works when there is no E2E user left: no one to forget', async () => {
    shared.allUserIds = []
    const res = fakeResponse()
    await e2eCleanupHandler(fakeRequest(undefined, { allE2eUsers: true }), res as unknown as Response)

    expect(res.statusCode).toBe(200)
    expect(forgetSeenToday).not.toHaveBeenCalled()
  })

  it('answers 400, and queries nothing, for allE2eUsers with a header, with userIds, or not true', async () => {
    const cases: [string | undefined, unknown][] = [
      ['e2e-user-1', { allE2eUsers: true }],
      [undefined, { allE2eUsers: true, userIds: ['a'] }],
      [undefined, { allE2eUsers: 'true' }],
      [undefined, { allE2eUsers: false }],
    ]
    for (const [header, body] of cases) {
      const res = fakeResponse()
      await e2eCleanupHandler(fakeRequest(header, body), res as unknown as Response)
      expect(res.statusCode, JSON.stringify(body)).toBe(400)
    }
    expect(events).toEqual([])
  })

  it('answers 500 when the function gives no list of ids, or a bad count', async () => {
    shared.allAnswer = { deleted: {} }
    const res = fakeResponse()
    await e2eCleanupHandler(fakeRequest(undefined, { allE2eUsers: true }), res as unknown as Response)
    expect(res.statusCode).toBe(500)
    expect(JSON.stringify(res.body)).toContain('user ids')

    vi.clearAllMocks()
    shared.allAnswer = { deleted: { carts: 1 }, userIds: [] }
    const res2 = fakeResponse()
    await e2eCleanupHandler(fakeRequest(undefined, { allE2eUsers: true }), res2 as unknown as Response)
    expect(res2.statusCode).toBe(500)
    expect(JSON.stringify(res2.body)).toContain('inventoryLogs')
  })
})

describe('installE2eCleanupFunction', () => {
  it('sends the three function texts, one statement each, as they are', async () => {
    await installE2eCleanupFunction()

    // One call per statement: Postgres refuses several commands in one
    // prepared statement.
    expect(vi.mocked(prisma.$executeRawUnsafe).mock.calls).toEqual([
      [E2E_CLEANUP_ROWS_SQL],
      [E2E_CLEANUP_FUNCTION_SQL],
      [E2E_CLEANUP_ALL_FUNCTION_SQL],
    ])
    expect(E2E_CLEANUP_INSTALL_SQL).toEqual([
      E2E_CLEANUP_ROWS_SQL,
      E2E_CLEANUP_FUNCTION_SQL,
      E2E_CLEANUP_ALL_FUNCTION_SQL,
    ])
    for (const sql of E2E_CLEANUP_INSTALL_SQL) {
      expect(withoutComments(sql).match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1)
    }
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
  it('creates the three functions, in PL/pgSQL', () => {
    expect(E2E_CLEANUP_ROWS_SQL).toContain(
      'CREATE OR REPLACE FUNCTION e2e_cleanup_rows(user_ids text[], owned text[]) RETURNS jsonb',
    )
    expect(E2E_CLEANUP_FUNCTION_SQL).toContain(
      'CREATE OR REPLACE FUNCTION e2e_cleanup(user_ids text[]) RETURNS jsonb',
    )
    expect(E2E_CLEANUP_ALL_FUNCTION_SQL).toContain(
      'CREATE OR REPLACE FUNCTION e2e_cleanup_all() RETURNS jsonb',
    )
    for (const sql of E2E_CLEANUP_INSTALL_SQL) expect(sql).toContain('LANGUAGE plpgsql')
  })

  it('writes the 22 deletes once: the two entry functions delete nothing themselves', () => {
    // Each entry function chooses the users and the households, then calls
    // e2e_cleanup_rows. A DELETE in one of them would be a delete the other
    // does not make.
    expect(withoutComments(E2E_CLEANUP_FUNCTION_SQL)).not.toMatch(/\bDELETE\b/i)
    expect(withoutComments(E2E_CLEANUP_ALL_FUNCTION_SQL)).not.toMatch(/\bDELETE\b/i)
    expect(withoutComments(E2E_CLEANUP_FUNCTION_SQL)).toContain(
      'RETURN e2e_cleanup_rows(user_ids, owned);',
    )
    expect(withoutComments(E2E_CLEANUP_ALL_FUNCTION_SQL)).toContain(
      "'deleted', e2e_cleanup_rows(user_ids, owned)",
    )
  })

  it('deletes exactly the 22 models, in order, each once, each followed by its own count key', () => {
    const deletes = deletesWithKeys(E2E_CLEANUP_ROWS_SQL)

    // Every DELETE is in the shape the pattern reads, so none is missed
    const allDeletes = withoutComments(E2E_CLEANUP_ROWS_SQL).match(/DELETE FROM/g) ?? []
    expect(allDeletes).toHaveLength(22)
    expect(deletes).toHaveLength(22)

    // Children before parents, User last, and each count under its own key
    expect(deletes).toEqual(
      MODELS.map((model, index) => ({ table: tableOf(model), key: CLEANUP_MODEL_KEYS[index] })),
    )
  })

  it('takes each count from its own DELETE, never from GET DIAGNOSTICS', () => {
    // `GET DIAGNOSTICS c = ROW_COUNT` is a separate statement that reads the
    // count of the LAST statement that ran. With a DELETE removed and its
    // count line kept, the count silently repeated the delete before it, and
    // cleanup-endpoint.spec.ts stayed green (E2E speed plan, S.2 mutation 1).
    const sql = withoutComments(E2E_CLEANUP_ROWS_SQL)
    expect(withoutComments(E2E_CLEANUP_INSTALL_SQL.join('\n'))).not.toMatch(/GET\s+DIAGNOSTICS/i)
    expect(sql).not.toMatch(/ROW_COUNT/i)
    // `result` is written only by the 22 delete statements (and its start
    // value), so no count can be added apart from its delete.
    expect(sql.match(/INTO result\b/g)).toHaveLength(22)
    expect(sql.match(/result :=/g)).toBeNull()
  })

  it('reads the owned households: owned by a listed user, or with every member listed (D6)', () => {
    // A household a user only belongs to is never deleted while it has a
    // member outside the list. `owned` holds the households where a listed
    // user has the `owner` role, and (decision D6, owner answer P5-A) the
    // households whose members are ALL listed. The second half starts from a
    // listed user's member row, so a household with no member at all is
    // never taken here (only `e2e_cleanup_all` takes those).
    const sql = withoutComments(E2E_CLEANUP_FUNCTION_SQL).replace(/\s+/g, ' ')
    expect(sql).toContain(
      `SELECT COALESCE(array_agg(DISTINCT "id"), '{}'::text[]) INTO owned FROM ( SELECT "householdId" AS "id" FROM "HouseholdMember" WHERE "userId" = ANY(user_ids) AND "role" = 'owner' UNION SELECT m."householdId" FROM "HouseholdMember" m WHERE m."userId" = ANY(user_ids) AND NOT EXISTS ( SELECT 1 FROM "HouseholdMember" o WHERE o."householdId" = m."householdId" AND NOT (o."userId" = ANY(user_ids)) ) ) AS households;`,
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

  it('e2e_cleanup_all takes the users by the E2E prefix, and every E2E user id has it', () => {
    // The prefix is written in the SQL. A narrower one would leave some E2E
    // users behind; this reads the two base ids from e2e/constants.ts (every
    // other E2E id is built from E2E_SECOND_USER_ID) and checks each matches.
    const sql = withoutComments(E2E_CLEANUP_ALL_FUNCTION_SQL).replace(/\s+/g, ' ')
    const prefixes = [...sql.matchAll(/LIKE '([^']*)%'/g)].map((m) => m[1])
    // Two uses: the users, and "a member who is not an E2E user"
    expect(prefixes).toEqual(['e2e-', 'e2e-'])
    expect(sql).toContain(`FROM "User" WHERE "id" LIKE 'e2e-%';`)

    const here = dirname(fileURLToPath(import.meta.url))
    const constants = readFileSync(resolve(here, '../../../../e2e/constants.ts'), 'utf8')
    const ids = ['E2E_USER_ID', 'E2E_SECOND_USER_ID'].map(
      (name) => constants.match(new RegExp(`export const ${name} = '([^']+)'`))?.[1],
    )
    expect(ids).toEqual(['e2e-test-user', 'e2e-test-user-2'])
    for (const id of ids) {
      for (const prefix of prefixes) expect(id?.startsWith(prefix ?? '\u0000'), `${id} / ${prefix}`).toBe(true)
    }
  })

  it('e2e_cleanup_all takes the owned households, and every household with no non-E2E member', () => {
    const sql = withoutComments(E2E_CLEANUP_ALL_FUNCTION_SQL).replace(/\s+/g, ' ')
    expect(sql).toContain(
      `SELECT "householdId" AS "id" FROM "HouseholdMember" WHERE "userId" = ANY(user_ids) AND "role" = 'owner' UNION SELECT h."id" FROM "Household" h WHERE NOT EXISTS ( SELECT 1 FROM "HouseholdMember" m WHERE m."householdId" = h."id" AND m."userId" NOT LIKE 'e2e-%' )`,
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
