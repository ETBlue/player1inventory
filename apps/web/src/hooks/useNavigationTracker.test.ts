// src/hooks/useNavigationTracker.test.ts
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNavigationTracker } from './useNavigationTracker'

// `vi.mock` factories are hoisted above every import, so the mocks they hand
// out have to be created in a `vi.hoisted` block. Each one carries its REAL
// implementation signature; a bare `vi.fn()` is `Mock<Procedure |
// Constructable>` and matches nothing.
//
// `useRouterState` is stubbed as `() => string`, NOT with its real signature.
// The hook calls it with a `select` callback and reads a string back
// (`useNavigationTracker.ts:16-22`), so the string is what each test supplies.
// `vi.mocked(useRouterState)` is deliberately not used — that would demand the
// real `RouterState` return type and no string could be given.
//
// The cost of that, said plainly: the `select` callback is never invoked by any
// test in this file, so the `searchStr` vs `search` rule its comment describes
// is unproven here. That was already true before the stub was typed.
const mocks = vi.hoisted(() => ({
  loadNavigationHistory: vi.fn<() => string[]>(),
  saveNavigationHistory: vi.fn<(history: string[]) => void>(),
  useRouterState: vi.fn<() => string>(),
}))

vi.mock('@/lib/sessionStorage', () => ({
  loadNavigationHistory: mocks.loadNavigationHistory,
  saveNavigationHistory: mocks.saveNavigationHistory,
}))

vi.mock('@tanstack/react-router', () => ({
  useRouterState: mocks.useRouterState,
}))

describe('useNavigationTracker', () => {
  const mockLoadNavigationHistory = mocks.loadNavigationHistory
  const mockSaveNavigationHistory = mocks.saveNavigationHistory
  const mockUseRouterState = mocks.useRouterState

  beforeEach(() => {
    // `clearAllMocks` drops call records but KEEPS a `mockReturnValue` set by a
    // previous test, so the empty-history default is re-armed here.
    vi.clearAllMocks()
    mockLoadNavigationHistory.mockReturnValue([])
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
