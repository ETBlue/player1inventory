import { describe, expect, it } from 'vitest'
import { resolveDatasourceUrl } from './prisma.js'

// resolveDatasourceUrl is a pure function — it reads an env object passed in, not
// process.env — so these tests exercise the E2E_TEST_MODE / TEST_DATABASE_URL switch
// directly with plain objects. No PrismaClient, no .env file, no module mocking:
// constructing a real PrismaClient here would trigger Prisma's own generated-client
// env auto-load (which reads apps/server/.env directly, ignoring test-side env
// mutation) and could produce a false pass — see apps/server/CLAUDE.md / the task-2
// report for how that bit the first attempt at verifying this guard.

describe('resolveDatasourceUrl', () => {
  it('user runs the server outside E2E mode and gets the default datasource', () => {
    // Given E2E_TEST_MODE is unset (the normal, non-E2E server process)
    const env = {} as NodeJS.ProcessEnv

    // When resolving the datasource URL
    const url = resolveDatasourceUrl(env)

    // Then no override is returned — the client falls through to schema.prisma's
    // env("DATABASE_URL")
    expect(url).toBeUndefined()
  })

  it('user runs E2E with a test database configured and gets that database', () => {
    // Given E2E_TEST_MODE=true and a TEST_DATABASE_URL is set
    const env = {
      E2E_TEST_MODE: 'true',
      TEST_DATABASE_URL: 'postgresql://test-host/test-db',
    } as NodeJS.ProcessEnv

    // When resolving the datasource URL
    const url = resolveDatasourceUrl(env)

    // Then the test database URL is returned
    expect(url).toBe('postgresql://test-host/test-db')
  })

  it('user runs E2E without a test database configured and the server refuses to start', () => {
    // Given E2E_TEST_MODE=true but TEST_DATABASE_URL is unset
    const env = { E2E_TEST_MODE: 'true' } as NodeJS.ProcessEnv

    // When resolving the datasource URL
    // Then it throws rather than silently falling back to the dev database
    expect(() => resolveDatasourceUrl(env)).toThrow(
      'E2E_TEST_MODE=true but TEST_DATABASE_URL is unset. Refusing to run E2E ' +
        'against the dev database — see apps/server/.env.example.',
    )
  })
})
