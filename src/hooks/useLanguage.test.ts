import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { LANGUAGE_STORAGE_KEY } from '@/lib/language'
import { useLanguage } from './useLanguage'

vi.mock('@/i18n', () => ({
  default: {
    changeLanguage: vi.fn(),
    language: 'en',
  },
}))

describe('useLanguage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'language', {
      value: 'en-US',
      configurable: true,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('defaults to auto preference when no stored preference', () => {
    // Given no stored preference in localStorage

    // When hook initializes
    const { result } = renderHook(() => useLanguage())

    // Then preference is auto and language resolves from browser
    expect(result.current.preference).toBe('auto')
    expect(result.current.language).toBe('en')
  })

  it('reads stored en preference from localStorage', () => {
    // Given en preference is stored in localStorage
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')

    // When hook initializes
    const { result } = renderHook(() => useLanguage())

    // Then preference and language are both en
    expect(result.current.preference).toBe('en')
    expect(result.current.language).toBe('en')
  })

  it('reads stored tw preference from localStorage', () => {
    // Given tw preference is stored in localStorage
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'tw')

    // When hook initializes
    const { result } = renderHook(() => useLanguage())

    // Then preference and language are both tw
    expect(result.current.preference).toBe('tw')
    expect(result.current.language).toBe('tw')
  })

  it('detects zh-TW browser language as tw when preference is auto', () => {
    // Given browser language is zh-TW and no stored preference
    Object.defineProperty(navigator, 'language', {
      value: 'zh-TW',
      configurable: true,
    })

    // When hook initializes
    const { result } = renderHook(() => useLanguage())

    // Then preference is auto and language resolves to tw
    expect(result.current.preference).toBe('auto')
    expect(result.current.language).toBe('tw')
  })

  it('calls i18n.changeLanguage with resolved language on mount', () => {
    // Given localStorage has tw preference
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'tw')

    // When hook initializes
    renderHook(() => useLanguage())

    // Then i18n.changeLanguage is called with tw
    expect(i18n.changeLanguage).toHaveBeenCalledWith('tw')
  })

  it('updates language and persists to localStorage when setPreference called with en', () => {
    // Given hook is initialized with no stored preference
    const { result } = renderHook(() => useLanguage())

    // When setPreference is called with en
    act(() => {
      result.current.setPreference('en')
    })

    // Then localStorage is updated, preference and language reflect en
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
    expect(result.current.preference).toBe('en')
    expect(result.current.language).toBe('en')
    expect(i18n.changeLanguage).toHaveBeenCalledWith('en')
  })

  it('clears localStorage when setPreference called with auto', () => {
    // Given tw preference is stored in localStorage
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'tw')
    const { result } = renderHook(() => useLanguage())

    // When setPreference is called with auto
    act(() => {
      result.current.setPreference('auto')
    })

    // Then localStorage entry is removed and preference is auto
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull()
    expect(result.current.preference).toBe('auto')
  })
})
