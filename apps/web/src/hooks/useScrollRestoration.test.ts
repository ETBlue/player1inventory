// src/hooks/useScrollRestoration.test.ts
import { act, renderHook } from '@testing-library/react'
import { createRef, type RefObject } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useScrollRestoration } from './useScrollRestoration'

// Build a ref to a mock scroll container with a writable scrollTop and a
// spy-able scrollTo (jsdom does not implement Element.prototype.scrollTo).
function makeScrollRef(scrollTop = 0): RefObject<HTMLElement | null> {
  const el = document.createElement('div')
  Object.defineProperty(el, 'scrollTop', {
    writable: true,
    configurable: true,
    value: scrollTop,
  })
  el.scrollTo = vi.fn() as unknown as typeof el.scrollTo
  const ref = createRef<HTMLElement>()
  ref.current = el
  return ref
}

describe('useScrollRestoration', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('restoreScroll scrolls the container to saved position', () => {
    // Given a saved scroll position for this URL
    sessionStorage.setItem('scroll-pos:/?q=milk', '350')
    const scrollRef = makeScrollRef()

    // When hook mounts and restoreScroll is called
    const { result } = renderHook(() =>
      useScrollRestoration('/?q=milk', scrollRef),
    )

    act(() => {
      result.current.restoreScroll()
    })

    // Then the container's scrollTo is called with the saved position
    expect(scrollRef.current?.scrollTo).toHaveBeenCalledWith({
      top: 350,
      behavior: 'instant',
    })
  })

  it('restoreScroll does nothing when no saved position', () => {
    // Given no saved scroll position
    const scrollRef = makeScrollRef()
    const { result } = renderHook(() => useScrollRestoration('/', scrollRef))

    act(() => {
      result.current.restoreScroll()
    })

    // Then scrollTo is NOT called
    expect(scrollRef.current?.scrollTo).not.toHaveBeenCalled()
  })

  it('saves container scrollTop to sessionStorage on unmount', () => {
    // Given the container is scrolled to 200
    const scrollRef = makeScrollRef(200)

    // When hook mounts then unmounts
    const { unmount } = renderHook(() =>
      useScrollRestoration('/?q=milk', scrollRef),
    )
    unmount()

    // Then scrollTop is saved to sessionStorage
    expect(sessionStorage.getItem('scroll-pos:/?q=milk')).toBe('200')
  })

  it('uses separate storage slots for different keys', () => {
    // Given saved positions for two different pages
    sessionStorage.setItem('scroll-pos:/', '100')
    sessionStorage.setItem('scroll-pos:/shopping', '500')
    const scrollRef = makeScrollRef()

    // When restoring for pantry
    const { result } = renderHook(() => useScrollRestoration('/', scrollRef))
    act(() => {
      result.current.restoreScroll()
    })

    // Then scrolls to pantry position, not shopping position
    expect(scrollRef.current?.scrollTo).toHaveBeenCalledWith({
      top: 100,
      behavior: 'instant',
    })
  })

  it('does not throw when the scroll ref is not attached', () => {
    // Given a ref that is not attached to any element and no saved position
    const scrollRef = createRef<HTMLElement>()

    // When the hook mounts and restoreScroll is called, then unmounts
    const { result, unmount } = renderHook(() =>
      useScrollRestoration('/', scrollRef),
    )

    // Then no error is thrown (render-phase capture defaults to 0)
    expect(() =>
      act(() => {
        result.current.restoreScroll()
      }),
    ).not.toThrow()
    expect(() => unmount()).not.toThrow()
    // And a default of 0 is saved on unmount (no element to read scrollTop from)
    expect(sessionStorage.getItem('scroll-pos:/')).toBe('0')
  })
})
