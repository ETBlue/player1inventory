import { composeStories } from '@storybook/react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { cloudRoleStorySetup } from '@/test/cloudRoleStory'
import * as stories from './$id.stories'

// The real generated hooks and Apollo React hooks, so the stories'
// `MockedProvider` takes effect. `setup.ts` stubs both for every other test.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

const { OwnerView, OrganizerView, ParticipantView, NoOrganizer, NobodyToAdd } =
  composeStories(stories)

// composeStories does not run a story's `beforeEach`, so each test runs it.
// Each test waits for something that shows only once the roles have loaded.

async function main() {
  return await screen.findByRole('main')
}

describe('Location people page stories smoke tests', () => {
  it('OwnerView shows Add person and a picker on an organizer row', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<OwnerView />)
    const page = await main()
    expect(
      await within(page).findByRole('button', { name: 'Add person' }),
    ).toBeInTheDocument()
    expect(
      within(page).getByRole('combobox', { name: 'Location role of oz' }),
    ).toBeInTheDocument()
  })

  it('OrganizerView shows Leave and no picker on the other organizer', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<OrganizerView />)
    const page = await main()
    expect(
      await within(page).findByRole('button', { name: 'Leave location' }),
    ).toBeInTheDocument()
    expect(
      within(page).queryByRole('combobox', { name: 'Location role of oz' }),
    ).toBeNull()
  })

  it('ParticipantView shows Leave and no picker', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<ParticipantView />)
    const page = await main()
    expect(
      await within(page).findByRole('button', { name: 'Leave location' }),
    ).toBeInTheDocument()
    expect(within(page).queryByRole('combobox')).toBeNull()
  })

  it('NoOrganizer shows the note', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<NoOrganizer />)
    expect(
      await within(await main()).findByText('No organizer'),
    ).toBeInTheDocument()
  })

  it('NobodyToAdd says everyone already has a role', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<NobodyToAdd />)
    expect(
      await within(await main()).findByText(
        'Everyone in this household already has a role here.',
      ),
    ).toBeInTheDocument()
  })
})
