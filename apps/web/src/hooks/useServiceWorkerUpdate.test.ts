import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const toastMock = vi.fn()
vi.mock('sonner', () => ({ toast: (...args: unknown[]) => toastMock(...args) }))

let capturedOnNeedRefresh: (() => void) | undefined
vi.mock('virtual:pwa-register', () => ({
  registerSW: (options: { onNeedRefresh?: () => void }) => {
    capturedOnNeedRefresh = options.onNeedRefresh
    return vi.fn()
  },
}))

import { useServiceWorkerUpdate } from './useServiceWorkerUpdate'

describe('useServiceWorkerUpdate', () => {
  beforeEach(() => {
    toastMock.mockClear()
    capturedOnNeedRefresh = undefined
  })

  it('user sees a reload prompt when a new version is ready', () => {
    // Given the hook is mounted
    renderHook(() => useServiceWorkerUpdate())
    expect(toastMock).not.toHaveBeenCalled()

    // When the service worker reports a new version
    capturedOnNeedRefresh?.()

    // Then a toast is shown with a reload action
    expect(toastMock).toHaveBeenCalledTimes(1)
    const [, options] = toastMock.mock.calls[0] as [
      string,
      { action?: { label: string } },
    ]
    expect(options.action?.label).toBeTruthy()
  })
})
