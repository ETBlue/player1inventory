import type {
  ApolloClient,
  DocumentNode,
  OperationVariables,
} from '@apollo/client'
import { useApolloClient } from '@apollo/client/react'
import { useCallback, useState } from 'react'

/**
 * One read to send again after a write. The two forms behave differently,
 * the same way they do in a mutation's own `refetchQueries`:
 *
 * | Form | What is read again |
 * |---|---|
 * | a query name (`'ItemStocksForItem'`) or a document | every MOUNTED query with that name or document. Nothing when none is mounted |
 * | `{ query, variables }` | that one query, from the network (`network-only`), EVEN WHEN NOTHING IS MOUNTED. The answer is written to the cache |
 *
 * Use `{ query, variables }` when the variables matter. By name, Apollo reads
 * again EVERY observer of that query, including one that `skip` has parked on
 * bad variables (the `PantryData` trap in `stockListRefetches`, `useItems.ts`).
 */
export type RefetchAfterWrite =
  | string
  | DocumentNode
  | { query: DocumentNode; variables?: OperationVariables }

/**
 * Read the lists a write changed again, and wait for EACH of them, also when
 * another one fails. A read that FAILS is not reported: the write before it
 * worked, so the call must not reject with "could not save". A watched query keeps its own error, so the page
 * shows a failed read the way it shows any failed read.
 *
 * Why not the mutation's own `refetchQueries` with `awaitRefetchQueries`:
 * Apollo waits for those reads with `Promise.all`, so one failed read REJECTS
 * the mutation (`@apollo/client@4.1.6`, `core/QueryInfo.js`,
 * `markMutationResult`). `client.refetchQueries()` rejects the same way. See
 * docs/global/bugs/2026-11-18-bug-failed-refetch-rejects-saved-write.md.
 *
 * Send the mutation with NO `refetchQueries`, then `await` this. A failed
 * WRITE still rejects, because it rejects before this is called.
 *
 * `{ query, variables }` entries go through `client.query` with
 * `network-only`, not through `client.refetchQueries`: Apollo's public type
 * for `include` accepts only names and documents.
 */
export async function refetchAfterWrite(
  client: ApolloClient,
  refetches: readonly RefetchAfterWrite[],
): Promise<void> {
  const include: (string | DocumentNode)[] = []
  const reads: Promise<unknown>[] = []
  for (const entry of refetches) {
    if (typeof entry === 'string' || !('query' in entry)) {
      include.push(entry)
    } else {
      reads.push(
        client
          .query({
            query: entry.query,
            ...(entry.variables ? { variables: entry.variables } : {}),
            fetchPolicy: 'network-only',
          })
          .catch(() => {}),
      )
    }
  }
  if (include.length > 0) {
    // Wait for EACH read on its own. The returned promise is a `Promise.all`
    // over the reads (`core/ApolloClient.js`, `refetchQueries`), so it
    // rejects as soon as ONE read fails, while the others are still open.
    // Waiting for it stopped the wait early: after a person left a location,
    // the mounted `LocationPeople` read failed with FORBIDDEN at once, and
    // the call resolved before `GetHouseholdLocations` had landed (review of
    // households H5c task H.4). `results` holds one promise per read.
    const all = client.refetchQueries({ include })
    all.catch(() => {})
    for (const read of all.results) {
      reads.push(Promise.resolve(read).catch(() => {}))
    }
  }
  await Promise.all(reads)
}

/**
 * `refetchAfterWrite` for a hook, plus `isRefetching`.
 *
 * A mutation's `loading` stayed true while `awaitRefetchQueries` waited, and
 * pages read it as "busy" (`isPending`). The relation tabs keep a badge busy
 * on it, so a second press cannot start from the old list. Now the read runs
 * after the mutation has finished, so a hook reports
 * `loading || isRefetching` to keep that meaning.
 */
export function useRefetchAfterWrite() {
  const client = useApolloClient()
  const [running, setRunning] = useState(0)
  const run = useCallback(
    async (refetches: readonly RefetchAfterWrite[]) => {
      setRunning((n) => n + 1)
      try {
        await refetchAfterWrite(client, refetches)
      } finally {
        setRunning((n) => n - 1)
      }
    },
    [client],
  )
  return { refetchAfterWrite: run, isRefetching: running > 0 }
}
