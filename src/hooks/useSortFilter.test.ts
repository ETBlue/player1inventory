import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useSortFilter } from './useSortFilter'

describe('useSortFilter', () => {
  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('user can see default sort and filter state on first use', () => {
    // Given no preferences have been saved
    // When the hook initializes
    const { result } = renderHook(() => useSortFilter('test'))

    // Then all values are at their defaults
    expect(result.current.sortBy).toBe('name')
    expect(result.current.sortDirection).toBe('asc')
    expect(result.current.filterState).toEqual({})
    expect(result.current.filtersVisible).toBe(false)
    expect(result.current.tagsVisible).toBe(false)
  })

  it('user can change sort and have it persisted to localStorage', () => {
    // Given the hook is initialized with no existing prefs
    const { result } = renderHook(() => useSortFilter('test'))

    // When the user changes sort field and direction
    act(() => {
      result.current.setSortBy('stock')
    })
    act(() => {
      result.current.setSortDirection('desc')
    })

    // Then the new values are written to localStorage
    const stored = JSON.parse(localStorage.getItem('test-sort-prefs') ?? '{}')
    expect(stored.sortBy).toBe('stock')
    expect(stored.sortDirection).toBe('desc')
  })

  it('user can apply filters and have them persisted to sessionStorage', () => {
    // Given the hook is initialized with no existing filter state
    const { result } = renderHook(() => useSortFilter('test'))

    // When the user sets a filter
    act(() => {
      result.current.setFilterState({ 'type-1': ['tag-a'] })
    })

    // Then the filter is written to sessionStorage
    const stored = JSON.parse(sessionStorage.getItem('test-filters') ?? '{}')
    expect(stored).toEqual({ 'type-1': ['tag-a'] })
  })

  it('user can toggle UI visibility prefs and have them persisted to sessionStorage', () => {
    // Given the hook is initialized with no existing UI prefs
    const { result } = renderHook(() => useSortFilter('test'))

    // When the user toggles filters and tags visibility
    act(() => {
      result.current.setFiltersVisible(true)
    })
    act(() => {
      result.current.setTagsVisible(true)
    })

    // Then the UI prefs are written to sessionStorage
    const stored = JSON.parse(sessionStorage.getItem('test-ui-prefs') ?? '{}')
    expect(stored.filtersVisible).toBe(true)
    expect(stored.tagsVisible).toBe(true)
  })

  it('user can return to a page and see previously saved sort prefs restored', () => {
    // Given sort prefs were previously saved to localStorage
    localStorage.setItem(
      'test-sort-prefs',
      JSON.stringify({ sortBy: 'expiring', sortDirection: 'desc' }),
    )

    // When the hook initializes
    const { result } = renderHook(() => useSortFilter('test'))

    // Then the persisted sort values are loaded
    expect(result.current.sortBy).toBe('expiring')
    expect(result.current.sortDirection).toBe('desc')
  })

  it('user can return to a page and see previously saved filter state restored', () => {
    // Given a filter was previously saved to sessionStorage
    sessionStorage.setItem(
      'test-filters',
      JSON.stringify({ 'type-1': ['tag-a'] }),
    )

    // When the hook initializes
    const { result } = renderHook(() => useSortFilter('test'))

    // Then the persisted filter state is loaded
    expect(result.current.filterState).toEqual({ 'type-1': ['tag-a'] })
  })

  it('user can use two pages at once without their sort prefs interfering', () => {
    // Given page-a has a custom sort saved, and page-b has nothing saved
    localStorage.setItem(
      'page-a-sort-prefs',
      JSON.stringify({ sortBy: 'stock', sortDirection: 'desc' }),
    )

    // When both hooks initialize
    const { result: resultA } = renderHook(() => useSortFilter('page-a'))
    const { result: resultB } = renderHook(() => useSortFilter('page-b'))

    // Then each page has its own independent state
    expect(resultA.current.sortBy).toBe('stock')
    expect(resultB.current.sortBy).toBe('name') // default, no data for page-b
  })
})
