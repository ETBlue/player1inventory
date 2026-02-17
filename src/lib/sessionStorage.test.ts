// src/lib/sessionStorage.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FilterState } from './filterUtils'
import {
  loadFilters,
  loadSortPrefs,
  loadUiPrefs,
  saveFilters,
  saveSortPrefs,
  saveUiPrefs,
} from './sessionStorage'

describe('sessionStorage utilities', () => {
  const STORAGE_KEY = 'pantry-filters'

  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('saves filter state to sessionStorage', () => {
    const filters: FilterState = {
      'type-1': ['tag-a', 'tag-b'],
      'type-2': ['tag-c'],
    }
    saveFilters(filters)

    const stored = sessionStorage.getItem(STORAGE_KEY)
    expect(stored).toBeDefined()
    if (stored) {
      expect(JSON.parse(stored)).toEqual(filters)
    }
  })

  it('loads filter state from sessionStorage', () => {
    const filters: FilterState = {
      'type-1': ['tag-a'],
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters))

    const loaded = loadFilters()
    expect(loaded).toEqual(filters)
  })

  it('returns empty object when sessionStorage is empty', () => {
    const loaded = loadFilters()
    expect(loaded).toEqual({})
  })

  it('returns empty object when sessionStorage contains invalid JSON', () => {
    sessionStorage.setItem(STORAGE_KEY, 'invalid json')

    const loaded = loadFilters()
    expect(loaded).toEqual({})
  })

  it('returns empty object when sessionStorage contains wrong type', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify('string'))

    const loaded = loadFilters()
    expect(loaded).toEqual({})
  })
})

describe('UI preferences storage', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('saves and loads UI preferences', () => {
    saveUiPrefs({ filtersVisible: true, tagsVisible: false })
    const loaded = loadUiPrefs()
    expect(loaded).toEqual({ filtersVisible: true, tagsVisible: false })
  })

  it('returns defaults when no stored preferences', () => {
    const loaded = loadUiPrefs()
    expect(loaded).toEqual({ filtersVisible: false, tagsVisible: false })
  })

  it('returns defaults when sessionStorage contains invalid data', () => {
    sessionStorage.setItem('pantry-ui-prefs', 'invalid json')
    const loaded = loadUiPrefs()
    expect(loaded).toEqual({ filtersVisible: false, tagsVisible: false })
  })
})

describe('Sort preferences storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saves and loads sort preferences', () => {
    saveSortPrefs({ sortBy: 'name', sortDirection: 'desc' })
    const loaded = loadSortPrefs()
    expect(loaded).toEqual({ sortBy: 'name', sortDirection: 'desc' })
  })

  it('returns defaults when no stored preferences', () => {
    const loaded = loadSortPrefs()
    expect(loaded).toEqual({ sortBy: 'expiring', sortDirection: 'asc' })
  })

  it('returns defaults when localStorage contains invalid data', () => {
    localStorage.setItem('pantry-sort-prefs', 'invalid json')
    const loaded = loadSortPrefs()
    expect(loaded).toEqual({ sortBy: 'expiring', sortDirection: 'asc' })
  })

  it('migrates legacy updatedAt sort field to purchased', () => {
    localStorage.setItem(
      'pantry-sort-prefs',
      JSON.stringify({ sortBy: 'updatedAt', sortDirection: 'desc' }),
    )
    const loaded = loadSortPrefs()
    expect(loaded).toEqual({ sortBy: 'purchased', sortDirection: 'desc' })
  })
})
