import { CombinedGraphQLErrors } from '@apollo/client/errors'

/**
 * Whether a rejected Apollo call carries a GraphQL error with this
 * `extensions.code` (for example `LAST_LOCATION` or `FORBIDDEN`).
 *
 * It reads the CODE, never the message text. The server's message can change,
 * and a different error could happen to use the same words.
 *
 * Any other value (a network error, a Dexie error from local mode, a plain
 * `Error`) returns `false`, so a caller can show a generic message for it.
 */
export function hasGraphQLErrorCode(err: unknown, code: string): boolean {
  return (
    CombinedGraphQLErrors.is(err) &&
    err.errors.some((e) => e.extensions?.code === code)
  )
}
