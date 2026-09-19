import { describe, expect, it } from 'vitest'
import { shouldRedirectToOnboarding } from './shouldRedirectToOnboarding'

const baseInput = {
  allLoaded: true,
  isEmpty: true,
  mode: 'local' as const,
  offline: false,
  pathname: '/',
  dismissed: false,
}

describe('shouldRedirectToOnboarding', () => {
  it('user can be a new local user with no data, and is sent to onboarding', () => {
    // Given a local user whose data has loaded and is empty
    const input = { ...baseInput, mode: 'local' as const, offline: false }

    // When the decision is made
    const result = shouldRedirectToOnboarding(input)

    // Then the user is sent to onboarding
    expect(result).toBe(true)
  })

  it('user can be a cloud user who is offline with an empty cache, and is NOT sent to onboarding', () => {
    // Given a cloud user with no connection and an empty local cache
    const input = { ...baseInput, mode: 'cloud' as const, offline: true }

    // When the decision is made
    const result = shouldRedirectToOnboarding(input)

    // Then the user stays put — an empty cache offline is not an empty account
    expect(result).toBe(false)
  })

  it('user can be a brand-new local user who is offline, and IS sent to onboarding', () => {
    // Given a local user with no connection and no data. Local mode is the
    // default and works fully offline, so an empty local database really does
    // mean an empty account.
    const input = { ...baseInput, mode: 'local' as const, offline: true }

    // When the decision is made
    const result = shouldRedirectToOnboarding(input)

    // Then the user is sent to onboarding. Without this case, dropping the
    // mode check and writing `if (offline) return false` would keep every
    // other test green and strand this user on an empty pantry page.
    expect(result).toBe(true)
  })

  it('user can be a cloud user who is online with an empty account, and is sent to onboarding', () => {
    // Given a cloud user with a connection and a genuinely empty account
    const input = { ...baseInput, mode: 'cloud' as const, offline: false }

    // When the decision is made
    const result = shouldRedirectToOnboarding(input)

    // Then the user is sent to onboarding
    expect(result).toBe(true)
  })

  it('user who dismissed onboarding is NOT sent there', () => {
    // Given a user who chose "Start from scratch" before
    const input = { ...baseInput, dismissed: true }

    // When the decision is made
    const result = shouldRedirectToOnboarding(input)

    // Then the user is not sent to onboarding again
    expect(result).toBe(false)
  })

  it('user already on /onboarding is NOT sent there again', () => {
    // Given a user who is already on the onboarding page
    const input = { ...baseInput, pathname: '/onboarding' }

    // When the decision is made
    const result = shouldRedirectToOnboarding(input)

    // Then no redirect is issued
    expect(result).toBe(false)
  })

  it('user whose queries have not finished loading is NOT sent there', () => {
    // Given data that has not finished loading yet
    const input = { ...baseInput, allLoaded: false }

    // When the decision is made
    const result = shouldRedirectToOnboarding(input)

    // Then no redirect is issued — the emptiness is not confirmed yet
    expect(result).toBe(false)
  })

  it('user with data is NOT sent to onboarding', () => {
    // Given a user whose data has loaded and is not empty
    const input = { ...baseInput, isEmpty: false }

    // When the decision is made
    const result = shouldRedirectToOnboarding(input)

    // Then no redirect is issued
    expect(result).toBe(false)
  })
})
