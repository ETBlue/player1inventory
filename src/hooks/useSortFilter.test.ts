import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useSortFilter } from './useSortFilter'

describe('useSortFilter', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('user can see default sort state on first use', () => {
    // Given no preferences have been saved
    // When the hook initializes
    const { result } = renderHook(() => useSortFilter('test'))

    // Then sort values are at their defaults
    expect(result.current.sortBy).toBe('name')
    expect(result.current.sortDirection).toBe('asc')
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
