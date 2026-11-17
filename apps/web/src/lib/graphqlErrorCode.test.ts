import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { describe, expect, it } from 'vitest'
import { hasGraphQLErrorCode } from './graphqlErrorCode'

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
