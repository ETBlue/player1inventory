import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as stories from './NoHouseholdScreen.stories'

// The real generated hooks and Apollo React hooks, so the stories'
// `MockedProvider` takes effect. `setup.ts` stubs both for every other test.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

const { Default, CreateDialogOpen } = composeStories(stories)

describe('NoHouseholdScreen stories smoke tests', () => {
  it('Default shows the heading and the Create button', () => {
    render(<Default />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'You are not in any household.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Create a household' }),
    ).toBeInTheDocument()
  })

  it('CreateDialogOpen shows the dialog with an empty name field', async () => {
    await CreateDialogOpen.run()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Household name')).toHaveValue('')
  })
})
