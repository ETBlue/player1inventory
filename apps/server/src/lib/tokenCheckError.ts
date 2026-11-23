// What a failed Clerk token check means for the socket (households H3c-1,
// task C.3).
//
// `verifyToken` (`@clerk/backend` 2.33.0, re-exported by `@clerk/express`)
// throws for two very different reasons:
//
// | What happened                         | What it throws                                  | Answer          |
// |---------------------------------------|-------------------------------------------------|-----------------|
// | Clerk checked the token and said no   | `TokenVerificationError`, a `reason` in the     | `'rejected'`    |
// |                                       | list below                                      |                 |
// | the JWKS could not be fetched         | `TokenVerificationError` with `reason`          | `'unavailable'` |
// | (Clerk answered with an error status) | `jwk-remote-failed-to-load`                     |                 |
// | the network failed                    | a plain `TypeError` ("fetch failed"), no reason | `'unavailable'` |
// | Clerk answered 5xx with an HTML page  | a plain `SyntaxError` from `response.json()`    | `'unavailable'` |
// | the server is set up wrongly          | `TokenVerificationError` with a key reason      | `'unavailable'` |
// | anything else                         | anything                                        | `'unavailable'` |
//
// Only `'rejected'` closes the socket with 4401, which the graphql-ws 5
// client never retries. Everything else closes with a code it retries, so a
// short Clerk or network outage does not stop live updates until a reload.
//
// The list is an ALLOW-list of "the token is bad" reasons, on purpose. A
// reason Clerk adds later falls into `'unavailable'`. The cost of that
// mistake is a few retries (the client gives up after 5). The cost of the
// opposite mistake is a tab with no live updates until it is reloaded.
//
// Known overlap: a token with three dot-separated parts that are not valid
// base64 JSON makes `decodeJwt` throw a plain `SyntaxError` too, before
// Clerk's own `try`. It cannot be told apart from the HTML-page case, so it
// counts as `'unavailable'` and is retried up to 5 times. A real Clerk client
// never sends such a token.
//
// The strings are copied from `TokenVerificationErrorReason` in
// `@clerk/backend/errors`. `apps/server` does not depend on `@clerk/backend`
// directly, so it cannot import them; `tokenCheckError.test.ts` loads the
// installed package and fails if a string here no longer matches.

/** The `reason` values that mean Clerk looked at the token and refused it. */
export const REJECTED_TOKEN_REASONS: readonly string[] = [
  'token-expired', // TokenExpired
  'token-invalid', // TokenInvalid
  'token-invalid-algorithm', // TokenInvalidAlgorithm
  'token-invalid-authorized-parties', // TokenInvalidAuthorizedParties
  'token-invalid-signature', // TokenInvalidSignature
  'token-not-active-yet', // TokenNotActiveYet
  'token-iat-in-the-future', // TokenIatInTheFuture
  'token-verification-failed', // TokenVerificationFailed
  // The JWKS was fetched (or cached) and holds no key for the token's `kid`.
  // Clerk fetches again when a `kid` is missing from the cache, so this means
  // the token was not signed by this Clerk instance.
  'jwk-kid-mismatch', // JWKKidMismatch
]

/**
 * The other Clerk reasons. All mean the server could not check the token:
 * the JWKS failed to load, or the server's keys are missing or wrong. They
 * are listed only so `loggableReason` can log them; the classification does
 * not read this list.
 */
export const OTHER_CLERK_REASONS: readonly string[] = [
  'jwk-remote-failed-to-load', // RemoteJWKFailedToLoad
  'jwk-remote-invalid', // RemoteJWKInvalid
  'jwk-remote-missing', // RemoteJWKMissing
  'jwk-local-missing', // LocalJWKMissing
  'jwk-failed-to-resolve', // JWKFailedToResolve
  'secret-key-invalid', // InvalidSecretKey
]

export type TokenCheckFailure = 'rejected' | 'unavailable'

/** The Clerk `reason` of an error, or `null` if it has none. */
export function clerkReason(err: unknown): string | null {
  if (typeof err !== 'object' || err === null || !('reason' in err)) return null
  const reason = (err as { reason: unknown }).reason
  return typeof reason === 'string' ? reason : null
}

/**
 * Decide what an error thrown by the token check means. By the Clerk
 * `reason` only, never by the message.
 */
export function classifyTokenCheckError(err: unknown): TokenCheckFailure {
  const reason = clerkReason(err)
  return reason !== null && REJECTED_TOKEN_REASONS.includes(reason) ? 'rejected' : 'unavailable'
}

/**
 * The Clerk `reason` of an error when it is one of Clerk's fixed codes, so it
 * is safe to log. Any other value (which could hold anything) gives `'-'`.
 */
export function loggableReason(err: unknown): string {
  const reason = clerkReason(err)
  if (reason === null) return '-'
  return REJECTED_TOKEN_REASONS.includes(reason) || OTHER_CLERK_REASONS.includes(reason) ? reason : '-'
}
