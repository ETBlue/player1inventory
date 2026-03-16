// src/lib/sessionStorage.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadNavigationHistory, saveNavigationHistory } from './sessionStorage'

describe('Navigation History', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('loads empty array when no history exists', () => {
    const history = loadNavigationHistory()
    expect(history).toEqual([])
  })

  it('saves and loads navigation history', () => {
    const history = ['/', '/items/123', '/items/123/tags']

    saveNavigationHistory(history)
    const loaded = loadNavigationHistory()

    expect(loaded).toEqual(history)
  })

  it('overwrites previous history on save', () => {
    saveNavigationHistory(['/', '/items/123'])
    saveNavigationHistory(['/settings'])

    const loaded = loadNavigationHistory()

    expect(loaded).toEqual(['/settings'])
  })

  it('returns empty array when stored data is invalid JSON', () => {
    sessionStorage.setItem('app-navigation-history', 'invalid json')
    const history = loadNavigationHistory()
    expect(history).toEqual([])
  })

  it('returns empty array when stored data is not an array', () => {
    sessionStorage.setItem(
      'app-navigation-history',
      JSON.stringify({ foo: 'bar' }),
    )
    const history = loadNavigationHistory()
    expect(history).toEqual([])
  })

  it('returns empty array when array contains non-strings', () => {
    sessionStorage.setItem(
      'app-navigation-history',
      JSON.stringify(['/', 123, '/items']),
    )
    const history = loadNavigationHistory()
    expect(history).toEqual([])
  })
})
