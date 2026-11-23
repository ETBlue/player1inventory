import { composeStories } from '@storybook/react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { cloudRoleStorySetup } from '@/test/cloudRoleStory'
import * as stories from './HouseholdDangerZone.stories'

// The real generated hooks and Apollo React hooks, so the stories'
// `MockedProvider` takes effect. `setup.ts` stubs both for every other test.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

const { Owner, ClearFails } = composeStories(stories)

// composeStories does not run a story's `beforeEach`, so each test runs it.
describe('HouseholdDangerZone stories smoke tests', () => {
  it('Owner shows the three purges', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<Owner />)
    const zone = await screen.findByRole('region', { name: 'Danger zone' })
    for (const name of [
      'Clear household',
      'Delete all locations',
      'Delete household',
    ]) {
      expect(within(zone).getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('ClearFails keeps the dialog open and shows the error', async () => {
    onTestFinished(cloudRoleStorySetup())
    const user = userEvent.setup()
    render(<ClearFails />)
    await user.click(
      await screen.findByRole('button', { name: 'Clear household' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.type(
      within(dialog).getByRole('textbox', {
        name: 'Type The Lin home to confirm',
      }),
      'The Lin home',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Clear household' }),
    )
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Could not delete. Please try again.',
    )
  })
})
