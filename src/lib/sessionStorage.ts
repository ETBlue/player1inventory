// src/lib/sessionStorage.ts
import type { FilterState } from './filterUtils'

const STORAGE_KEY = 'pantry-filters'

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
