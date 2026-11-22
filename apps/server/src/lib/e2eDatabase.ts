import type { Request, Response } from 'express'
import { e2eDatabaseKind, type E2eDatabaseKind } from './databaseUrl.js'
import { errorCodeOf } from './e2eCleanup.js'
import { prisma } from './prisma.js'

// `GET /e2e/database` (E2E speed plan, task S.6, decision D12). An E2E-only
// route: `index.ts` mounts it ONLY inside its `if (E2E_TEST_MODE)` block, and
// `src/webhookRouteOrder.test.ts` fails when it moves out.
//
// It tells the E2E run which database this server uses, so a run on the wrong
// or a stale database stops at the start (`e2e/global-setup.ts`, task S.8):
//
// | Field | What it is |
// |---|---|
// | `kind` | `local` or `neon`, from `E2E_DATABASE` (the same value `lib/prisma.ts` used to pick the URL) |
// | `migrations.applied` | the rows of `_prisma_migrations` that finished and were not rolled back |
// | `migrations.latest` | the largest `migration_name` among them (names start with a timestamp), or `null` |
//
// It NEVER answers a URL, a host, a user or a password. Only the three values
// above are written, and each is built here, not copied from a row as a whole.
// A database error answers 500 with the error's class and codes only
// (`errorCodeOf`): a Prisma message can hold the host.

export type E2eDatabaseInfo = {
  kind: E2eDatabaseKind
  migrations: { applied: number; latest: string | null }
}

type MigrationRow = { applied: unknown; latest: unknown }

/** Read the answer of `GET /e2e/database`. Throws on a database error. */
export async function readE2eDatabaseInfo(
  env: Record<string, string | undefined> = process.env,
): Promise<E2eDatabaseInfo> {
  const kind = e2eDatabaseKind(env)
  const rows = await prisma.$queryRaw<MigrationRow[]>`
    SELECT count(*)::int AS applied, max("migration_name") AS latest
    FROM "_prisma_migrations"
    WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`
  const row = rows[0]
  const applied = row?.applied
  const latest = row?.latest
  if (typeof applied !== 'number' || !Number.isInteger(applied) || applied < 0) {
    throw Object.assign(new Error('bad count'), { code: 'BAD_MIGRATION_COUNT' })
  }
  if (latest !== null && typeof latest !== 'string') {
    throw Object.assign(new Error('bad name'), { code: 'BAD_MIGRATION_NAME' })
  }
  return { kind, migrations: { applied, latest } }
}

export async function e2eDatabaseHandler(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await readE2eDatabaseInfo())
  } catch (err) {
    const code = errorCodeOf(err)
    console.error(`GET /e2e/database failed: ${code}`)
    res.status(500).json({ error: `could not read the E2E database: ${code}` })
  }
}
