// src/hooks/useUrlSearchAndFilters.test.ts

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadSearchPrefs,
  useUrlSearchAndFilters,
} from './useUrlSearchAndFilters'

// Mock TanStack Router
vi.mock('@tanstack/react-router', () => ({
  useRouter: vi.fn(),
  useRouterState: vi.fn(),
}))

describe('useUrlSearchAndFilters', () => {
  let mockHistoryReplace: ReturnType<typeof vi.fn>
  let mockRouterState: {
    location: { search: string; pathname: string }
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    sessionStorage.clear()

    mockHistoryReplace = vi.fn()
    mockRouterState = {
      location: { search: '', pathname: '/' },
    }

    const { useRouter, useRouterState } = await import('@tanstack/react-router')

    vi.mocked(useRouter).mockReturnValue({
      state: mockRouterState,
      history: { replace: mockHistoryReplace },
    } as ReturnType<typeof useRouter>)

    vi.mocked(useRouterState).mockImplementation(
      ({ select }: { select: (s: typeof mockRouterState) => string }) =>
        select(mockRouterState),
    )
  })

  it('returns empty defaults when URL has no params', () => {
    // Given no URL params
    const { result } = renderHook(() => useUrlSearchAndFilters())

    // Then defaults are empty
    expect(result.current.search).toBe('')
    expect(result.current.filterState).toEqual({})
    expect(result.current.isFiltersVisible).toBe(false)
    expect(result.current.isTagsVisible).toBe(false)
  })

  it('reads search query from URL', () => {
    // Given ?q=apple in the URL
    mockRouterState.location.search = '?q=apple'

    const { result } = renderHook(() => useUrlSearchAndFilters())

    expect(result.current.search).toBe('apple')
  })

  it('reads isFiltersVisible from URL', () => {
    // Given ?filters=1 in the URL
    mockRouterState.location.search = '?filters=1'

    const { result } = renderHook(() => useUrlSearchAndFilters())

    expect(result.current.isFiltersVisible).toBe(true)
  })

  it('reads isTagsVisible from URL', () => {
    // Given ?tags=1 in the URL
    mockRouterState.location.search = '?tags=1'

    const { result } = renderHook(() => useUrlSearchAndFilters())

    expect(result.current.isTagsVisible).toBe(true)
  })

  it('reads filterState from URL', () => {
    // Given ?f_type-1=tag-a,tag-b in the URL
    mockRouterState.location.search = '?f_type-1=tag-a%2Ctag-b'

    const { result } = renderHook(() => useUrlSearchAndFilters())

    expect(result.current.filterState).toEqual({
      'type-1': ['tag-a', 'tag-b'],
    })
  })

  it('reads multiple filter params from URL', () => {
    // Given multiple filter params
    mockRouterState.location.search = '?f_type-1=tag-a&f_type-2=tag-c'

    const { result } = renderHook(() => useUrlSearchAndFilters())

    expect(result.current.filterState).toEqual({
      'type-1': ['tag-a'],
      'type-2': ['tag-c'],
    })
  })

  it('setSearch updates URL and saves to sessionStorage', () => {
    // Given no URL params
    const { result } = renderHook(() => useUrlSearchAndFilters())

    // When setSearch is called
    act(() => {
      result.current.setSearch('apple')
    })

    // Then URL is updated
    expect(mockHistoryReplace).toHaveBeenCalledWith('/?q=apple')

    // And sessionStorage is updated
    expect(loadSearchPrefs()).toBe('q=apple')
  })

  it('setSearch removes q param when empty', () => {
    // Given ?q=apple in the URL
    mockRouterState.location.search = '?q=apple'

    const { result } = renderHook(() => useUrlSearchAndFilters())

    // When setSearch is called with empty string
    act(() => {
      result.current.setSearch('')
    })

    // Then URL param is removed
    expect(mockHistoryReplace).toHaveBeenCalledWith('/')
  })

  it('setFilterState updates URL with filter params', () => {
    // Given no URL params
    const { result } = renderHook(() => useUrlSearchAndFilters())

    // When setFilterState is called
    act(() => {
      result.current.setFilterState({
        'type-1': ['tag-a', 'tag-b'],
      })
    })

    // Then URL includes filter params
    expect(mockHistoryReplace).toHaveBeenCalledWith(
      expect.stringContaining('f_type-1='),
    )
    // And sessionStorage is updated
    expect(loadSearchPrefs()).toContain('f_type-1=')
  })

  it('setFilterState replaces existing filter params', () => {
    // Given ?f_type-1=tag-a in the URL
    mockRouterState.location.search = '?f_type-1=tag-a'

    const { result } = renderHook(() => useUrlSearchAndFilters())

    // When setFilterState is called with new state
    act(() => {
      result.current.setFilterState({ 'type-2': ['tag-c'] })
    })

    const callArg: string = mockHistoryReplace.mock.calls[0][0]
    // Old param is removed, new param is added
    expect(callArg).not.toContain('f_type-1')
    expect(callArg).toContain('f_type-2')
  })

  it('setFilterState removes filter params when state is empty', () => {
    // Given filter params in URL
    mockRouterState.location.search = '?f_type-1=tag-a'

    const { result } = renderHook(() => useUrlSearchAndFilters())

    // When setFilterState is called with empty state
    act(() => {
      result.current.setFilterState({})
    })

    expect(mockHistoryReplace).toHaveBeenCalledWith('/')
  })

  it('setIsFiltersVisible adds filters param', () => {
    const { result } = renderHook(() => useUrlSearchAndFilters())

    act(() => {
      result.current.setIsFiltersVisible(true)
    })

    expect(mockHistoryReplace).toHaveBeenCalledWith('/?filters=1')
  })

  it('setIsFiltersVisible removes filters param when false', () => {
    mockRouterState.location.search = '?filters=1'

    const { result } = renderHook(() => useUrlSearchAndFilters())

    act(() => {
      result.current.setIsFiltersVisible(false)
    })

    expect(mockHistoryReplace).toHaveBeenCalledWith('/')
  })

  it('setIsTagsVisible adds tags param', () => {
    const { result } = renderHook(() => useUrlSearchAndFilters())

    act(() => {
      result.current.setIsTagsVisible(true)
    })

    expect(mockHistoryReplace).toHaveBeenCalledWith('/?tags=1')
  })

  it('setIsTagsVisible removes tags param when false', () => {
    mockRouterState.location.search = '?tags=1'

    const { result } = renderHook(() => useUrlSearchAndFilters())

    act(() => {
      result.current.setIsTagsVisible(false)
    })

    expect(mockHistoryReplace).toHaveBeenCalledWith('/')
  })

  it('preserves existing URL params when updating one param', () => {
    // Given ?q=apple&filters=1 in the URL
    mockRouterState.location.search = '?q=apple&filters=1'

    const { result } = renderHook(() => useUrlSearchAndFilters())

    // When tags param is added
    act(() => {
      result.current.setIsTagsVisible(true)
    })

    const callArg: string = mockHistoryReplace.mock.calls[0][0]
    // Both existing params and new param are present
    expect(callArg).toContain('q=apple')
    expect(callArg).toContain('filters=1')
    expect(callArg).toContain('tags=1')
  })

  it('seeds URL from sessionStorage on mount when URL has no params', () => {
    // Given sessionStorage has stored prefs
    sessionStorage.setItem('item-list-search-prefs', 'q=apple&filters=1')

    // And URL has no params (already set in beforeEach)
    const { result } = renderHook(() => useUrlSearchAndFilters())

    // Verify hook renders without error
    expect(result.current).toBeDefined()

    // Then URL is seeded from sessionStorage
    expect(mockHistoryReplace).toHaveBeenCalledWith('/?q=apple&filters=1')
  })

  it('does not seed from sessionStorage when URL already has params', () => {
    // Given sessionStorage has stored prefs
    sessionStorage.setItem('item-list-search-prefs', 'q=old')

    // And URL already has params
    mockRouterState.location.search = '?q=new'

    const { result } = renderHook(() => useUrlSearchAndFilters())

    // Verify hook renders
    expect(result.current.search).toBe('new')

    // Then URL is NOT overwritten from sessionStorage
    expect(mockHistoryReplace).not.toHaveBeenCalled()
  })

  it('does not seed when sessionStorage is empty', () => {
    // Given no stored prefs
    // And URL has no params

    const { result } = renderHook(() => useUrlSearchAndFilters())

    expect(result.current.search).toBe('')
    // Then URL is not modified
    expect(mockHistoryReplace).not.toHaveBeenCalled()
  })

  it('selectedVendorIds reads from ?f_vendor= param', () => {
    mockRouterState.location.search = '?f_vendor=v1%2Cv2'
    const { result } = renderHook(() => useUrlSearchAndFilters())
    expect(result.current.selectedVendorIds).toEqual(['v1', 'v2'])
  })

  it('selectedVendorIds is empty when no f_vendor param', () => {
    const { result } = renderHook(() => useUrlSearchAndFilters())
    expect(result.current.selectedVendorIds).toEqual([])
  })

  it('filterState does NOT include vendor key', () => {
    mockRouterState.location.search = '?f_vendor=v1&f_type-1=tag-a'
    const { result } = renderHook(() => useUrlSearchAndFilters())
    expect(result.current.filterState).toEqual({ 'type-1': ['tag-a'] })
    expect(result.current.filterState.vendor).toBeUndefined()
  })

  it('selectedRecipeIds reads from ?f_recipe= param', () => {
    mockRouterState.location.search = '?f_recipe=r1'
    const { result } = renderHook(() => useUrlSearchAndFilters())
    expect(result.current.selectedRecipeIds).toEqual(['r1'])
  })

  it('filterState does NOT include recipe key', () => {
    mockRouterState.location.search = '?f_recipe=r1&f_type-1=tag-a'
    const { result } = renderHook(() => useUrlSearchAndFilters())
    expect(result.current.filterState).toEqual({ 'type-1': ['tag-a'] })
    expect(result.current.filterState.recipe).toBeUndefined()
  })

  it('toggleVendorId adds vendor to f_vendor param', () => {
    const { result } = renderHook(() => useUrlSearchAndFilters())
    act(() => {
      result.current.toggleVendorId('v1')
    })
    expect(mockHistoryReplace).toHaveBeenCalledWith(
      expect.stringContaining('f_vendor=v1'),
    )
  })

  it('toggleVendorId removes vendor when already selected', () => {
    mockRouterState.location.search = '?f_vendor=v1%2Cv2'
    const { result } = renderHook(() => useUrlSearchAndFilters())
    act(() => {
      result.current.toggleVendorId('v1')
    })
    const callArg: string = mockHistoryReplace.mock.calls[0][0]
    expect(callArg).not.toContain('v1')
    expect(callArg).toContain('v2')
  })

  it('toggleVendorId removes f_vendor param when last vendor deselected', () => {
    mockRouterState.location.search = '?f_vendor=v1'
    const { result } = renderHook(() => useUrlSearchAndFilters())
    act(() => {
      result.current.toggleVendorId('v1')
    })
    expect(mockHistoryReplace).toHaveBeenCalledWith('/')
  })

  it('clearVendorIds removes f_vendor param', () => {
    mockRouterState.location.search = '?f_vendor=v1%2Cv2'
    const { result } = renderHook(() => useUrlSearchAndFilters())
    act(() => {
      result.current.clearVendorIds()
    })
    expect(mockHistoryReplace).toHaveBeenCalledWith('/')
  })

  it('toggleRecipeId adds recipe to f_recipe param', () => {
    const { result } = renderHook(() => useUrlSearchAndFilters())
    act(() => {
      result.current.toggleRecipeId('r1')
    })
    expect(mockHistoryReplace).toHaveBeenCalledWith(
      expect.stringContaining('f_recipe=r1'),
    )
  })

  it('clearRecipeIds removes f_recipe param', () => {
    mockRouterState.location.search = '?f_recipe=r1'
    const { result } = renderHook(() => useUrlSearchAndFilters())
    act(() => {
      result.current.clearRecipeIds()
    })
    expect(mockHistoryReplace).toHaveBeenCalledWith('/')
  })
})

describe('loadSearchPrefs', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('returns empty string when nothing stored', () => {
    expect(loadSearchPrefs()).toBe('')
  })

  it('returns stored string', () => {
    sessionStorage.setItem('item-list-search-prefs', 'q=apple')
    expect(loadSearchPrefs()).toBe('q=apple')
  })
})
