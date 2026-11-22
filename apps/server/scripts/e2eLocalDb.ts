// Migrates the LOCAL E2E database, or shows its migration status (E2E speed
// plan, task S.7). A person runs it, never a test:
//
//   pnpm --filter server e2e:db:migrate   # prisma migrate deploy
//   pnpm --filter server e2e:db:status    # prisma migrate status
//
// Run `e2e:db:migrate` after every new migration. Until you do, the `cloud`
// E2E run stops at the start (`globalSetup` compares the migrations, task S.8).
// See e2e/CLAUDE.md, *The local E2E database*.
//
// What it does, in this order:
//
// 1. reads `apps/server/.env` (a value already set in the shell wins, the same
//    rule as `dotenv/config` in the server);
// 2. refuses to go on unless `E2E_LOCAL_DATABASE_URL` is set and passes the
//    task S.6 checks (`assertLocalE2eDatabaseUrl` in `src/lib/databaseUrl.ts`):
//    a host on this computer, and not the same database as any other `*_URL`
//    variable. The identity check runs twice: against the merged environment,
//    and against `.env` alone, so a shell value cannot hide a `.env` variable
//    that names the same database;
// 3. runs `pnpm exec prisma migrate deploy` (or `status`) in `apps/server`
//    with BOTH `DATABASE_URL` and `DIRECT_URL` set to the local URL.
//
// Why both: `prisma/schema.prisma` reads `url = env("DATABASE_URL")` and
// `directUrl = env("DIRECT_URL")`, and Prisma Migrate uses `directUrl`. With
// only `DATABASE_URL` changed, the migration would go to the database
// `DIRECT_URL` names in `.env`: the DEV database. The schema reads no other
// variable (no `shadowDatabaseUrl`). The Prisma CLI loads `.env` by itself
// too, but it does not replace a variable that is already set, so the two
// values given here win (`verify-migration.ts` relies on the same rule).
//
// No message here prints a URL or a host.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse } from 'dotenv'
import { assertLocalE2eDatabaseUrl, E2E_LOCAL_URL_VAR_NAME } from '../src/lib/databaseUrl.js'

type Env = Record<string, string | undefined>

/** The Prisma arguments for each command of this script. */
export const PRISMA_ARGS = {
  migrate: ['migrate', 'deploy'],
  status: ['migrate', 'status'],
} as const

export type E2eDbCommand = keyof typeof PRISMA_ARGS

const USAGE =
  'Usage: tsx scripts/e2eLocalDb.ts migrate|status ' +
  '(or pnpm --filter server e2e:db:migrate / e2e:db:status)'

/** The command named by the first argument. Anything else throws the usage. */
export function parseCommand(args: readonly string[]): E2eDbCommand {
  const [first, ...rest] = args
  if (rest.length === 0 && (first === 'migrate' || first === 'status')) return first
  throw new Error(USAGE)
}

/**
 * The environment for the Prisma child process. Pure: it reads only its
 * arguments, so a test can call it with made-up values and no database.
 *
 * `shellEnv` is `process.env`; `fileEnv` is `apps/server/.env`, parsed. A
 * value in the shell wins, as with `dotenv/config`.
 *
 * Throws, before anything runs, when `E2E_LOCAL_DATABASE_URL` is unset or
 * empty, or fails a check of `assertLocalE2eDatabaseUrl`.
 */
export function migrateEnv(shellEnv: Env, fileEnv: Env): Env {
  const merged: Env = { ...fileEnv, ...shellEnv }
  const localUrl = merged[E2E_LOCAL_URL_VAR_NAME]
  if (!localUrl) {
    throw new Error(
      'E2E_LOCAL_DATABASE_URL is unset. Set it in apps/server/.env to the local ' +
        'E2E database (see apps/server/.env.example and e2e/CLAUDE.md, ' +
        '*The local E2E database*). Nothing was run.',
    )
  }
  assertLocalE2eDatabaseUrl(localUrl, merged)
  assertLocalE2eDatabaseUrl(localUrl, fileEnv)
  return { ...merged, DATABASE_URL: localUrl, DIRECT_URL: localUrl }
}

/** Runs `pnpm` with these arguments and this environment; returns the exit code. */
export type Runner = (args: readonly string[], env: Env) => number

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url))

/** `apps/server/.env`, parsed, or `{}` when there is no such file. */
function readServerEnvFile(): Env {
  const path = join(SERVER_DIR, '.env')
  return existsSync(path) ? parse(readFileSync(path)) : {}
}

const runPnpm: Runner = (args, env) => {
  const result = spawnSync('pnpm', [...args], { cwd: SERVER_DIR, env, stdio: 'inherit' })
  if (result.error) throw result.error
  return result.status ?? 1
}

/**
 * The whole script, with its inputs passed in. Every check runs before
 * `run` is called, so a refused URL never reaches Prisma.
 */
export function main(
  args: readonly string[],
  shellEnv: Env,
  fileEnv: Env,
  run: Runner,
): number {
  const command = parseCommand(args)
  const env = migrateEnv(shellEnv, fileEnv)
  const prismaArgs = PRISMA_ARGS[command]
  console.log(`Running prisma ${prismaArgs.join(' ')} on the local E2E database (E2E_LOCAL_DATABASE_URL).`)
  return run(['exec', 'prisma', ...prismaArgs], env)
}

// Run only when started as a script, not when a test imports this file.
const startedAsScript =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (startedAsScript) {
  try {
    process.exitCode = main(process.argv.slice(2), process.env, readServerEnvFile(), runPnpm)
  } catch (error) {
    // The messages above hold no URL. A Node error from spawnSync (ENOENT for
    // a missing pnpm) holds none either.
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
