// src/lib/sessionStorage.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FilterState } from './filterUtils'
import { loadFilters, saveFilters } from './sessionStorage'

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
    expect(JSON.parse(stored!)).toEqual(filters)
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
