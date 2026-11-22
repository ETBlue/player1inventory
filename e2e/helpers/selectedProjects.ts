// Which Playwright projects the command line asked for. Used by
// `e2e/playwright.config.ts` (which servers to start) and by
// `e2e/global-setup.ts` (whether to clean the cloud database). It moved here
// from the config in the E2E speed plan, task S.3, so both read one rule.

export const PROJECT_NAMES = ['local', 'cloud', 'pwa'] as const
export type ProjectName = (typeof PROJECT_NAMES)[number]

/**
 * Which projects did the CLI ask for? Returns all three when it cannot tell.
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
 * three. A parsing mistake then costs a slow run, never a missing server. That
 * happens when no `--project` is passed, when `--ui` or `--debug` is passed (the
 * user picks projects inside the UI, after this config has already been read),
 * or when a `--project` value is not exactly `local`, `cloud` or `pwa` — a glob
 * counts as unrecognised.
 */
export function selectedProjects(): ProjectName[] {
  const argv: string[] = process.argv.slice(2)
  const selected = new Set<ProjectName>()

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    // The UI and debug runners let the user pick projects after startup.
    if (arg === '--debug' || arg.startsWith('--ui')) return [...PROJECT_NAMES]

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
      if (!(PROJECT_NAMES as readonly string[]).includes(value))
        return [...PROJECT_NAMES]
      selected.add(value as ProjectName)
    }
  }

  return selected.size > 0 ? [...selected] : [...PROJECT_NAMES]
}
