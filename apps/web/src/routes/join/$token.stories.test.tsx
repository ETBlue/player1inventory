import { composeStories } from '@storybook/react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { cloudRoleStorySetup } from '@/test/cloudRoleStory'
import * as stories from './$token.stories'

// The real generated hooks and Apollo React hooks, so the stories'
// `MockedProvider` takes effect. `setup.ts` stubs both for every other test.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

const { Valid, NoLocations, AlreadyMember, Invalid, LocalMode } =
  composeStories(stories)

describe('Join page stories smoke tests', () => {
  // composeStories does not run a story's `beforeEach`, so each test runs it

  it('Valid shows the household and the Join button', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<Valid />)
    expect(
      await screen.findByRole('heading', { name: 'Join the Lin home' }),
    ).toBeInTheDocument()
    expect(
      within(
        screen.getByRole('list', { name: 'Locations in this household' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument()
  })

  it('NoLocations shows the household role and no locations list', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<NoLocations />)
    expect(
      await screen.findByRole('heading', { name: 'Join the Lin home' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Member')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('AlreadyMember says so, with no Join button', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<AlreadyMember />)
    expect(
      await screen.findByText('You are already in this household.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull()
  })

  it('Invalid says the link is no longer valid', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<Invalid />)
    expect(
      await screen.findByText(
        'This invite is no longer valid. Ask for a new one.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull()
  })

  it('LocalMode offers Sign in to join', async () => {
    render(<LocalMode />)
    expect(
      await screen.findByRole('button', { name: 'Sign in to join' }),
    ).toBeInTheDocument()
  })
})
