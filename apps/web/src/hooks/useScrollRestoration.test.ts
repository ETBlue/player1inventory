// src/hooks/useScrollRestoration.test.ts
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useScrollRestoration } from './useScrollRestoration'

describe('useScrollRestoration', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    Object.defineProperty(window, 'scrollY', {
      writable: true,
      configurable: true,
      value: 0,
    })
  })

  it('restoreScroll scrolls to saved position', () => {
    // Given a saved scroll position for this URL
    sessionStorage.setItem('scroll-pos:/?q=milk', '350')

    // When hook mounts and restoreScroll is called
    const { result } = renderHook(() => useScrollRestoration('/?q=milk'))

    act(() => {
      result.current.restoreScroll()
    })

    // Then scrollTo is called with saved position
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 350,
      behavior: 'instant',
    })
  })

  it('restoreScroll does nothing when no saved position', () => {
    // Given no saved scroll position
    const { result } = renderHook(() => useScrollRestoration('/'))

    act(() => {
      result.current.restoreScroll()
    })

    // Then scrollTo is NOT called
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('saves scrollY to sessionStorage on unmount', () => {
    // Given scroll position is at 200
    Object.defineProperty(window, 'scrollY', { value: 200 })

    // When hook mounts then unmounts
    const { unmount } = renderHook(() => useScrollRestoration('/?q=milk'))
    unmount()

    // Then scrollY is saved to sessionStorage
    expect(sessionStorage.getItem('scroll-pos:/?q=milk')).toBe('200')
  })

  it('uses separate storage slots for different keys', () => {
    // Given saved positions for two different pages
    sessionStorage.setItem('scroll-pos:/', '100')
    sessionStorage.setItem('scroll-pos:/shopping', '500')

    // When restoring for pantry
    const { result } = renderHook(() => useScrollRestoration('/'))
    act(() => {
      result.current.restoreScroll()
    })

    // Then scrolls to pantry position, not shopping position
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 100,
      behavior: 'instant',
    })
  })
})
