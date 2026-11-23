import { PrismaClient } from '@prisma/client'
import { assertLocalE2eDatabaseUrl, e2eDatabaseKind } from './databaseUrl.js'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// E2E runs against a throwaway database, never dev.
//
// Isolation by row ownership under a single E2E_USER_ID is not sufficient for
// the multi-user fixtures cloud locations needs: /e2e/cleanup deletes only that
// one user's rows, so a second synthetic user would persist in dev forever.
//
// This switch lives here rather than in e2e/playwright.config.ts because the
// URLs come from apps/server/.env, which dotenv loads inside THIS process —
// Playwright's shell has never seen them and would expand them to "".
//
// Since E2E speed plan task S.6 there are two E2E databases, picked by
// `E2E_DATABASE` (decision D9; `e2eDatabaseKind` in lib/databaseUrl.ts):
//
// | `E2E_DATABASE` | URL | Refused when |
// |---|---|---|
// | `local`, or unset (owner answer P7-A) | `E2E_LOCAL_DATABASE_URL` | unset; a host that is not this computer; the same database as any other `*_URL` variable (decision D10) |
// | `neon` | `TEST_DATABASE_URL` | unset (as before task S.6) |
// | anything else | — | always |
//
// No branch falls back to the other database. No message prints a URL, a host
// or a password, and the bad `E2E_DATABASE` value is not repeated either (it
// may be a URL pasted into the wrong variable).
//
// Pure function (reads its argument, not process.env) so it is testable without
// constructing a PrismaClient — see prisma.test.ts. Constructing a real PrismaClient
// in a test would trigger Prisma's own generated-client env auto-load, which reads
// apps/server/.env directly and would silently defeat any test-side env mutation.
export function resolveDatasourceUrl(env: NodeJS.ProcessEnv): string | undefined {
  if (env.E2E_TEST_MODE !== 'true') return undefined
  if (e2eDatabaseKind(env) === 'neon') {
    const testUrl = env.TEST_DATABASE_URL
    if (!testUrl) {
      throw new Error(
        'E2E_TEST_MODE=true but TEST_DATABASE_URL is unset. Refusing to run E2E ' +
          'against the dev database — see apps/server/.env.example.',
      )
    }
    return testUrl
  }
  const localUrl = env.E2E_LOCAL_DATABASE_URL
  if (!localUrl) {
    throw new Error(
      'E2E_DATABASE=local but E2E_LOCAL_DATABASE_URL is unset. Set it in ' +
        'apps/server/.env to the local E2E database, or run with E2E_DATABASE=neon ' +
        'to use the Neon test branch — see apps/server/.env.example.',
    )
  }
  // The loopback and identity checks, shared with scripts/e2eLocalDb.ts.
  assertLocalE2eDatabaseUrl(localUrl, env)
  return localUrl
}

function createClient(): PrismaClient {
  const url = resolveDatasourceUrl(process.env)
  return url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient()
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
