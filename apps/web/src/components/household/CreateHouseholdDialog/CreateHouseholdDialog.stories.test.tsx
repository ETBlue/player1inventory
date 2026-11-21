import { composeStories } from '@storybook/react'
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as stories from './CreateHouseholdDialog.stories'

// `.run()` runs each story's `play`. The stories answer the create through
// `MockedProvider`, so the real generated hooks and Apollo React hooks must
// run. `src/test/setup.ts` stubs both; this file puts the real modules back.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

const { Open, Creating, ServerError } = composeStories(stories)

describe('CreateHouseholdDialog stories smoke tests', () => {
  it('Open shows the name field and Create', async () => {
    await Open.run()
    const dialog = await screen.findByRole('dialog', {
      name: 'Create a new household',
    })
    expect(within(dialog).getByLabelText('Household name')).toHaveValue('')
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeEnabled()
  })

  it('Creating turns Create and Cancel off', async () => {
    await Creating.run()
    const dialog = await screen.findByRole('dialog')
    expect(
      await within(dialog).findByRole('button', { name: 'Create' }),
    ).toBeDisabled()
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled()
  })

  it('ServerError shows the error inside the dialog', async () => {
    await ServerError.run()
    const dialog = await screen.findByRole('dialog')
    expect(
      await within(dialog).findByText(
        'Could not create the household. Try again.',
      ),
    ).toBeInTheDocument()
  })
})
