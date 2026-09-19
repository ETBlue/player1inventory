import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOffline, useIsOffline } from './useIsOffline'

function setOnLine(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useIsOffline', () => {
  it('user is treated as online when navigator.onLine is true', () => {
    // Given the browser reports a connection
    setOnLine(true)

    // When the hook renders
    const { result } = renderHook(() => useIsOffline())

    // Then the app is not offline
    expect(result.current).toBe(false)
  })

  it('user is treated as offline when navigator.onLine is false', () => {
    // Given the browser reports no connection
    setOnLine(false)

    // When the hook renders
    const { result } = renderHook(() => useIsOffline())

    // Then the app is offline
    expect(result.current).toBe(true)
  })

  it('user sees the value change when the browser fires offline', () => {
    // Given the browser starts online
    setOnLine(true)
    const { result } = renderHook(() => useIsOffline())
    expect(result.current).toBe(false)

    // When the connection drops
    act(() => {
      setOnLine(false)
      window.dispatchEvent(new Event('offline'))
    })

    // Then the hook reports offline without a reload
    expect(result.current).toBe(true)
  })
})

describe('isOffline', () => {
  it('returns true only when navigator.onLine is false', () => {
    setOnLine(false)
    expect(isOffline()).toBe(true)

    setOnLine(true)
    expect(isOffline()).toBe(false)
  })
})
