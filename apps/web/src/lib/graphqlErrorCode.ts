import { CombinedGraphQLErrors } from '@apollo/client/errors'

/**
 * Whether a rejected Apollo call carries a GraphQL error with this
 * `extensions.code` (for example `FORBIDDEN` or `BAD_USER_INPUT`).
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

/**
 * Whether a rejected Apollo call carries a GraphQL error with this
 * `extensions.reason`. The server adds a reason to some `BAD_USER_INPUT`
 * refusals, so a caller can tell them apart: `INVITE_INVALID` and
 * `ALREADY_MEMBER` from `joinHousehold` (households H5b, decision T18), or
 * `IMPORT_NEEDS_LOCATION` from an import.
 *
 * Like `hasGraphQLErrorCode`, it never reads the message text, and any value
 * that is not a GraphQL error returns `false`.
 */
export function hasGraphQLErrorReason(err: unknown, reason: string): boolean {
  return (
    CombinedGraphQLErrors.is(err) &&
    err.errors.some((e) => e.extensions?.reason === reason)
  )
}
