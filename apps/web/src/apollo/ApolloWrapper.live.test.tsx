import { useAuth } from '@clerk/react'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATA_MODE_STORAGE_KEY } from '@/lib/dataMode'
import { callArgs } from '@/test/narrow'
import { ApolloWrapper } from './ApolloWrapper'
import { liveSocketOf } from './liveSocket'
import { startLiveUpdates } from './liveUpdates'

// How `ApolloWrapper` runs live updates for a real (Clerk) user. The runner
// itself is tested in `liveUpdates.test.ts`; here it is a spy, so no socket
// opens in jsdom.

vi.mock('@clerk/react', () => ({
  useAuth: vi.fn(),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// The REAL `useApolloClient`, so the runner sees the client the wrapper made.
// `src/test/setup.ts` stubs it with an object that has no socket.
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

const stop = vi.fn()
vi.mock('./liveUpdates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./liveUpdates')>()),
  startLiveUpdates: vi.fn(() => stop),
}))

const getToken = async () => null

function signedInAs(userId: string | null) {
  vi.mocked(useAuth).mockReturnValue({
    userId,
    isLoaded: true,
    isSignedIn: userId !== null,
    getToken,
  } as unknown as ReturnType<typeof useAuth>)
}

// Cleared BEFORE each test: Testing Library unmounts the previous test's tree
// in its own `afterEach`, which runs after this file's, and that unmount
// calls `stop`.
beforeEach(() => {
  vi.mocked(startLiveUpdates).mockClear()
  stop.mockClear()
})

afterEach(() => {
  localStorage.removeItem(DATA_MODE_STORAGE_KEY)
})

describe('ApolloWrapper live updates', () => {
  it('starts live updates on the wrapper client and its own socket', () => {
    localStorage.setItem(DATA_MODE_STORAGE_KEY, 'cloud')
    signedInAs('user-1')

    render(<ApolloWrapper>{null}</ApolloWrapper>)

    expect(startLiveUpdates).toHaveBeenCalledTimes(1)
    const [options] = callArgs(vi.mocked(startLiveUpdates).mock)
    expect(options.socket).toBeDefined()
    expect(liveSocketOf(options.client)).toBe(options.socket)
  })

  it('stops live updates on sign-out', () => {
    // Given a signed-in user with live updates running
    localStorage.setItem(DATA_MODE_STORAGE_KEY, 'cloud')
    signedInAs('user-1')
    const view = render(<ApolloWrapper>{null}</ApolloWrapper>)
    expect(stop).not.toHaveBeenCalled()

    // When the user signs out
    signedInAs(null)
    view.rerender(<ApolloWrapper>{null}</ApolloWrapper>)

    // Then the runner is stopped (it unsubscribes, and the lazy socket
    // closes) and not started again
    expect(stop).toHaveBeenCalledTimes(1)
    expect(startLiveUpdates).toHaveBeenCalledTimes(1)
  })

  it('starts nothing when signed out', () => {
    localStorage.setItem(DATA_MODE_STORAGE_KEY, 'cloud')
    signedInAs(null)

    render(<ApolloWrapper>{null}</ApolloWrapper>)

    expect(startLiveUpdates).not.toHaveBeenCalled()
  })
})
