import type { Request, Response } from 'express'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// `GET /e2e/database` (lib/e2eDatabase.ts, E2E speed plan task S.6), called
// directly with a fake request and response. The query is faked: these tests
// do not run SQL. What they pin:
// - the answer is `{ kind, migrations: { applied, latest } }` and nothing else;
// - `kind` follows `E2E_DATABASE`, with `local` when it is unset (P7-A);
// - no field holds a URL, a host or a password, even when the environment
//   and the database error are full of them;
// - a database error is a 500 that names the error's codes only.
//
// Every URL here is made up.

const shared = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as Error | null,
  sql: [] as string[],
}))

vi.mock('./prisma.js', () => ({
  prisma: {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      shared.sql.push(strings.join('?'))
      if (values.length > 0) throw new Error('this query takes no values')
      if (shared.error) throw shared.error
      return shared.rows
    },
  },
}))

const { e2eDatabaseHandler } = await import('./e2eDatabase.js')

const SECRET_ENV = {
  E2E_LOCAL_DATABASE_URL: 'postgresql://u:p@localhost:5432/p1i_e2e',
  TEST_DATABASE_URL: 'postgresql://u:p@db.example.invalid/test-db?sslmode=require',
  DATABASE_URL: 'postgresql://u:p@dev.example.invalid/dev',
}

type Answer = { status: number; body: unknown }

async function call(): Promise<Answer> {
  const answer: Answer = { status: 200, body: undefined }
  const res = {
    status(code: number) {
      answer.status = code
      return this
    },
    json(body: unknown) {
      answer.body = body
      return this
    },
  } as unknown as Response
  await e2eDatabaseHandler({} as Request, res)
  return answer
}

/** The answer as JSON text holds no URL, user, password or host. */
function expectNoSecrets(body: unknown): void {
  const text = JSON.stringify(body)
  expect(text).not.toContain('://')
  expect(text).not.toContain('@')
  expect(text).not.toMatch(/example\.invalid|localhost|p1i_e2e|u:p/)
}

const savedEnv = { ...process.env }

afterAll(() => {
  process.env = savedEnv
})

beforeEach(() => {
  shared.rows = [{ applied: 22, latest: '20261122000000_add_location_preferences' }]
  shared.error = null
  shared.sql = []
  process.env = { ...savedEnv, ...SECRET_ENV, E2E_TEST_MODE: 'true' }
  delete process.env.E2E_DATABASE
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /e2e/database', () => {
  it('answers the kind and the applied migrations, and nothing else', async () => {
    // Given the local database, with 22 migrations applied
    process.env.E2E_DATABASE = 'local'

    // When the route is called
    const answer = await call()

    // Then it answers exactly the three values
    expect(answer).toEqual({
      status: 200,
      body: {
        kind: 'local',
        migrations: { applied: 22, latest: '20261122000000_add_location_preferences' },
      },
    })
    expectNoSecrets(answer.body)
  })

  it('answers neon when E2E_DATABASE=neon', async () => {
    process.env.E2E_DATABASE = 'neon'
    const answer = await call()
    expect(answer.body).toMatchObject({ kind: 'neon' })
    expectNoSecrets(answer.body)
  })

  it('answers local when E2E_DATABASE is unset (owner answer P7-A)', async () => {
    const answer = await call()
    expect(answer.body).toMatchObject({ kind: 'local' })
  })

  it('counts only finished migrations that were not rolled back', async () => {
    await call()
    expect(shared.sql).toHaveLength(1)
    const sql = shared.sql[0] ?? ''
    expect(sql).toContain('FROM "_prisma_migrations"')
    expect(sql).toContain('"finished_at" IS NOT NULL')
    expect(sql).toContain('"rolled_back_at" IS NULL')
    expect(sql).toContain('max("migration_name")')
  })

  it('answers latest: null on a database with no migration', async () => {
    shared.rows = [{ applied: 0, latest: null }]
    const answer = await call()
    expect(answer.body).toEqual({ kind: 'local', migrations: { applied: 0, latest: null } })
  })

  it('does not copy other columns of the row into the answer', async () => {
    // Given a row that carries more than the two columns asked for
    shared.rows = [
      { applied: 3, latest: '20261001000000_x', url: SECRET_ENV.TEST_DATABASE_URL },
    ]
    const answer = await call()
    expect(answer.body).toEqual({
      kind: 'local',
      migrations: { applied: 3, latest: '20261001000000_x' },
    })
    expectNoSecrets(answer.body)
  })

  it.each([
    ['a count that is not a number', [{ applied: '22', latest: null }], 'BAD_MIGRATION_COUNT'],
    ['no row', [], 'BAD_MIGRATION_COUNT'],
    ['a name that is not text', [{ applied: 1, latest: 5 }], 'BAD_MIGRATION_NAME'],
  ])('answers 500 for %s', async (_name, rows, code) => {
    shared.rows = rows
    const answer = await call()
    expect(answer.status).toBe(500)
    expect(answer.body).toEqual({ error: `could not read the E2E database: Error ${code}` })
  })

  it('answers 500 with the error codes only, never the message, on a database error', async () => {
    // Given a Prisma-like error whose message holds a URL and a host
    shared.error = Object.assign(
      new Error(`Can't reach database server at ${SECRET_ENV.TEST_DATABASE_URL}`),
      { name: 'PrismaClientKnownRequestError', code: 'P1001' },
    )

    // When the route is called
    const answer = await call()

    // Then the answer and the log name the codes and nothing else
    expect(answer).toEqual({
      status: 500,
      body: { error: 'could not read the E2E database: PrismaClientKnownRequestError P1001' },
    })
    expectNoSecrets(answer.body)
    const logged = vi.mocked(console.error).mock.calls.flat().join(' ')
    expect(logged).toBe('GET /e2e/database failed: PrismaClientKnownRequestError P1001')
  })

  it('answers 500 without repeating a bad E2E_DATABASE value', async () => {
    process.env.E2E_DATABASE = SECRET_ENV.TEST_DATABASE_URL
    const answer = await call()
    expect(answer.status).toBe(500)
    expectNoSecrets(answer.body)
  })
})
