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
  it('Default shows the heading and all three actions', () => {
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
    expect(
      screen.getByRole('button', { name: 'Switch to offline mode' }),
    ).toBeInTheDocument()
    // `setup.ts` mocks `@clerk/react`, as Storybook's stub does
    expect(
      screen.getByRole('button', { name: 'Sign in to another account' }),
    ).toBeInTheDocument()
  })

  it('CreateDialogOpen shows the dialog with an empty name field', async () => {
    await CreateDialogOpen.run()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Household name')).toHaveValue('')
  })
})
