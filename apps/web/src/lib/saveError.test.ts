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

  // Owner answer 6A, limited to catalog writes: a role taken away while the
  // page was open says why. A location write's FORBIDDEN means something
  // else (a location viewer), so the caller must ask for this text.
  const CATALOG_TEXT = 'Only a household owner or manager can change this.'
  const forbidden = () =>
    new CombinedGraphQLErrors({
      errors: [{ message: 'no', extensions: { code: 'FORBIDDEN' } }],
    })

  it('user sees why a catalog write was refused for the household role', () => {
    showSaveError(forbidden(), { catalog: true })
    expect(toastError).toHaveBeenCalledWith(CATALOG_TEXT)
  })

  it('the catalog text wins over a message the caller passes', () => {
    showSaveError(forbidden(), {
      catalog: true,
      message: 'Could not add Milk.',
    })
    expect(toastError).toHaveBeenCalledWith(CATALOG_TEXT)
  })

  it('a FORBIDDEN without the catalog option still shows the general text', () => {
    // Negative control: a location write must not claim a household role
    showSaveError(forbidden())
    expect(toastError).toHaveBeenCalledWith(
      'Could not save the change. Please try again.',
    )
  })

  it('a catalog write that fails for another reason shows its message', () => {
    showSaveError(new Error('boom'), {
      catalog: true,
      message: 'Could not add Milk.',
    })
    expect(toastError).toHaveBeenCalledWith('Could not add Milk.')
  })

  it('a catalog write offline shows nothing', () => {
    showSaveError(new OfflineWriteError(), { catalog: true })
    expect(toastError).not.toHaveBeenCalled()
  })

  it('a catalog write refused as not consumable says so', () => {
    showSaveError(new NotConsumableError(['item-cup']), { catalog: true })
    expect(toastError).toHaveBeenCalledWith(NOT_CONSUMABLE_TEXT)
  })
})
