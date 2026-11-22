// The spec files of the `cloud-neon` project (E2E speed plan, task S.8,
// decision D13, owner answer P8-A: the 8 core files, 38 tests).
//
// WHY A SECOND CLOUD PROJECT. The `cloud` project runs on a Postgres on this
// Mac (decision D9, owner answer P7-A). A local database hides what only Neon
// does: the pooler, the 52 ms per query that opens latency races, and Neon's
// cold start. `cloud-neon` runs these files on the Neon TEST branch, once per
// gate (owner answer P6-A: the fourth row of `pnpm test:e2e:all`). The whole
// cloud list runs on Neon before each checkpoint release, with
// `pnpm test:e2e:all:neon` (owner answer P10-A).
//
// Each entry is a path under `e2e/tests/`, written the same way as in the
// `cloud` project's `testMatch` (`'**/' + spec`). The config throws at load
// when an entry is not in that list, so a typo cannot select zero tests and
// pass (`assertNeonSpecsInCloud` below).

export const NEON_SPECS: readonly { spec: string; why: string }[] = [
  {
    spec: 'settings/import-export-cloud.spec.ts',
    why: 'the 22 bulk import mutations, batch after batch, through the pooler',
  },
  {
    spec: 'settings/import-strategies.spec.ts',
    why: '`clear` runs `clearAllData` first',
  },
  {
    spec: 'settings/import-households.spec.ts',
    why: '`importCheck` and the import role gate',
  },
  {
    spec: 'purge-two-households.spec.ts',
    why: "`clearAllData`, `deleteAllLocations`, `removeAllLocationItems`, `deleteHouseholdData`'s order",
  },
  {
    spec: 'household-ownership.spec.ts',
    why: 'the hand-over through the webhook, two accepts at once (the lock window)',
  },
  { spec: 'live-cart.spec.ts', why: 'socket, event order, reconnect' },
  {
    spec: 'live-pantry.spec.ts',
    why: "the same, and `deleteItem`'s read before the cascade",
  },
  {
    spec: 'cleanup-endpoint.spec.ts',
    why: 'the `/e2e/cleanup` SQL functions on Neon (decision D1)',
  },
]

/** The `testMatch` pattern of one entry, the same form as the `cloud` list. */
export function neonPattern(spec: string): string {
  return `**/${spec}`
}

/**
 * Throw when an entry of `NEON_SPECS` is not in the `cloud` project's
 * `testMatch`, or appears twice. Called by `e2e/playwright.config.ts` at load.
 */
export function assertNeonSpecsInCloud(
  cloudTestMatch: readonly string[],
): void {
  const cloud = new Set(cloudTestMatch)
  const seen = new Set<string>()
  for (const { spec } of NEON_SPECS) {
    const pattern = neonPattern(spec)
    if (seen.has(pattern))
      throw new Error(`e2e/neonSpecs.ts: "${spec}" is listed twice.`)
    seen.add(pattern)
    if (!cloud.has(pattern))
      throw new Error(
        `e2e/neonSpecs.ts: "${spec}" is not in the cloud project's testMatch ` +
          `(e2e/playwright.config.ts). Fix the name, or add the spec to the cloud list first.`,
      )
  }
}
