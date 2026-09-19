import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActiveLocationProvider } from '@/hooks/useActiveLocation'
import { DataModeCard } from '.'

// Records the order operations actually ran in, not just whether they ran.
// clearCache must run before signOut — after signing out the app may
// navigate or re-render, and the cleanup could be interrupted.
const calls: string[] = []

const signOutMock = vi.fn(async () => {
  calls.push('signOut')
})

vi.mock('@clerk/react', () => ({
  useUser: vi.fn(() => ({
    user: {
      id: 'user_123',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
    },
  })),
  useClerk: vi.fn(() => ({ signOut: signOutMock })),
}))

vi.mock('@/apollo/persistence', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    clearCache: async () => {
      calls.push('clearCache')
    },
  }
})

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveLocationProvider>
        <DataModeCard />
      </ActiveLocationProvider>
    </QueryClientProvider>,
  )
}

describe('DataModeCard sign-out clears the cached cloud data', () => {
  afterEach(() => {
    localStorage.clear()
    calls.length = 0
    signOutMock.mockClear()
  })

  it('user signing out has the cache cleared before Clerk signs them out', async () => {
    // Given cloud mode
    localStorage.setItem('data-mode', 'cloud')
    const user = userEvent.setup()
    renderCard()

    // When the user signs out, choosing "Just sign out" (no offline switch)
    await user.click(screen.getByRole('button', { name: 'Sign Out' }))
    await user.click(screen.getByRole('button', { name: 'Just sign out' }))

    // Then both ran, in this order: cache cleared first, Clerk signed out second.
    // On a shared device the next person must never see the previous account's
    // pantry — so the order matters as much as the call itself.
    await waitFor(() => expect(signOutMock).toHaveBeenCalledOnce())
    expect(calls).toEqual(['clearCache', 'signOut'])
  })
})
