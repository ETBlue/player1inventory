import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import { showVendorCreateError } from './vendorCreateError'

const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}))

describe('showVendorCreateError', () => {
  beforeEach(() => toastError.mockReset())

  it('says who may add a vendor for FORBIDDEN', () => {
    showVendorCreateError(
      new CombinedGraphQLErrors({
        errors: [{ message: 'x', extensions: { code: 'FORBIDDEN' } }],
      }),
      'Lidl',
    )
    expect(toastError).toHaveBeenCalledWith(
      'Only a household owner or manager can add a vendor.',
    )
  })

  it('shows the general text for any other error', () => {
    showVendorCreateError(new Error('boom'), 'Lidl')
    expect(toastError).toHaveBeenCalledWith(
      'Could not add Lidl. Please try again.',
    )
  })

  it('shows nothing offline, because offlineWriteLink already did', () => {
    showVendorCreateError(new OfflineWriteError(), 'Lidl')
    expect(toastError).not.toHaveBeenCalled()
  })
})
