import { composeStories } from '@storybook/react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { cloudRoleStorySetup } from '@/test/cloudRoleStory'
import * as stories from './LocationDangerZone.stories'

// The real generated hooks and Apollo React hooks, so the stories'
// `MockedProvider` takes effect. `setup.ts` stubs both for every other test.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

const { Organizer, RemoveFails } = composeStories(stories)

// composeStories does not run a story's `beforeEach`, so each test runs it.
describe('LocationDangerZone stories smoke tests', () => {
  it('Organizer shows Remove all items', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<Organizer />)
    const zone = await screen.findByRole('region', { name: 'Danger zone' })
    expect(
      within(zone).getByRole('button', { name: 'Remove all items' }),
    ).toBeInTheDocument()
  })

  it('RemoveFails keeps the dialog open and shows the error', async () => {
    onTestFinished(cloudRoleStorySetup())
    const user = userEvent.setup()
    render(<RemoveFails />)
    await user.click(
      await screen.findByRole('button', { name: 'Remove all items' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.type(
      within(dialog).getByRole('textbox', {
        name: 'Type my Kitchen to confirm',
      }),
      'my Kitchen',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove all items' }),
    )
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Could not delete. Please try again.',
    )
  })
})
