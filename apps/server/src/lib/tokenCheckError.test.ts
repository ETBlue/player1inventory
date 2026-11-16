import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  classifyTokenCheckError,
  loggableReason,
  OTHER_CLERK_REASONS,
  REJECTED_TOKEN_REASONS,
} from './tokenCheckError.js'

// `apps/server` depends on `@clerk/express`, not on `@clerk/backend`, so pnpm
// does not let it import `@clerk/backend/errors`. Load it from where
// `@clerk/express` sees it: the same copy `verifyToken` uses at run time.
const require = createRequire(import.meta.url)
const fromExpress = createRequire(require.resolve('@clerk/express'))
const clerkErrors = fromExpress('@clerk/backend/errors') as {
  TokenVerificationError: new (args: { message: string; reason: string }) => Error & {
    reason: string
  }
  TokenVerificationErrorReason: Record<string, string>
}
const { TokenVerificationError, TokenVerificationErrorReason: Reason } = clerkErrors

function clerkError(reason: string) {
  return new TokenVerificationError({ message: 'token value would be here', reason })
}

describe('the reason lists match the installed @clerk/backend', () => {
  it('together they hold every reason Clerk has, each once', () => {
    const ours = [...REJECTED_TOKEN_REASONS, ...OTHER_CLERK_REASONS].sort()
    expect(ours).toEqual(Object.values(Reason).sort())
  })
})

describe('classifyTokenCheckError', () => {
  it.each([
    'TokenExpired',
    'TokenInvalid',
    'TokenInvalidAlgorithm',
    'TokenInvalidAuthorizedParties',
    'TokenInvalidSignature',
    'TokenNotActiveYet',
    'TokenIatInTheFuture',
    'TokenVerificationFailed',
    'JWKKidMismatch',
  ])('a Clerk %s means the token is rejected', (key) => {
    const reason = Reason[key]
    expect(reason).toBeTypeOf('string')
    expect(classifyTokenCheckError(clerkError(reason as string))).toBe('rejected')
  })

  it.each([
    'RemoteJWKFailedToLoad',
    'RemoteJWKInvalid',
    'RemoteJWKMissing',
    'LocalJWKMissing',
    'JWKFailedToResolve',
    'InvalidSecretKey',
  ])('a Clerk %s means the check is unavailable', (key) => {
    const reason = Reason[key]
    expect(reason).toBeTypeOf('string')
    expect(classifyTokenCheckError(clerkError(reason as string))).toBe('unavailable')
  })

  it('a network failure (fetch throws a TypeError) is unavailable', () => {
    expect(classifyTokenCheckError(new TypeError('fetch failed'))).toBe('unavailable')
  })

  it('an HTML error page from Clerk (a SyntaxError) is unavailable', () => {
    expect(classifyTokenCheckError(new SyntaxError('Unexpected token <'))).toBe('unavailable')
  })

  it('a reason Clerk does not have, or no error object at all, is unavailable', () => {
    expect(classifyTokenCheckError(clerkError('some-new-reason'))).toBe('unavailable')
    expect(classifyTokenCheckError({ reason: 42 })).toBe('unavailable')
    expect(classifyTokenCheckError('a string')).toBe('unavailable')
    expect(classifyTokenCheckError(null)).toBe('unavailable')
  })

  it('reads the reason, not the message', () => {
    const err = clerkError(Reason.RemoteJWKFailedToLoad as string)
    err.message = 'JWT is expired'
    expect(classifyTokenCheckError(err)).toBe('unavailable')
  })
})

describe('loggableReason', () => {
  it('gives a known Clerk reason, of either kind', () => {
    expect(loggableReason(clerkError(Reason.TokenExpired as string))).toBe('token-expired')
    expect(loggableReason(clerkError(Reason.RemoteJWKFailedToLoad as string))).toBe(
      'jwk-remote-failed-to-load',
    )
  })

  it('gives "-" for any other value, so nothing unknown is logged', () => {
    expect(loggableReason({ reason: 'secret-session-token-value' })).toBe('-')
    expect(loggableReason(new TypeError('fetch failed'))).toBe('-')
    expect(loggableReason(undefined)).toBe('-')
  })
})
