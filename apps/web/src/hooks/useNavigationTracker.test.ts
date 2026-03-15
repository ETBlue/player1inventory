// src/hooks/useNavigationTracker.test.ts
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNavigationTracker } from './useNavigationTracker'

vi.mock('@/lib/sessionStorage', () => ({
  loadNavigationHistory: vi.fn(),
  saveNavigationHistory: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useRouterState: vi.fn(),
}))

describe('useNavigationTracker', () => {
  let mockLoadNavigationHistory: ReturnType<typeof vi.fn>
  let mockSaveNavigationHistory: ReturnType<typeof vi.fn>
  let mockUseRouterState: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()

    mockLoadNavigationHistory = vi.fn(() => [])
    mockSaveNavigationHistory = vi.fn()
    mockUseRouterState = vi.fn()

    const { loadNavigationHistory, saveNavigationHistory } = await import(
      '@/lib/sessionStorage'
    )
    vi.mocked(loadNavigationHistory).mockImplementation(
      mockLoadNavigationHistory,
    )
    vi.mocked(saveNavigationHistory).mockImplementation(
      mockSaveNavigationHistory,
    )

    const { useRouterState } = await import('@tanstack/react-router')
    vi.mocked(useRouterState).mockImplementation(mockUseRouterState)
  })

  it('records full URL including search params', () => {
    // Given user is on pantry with active filters
    mockUseRouterState.mockReturnValue('/?q=milk&f_tag1=abc')

    // When tracker runs
    renderHook(() => useNavigationTracker())

    // Then saves full URL (not just pathname)
    expect(mockSaveNavigationHistory).toHaveBeenCalledWith([
      '/?q=milk&f_tag1=abc',
    ])
  })

  it('updates last entry in place when same pathname but params change', () => {
    // Given history already has an entry for pantry
    mockLoadNavigationHistory.mockReturnValue(['/?q=milk'])
    mockUseRouterState.mockReturnValue('/?q=cheese')

    // When tracker runs (params changed on same page)
    renderHook(() => useNavigationTracker())

    // Then updates the last entry instead of appending
    expect(mockSaveNavigationHistory).toHaveBeenCalledWith(['/?q=cheese'])
  })

  it('appends new entry when navigating to a different page', () => {
    // Given history has pantry
    mockLoadNavigationHistory.mockReturnValue(['/?q=milk'])
    mockUseRouterState.mockReturnValue('/items/123')

    // When tracker runs (navigated to item detail)
    renderHook(() => useNavigationTracker())

    // Then appends new entry
    expect(mockSaveNavigationHistory).toHaveBeenCalledWith([
      '/?q=milk',
      '/items/123',
    ])
  })

  it('does not duplicate the last entry when URL is unchanged', () => {
    // Given history already has this exact URL
    mockLoadNavigationHistory.mockReturnValue(['/?q=milk'])
    mockUseRouterState.mockReturnValue('/?q=milk')

    // When tracker runs (no navigation occurred)
    renderHook(() => useNavigationTracker())

    // Then does not add a duplicate
    expect(mockSaveNavigationHistory).not.toHaveBeenCalled()
  })
})
