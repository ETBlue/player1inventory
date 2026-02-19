import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadNavigationHistory,
  saveNavigationHistory,
} from '@/lib/sessionStorage'
import { useAppNavigation } from './useAppNavigation'

// Mock TanStack Router hooks
const mockNavigate = vi.fn()
const mockRouterState = {
  location: {
    pathname: '/',
  },
}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useRouter: () => ({
    state: mockRouterState,
  }),
}))

describe('useAppNavigation', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
    mockRouterState.location.pathname = '/'
  })

  it('goBack navigates to home when history is empty', async () => {
    // Given empty navigation history
    expect(loadNavigationHistory()).toEqual([])

    // When user calls goBack
    const { result } = renderHook(() => useAppNavigation())

    result.current.goBack()

    // Then navigates to home
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/' })
    })
  })

  it('tracks navigation in sessionStorage', async () => {
    // Given a navigation from home to settings
    mockRouterState.location.pathname = '/'

    // When hook mounts on home page
    const { rerender } = renderHook(() => useAppNavigation())

    // Then home page is tracked
    await waitFor(() => {
      const history = loadNavigationHistory()
      expect(history).toContain('/')
    })

    // When navigating to settings
    mockRouterState.location.pathname = '/settings'
    rerender()

    // Then settings is tracked
    await waitFor(() => {
      const history = loadNavigationHistory()
      expect(history).toEqual(['/', '/settings'])
    })
  })

  it('goBack navigates to previous page', async () => {
    // Given navigation history: / -> /settings
    saveNavigationHistory(['/', '/settings'])
    mockRouterState.location.pathname = '/settings'

    // When user calls goBack
    const { result } = renderHook(() => useAppNavigation())

    result.current.goBack()

    // Then navigates to previous page (/)
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/' })
    })

    // And current page removed from history
    const history = loadNavigationHistory()
    expect(history).toEqual(['/'])
  })

  it('limits history to 50 entries', async () => {
    // Given a history with 50 entries
    const largeHistory = Array.from({ length: 50 }, (_, i) => `/page${i}`)
    saveNavigationHistory(largeHistory)
    mockRouterState.location.pathname = '/page49'

    // When navigating to a new page
    const { rerender } = renderHook(() => useAppNavigation())

    mockRouterState.location.pathname = '/new-page'
    rerender()

    // Then oldest entry is removed and new entry added
    await waitFor(() => {
      const history = loadNavigationHistory()
      expect(history.length).toBe(50)
      expect(history[0]).toBe('/page1') // First entry removed
      expect(history[history.length - 1]).toBe('/new-page') // New entry added
    })
  })

  it('avoids tracking duplicate consecutive paths', async () => {
    const { rerender } = renderHook(() => useAppNavigation(), {
      wrapper: ({ children }) => children,
    })

    // Navigate to same path again (simulated by rerender)
    rerender()

    await waitFor(() => {
      const history = loadNavigationHistory()
      // Should only have one entry for '/' despite multiple renders
      const homeCount = history.filter((p) => p === '/').length
      expect(homeCount).toBe(1)
    })
  })
})
