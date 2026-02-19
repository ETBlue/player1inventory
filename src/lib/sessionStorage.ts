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
export type SortField = 'name' | 'stock' | 'purchased' | 'expiring'
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

    const validFields: SortField[] = ['name', 'stock', 'purchased', 'expiring']
    const validDirections: SortDirection[] = ['asc', 'desc']

    const sortBy: SortField =
      parsed.sortBy === 'updatedAt'
        ? 'purchased' // migrate legacy value
        : validFields.includes(parsed.sortBy)
          ? parsed.sortBy
          : 'expiring' // unknown value → default

    const sortDirection: SortDirection = validDirections.includes(
      parsed.sortDirection,
    )
      ? parsed.sortDirection
      : 'asc'

    return { sortBy, sortDirection }
  } catch (error) {
    console.error('Failed to load sort preferences:', error)
    return { sortBy: 'expiring', sortDirection: 'asc' }
  }
}

// Navigation history (sessionStorage)
const NAVIGATION_HISTORY_KEY = 'app-navigation-history'

export function loadNavigationHistory(): string[] {
  try {
    const stored = sessionStorage.getItem(NAVIGATION_HISTORY_KEY)
    if (!stored) return []

    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) {
      return []
    }

    // Validate all elements are strings
    if (!parsed.every((item) => typeof item === 'string')) {
      return []
    }

    return parsed
  } catch (error) {
    console.error(
      'Failed to load navigation history from sessionStorage:',
      error,
    )
    return []
  }
}

export function saveNavigationHistory(history: string[]): void {
  try {
    sessionStorage.setItem(NAVIGATION_HISTORY_KEY, JSON.stringify(history))
  } catch (error) {
    console.error('Failed to save navigation history to sessionStorage:', error)
  }
}

// Shopping page (sessionStorage)
const SHOPPING_FILTERS_KEY = 'shopping-filters'
const SHOPPING_UI_PREFS_KEY = 'shopping-ui-prefs'

export interface ShoppingUiPreferences {
  filtersVisible: boolean
}

export function saveShoppingFilters(filters: FilterState): void {
  try {
    sessionStorage.setItem(SHOPPING_FILTERS_KEY, JSON.stringify(filters))
  } catch (error) {
    console.error('Failed to save shopping filters to sessionStorage:', error)
  }
}

export function loadShoppingFilters(): FilterState {
  try {
    const stored = sessionStorage.getItem(SHOPPING_FILTERS_KEY)
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
    console.error('Failed to load shopping filters from sessionStorage:', error)
    return {}
  }
}

export function saveShoppingUiPrefs(prefs: ShoppingUiPreferences): void {
  try {
    sessionStorage.setItem(SHOPPING_UI_PREFS_KEY, JSON.stringify(prefs))
  } catch (error) {
    console.error('Failed to save shopping UI preferences:', error)
  }
}

export function loadShoppingUiPrefs(): ShoppingUiPreferences {
  try {
    const stored = sessionStorage.getItem(SHOPPING_UI_PREFS_KEY)
    if (!stored) return { filtersVisible: false }
    const parsed = JSON.parse(stored)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { filtersVisible: false }
    }
    return parsed as ShoppingUiPreferences
  } catch (error) {
    console.error('Failed to load shopping UI preferences:', error)
    return { filtersVisible: false }
  }
}
