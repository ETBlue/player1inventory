import { ApolloLink, Observable } from '@apollo/client'
import { getMainDefinition } from '@apollo/client/utilities'

/**
 * How many times one query may be sent, in total, before its answer is passed
 * on even though a mutation landed while it was waiting. The limit stops a
 * query from being sent again and again while the user saves changes quickly.
 */
export const MAX_QUERY_ATTEMPTS = 3

/**
 * Sends a query again when a mutation answered while that query was waiting
 * for its own answer.
 *
 * Why: such a query may have read the database BEFORE the mutation was saved.
 * Two things in Apollo Client 4.1.6 then keep that old answer on screen:
 *
 * 1. Apollo joins identical queries that are in flight at the same time
 *    (`queryDeduplication`, on by default). A mutation's `refetchQueries`
 *    therefore joins the old request instead of sending a new one, and gets
 *    the old answer.
 * 2. Every answer is written to the cache when it arrives. An old answer that
 *    arrives after a newer one replaces the newer one.
 *
 * This link fixes both for every mutation and every query, in one place. A
 * joined refetch now waits for the new answer, and the old answer is never
 * passed on, so it never reaches the cache.
 *
 * Bug: `docs/global/bugs/2026-11-01-bug-refetch-joins-stale-query.md`.
 *
 * The count is kept per link, so build one link per Apollo client.
 */
export function createStaleReadRetryLink(
  maxAttempts: number = MAX_QUERY_ATTEMPTS,
): ApolloLink {
  // How many mutations have answered (or failed) through this link so far.
  let mutationsAnswered = 0

  return new ApolloLink((operation, forward) => {
    const definition = getMainDefinition(operation.query)
    const kind =
      definition.kind === 'OperationDefinition'
        ? definition.operation
        : undefined

    if (kind === 'mutation') {
      return new Observable((observer) => {
        const subscription = forward(operation).subscribe({
          next: (result) => {
            mutationsAnswered += 1
            observer.next(result)
          },
          error: (error) => {
            // A failed mutation may still have been saved on the server.
            mutationsAnswered += 1
            observer.error(error)
          },
          complete: () => observer.complete(),
        })
        return () => subscription.unsubscribe()
      })
    }

    if (kind !== 'query') return forward(operation)

    return new Observable((observer) => {
      let attempts = 0
      let closed = false
      let subscription: { unsubscribe: () => void } | undefined

      const send = () => {
        attempts += 1
        const countWhenSent = mutationsAnswered
        let dropped = false
        subscription = forward(operation).subscribe({
          next: (result) => {
            if (mutationsAnswered !== countWhenSent && attempts < maxAttempts) {
              dropped = true
              return
            }
            observer.next(result)
          },
          error: (error) => observer.error(error),
          complete: () => {
            if (dropped && !closed) send()
            else observer.complete()
          },
        })
      }

      send()
      return () => {
        closed = true
        subscription?.unsubscribe()
      }
    })
  })
}
