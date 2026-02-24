import { useEffect, useState } from 'react'
import type { FilterState } from '@/lib/filterUtils'
import type { SortDirection, SortField } from '@/lib/sortUtils'

function loadSortPrefs(storageKey: string): {
  sortBy: SortField
  sortDirection: SortDirection
} {
  try {
    const stored = localStorage.getItem(`${storageKey}-sort-prefs`)
    // Default to 'name' for assignment pages (tag, vendor, recipe items tabs, shopping).
    // Pantry page defaults to 'expiring' — it has its own persistence in sessionStorage.ts.
    if (!stored) return { sortBy: 'name', sortDirection: 'asc' }
    const parsed = JSON.parse(stored)
    const validFields: SortField[] = ['name', 'stock', 'purchased', 'expiring']
    const validDirections: SortDirection[] = ['asc', 'desc']
    const sortBy: SortField = validFields.includes(parsed.sortBy)
      ? parsed.sortBy
      : 'name'
    const sortDirection: SortDirection = validDirections.includes(
      parsed.sortDirection,
    )
      ? parsed.sortDirection
      : 'asc'
    return { sortBy, sortDirection }
  } catch (error) {
    console.error('Failed to load sort prefs from localStorage:', error)
    return { sortBy: 'name', sortDirection: 'asc' }
  }
}

function loadFilterState(storageKey: string): FilterState {
  try {
    const stored = sessionStorage.getItem(`${storageKey}-filters`)
    if (!stored) return {}
    const parsed = JSON.parse(stored)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {}
    }
    return parsed as FilterState
  } catch (error) {
    console.error('Failed to load filter state from sessionStorage:', error)
    return {}
  }
}

interface UiPrefs {
  filtersVisible: boolean
  tagsVisible: boolean
}

function loadUiPrefs(storageKey: string): UiPrefs {
  try {
    const stored = sessionStorage.getItem(`${storageKey}-ui-prefs`)
    if (!stored) return { filtersVisible: false, tagsVisible: false }
    const parsed = JSON.parse(stored)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { filtersVisible: false, tagsVisible: false }
    }
    return parsed as UiPrefs
  } catch (error) {
    console.error('Failed to load UI prefs from sessionStorage:', error)
    return { filtersVisible: false, tagsVisible: false }
  }
}

export function useSortFilter(storageKey: string) {
  const [sortPrefs, setSortPrefsState] = useState(() =>
    loadSortPrefs(storageKey),
  )
  const sortBy = sortPrefs.sortBy
  const sortDirection = sortPrefs.sortDirection
  const setSortBy = (field: SortField) =>
    setSortPrefsState((prev) => ({ ...prev, sortBy: field }))
  const setSortDirection = (dir: SortDirection) =>
    setSortPrefsState((prev) => ({ ...prev, sortDirection: dir }))
  const [filterState, setFilterState] = useState<FilterState>(() =>
    loadFilterState(storageKey),
  )
  const [filtersVisible, setFiltersVisible] = useState(
    () => loadUiPrefs(storageKey).filtersVisible,
  )
  const [tagsVisible, setTagsVisible] = useState(
    () => loadUiPrefs(storageKey).tagsVisible,
  )

  useEffect(() => {
    try {
      localStorage.setItem(
        `${storageKey}-sort-prefs`,
        JSON.stringify({ sortBy, sortDirection }),
      )
    } catch (error) {
      console.error('Failed to save sort prefs:', error)
    }
  }, [storageKey, sortBy, sortDirection])

  useEffect(() => {
    try {
      sessionStorage.setItem(
        `${storageKey}-filters`,
        JSON.stringify(filterState),
      )
    } catch (error) {
      console.error('Failed to save filter state:', error)
    }
  }, [storageKey, filterState])

  useEffect(() => {
    try {
      sessionStorage.setItem(
        `${storageKey}-ui-prefs`,
        JSON.stringify({ filtersVisible, tagsVisible }),
      )
    } catch (error) {
      console.error('Failed to save UI prefs:', error)
    }
  }, [storageKey, filtersVisible, tagsVisible])

  return {
    sortBy,
    sortDirection,
    setSortBy,
    setSortDirection,
    filterState,
    setFilterState,
    filtersVisible,
    setFiltersVisible,
    tagsVisible,
    setTagsVisible,
  }
}
