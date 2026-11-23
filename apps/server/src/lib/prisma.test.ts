import { describe, expect, it } from 'vitest'
import { resolveDatasourceUrl } from './prisma.js'

// resolveDatasourceUrl is a pure function — it reads an env object passed in, not
// process.env — so these tests exercise the E2E switch directly with plain objects.
// No PrismaClient, no .env file, no module mocking: constructing a real PrismaClient
// here would trigger Prisma's own generated-client env auto-load (which reads
// apps/server/.env directly, ignoring test-side env mutation) and could produce a
// false pass.
//
// Every URL in this file is MADE UP (`*.invalid` hosts, `u:p` credentials). No real
// connection string belongs here.
//
// Since E2E speed plan task S.6, `E2E_DATABASE` picks one of two databases:
//
// | `E2E_DATABASE` | URL | Checks |
// |---|---|---|
// | `local`, or unset (owner answer P7-A) | `E2E_LOCAL_DATABASE_URL` | on this computer; not the same database as any other `*_URL` variable |
// | `neon` | `TEST_DATABASE_URL` | set (as before task S.6) |
// | anything else | — | throws |

const LOCAL = 'postgresql://u:p@localhost:5432/p1i_e2e'
const NEON = 'postgresql://u:p@example.invalid/test-db?sslmode=require'

