// src/lib/sessionStorage.ts
import type { FilterState } from './filterUtils'

const STORAGE_KEY = 'pantry-filters'
const UI_PREFS_KEY = 'pantry-ui-prefs'
const SORT_PREFS_KEY = 'pantry-sort-prefs'

export function saveFilters(filters: FilterState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  } catch (error) {
    console.error('Failed to save filters to sessionStorage:', error)
  }
}

export function loadFilters(): FilterState {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
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
    console.error('Failed to load filters from sessionStorage:', error)
    return {}
  }
}

// UI preferences (sessionStorage)
export interface UiPreferences {
  filtersVisible: boolean
  tagsVisible: boolean
}

export function saveUiPrefs(prefs: UiPreferences): void {
  try {
    sessionStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs))
  } catch (error) {
    console.error('Failed to save UI preferences:', error)
  }
}

export function loadUiPrefs(): UiPreferences {
  try {
    const stored = sessionStorage.getItem(UI_PREFS_KEY)
    if (!stored) return { filtersVisible: false, tagsVisible: false }

    const parsed = JSON.parse(stored)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { filtersVisible: false, tagsVisible: false }
    }

    return parsed as UiPreferences
  } catch (error) {
    console.error('Failed to load UI preferences:', error)
    return { filtersVisible: false, tagsVisible: false }
  }
}

// Sort preferences (localStorage)
export type SortField =
  | 'name'
  | 'quantity'
  | 'status'
  | 'updatedAt'
  | 'expiring'
export type SortDirection = 'asc' | 'desc'

export interface SortPreferences {
  sortBy: SortField
  sortDirection: SortDirection
}

export function saveSortPrefs(prefs: SortPreferences): void {
  try {
    localStorage.setItem(SORT_PREFS_KEY, JSON.stringify(prefs))
  } catch (error) {
    console.error('Failed to save sort preferences:', error)
  }
}

export function loadSortPrefs(): SortPreferences {
  try {
    const stored = localStorage.getItem(SORT_PREFS_KEY)
    if (!stored) return { sortBy: 'expiring', sortDirection: 'asc' }

    const parsed = JSON.parse(stored)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { sortBy: 'expiring', sortDirection: 'asc' }
    }

    return parsed as SortPreferences
  } catch (error) {
    console.error('Failed to load sort preferences:', error)
    return { sortBy: 'expiring', sortDirection: 'asc' }
  }
}
