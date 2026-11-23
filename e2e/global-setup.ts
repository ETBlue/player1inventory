import { type APIRequestContext, request } from '@playwright/test'
import { CLOUD_SERVER_URL } from './constants'
import { cleanupAllE2eUsers } from './helpers/cloudTeardown'
import {
  type E2eDatabaseKind,
  e2eDatabaseKind,
  migrationFolders,
} from './helpers/e2eDatabase'
import { selectedProjects, selectsCloud } from './helpers/selectedProjects'

/**
 * Runs once per Playwright invocation, before the first test (E2E speed plan,
 * tasks S.3 and S.8, decisions D8 and D12). It does nothing unless a cloud
 * project (`cloud` or `cloud-neon`) is selected. Then, in this order:
 *
 * 1. `GET /e2e/database` (task S.8). It stops the run when the server uses
 *    another database than `E2E_DATABASE` asks for, or when that database is
 *    behind the migrations of this branch (`apps/server/prisma/migrations`).
 *    Without this check a stale local database shows up later as random
 *    failed tests. The message names the fix.
 * 2. The cleanup below (task S.3).
 *
 * The cleanup deletes every E2E user (every
 * `User` id that starts with `e2e-`) and every household with no member
 * outside them, in ONE request to `DELETE /e2e/cleanup` with
 * `{ "allE2eUsers": true }`. That removes what a killed run left behind,
 * also for the users of specs this run does not reach. Each spec's own
 * `beforeEach` still cleans the users it uses; this is the only place that
 * cleans the others.
 *
 * WHY THE API SERVER IS ALREADY UP. Playwright 1.58 starts each `webServer`
 * entry as a plugin, and runs the plugin setup (start the process, then wait
 * for its `url`) BEFORE `globalSetup`. Read in the source of
 * playwright@1.58.2: `createGlobalSetupTasks` in `lib/runner/tasks.js` lists
 * `createPluginSetupTasks(config)` before the `globalSetups`, the tasks run
 * one after another, and `WebServerPlugin.setup` in
 * `lib/plugins/webServerPlugin.js` awaits `_startProcess()` and then
 * `_waitForProcess()`. `testRunner.js` adds the `webServer` entries to
 * `config.plugins`. So no setup project is needed.
 *
 * It throws on any error, so a broken cleanup stops the run before the first
 * test, not inside some later test.
 */
export default async function globalSetup(): Promise<void> {
  if (!selectsCloud(selectedProjects())) return

  const context = await request.newContext()
  try {
    await checkE2eDatabase(context, e2eDatabaseKind())
    const { deleted, userIds } = await cleanupAllE2eUsers(context)
    const nonZero = Object.entries(deleted)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `${key} ${count}`)
    console.log(
      `global-setup: /e2e/cleanup allE2eUsers deleted ${userIds.length} E2E users` +
        (nonZero.length > 0 ? ` (${nonZero.join(', ')})` : ' (nothing else)'),
    )
  } finally {
    await context.dispose()
  }
}

const NAME: Record<E2eDatabaseKind, string> = {
  local: 'the local E2E database',
  neon: 'the Neon test branch',
}

const MIGRATE_FIX: Record<E2eDatabaseKind, string> = {
  local:
    'run `pnpm --filter server e2e:db:migrate` (e2e/CLAUDE.md, The local E2E database)',
  neon: 'apply the new migrations to the Neon test branch the way the deploy runbook says',
}

type DatabaseAnswer = {
  kind?: unknown
  migrations?: { applied?: unknown; latest?: unknown }
}

/**
 * Throw unless the API server uses the expected database, and that database
 * has every migration folder of this branch applied.
 *
 * "Applied" counts the finished, not rolled back rows of `_prisma_migrations`
 * (apps/server/src/lib/e2eDatabase.ts). The run stops when there are FEWER
 * than the folders, or when the newest applied name sorts before the newest
 * folder (names start with a timestamp). More rows than folders is allowed:
 * the Neon test branch is shared, and another branch may have applied a newer
 * migration there.
 */
export async function checkE2eDatabase(
  context: APIRequestContext,
  expected: E2eDatabaseKind,
): Promise<void> {
  const url = `${CLOUD_SERVER_URL}/e2e/database`
  const response = await context.get(url)
  if (!response.ok()) {
    throw new Error(
      `global-setup: GET ${url} returned ${response.status()} ${response.statusText()} — ${await response.text()}`,
    )
  }
  const body = (await response.json()) as DatabaseAnswer
  const kind = body.kind
  const applied = body.migrations?.applied
  const latest = body.migrations?.latest
  if (kind !== 'local' && kind !== 'neon') {
    throw new Error(`global-setup: GET ${url} returned no database kind.`)
  }
  if (kind !== expected) {
    throw new Error(
      `global-setup: this run expected ${NAME[expected]} but the server uses ${NAME[kind]}. ` +
        'Check E2E_DATABASE in the shell and in the API server command (e2e/playwright.config.ts).',
    )
  }
  if (
    typeof applied !== 'number' ||
    (latest !== null && typeof latest !== 'string')
  ) {
    throw new Error(`global-setup: GET ${url} returned no migration count.`)
  }
  const folders = migrationFolders()
  const newest = folders[folders.length - 1] ?? null
  const behind =
    applied < folders.length ||
    (newest !== null && (latest === null || latest < newest))
  if (behind) {
    throw new Error(
      `global-setup: ${NAME[kind]} is behind: ${applied} migrations applied, ` +
        `${folders.length} migration folders in apps/server/prisma/migrations. ` +
        `To fix it, ${MIGRATE_FIX[kind]}.`,
    )
  }
  console.log(
    `global-setup: ${NAME[kind]}, ${applied} migrations applied (${folders.length} folders).`,
  )
}