/** No error message may hold a URL, a host or a password. */
function messageOf(fn: () => unknown): string {
  try {
    fn()
  } catch (err) {
    const message = (err as Error).message
    expect(message).not.toMatch(/:\/\//)
    expect(message).not.toMatch(/@/)
    // The help text may name `localhost` as an example; it must not name the
    // made-up hosts, databases, users or passwords of the fixtures.
    expect(message).not.toMatch(/example\.invalid|192\.0\.2|p1i_|u:p|secret|other:/)
    return message
  }
  throw new Error('expected a throw')
}

describe('resolveDatasourceUrl', () => {
  it('user runs the server outside E2E mode and gets the default datasource', () => {
    // Given E2E_TEST_MODE is unset (the normal, non-E2E server process)
    const env = { E2E_DATABASE: 'neon', TEST_DATABASE_URL: NEON } as NodeJS.ProcessEnv

    // When resolving the datasource URL
    const url = resolveDatasourceUrl(env)

    // Then no override is returned — the client falls through to schema.prisma's
    // env("DATABASE_URL")
    expect(url).toBeUndefined()
  })

  describe('E2E_DATABASE=neon', () => {
    it('user runs E2E on the Neon test branch and gets TEST_DATABASE_URL', () => {
      // Given E2E mode, the Neon switch, and both URLs set
      const env = {
        E2E_TEST_MODE: 'true',
        E2E_DATABASE: 'neon',
        TEST_DATABASE_URL: NEON,
        E2E_LOCAL_DATABASE_URL: LOCAL,
      } as NodeJS.ProcessEnv

      // When resolving the datasource URL
      // Then the Neon test URL is returned, not the local one
      expect(resolveDatasourceUrl(env)).toBe(NEON)
    })

    it('user runs E2E on Neon without TEST_DATABASE_URL and the server refuses to start', () => {
      // Given E2E mode and the Neon switch, but TEST_DATABASE_URL is unset
      const env = {
        E2E_TEST_MODE: 'true',
        E2E_DATABASE: 'neon',
        E2E_LOCAL_DATABASE_URL: LOCAL,
      } as NodeJS.ProcessEnv

      // When resolving the datasource URL
      // Then it throws rather than falling back to the local or the dev database
      expect(messageOf(() => resolveDatasourceUrl(env))).toBe(
        'E2E_TEST_MODE=true but TEST_DATABASE_URL is unset. Refusing to run E2E ' +
          'against the dev database — see apps/server/.env.example.',
      )
    })
  })

  describe('E2E_DATABASE=local', () => {
    it('user runs E2E on the local database and gets E2E_LOCAL_DATABASE_URL', () => {
      // Given E2E mode, the local switch, and both URLs set
      const env = {
        E2E_TEST_MODE: 'true',
        E2E_DATABASE: 'local',
        E2E_LOCAL_DATABASE_URL: LOCAL,
        TEST_DATABASE_URL: NEON,
      } as NodeJS.ProcessEnv

      // Then the local URL is returned
      expect(resolveDatasourceUrl(env)).toBe(LOCAL)
    })

    it('user runs E2E with no E2E_DATABASE and gets the local database (owner answer P7-A)', () => {
      const env = {
        E2E_TEST_MODE: 'true',
        E2E_LOCAL_DATABASE_URL: LOCAL,
        TEST_DATABASE_URL: NEON,
      } as NodeJS.ProcessEnv
      expect(resolveDatasourceUrl(env)).toBe(LOCAL)
    })

    it('treats an empty E2E_DATABASE as unset', () => {
      const env = {
        E2E_TEST_MODE: 'true',
        E2E_DATABASE: '',
        E2E_LOCAL_DATABASE_URL: LOCAL,
      } as NodeJS.ProcessEnv
      expect(resolveDatasourceUrl(env)).toBe(LOCAL)
    })

    it.each([
      ['127.0.0.1', 'postgresql://u:p@127.0.0.1:5432/p1i_e2e'],
      ['::1', 'postgresql://u:p@[::1]:5432/p1i_e2e'],
      ['LOCALHOST in capitals', 'postgresql://u:p@LOCALHOST/p1i_e2e'],
      ['the postgres: scheme', 'postgres://u:p@localhost/p1i_e2e'],
      ['the default socket (no host)', 'postgresql:///p1i_e2e'],
      ['a socket path in ?host=, no host', 'postgresql:///p1i_e2e?host=/tmp'],
      ['a socket path in ?host=, with localhost', 'postgresql://u@localhost/p1i_e2e?host=/tmp'],
      ['an encoded socket path as the host', 'postgresql://u@%2Ftmp/p1i_e2e'],
    ])('accepts a local URL: %s', (_name, url) => {
      const env = { E2E_TEST_MODE: 'true', E2E_LOCAL_DATABASE_URL: url } as NodeJS.ProcessEnv
      expect(resolveDatasourceUrl(env)).toBe(url)
    })

    it('user runs E2E on the local database without E2E_LOCAL_DATABASE_URL and the server refuses to start', () => {
      // Given the local switch, with TEST_DATABASE_URL set but no local URL
      const env = {
        E2E_TEST_MODE: 'true',
        E2E_DATABASE: 'local',
        TEST_DATABASE_URL: NEON,
      } as NodeJS.ProcessEnv

      // Then it throws, names the variable, and does NOT fall back to Neon
      expect(messageOf(() => resolveDatasourceUrl(env))).toMatch(
        /^E2E_DATABASE=local but E2E_LOCAL_DATABASE_URL is unset\./,
      )
    })

    it.each([
      ['a remote host', 'postgresql://u:p@db.example.invalid/p1i_e2e'],
      ['a host that only starts with localhost', 'postgresql://u:p@localhost.example.invalid/p1i_e2e'],
      ['two hosts', 'postgresql://u:p@localhost,db.example.invalid/p1i_e2e'],
      ['a remote host in ?host=', 'postgresql://u:p@localhost/p1i_e2e?host=db.example.invalid'],
      ['a remote address in ?hostaddr=', 'postgresql://u:p@localhost/p1i_e2e?hostaddr=192.0.2.1'],
      ['another scheme', 'mysql://u:p@localhost/p1i_e2e'],
      ['not a URL', 'not a url at all'],
    ])('refuses a URL that is not on this computer: %s', (_name, url) => {
      // Given a local URL that points somewhere else (a Neon URL pasted in the
      // wrong variable, for example)
      const env = { E2E_TEST_MODE: 'true', E2E_LOCAL_DATABASE_URL: url } as NodeJS.ProcessEnv

      // Then it throws, names the variable, and prints no host
      expect(messageOf(() => resolveDatasourceUrl(env))).toMatch(
        /^E2E_LOCAL_DATABASE_URL must point at a database on this computer/,
      )
    })

    // The local URL must not be a database another variable names. Every
    // variable whose name ends in `_URL` is compared, the TEST_ ones included
    // (unlike verify-migration.ts's guard, which skips them because they are
    // its target).
    it.each([
      'DATABASE_URL',
      'DIRECT_URL',
      'TEST_DATABASE_URL',
      'TEST_DIRECT_URL',
      'PROD_COPY_DATABASE_URL',
      'PROD_COPY_DIRECT_URL',
      'SOMEONES_SCRATCH_DB_URL',
    ])('refuses a local URL that is the same database as %s, and names it', (name) => {
      // Given another variable that names the same local database (with
      // other credentials and options, which do not change the database)
      const env = {
        E2E_TEST_MODE: 'true',
        E2E_LOCAL_DATABASE_URL: LOCAL,
        [name]: 'postgresql://other:secret@localhost:5432/p1i_e2e?sslmode=disable',
      } as NodeJS.ProcessEnv

      // Then it throws and names that variable
      const message = messageOf(() => resolveDatasourceUrl(env))
      expect(message).toMatch(/^E2E_LOCAL_DATABASE_URL is the same database as /)
      expect(message).toContain(` as ${name}.`)
    })

    it('accepts a local URL when every other variable names another database', () => {
      const env = {
        E2E_TEST_MODE: 'true',
        E2E_LOCAL_DATABASE_URL: LOCAL,
        DATABASE_URL: 'postgresql://u:p@dev.example.invalid/dev',
        DIRECT_URL: 'postgresql://u:p@dev-direct.example.invalid/dev',
        TEST_DATABASE_URL: NEON,
        TEST_DIRECT_URL: 'postgresql://u:p@direct.example.invalid/test-db',
        PROD_COPY_DATABASE_URL: 'postgresql://u:p@copy.example.invalid/copy',
        // the same local server, another database: allowed
        OTHER_LOCAL_URL: 'postgresql://u:p@localhost:5432/p1i_dev',
      } as NodeJS.ProcessEnv
      expect(resolveDatasourceUrl(env)).toBe(LOCAL)
    })
  })

  it.each(['Neon', 'LOCAL', 'test', 'postgresql://u:p@example.invalid/db'])(
    'refuses E2E_DATABASE=%s, without repeating the value',
    (value) => {
      const env = {
        E2E_TEST_MODE: 'true',
        E2E_DATABASE: value,
        E2E_LOCAL_DATABASE_URL: LOCAL,
        TEST_DATABASE_URL: NEON,
      } as NodeJS.ProcessEnv
      const message = messageOf(() => resolveDatasourceUrl(env))
      expect(message).toBe(
        'E2E_DATABASE must be "local" or "neon" (or unset, which means "local").',
      )
      expect(message).not.toContain(value)
    },
  )
})
