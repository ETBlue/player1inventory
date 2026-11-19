import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import { showSaveError } from './saveError'

const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}))

describe('showSaveError', () => {
  beforeEach(() => toastError.mockReset())

  it('shows the general text when no message is given', () => {
    showSaveError(new Error('boom'))
    expect(toastError).toHaveBeenCalledWith(
      'Could not save the change. Please try again.',
    )
  })

  it('shows the message it is given', () => {
    showSaveError(new Error('boom'), 'Could not add Milk.')
    expect(toastError).toHaveBeenCalledWith('Could not add Milk.')
  })

  it('shows nothing offline, because offlineWriteLink already did', () => {
    showSaveError(new OfflineWriteError())
    expect(toastError).not.toHaveBeenCalled()
  })
})
