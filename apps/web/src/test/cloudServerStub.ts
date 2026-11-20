// A fake cloud server for tests that check what a screen does when a CLOUD
// save fails. It replaces only the GENERATED Apollo hooks
// (`@/generated/graphql`). The app hooks above them (`useUpdateItem`,
// `useCreateTag`, …) stay real, so their `mode === 'cloud'` branch runs.
//
// Use it from a per-file factory. The factory REPLACES the one in
// `src/test/setup.ts`, so every generated hook gets a stub here:
//
//   vi.mock('@/generated/graphql', async (importOriginal) => {
//     const { stubGeneratedHooks } = await import('@/test/cloudServerStub')
//     return stubGeneratedHooks(await importOriginal())
//   })
//
// Then, in the test:
//
//   cloudServer.queries.useGetItemQuery = { item: MILK }
//   cloudServer.failing.add('useUpdateItemMutation')
//   …
//   expect(cloudServer.calls.useUpdateItemMutation).toHaveLength(1)
//
// - A query hook returns `cloudServer.queries[hookName]` as its `data`, or no
//   data when nothing is set. A function there gets the query's variables.
// - A mutation hook's function records its variables in
//   `cloudServer.calls[hookName]`. When the hook name is in
//   `cloudServer.failing`, it rejects the way Apollo does when the server
//   refuses: a `CombinedGraphQLErrors` with the code `FORBIDDEN`. Otherwise it
//   resolves with `cloudServer.results[hookName]`, or `{}` as `data`.
//
// Check `calls` in every test. It proves the request was really sent. A test
// that only checks the toast would also pass when the write failed before it
// was sent (for example with `NoCloudLocationError`).
import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { useCallback, useState } from 'react'
import { vi } from 'vitest'

type Data = unknown
type QueryData = Data | ((variables: Record<string, unknown>) => Data)

export const cloudServer = {
  queries: {} as Record<string, QueryData>,
  results: {} as Record<string, (variables: Record<string, unknown>) => Data>,
  failing: new Set<string>(),
  calls: {} as Record<string, Record<string, unknown>[]>,
}

/** Clears every query answer, result, failure and recorded call. */
export function resetCloudServer() {
  cloudServer.queries = {}
  cloudServer.results = {}
  cloudServer.failing = new Set()
  cloudServer.calls = {}
  dataCache.clear()
}

/** The error Apollo's `mutate` rejects with when the server refuses. */
export function forbiddenError() {
  return new CombinedGraphQLErrors({
    errors: [
      {
        message: 'Not allowed in this test.',
        extensions: { code: 'FORBIDDEN' },
      },
    ],
  })
}

// A query hook must return the SAME data object on every render, or an effect
// that depends on it runs again on every render and the test never settles.
const dataCache = new Map<string, Data>()

function queryData(hook: string, variables: Record<string, unknown>) {
  const answer = cloudServer.queries[hook]
  if (typeof answer !== 'function') return answer
  const key = `${hook}:${JSON.stringify(variables)}`
  if (!dataCache.has(key)) dataCache.set(key, answer(variables))
  return dataCache.get(key)
}

async function runMutation(hook: string, options?: unknown) {
  const variables =
    (options as { variables?: Record<string, unknown> } | undefined)
      ?.variables ?? {}
  cloudServer.calls[hook] = [...(cloudServer.calls[hook] ?? []), variables]
  // A real request is never answered in the same tick. Without this wait a
  // `loading` flag would go true and false again before React rendered it.
  await new Promise((resolve) => setTimeout(resolve, 0))
  if (cloudServer.failing.has(hook)) throw forbiddenError()
  return { data: cloudServer.results[hook]?.(variables) ?? {} }
}

// A mutation hook with a real `loading` flag, like Apollo's: true while the
// request runs, false again when it is answered or refused. The pages turn it
// into `isPending`, and a page that keeps a button disabled while pending
// must enable it again after a refusal. A stub that always said `false` could
// not catch a page that forgot to.
function useStubMutation(hook: string) {
  const [loading, setLoading] = useState(false)
  const mutate = useCallback(
    async (options?: unknown) => {
      setLoading(true)
      try {
        return await runMutation(hook, options)
      } finally {
        setLoading(false)
      }
    },
    [hook],
  )
  return [
    mutate,
    {
      loading,
      called: false,
      client: {
        // The Apollo shape: a promise that also carries `queries` and
        // `results`, like `setup.ts`. `refetchAfterWrite` reads `results`.
        refetchQueries: () =>
          Object.assign(Promise.resolve([]), { queries: [], results: [] }),
      },
    },
  ] as const
}

const refetch = () => Promise.resolve({ data: undefined })

/** The module the factory returns: every generated hook replaced. */
export function stubGeneratedHooks(original: Record<string, unknown>) {
  const stubbed: Record<string, unknown> = { ...original }
  for (const key of Object.keys(original)) {
    if (!key.startsWith('use')) continue
    if (key.endsWith('SuspenseQuery')) continue
    if (key.endsWith('LazyQuery')) {
      stubbed[key] = () => [vi.fn(), { data: undefined, loading: false }]
    } else if (key.endsWith('Query')) {
      stubbed[key] = (options?: {
        skip?: boolean
        variables?: Record<string, unknown>
      }) => ({
        data: options?.skip
          ? undefined
          : queryData(key, options?.variables ?? {}),
        previousData: undefined,
        loading: false,
        error: undefined,
        networkStatus: 7,
        called: true,
        refetch,
      })
    } else if (key.endsWith('Mutation')) {
      stubbed[key] = () => useStubMutation(key)
    } else if (key.endsWith('Subscription')) {
      stubbed[key] = () => ({ data: undefined, loading: false })
    }
  }
  return stubbed
}

/**
 * The answers every cloud screen reads: two locations where the caller is
 * `organizer`, and a household where the caller is `owner`. So every control
 * is shown and no screen is read-only.
 */
//
// Takes the locations as an argument (pass `CLOUD_LOCATIONS` from
// `cloudFixtures`). This module must not import `cloudFixtures` itself: that
// file imports `@/generated/graphql`, and the factory that imports this module
// is the one building `@/generated/graphql`, so the import waits for itself
// and the test file never loads.
export function seedCloudHousehold(locations: readonly object[]) {
  cloudServer.queries.useGetLocationsQuery = { locations }
  cloudServer.queries.useGetHouseholdLocationsQuery = {
    householdLocations: locations.map((l) => ({
      ...l,
      hasOrganizer: true,
    })),
  }
  cloudServer.queries.useGetHouseholdQuery = {
    household: {
      __typename: 'Household',
      id: 'hh-1',
      name: 'Home',
      role: 'owner',
      hasOwner: true,
      pendingTransfer: null,
    },
  }
}
