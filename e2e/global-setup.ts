import { request } from '@playwright/test'
import { cleanupAllE2eUsers } from './helpers/cloudTeardown'
import { selectedProjects } from './helpers/selectedProjects'

/**
 * Runs once per Playwright invocation, before the first test (E2E speed plan,
 * task S.3, decision D8).
 *
 * When the `cloud` project is selected, it deletes every E2E user (every
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
  if (!selectedProjects().includes('cloud')) return

  const context = await request.newContext()
  try {
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
