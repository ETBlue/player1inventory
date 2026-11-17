import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { describe, expect, it } from 'vitest'
import { hasGraphQLErrorCode, hasGraphQLErrorReason } from './graphqlErrorCode'

function apolloError(code: string, message: string) {
  return new CombinedGraphQLErrors({
    errors: [{ message, extensions: { code } }],
  })
}

describe('hasGraphQLErrorCode', () => {
  it('finds the code in extensions', () => {
    expect(
      hasGraphQLErrorCode(
        apolloError('CART_CHANGED', 'the cart changed'),
        'CART_CHANGED',
      ),
    ).toBe(true)
  })

  it('reads the code, not the message', () => {
    // The message names the code, but the code is a different one
    expect(
      hasGraphQLErrorCode(
        apolloError('FORBIDDEN', 'CART_CHANGED'),
        'CART_CHANGED',
      ),
    ).toBe(false)
  })

  it('returns false for an error that is not a GraphQL error', () => {
    // A network failure, or a Dexie error from local mode
    const plain = new Error('CART_CHANGED')
    Object.assign(plain, { extensions: { code: 'CART_CHANGED' } })
    expect(hasGraphQLErrorCode(plain, 'CART_CHANGED')).toBe(false)
    expect(hasGraphQLErrorCode(undefined, 'CART_CHANGED')).toBe(false)
  })
})

describe('hasGraphQLErrorReason', () => {
  function reasonError(code: string, reason: string, message = 'refused') {
    return new CombinedGraphQLErrors({
      errors: [{ message, extensions: { code, reason } }],
    })
  }

  it('finds the reason in extensions', () => {
    expect(
      hasGraphQLErrorReason(
        reasonError('BAD_USER_INPUT', 'INVITE_INVALID'),
        'INVITE_INVALID',
      ),
    ).toBe(true)
  })

  it('reads the reason, not the code or the message', () => {
    // The code and the message name the reason, but the reason is another one
    const err = new CombinedGraphQLErrors({
      errors: [
        {
          message: 'INVITE_INVALID',
          extensions: { code: 'INVITE_INVALID', reason: 'ALREADY_MEMBER' },
        },
      ],
    })
    expect(hasGraphQLErrorReason(err, 'INVITE_INVALID')).toBe(false)
    expect(hasGraphQLErrorReason(err, 'ALREADY_MEMBER')).toBe(true)
  })

  it('returns false for an error that is not a GraphQL error', () => {
    const plain = new Error('INVITE_INVALID')
    Object.assign(plain, { extensions: { reason: 'INVITE_INVALID' } })
    expect(hasGraphQLErrorReason(plain, 'INVITE_INVALID')).toBe(false)
    expect(hasGraphQLErrorReason(undefined, 'INVITE_INVALID')).toBe(false)
  })
})
