// Tests for `scripts/e2eLocalDb.ts` (E2E speed plan, task S.7).
//
// Every URL in this file is MADE UP. No test runs Prisma or connects to a
// database: `main` gets a fake runner that only records what it was given.
import { describe, expect, it } from 'vitest'
import { type E2eDbCommand, main, migrateEnv, parseCommand, type Runner } from './e2eLocalDb.js'

const LOCAL = 'postgresql://u:p@localhost/fake_db'
const DEV = 'postgresql://u:p@example.invalid/db'
const DEV_DIRECT = 'postgresql://u:p@direct.example.invalid/db'
const REMOTE = 'postgresql://u:p@example.invalid/fake_db'

function messageOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('expected a throw')
}

/** A runner that records its calls and runs nothing. */
function recordingRunner(code = 0): { run: Runner; calls: { args: readonly string[]; env: Record<string, string | undefined> }[] } {
  const calls: { args: readonly string[]; env: Record<string, string | undefined> }[] = []
  return {
    calls,
    run: (args, env) => {
      calls.push({ args, env })
      return code
    },
  }
}

describe('parseCommand', () => {
  it.each(['migrate', 'status'] as const)('accepts %s', (command) => {
    expect(parseCommand([command])).toBe(command)
  })

  it.each([[[]], [['deploy']], [['reset']], [['migrate', 'extra']]])(
    'refuses %j with the usage',
    (args) => {
      expect(messageOf(() => parseCommand(args))).toMatch(/^Usage: /)
    },
  )
})

describe('migrateEnv', () => {
  it('sets BOTH DATABASE_URL and DIRECT_URL to the local URL', () => {
    // Given a .env whose DATABASE_URL and DIRECT_URL name the dev database
    const fileEnv = { DATABASE_URL: DEV, DIRECT_URL: DEV_DIRECT, E2E_LOCAL_DATABASE_URL: LOCAL }

    // When the child environment is built
    const env = migrateEnv({}, fileEnv)

    // Then Prisma gets the local URL in both: migrate deploy uses DIRECT_URL
    expect(env.DATABASE_URL).toBe(LOCAL)
    expect(env.DIRECT_URL).toBe(LOCAL)
  })

  it('overrides a DATABASE_URL and DIRECT_URL set in the shell too', () => {
    const env = migrateEnv(
      { DATABASE_URL: DEV, DIRECT_URL: DEV_DIRECT, E2E_LOCAL_DATABASE_URL: LOCAL },
      {},
    )
    expect(env.DATABASE_URL).toBe(LOCAL)
    expect(env.DIRECT_URL).toBe(LOCAL)
  })

  it('keeps the other variables', () => {
    const env = migrateEnv({ PATH: '/bin' }, { E2E_LOCAL_DATABASE_URL: LOCAL, OTHER: 'x' })
    expect(env.PATH).toBe('/bin')
    expect(env.OTHER).toBe('x')
  })

  it('lets a shell value win over .env, like dotenv', () => {
    const other = 'postgresql://u:p@localhost/fake_db_2'
    const env = migrateEnv({ E2E_LOCAL_DATABASE_URL: other }, { E2E_LOCAL_DATABASE_URL: LOCAL })
    expect(env.DATABASE_URL).toBe(other)
  })

  it.each([
    ['unset everywhere', {}, {}],
    ['empty in .env', {}, { E2E_LOCAL_DATABASE_URL: '' }],
    ['empty in the shell, set in .env', { E2E_LOCAL_DATABASE_URL: '' }, { E2E_LOCAL_DATABASE_URL: LOCAL }],
  ])('refuses when E2E_LOCAL_DATABASE_URL is %s', (_name, shellEnv, fileEnv) => {
    expect(messageOf(() => migrateEnv(shellEnv, fileEnv))).toMatch(
      /^E2E_LOCAL_DATABASE_URL is unset\./,
    )
  })

  it('refuses a URL that is not on this computer, and prints no host', () => {
    const message = messageOf(() => migrateEnv({}, { E2E_LOCAL_DATABASE_URL: REMOTE }))
    expect(message).toMatch(/^E2E_LOCAL_DATABASE_URL must point at a database on this computer/)
    expect(message).not.toContain('example.invalid')
  })

  it('refuses the socket form with a user and no host: it is not a valid URL', () => {
    // `postgresql://u@/db?host=/tmp` is refused by Node's URL parser, so it
    // fails the loopback check. `postgresql:///db?host=/tmp` is accepted.
    expect(
      messageOf(() => migrateEnv({}, { E2E_LOCAL_DATABASE_URL: 'postgresql://u@/fake_db?host=/tmp' })),
    ).toMatch(/must point at a database on this computer/)
    expect(
      migrateEnv({}, { E2E_LOCAL_DATABASE_URL: 'postgresql:///fake_db?host=/tmp' }).DIRECT_URL,
    ).toBe('postgresql:///fake_db?host=/tmp')
  })

  it.each(['DATABASE_URL', 'DIRECT_URL', 'TEST_DATABASE_URL', 'TEST_DIRECT_URL', 'PROD_COPY_DIRECT_URL'])(
    'refuses a local URL that is the same database as %s in .env, and names it',
    (name) => {
      // Given a .env where another variable names the same local database
      // (other credentials, same host and database name)
      const fileEnv = {
        E2E_LOCAL_DATABASE_URL: LOCAL,
        [name]: 'postgresql://other:secret@localhost/fake_db?sslmode=disable',
      }

      // Then nothing is built, and the message names the variable only
      const message = messageOf(() => migrateEnv({}, fileEnv))
      expect(message).toBe(
        `E2E_LOCAL_DATABASE_URL is the same database as ${name}. Refusing to run ` +
          'E2E: the local E2E database must be a database of its own.',
      )
    },
  )

  it('refuses when the same database hides in .env behind a shell value', () => {
    // Given the shell sets DATABASE_URL to the remote dev database, but .env's
    // DATABASE_URL is the local URL (the local dev database)
    const shellEnv = { DATABASE_URL: DEV }
    const fileEnv = { DATABASE_URL: LOCAL, E2E_LOCAL_DATABASE_URL: LOCAL }

    // Then the .env value is still compared, and the run is refused
    expect(messageOf(() => migrateEnv(shellEnv, fileEnv))).toMatch(
      /is the same database as DATABASE_URL\./,
    )
  })

  it('refuses a same-database variable set only in the shell', () => {
    expect(
      messageOf(() =>
        migrateEnv(
          { TEST_DATABASE_URL: 'postgresql://x@localhost/fake_db' },
          { E2E_LOCAL_DATABASE_URL: LOCAL },
        ),
      ),
    ).toMatch(/is the same database as TEST_DATABASE_URL\./)
  })

  it('accepts a local URL when every other variable names another database', () => {
    const env = migrateEnv(
      {},
      {
        E2E_LOCAL_DATABASE_URL: LOCAL,
        DATABASE_URL: DEV,
        DIRECT_URL: DEV_DIRECT,
        TEST_DATABASE_URL: 'postgresql://u:p@test.example.invalid/test_db',
        OTHER_LOCAL_URL: 'postgresql://u:p@localhost/another_fake_db',
      },
    )
    expect(env.DIRECT_URL).toBe(LOCAL)
  })
})

