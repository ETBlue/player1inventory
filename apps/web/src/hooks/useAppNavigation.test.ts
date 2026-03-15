import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isSamePage, useAppNavigation } from './useAppNavigation'

// Mock dependencies
vi.mock('@/lib/sessionStorage', () => ({
  loadNavigationHistory: vi.fn(),
  saveNavigationHistory: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: vi.fn(),
  useRouter: vi.fn(),
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
      isSamePage('/settings/vendors/abc', '/settings/vendors/abc/items'),
    ).toBe(true)
    expect(
      isSamePage('/settings/vendors/abc/items', '/settings/vendors/abc'),
    ).toBe(true)
    expect(isSamePage('/settings/vendors/abc', '/settings/vendors/abc')).toBe(
      true,
    )
  })

  it('treats tag detail tabs as same page', () => {
    expect(isSamePage('/settings/tags/xyz', '/settings/tags/xyz/items')).toBe(
      true,
    )
    expect(isSamePage('/settings/tags/xyz/items', '/settings/tags/xyz')).toBe(
      true,
    )
    expect(isSamePage('/settings/tags/xyz', '/settings/tags/xyz')).toBe(true)
  })

  it('treats different item IDs as different pages', () => {
    expect(isSamePage('/items/123', '/items/456')).toBe(false)
    expect(isSamePage('/items/123/tags', '/items/456/tags')).toBe(false)
  })

  it('treats different vendor IDs as different pages', () => {
    expect(isSamePage('/settings/vendors/abc', '/settings/vendors/xyz')).toBe(
      false,
    )
    expect(
      isSamePage('/settings/vendors/abc/items', '/settings/vendors/xyz/items'),
    ).toBe(false)
  })

  it('treats different tag IDs as different pages', () => {
    expect(isSamePage('/settings/tags/abc', '/settings/tags/xyz')).toBe(false)
    expect(
      isSamePage('/settings/tags/abc/items', '/settings/tags/xyz/items'),
    ).toBe(false)
  })

  it('treats recipe detail tabs as same page', () => {
    expect(
      isSamePage('/settings/recipes/abc', '/settings/recipes/abc/items'),
    ).toBe(true)
    expect(
      isSamePage('/settings/recipes/abc/items', '/settings/recipes/abc'),
    ).toBe(true)
    expect(isSamePage('/settings/recipes/abc', '/settings/recipes/abc')).toBe(
      true,
    )
  })

  it('treats different recipe IDs as different pages', () => {
    expect(isSamePage('/settings/recipes/abc', '/settings/recipes/xyz')).toBe(
      false,
    )
    expect(
      isSamePage('/settings/recipes/abc/items', '/settings/recipes/xyz/items'),
    ).toBe(false)
  })

  it('treats completely different routes as different pages', () => {
    expect(isSamePage('/', '/shopping')).toBe(false)
    expect(isSamePage('/items/123', '/shopping')).toBe(false)
    expect(isSamePage('/settings/vendors', '/settings/tags')).toBe(false)
  })

  it('does not treat /new pages as same page as detail pages', () => {
    expect(isSamePage('/settings/recipes/new', '/settings/recipes/abc')).toBe(
      false,
    )
    expect(isSamePage('/settings/vendors/new', '/settings/vendors/abc')).toBe(
      false,
    )
  })

  it('treats full URLs with matching pathnames as same page regardless of search params', () => {
    expect(isSamePage('/items/123?tab=tags', '/items/123?tab=vendors')).toBe(
      true,
    )
    expect(
      isSamePage('/settings/vendors/abc?q=foo', '/settings/vendors/abc/items'),
    ).toBe(true)
  })

  it('treats full URLs with different pathnames as different pages', () => {
    expect(isSamePage('/?q=milk', '/shopping?q=milk')).toBe(false)
    expect(isSamePage('/items/123?tab=tags', '/items/456?tab=tags')).toBe(false)
  })
})

describe('useAppNavigation', () => {
  let mockNavigate: ReturnType<typeof vi.fn>
  let mockHistoryPush: ReturnType<typeof vi.fn>
  let mockUseRouter: ReturnType<typeof vi.fn>
  let mockLoadNavigationHistory: ReturnType<typeof vi.fn>
  let mockSaveNavigationHistory: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()

    // Setup mocks
    mockNavigate = vi.fn()
    mockHistoryPush = vi.fn()
    mockLoadNavigationHistory = vi.fn()
    mockSaveNavigationHistory = vi.fn()

    mockUseRouter = vi.fn(() => ({
      history: { push: mockHistoryPush },
      state: {
        location: {
          pathname: '/current-page',
        },
      },
    }))

    // Apply mocks
    const { useNavigate, useRouter } = await import('@tanstack/react-router')
    vi.mocked(useNavigate).mockReturnValue(mockNavigate)
    vi.mocked(useRouter).mockImplementation(mockUseRouter)

    const { loadNavigationHistory, saveNavigationHistory } = await import(
      '@/lib/sessionStorage'
    )
    vi.mocked(loadNavigationHistory).mockImplementation(
      mockLoadNavigationHistory,
    )
    vi.mocked(saveNavigationHistory).mockImplementation(
      mockSaveNavigationHistory,
    )
  })

  it('user can navigate back skipping /new pages in history', () => {
    // Given history has a /new page before the list page
    mockLoadNavigationHistory.mockReturnValue([
      '/settings/recipes',
      '/settings/recipes/new',
    ])
    mockUseRouter.mockReturnValue({
      history: { push: mockHistoryPush },
      state: { location: { pathname: '/settings/recipes/abc' } },
    })

    // When user calls goBack
    const { result } = renderHook(() => useAppNavigation('/settings/recipes'))
    result.current.goBack()

    // Then navigates to the list page using history.push to preserve full URL
    expect(mockHistoryPush).toHaveBeenCalledWith('/settings/recipes')
  })

  it('user can navigate back when only /new pages are in history', () => {
    // Given history only has a /new page
    mockLoadNavigationHistory.mockReturnValue(['/settings/recipes/new'])
    mockUseRouter.mockReturnValue({
      history: { push: mockHistoryPush },
      state: { location: { pathname: '/settings/recipes/abc' } },
    })

    // When user calls goBack with fallback
    const { result } = renderHook(() => useAppNavigation('/settings/recipes'))
    result.current.goBack()

    // Then falls back to the fallback path via navigate (not history.push)
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/recipes' })
    expect(mockHistoryPush).not.toHaveBeenCalled()
  })

  it('user can navigate back when history is empty and fallback provided', () => {
    // Given empty history and a fallback path
    mockLoadNavigationHistory.mockReturnValue([])
    mockUseRouter.mockReturnValue({
      history: { push: mockHistoryPush },
      state: { location: { pathname: '/settings/recipes/abc' } },
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
      state: { location: { pathname: '/settings/recipes/abc' } },
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
