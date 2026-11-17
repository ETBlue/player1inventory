import { afterEach, describe, expect, it, vi } from 'vitest'
import { E2E_USER_ID_STORAGE_KEY, getE2ETestUserId } from './e2eUser'

// `getE2ETestUserId` (households H5 task F.8, decision T10). The E2E build lets
// each browser context be a different person through a `localStorage` key.
// The key must count ONLY in that build: in production anyone can write
// `localStorage`, and the id would pick the user the E2E server trusts.

afterEach(() => {
  vi.unstubAllEnvs()
  localStorage.removeItem(E2E_USER_ID_STORAGE_KEY)
})

describe('getE2ETestUserId', () => {
  it('ignores the localStorage key when the build flag is not set (production)', () => {
    // Given a production build (no `VITE_E2E_TEST_USER_ID`), and a key
    // someone wrote by hand
    vi.stubEnv('VITE_E2E_TEST_USER_ID', '')
    localStorage.setItem(E2E_USER_ID_STORAGE_KEY, 'someone-else')

    // Then there is no E2E user at all
    expect(getE2ETestUserId()).toBeUndefined()
  })

  it('gives the build-time id when no key is set', () => {
    vi.stubEnv('VITE_E2E_TEST_USER_ID', 'e2e-test-user')

    expect(getE2ETestUserId()).toBe('e2e-test-user')
  })

  it('gives the key when the build flag is set and the key exists', () => {
    vi.stubEnv('VITE_E2E_TEST_USER_ID', 'e2e-test-user')
    localStorage.setItem(E2E_USER_ID_STORAGE_KEY, 'e2e-test-user-2-member')

    expect(getE2ETestUserId()).toBe('e2e-test-user-2-member')
  })

  it('ignores an empty key and gives the build-time id', () => {
    vi.stubEnv('VITE_E2E_TEST_USER_ID', 'e2e-test-user')
    localStorage.setItem(E2E_USER_ID_STORAGE_KEY, '')

    expect(getE2ETestUserId()).toBe('e2e-test-user')
  })
})