describe('main', () => {
  it.each([
    ['migrate', ['exec', 'prisma', 'migrate', 'deploy']],
    ['status', ['exec', 'prisma', 'migrate', 'status']],
  ] as const)('%s runs pnpm %j with the local URL in both variables', (command, expected) => {
    const { run, calls } = recordingRunner()
    const code = main([command satisfies E2eDbCommand], {}, { DIRECT_URL: DEV_DIRECT, E2E_LOCAL_DATABASE_URL: LOCAL }, run)

    expect(code).toBe(0)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.args).toEqual(expected)
    expect(calls[0]?.env.DATABASE_URL).toBe(LOCAL)
    expect(calls[0]?.env.DIRECT_URL).toBe(LOCAL)
  })

  it('passes the exit code of Prisma on', () => {
    const { run } = recordingRunner(1)
    expect(main(['status'], {}, { E2E_LOCAL_DATABASE_URL: LOCAL }, run)).toBe(1)
  })

  it.each([
    ['a remote URL', { E2E_LOCAL_DATABASE_URL: REMOTE }],
    ['the dev database', { E2E_LOCAL_DATABASE_URL: LOCAL, DIRECT_URL: LOCAL }],
    ['no URL', {}],
  ])('runs nothing when refused: %s', (_name, fileEnv) => {
    const { run, calls } = recordingRunner()
    expect(() => main(['migrate'], {}, fileEnv, run)).toThrow()
    expect(calls).toHaveLength(0)
  })

  it('runs nothing for an unknown command', () => {
    const { run, calls } = recordingRunner()
    expect(() => main(['reset'], {}, { E2E_LOCAL_DATABASE_URL: LOCAL }, run)).toThrow(/^Usage: /)
    expect(calls).toHaveLength(0)
  })
})
