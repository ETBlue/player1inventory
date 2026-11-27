import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import { NotConsumableError } from '@/lib/recipeConsumables'
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

  // Only consumable items can be in a recipe or be cooked. Another tab may
  // turn an item off while this one still shows it; the refusal says why.
  const NOT_CONSUMABLE_TEXT =
    'An item here is no longer consumable, so it cannot be in a recipe or be cooked. Nothing was saved.'

  it('user sees why a cloud write was refused for a non-consumable item', () => {
    const err = new CombinedGraphQLErrors({
      errors: [
        {
          message: 'Only consumable items can be in a recipe',
          extensions: { code: 'BAD_USER_INPUT', reason: 'NOT_CONSUMABLE' },
        },
      ],
    })
    // The reason wins over a general message the caller passes
    showSaveError(err, 'Could not add Milk.')
    expect(toastError).toHaveBeenCalledWith(NOT_CONSUMABLE_TEXT)
  })

  it('user sees why a local write was refused for a non-consumable item', () => {
    showSaveError(new NotConsumableError(['item-cup']))
    expect(toastError).toHaveBeenCalledWith(NOT_CONSUMABLE_TEXT)
  })

  it('another BAD_USER_INPUT still shows the general text', () => {
    // Negative control: only the NOT_CONSUMABLE reason gets the new text
    showSaveError(
      new CombinedGraphQLErrors({
        errors: [{ message: 'x', extensions: { code: 'BAD_USER_INPUT' } }],
      }),
    )
    expect(toastError).toHaveBeenCalledWith(
      'Could not save the change. Please try again.',
    )
  })
})
