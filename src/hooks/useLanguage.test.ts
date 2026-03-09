import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    const { result } = renderHook(() => useLanguage())
    expect(result.current.preference).toBe('auto')
    expect(result.current.language).toBe('en')
  })

  it('reads stored en preference from localStorage', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
    const { result } = renderHook(() => useLanguage())
    expect(result.current.preference).toBe('en')
    expect(result.current.language).toBe('en')
  })

  it('reads stored tw preference from localStorage', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'tw')
    const { result } = renderHook(() => useLanguage())
    expect(result.current.preference).toBe('tw')
    expect(result.current.language).toBe('tw')
  })

  it('detects zh-TW browser language as tw when preference is auto', () => {
    Object.defineProperty(navigator, 'language', {
      value: 'zh-TW',
      configurable: true,
    })
    const { result } = renderHook(() => useLanguage())
    expect(result.current.preference).toBe('auto')
    expect(result.current.language).toBe('tw')
  })

  it('updates language and persists to localStorage when setPreference called with en', () => {
    const { result } = renderHook(() => useLanguage())
    act(() => {
      result.current.setPreference('en')
    })
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
    expect(result.current.preference).toBe('en')
    expect(result.current.language).toBe('en')
  })

  it('clears localStorage when setPreference called with auto', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'tw')
    const { result } = renderHook(() => useLanguage())
    act(() => {
      result.current.setPreference('auto')
    })
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull()
    expect(result.current.preference).toBe('auto')
  })
})
