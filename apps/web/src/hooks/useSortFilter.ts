import { useEffect, useState } from 'react'
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

  return {
    sortBy,
    sortDirection,
    setSortBy,
    setSortDirection,
  }
}
