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
        apolloError('LAST_LOCATION', 'cannot delete'),
        'LAST_LOCATION',
      ),
    ).toBe(true)
  })

  it('reads the code, not the message', () => {
    // The message names the code, but the code is a different one
    expect(
      hasGraphQLErrorCode(
        apolloError('FORBIDDEN', 'LAST_LOCATION'),
        'LAST_LOCATION',
      ),
    ).toBe(false)
  })

  it('returns false for an error that is not a GraphQL error', () => {
    // A network failure, or a Dexie error from local mode
    const plain = new Error('LAST_LOCATION')
    Object.assign(plain, { extensions: { code: 'LAST_LOCATION' } })
    expect(hasGraphQLErrorCode(plain, 'LAST_LOCATION')).toBe(false)
    expect(hasGraphQLErrorCode(undefined, 'LAST_LOCATION')).toBe(false)
  })
})
