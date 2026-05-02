// src/hooks/useScrollRestoration.test.ts
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useScrollRestoration } from './useScrollRestoration'

// The hook targets <main id="main-content"> when present, falling back to
// document.documentElement. In this test environment, we insert a main element
// so the hook targets it directly.

describe('useScrollRestoration', () => {
  let mainEl: HTMLElement

  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()

    // Insert a <main id="main-content"> into the document so the hook can target it
    mainEl = document.createElement('main')
    mainEl.id = 'main-content'
    document.body.appendChild(mainEl)

    // Define scrollTo and scrollTop on the element
    mainEl.scrollTo = vi.fn()
    Object.defineProperty(mainEl, 'scrollTop', {
      writable: true,
      configurable: true,
      value: 0,
    })
  })

  afterEach(() => {
    // Remove the inserted element to avoid leaking between tests
    mainEl.remove()
  })

  it('restoreScroll scrolls to saved position', () => {
    // Given a saved scroll position for this URL
    sessionStorage.setItem('scroll-pos:/?q=milk', '350')

    // When hook mounts and restoreScroll is called
    const { result } = renderHook(() => useScrollRestoration('/?q=milk'))

    act(() => {
      result.current.restoreScroll()
    })

    // Then scrollTo is called with saved position on the scroll container
    expect(mainEl.scrollTo).toHaveBeenCalledWith({
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
    expect(mainEl.scrollTo).not.toHaveBeenCalled()
  })

  it('saves scrollTop to sessionStorage on unmount', () => {
    // Given scroll position is at 200
    Object.defineProperty(mainEl, 'scrollTop', {
      value: 200,
      configurable: true,
    })

    // When hook mounts then unmounts
    const { unmount } = renderHook(() => useScrollRestoration('/?q=milk'))
    unmount()

    // Then scrollTop is saved to sessionStorage
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
    expect(mainEl.scrollTo).toHaveBeenCalledWith({
      top: 100,
      behavior: 'instant',
    })
  })
})
