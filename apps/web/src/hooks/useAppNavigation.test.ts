import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isSamePage, useAppNavigation } from './useAppNavigation'

// The subset of the router `useAppNavigation` actually reads:
// `router.state.location.pathname` (`useAppNavigation.ts:63`) and
// `router.history.push` (`:93`). The real `useRouter()` returns the whole
// `AnyRouter` instance, so a two-field fake is not assignable to it. Declaring
// the subset lets the fake be TYPED instead of cast — and nothing below calls
// `vi.mocked(useRouter)`, which is what would pull the full type back in.
interface RouterStub {
  history: { push: (url: string) => void }
  state: { location: { pathname: string } }
}

// `vi.mock` factories are hoisted above every import, so the mocks they hand
// out have to be created in a `vi.hoisted` block. Each one carries its REAL
// implementation signature, which is what makes the assertions below type-check
// (a bare `vi.fn()` is `Mock<Procedure | Constructable>` and matches nothing).
const mocks = vi.hoisted(() => ({
  navigate: vi.fn<(opts: { to: string }) => void>(),
  historyPush: vi.fn<(url: string) => void>(),
  useRouter: vi.fn<() => RouterStub>(),
  loadNavigationHistory: vi.fn<() => string[]>(),
  saveNavigationHistory: vi.fn<(history: string[]) => void>(),
}))

vi.mock('@/lib/sessionStorage', () => ({
  loadNavigationHistory: mocks.loadNavigationHistory,
  saveNavigationHistory: mocks.saveNavigationHistory,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  useRouter: mocks.useRouter,
}))

describe('isSamePage', () => {
  it('treats item detail tabs as same page', () => {
    expect(isSamePage('/items/123', '/items/123/tags')).toBe(true)
    expect(isSamePage('/items/123/tags', '/items/123/vendors')).toBe(true)
    expect(isSamePage('/items/123/vendors', '/items/123/log')).toBe(true)
    expect(isSamePage('/items/123', '/items/123')).toBe(true)
  })

  it('treats vendor detail tabs as same page', () => {
    expect(
      isSamePage(
        '/settings/household/vendors/abc',
        '/settings/household/vendors/abc/items',
      ),
    ).toBe(true)
    expect(
      isSamePage(
        '/settings/household/vendors/abc/items',
        '/settings/household/vendors/abc',
      ),
    ).toBe(true)
    expect(
      isSamePage(
        '/settings/household/vendors/abc',
        '/settings/household/vendors/abc',
      ),
    ).toBe(true)
  })

  it('treats tag detail tabs as same page', () => {
    expect(
      isSamePage(
        '/settings/household/tags/xyz',
        '/settings/household/tags/xyz/items',
      ),
    ).toBe(true)
    expect(
      isSamePage(
        '/settings/household/tags/xyz/items',
        '/settings/household/tags/xyz',
      ),
    ).toBe(true)
    expect(
      isSamePage(
        '/settings/household/tags/xyz',
        '/settings/household/tags/xyz',
      ),
    ).toBe(true)
  })

  it('treats different item IDs as different pages', () => {
    expect(isSamePage('/items/123', '/items/456')).toBe(false)
    expect(isSamePage('/items/123/tags', '/items/456/tags')).toBe(false)
  })

  it('treats different vendor IDs as different pages', () => {
    expect(
      isSamePage(
        '/settings/household/vendors/abc',
        '/settings/household/vendors/xyz',
      ),
    ).toBe(false)
    expect(
      isSamePage(
        '/settings/household/vendors/abc/items',
        '/settings/household/vendors/xyz/items',
      ),
    ).toBe(false)
  })

  it('treats different tag IDs as different pages', () => {
    expect(
      isSamePage(
        '/settings/household/tags/abc',
        '/settings/household/tags/xyz',
      ),
    ).toBe(false)
    expect(
      isSamePage(
        '/settings/household/tags/abc/items',
        '/settings/household/tags/xyz/items',
      ),
    ).toBe(false)
  })

  it('treats recipe detail tabs as same page', () => {
    expect(
      isSamePage(
        '/settings/household/recipes/abc',
        '/settings/household/recipes/abc/items',
      ),
    ).toBe(true)
    expect(
      isSamePage(
        '/settings/household/recipes/abc/items',
        '/settings/household/recipes/abc',
      ),
    ).toBe(true)
    expect(
      isSamePage(
        '/settings/household/recipes/abc',
        '/settings/household/recipes/abc',
      ),
    ).toBe(true)
  })

  it('treats different recipe IDs as different pages', () => {
    expect(
      isSamePage(
        '/settings/household/recipes/abc',
        '/settings/household/recipes/xyz',
      ),
    ).toBe(false)
    expect(
      isSamePage(
        '/settings/household/recipes/abc/items',
        '/settings/household/recipes/xyz/items',
      ),
    ).toBe(false)
  })

  it('treats completely different routes as different pages', () => {
    expect(isSamePage('/', '/shopping')).toBe(false)
    expect(isSamePage('/items/123', '/shopping')).toBe(false)
    expect(
      isSamePage('/settings/household/vendors', '/settings/household/tags'),
    ).toBe(false)
  })

  it('does not treat /new pages as same page as detail pages', () => {
    expect(
      isSamePage(
        '/settings/household/recipes/new',
        '/settings/household/recipes/abc',
      ),
    ).toBe(false)
    expect(
      isSamePage(
        '/settings/household/vendors/new',
        '/settings/household/vendors/abc',
      ),
    ).toBe(false)
  })

  it('treats full URLs with matching pathnames as same page regardless of search params', () => {
    expect(isSamePage('/items/123?tab=tags', '/items/123?tab=vendors')).toBe(
      true,
    )
    expect(
      isSamePage(
        '/settings/household/vendors/abc?q=foo',
        '/settings/household/vendors/abc/items',
      ),
    ).toBe(true)
  })

  it('treats full URLs with different pathnames as different pages', () => {
    expect(isSamePage('/?q=milk', '/shopping?q=milk')).toBe(false)
    expect(isSamePage('/items/123?tab=tags', '/items/456?tab=tags')).toBe(false)
  })
})

