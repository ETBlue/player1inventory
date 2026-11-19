import { composeStories } from '@storybook/react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { cloudRoleStorySetup } from '@/test/cloudRoleStory'
import * as stories from './members.stories'

// The real generated hooks and Apollo React hooks, so the stories'
// `MockedProvider` takes effect. `setup.ts` stubs both for every other test.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

const {
  Owner,
  Manager,
  Member,
  WithOpenInvites,
  InviteDialogOpen,
  OwnerSeesNoLocationRoles,
} = composeStories(stories)

// composeStories does not run a story's `beforeEach`, so each test runs it.
// Each test waits for a control that shows only once the ROLE has loaded
// (the present-first rule): while it loads, no role gets any button.

describe('Members page stories smoke tests', () => {
  it('Owner shows the role control on the member row', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<Owner />)
    expect(
      await screen.findByRole('combobox', { name: 'Household role of mia' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Invite someone' }),
    ).toBeInTheDocument()
  })

  it('Manager shows Remove on the member row and Leave', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<Manager />)
    expect(
      await screen.findByRole('button', { name: 'Remove mia' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Leave household' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Remove Olive Lin' }),
    ).toBeNull()
  })

  it('Member shows Leave and no Invite', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<Member />)
    expect(
      await screen.findByRole('button', { name: 'Leave household' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invite someone' })).toBeNull()
  })

  it('WithOpenInvites lists both invites', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<WithOpenInvites />)
    const heading = await screen.findByText('Open invites')
    const section = heading.closest('section') as HTMLElement
    expect(await within(section).findAllByRole('listitem')).toHaveLength(2)
  })

  it('InviteDialogOpen shows the form with the locations', async () => {
    onTestFinished(cloudRoleStorySetup())
    await InviteDialogOpen.run()
    const dialog = screen.getByRole('dialog')
    expect(
      within(dialog).getByRole('combobox', { name: 'Garage' }),
    ).toHaveTextContent('No access')
  })

  it('OwnerSeesNoLocationRoles marks the member with no location role', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<OwnerSeesNoLocationRoles />)
    const link = await screen.findByRole('link', {
      name: 'Give a location role',
    })
    const row = link.closest('li') as HTMLElement
    expect(row).toHaveTextContent('mia')
    expect(within(row).getByText('No location roles')).toBeInTheDocument()
  })
})
