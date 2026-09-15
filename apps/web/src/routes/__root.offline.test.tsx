import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useRouterState: () => '/',
  }
})

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ isSignedIn: false, isLoaded: true }),
}))

import { CloudAuthGuard } from './__root'

function setOnLine(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
}

afterEach(() => {
  navigateMock.mockClear()
  vi.restoreAllMocks()
})

describe('CloudAuthGuard', () => {
  it('user is sent to sign-in when signed out and online', async () => {
    // Given the device has a connection and Clerk says signed out
    setOnLine(true)

    // When the guard renders
    render(<CloudAuthGuard />)

    // Then the user is sent to the sign-in page
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: '/sign-in' })
    })
  })

  it('user stays on the page when signed out and offline', async () => {
    // Given the device has no connection and Clerk says signed out
    setOnLine(false)

    // When the guard renders
    render(<CloudAuthGuard />)

    // Then the user is NOT sent to a sign-in page they cannot finish
    await waitFor(() => {
      expect(navigateMock).not.toHaveBeenCalled()
    })
  })
})
