import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DESKTOP_MEDIA_QUERY, useIsDesktop } from './useIsDesktop'

type Listener = (event: MediaQueryListEvent) => void

// A matchMedia stand-in that remembers its listeners, so a test can fire a
// real `change` event. setup.ts mocks matchMedia as always `matches: false`
// with listener functions that do nothing.
function mockMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>()
  const mql = {
    matches: initial,
    media: '',
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: Listener) => {
      listeners.add(listener)
    }),
    removeEventListener: vi.fn((_type: string, listener: Listener) => {
      listeners.delete(listener)
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
  const matchMedia = vi.fn((query: string) => {
    mql.media = query
    return mql
  })
  vi.spyOn(window, 'matchMedia').mockImplementation(
    matchMedia as unknown as typeof window.matchMedia,
  )
  return {
    matchMedia,
    listeners,
    change(matches: boolean) {
      mql.matches = matches
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent)
      }
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useIsDesktop', () => {
  it('asks for the Tailwind lg breakpoint', () => {
    const media = mockMatchMedia(true)

    renderHook(() => useIsDesktop())

    expect(media.matchMedia).toHaveBeenCalledWith(DESKTOP_MEDIA_QUERY)
    expect(DESKTOP_MEDIA_QUERY).toBe('(min-width: 64rem)')
  })

  it('user sees the layout follow the screen width when it changes', () => {
    // Given a wide screen
    const media = mockMatchMedia(true)
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(true)

    // When the screen becomes narrower than lg
    act(() => {
      media.change(false)
    })

    // Then the hook reports a mobile screen without a reload
    expect(result.current).toBe(false)
  })

  it('stops listening when the component unmounts', () => {
    const media = mockMatchMedia(false)
    const { unmount } = renderHook(() => useIsDesktop())
    expect(media.listeners.size).toBe(1)

    unmount()

    expect(media.listeners.size).toBe(0)
  })

  it('returns false when matchMedia does not exist', () => {
    const original = window.matchMedia
    // @ts-expect-error -- simulate an environment with no matchMedia
    delete window.matchMedia
    try {
      const { result } = renderHook(() => useIsDesktop())
      expect(result.current).toBe(false)
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: original,
      })
    }
  })
})
