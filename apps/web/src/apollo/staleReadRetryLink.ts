import { ApolloLink, Observable } from '@apollo/client'
import { getMainDefinition } from '@apollo/client/utilities'

/**
 * How many times one query may be sent, in total, before its answer is passed
 * on even though a mutation landed while it was waiting.
 *
 * A query is sent again only when a mutation answered during its last send.
 * So once the user stops saving, sending stops by itself, and the cap is
 * reached only while saves keep landing. The cap is a hard stop for that case,
 * so a stream of saves can never keep one query busy forever.
 *
 * WARNING: when the cap is reached, the last answer is passed on even if a
 * mutation answered while it was waiting. That answer may be OLD, which is the
 * original bug. This happens when saves land during every one of the sends,
 * more times in a row than the cap allows. The count belongs to the shared
 * request, not to each caller: a refetch that joins the request on its last
 * send gets no new sends of its own. The cap was 3 and is now 5, so it takes
 * 5 sends in a row, each with a save landing while it waits, to reach it.
 */
export const MAX_QUERY_ATTEMPTS = 5

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
            // The order of these two lines matters: count FIRST, then pass
            // the answer on. Apollo Client 4.1.6 sends the mutation's
            // `refetchQueries` synchronously inside `observer.next`. If the
            // count came after, a refetch that joins no request would record
            // the old count, see it change while it waits, and be sent twice.
            // Pinned by "a refetch sent after the mutation answers is sent
            // once" in `staleReadRetryLink.test.ts`.
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
        const thisAttempt = attempts
        const countWhenSent = mutationsAnswered
        let dropped = false
        const attemptSubscription = forward(operation).subscribe({
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
        // Store this attempt's subscription only if it is still the current
        // attempt. When the next link answers synchronously, `complete` above
        // starts the next attempt before `subscribe` returns, and that attempt
        // stores its own subscription first. Writing this finished one over it
        // would leave the resend open after the caller unsubscribes.
        if (thisAttempt === attempts) subscription = attemptSubscription
      }

      send()
      return () => {
        closed = true
        subscription?.unsubscribe()
      }
    })
  })
}
