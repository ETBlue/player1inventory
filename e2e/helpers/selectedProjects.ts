// Which Playwright projects the command line asked for. Used by
// `e2e/playwright.config.ts` (which servers to start) and by
// `e2e/global-setup.ts` (whether to clean the cloud database). It moved here
// from the config in the E2E speed plan, task S.3, so both read one rule.

//
// `cloud-neon` (E2E speed plan, task S.8) runs cloud specs on the Neon TEST
// branch. Only one of `cloud` and `cloud-neon` exists in one invocation: the
// config builds `cloud-neon` when `E2E_DATABASE=neon`, else `cloud`
// (decision D11). Both need the same two servers.

export const PROJECT_NAMES = ['local', 'cloud', 'cloud-neon', 'pwa'] as const
export type ProjectName = (typeof PROJECT_NAMES)[number]

/** True when the selection includes a project that needs the API server. */
export function selectsCloud(projects: readonly ProjectName[]): boolean {
  return projects.includes('cloud') || projects.includes('cloud-neon')
}

/**
 * Which projects did the CLI ask for? Returns all of them when it cannot tell.
 *
 * WHY THIS EXISTS: Playwright starts EVERY `webServer` entry, whatever
 * `--project` says. There is no per-project `webServer`. Measured 2026-09-24 at
 * `c36e18a2`, running `pnpm test:e2e --project=local e2e/tests/onboarding.spec.ts`
 * (three local-mode tests that never leave IndexedDB) left all four ports
 * listening:
 *
 *   5174  cloud web app
 *   5175  local web app
 *   5176  pwa preview   <- and a full `pnpm --filter web build` ran first
 *   4001  API server
 *
 * So a filtered run paid the same startup cost as the full one. The gate in root
 * `CLAUDE.md` runs the three projects as three commands, which meant three
 * production builds per gate run. `webServer` below is built from this list so
 * each command starts only what it needs.
 *
 * FALLBACK RULE: when the selection cannot be read with confidence, return all
 * of them. A parsing mistake then costs a slow run, never a missing server. That
 * happens when no `--project` is passed, when `--ui` or `--debug` is passed (the
 * user picks projects inside the UI, after this config has already been read),
 * or when a `--project` value is not exactly one of `PROJECT_NAMES` — a glob
 * counts as unrecognised.
 */
export function selectedProjects(): ProjectName[] {
  return requestedProjects() ?? [...PROJECT_NAMES]
}

/**
 * The projects named on the command line, or `null` when the selection cannot
 * be read with confidence (the fallback cases above). The config uses it to
 * refuse `--project=cloud-neon` without `E2E_DATABASE=neon`, and
 * `--project=cloud` with it, with a message that names the fix.
 */
export function requestedProjects(
  argv: string[] = process.argv.slice(2),
): ProjectName[] | null {
  const selected = new Set<ProjectName>()

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    // The UI and debug runners let the user pick projects after startup.
    if (arg === '--debug' || arg.startsWith('--ui')) return null

    let values: string[] = []
    if (arg.startsWith('--project=')) {
      values = [arg.slice('--project='.length)]
    } else if (arg === '--project') {
      // Playwright's `--project` is variadic: `--project local cloud` is valid,
      // so consume every following argument up to the next flag.
      while (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        values.push(argv[++i])
      }
    } else {
      continue
    }

    for (const value of values) {
      if (!(PROJECT_NAMES as readonly string[]).includes(value)) return null
      selected.add(value as ProjectName)
    }
  }

  return selected.size > 0 ? [...selected] : null
}
