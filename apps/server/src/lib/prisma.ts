import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// E2E runs against a throwaway database, never dev.
//
// Isolation by row ownership under a single E2E_USER_ID is not sufficient for
// the multi-user fixtures cloud locations needs: /e2e/cleanup deletes only that
// one user's rows, so a second synthetic user would persist in dev forever.
//
// This switch lives here rather than in e2e/playwright.config.ts because
// TEST_DATABASE_URL comes from apps/server/.env, which dotenv loads inside THIS
// process — Playwright's shell has never seen it and would expand it to "".
//
// Pure function (reads its argument, not process.env) so it is testable without
// constructing a PrismaClient — see prisma.test.ts. Constructing a real PrismaClient
// in a test would trigger Prisma's own generated-client env auto-load, which reads
// apps/server/.env directly and would silently defeat any test-side env mutation.
export function resolveDatasourceUrl(env: NodeJS.ProcessEnv): string | undefined {
  if (env.E2E_TEST_MODE !== 'true') return undefined
  const testUrl = env.TEST_DATABASE_URL
  if (!testUrl) {
    throw new Error(
      'E2E_TEST_MODE=true but TEST_DATABASE_URL is unset. Refusing to run E2E ' +
        'against the dev database — see apps/server/.env.example.',
    )
  }
  return testUrl
}

function createClient(): PrismaClient {
  const url = resolveDatasourceUrl(process.env)
  return url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient()
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
