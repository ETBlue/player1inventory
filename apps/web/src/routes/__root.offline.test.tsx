import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const navigateMock = vi.fn()

// The page the guard runs on. `useRouterState` gets a `select` function, so
// the mock applies it to this location, the way the router does.
const routerLocation = vi.hoisted(() => ({
  value: { pathname: '/', searchStr: '' },
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useRouterState: (opts: {
      select: (s: { location: typeof routerLocation.value }) => unknown
    }) => opts.select({ location: routerLocation.value }),
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
  routerLocation.value = { pathname: '/', searchStr: '' }
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
      expect(navigateMock).toHaveBeenCalledWith({ to: '/sign-in', search: {} })
    })
  })

  it('user who opens an invite link while signed out comes back to it after sign-in', async () => {
    // Given a signed-out person on the join page of an invite link
    setOnLine(true)
    routerLocation.value = { pathname: '/join/abc', searchStr: '?x=1' }

    // When the guard renders
    render(<CloudAuthGuard />)

    // Then the sign-in page is told where to send them back (decision T24)
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/sign-in',
        search: { redirect: '/join/abc?x=1' },
      })
    })
  })

  it('does not send the sign-in page to itself', async () => {
    // Given a signed-out person already on the sign-in page, with a return
    // path. Navigating again would replace that return path with the
    // sign-in page's own URL
    setOnLine(true)
    routerLocation.value = {
      pathname: '/sign-in',
      searchStr: '?redirect=%2Fjoin%2Fabc',
    }

    // When the guard renders
    render(<CloudAuthGuard />)

    // Then it stays put
    await new Promise((r) => setTimeout(r, 0))
    expect(navigateMock).not.toHaveBeenCalled()
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