describe('useAppNavigation', () => {
  const mockNavigate = mocks.navigate
  const mockHistoryPush = mocks.historyPush
  const mockUseRouter = mocks.useRouter
  const mockLoadNavigationHistory = mocks.loadNavigationHistory

  beforeEach(() => {
    // `clearAllMocks` drops call records but KEEPS a `mockReturnValue` set by a
    // previous test, so both defaults are re-armed here. Every test below
    // overrides both anyway.
    vi.clearAllMocks()

    mockUseRouter.mockReturnValue({
      history: { push: mockHistoryPush },
      state: { location: { pathname: '/current-page' } },
    })
    mockLoadNavigationHistory.mockReturnValue([])
  })

  it('user can navigate back skipping /new pages in history', () => {
    // Given history has a /new page before the list page
    mockLoadNavigationHistory.mockReturnValue([
      '/settings/household/recipes',
      '/settings/household/recipes/new',
    ])
    mockUseRouter.mockReturnValue({
      history: { push: mockHistoryPush },
      state: { location: { pathname: '/settings/household/recipes/abc' } },
    })

    // When user calls goBack
    const { result } = renderHook(() =>
      useAppNavigation('/settings/household/recipes'),
    )
    result.current.goBack()

    // Then navigates to the list page using history.push to preserve full URL
    expect(mockHistoryPush).toHaveBeenCalledWith('/settings/household/recipes')
  })

  it('user can navigate back when only /new pages are in history', () => {
    // Given history only has a /new page
    mockLoadNavigationHistory.mockReturnValue([
      '/settings/household/recipes/new',
    ])
    mockUseRouter.mockReturnValue({
      history: { push: mockHistoryPush },
      state: { location: { pathname: '/settings/household/recipes/abc' } },
    })

    // When user calls goBack with fallback
    const { result } = renderHook(() =>
      useAppNavigation('/settings/household/recipes'),
    )
    result.current.goBack()

    // Then falls back to the fallback path via navigate (not history.push)
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/settings/household/recipes',
    })
    expect(mockHistoryPush).not.toHaveBeenCalled()
  })

  it('user can navigate back when history is empty and fallback provided', () => {
    // Given empty history and a fallback path
    mockLoadNavigationHistory.mockReturnValue([])
    mockUseRouter.mockReturnValue({
      history: { push: mockHistoryPush },
      state: { location: { pathname: '/settings/household/recipes/abc' } },
    })

    // When user calls goBack with fallback
    const { result } = renderHook(() => useAppNavigation('/settings'))
    result.current.goBack()

    // Then navigates to fallback path
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings' })
    expect(mockHistoryPush).not.toHaveBeenCalled()
  })

  it('user can navigate back when history is empty and no fallback provided', () => {
    // Given empty history and no fallback
    mockLoadNavigationHistory.mockReturnValue([])
    mockUseRouter.mockReturnValue({
      history: { push: mockHistoryPush },
      state: { location: { pathname: '/settings/household/recipes/abc' } },
    })

    // When user calls goBack without fallback
    const { result } = renderHook(() => useAppNavigation())
    result.current.goBack()

    // Then navigates to default home path
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' })
    expect(mockHistoryPush).not.toHaveBeenCalled()
  })

  it('user can navigate back to full URL including search params', () => {
    // Given history has a full URL with search params
    mockLoadNavigationHistory.mockReturnValue([
      '/?q=milk&f_tag1=abc',
      '/items/123',
    ])
    mockUseRouter.mockReturnValue({
      history: { push: mockHistoryPush },
      state: { location: { pathname: '/items/123' } },
    })

    // When user calls goBack
    const { result } = renderHook(() => useAppNavigation())
    result.current.goBack()

    // Then navigates to full URL preserving search params
    expect(mockHistoryPush).toHaveBeenCalledWith('/?q=milk&f_tag1=abc')
  })
})
