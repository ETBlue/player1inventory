import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { cloudRoleStorySetup } from '@/test/cloudRoleStory'
import * as stories from './activity.stories'

// The real generated hooks and Apollo React hooks, so the stories'
// `MockedProvider` takes effect. `setup.ts` stubs both for every other test.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

const { Owner, Empty, Loading, NoAccess, LoadError } = composeStories(stories)

// composeStories does not run a story's `beforeEach`, so each test runs it.

describe('Activity page stories smoke tests', () => {
  it('Owner shows a sentence for every action', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<Owner />)
    expect(
      await screen.findByText(
        'Olive Lin gave mia the Organizer role on my Kitchen',
      ),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(19)
    expect(
      screen.getByText("Ben (deleted account)'s account was deleted"),
    ).toBeInTheDocument()
  })

  it('Empty says nothing has happened yet', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<Empty />)
    expect(
      await screen.findByText('Nothing has happened here yet.'),
    ).toBeInTheDocument()
  })

  it('Loading shows the title and no rows', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<Loading />)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Activity' }),
    ).toBeInTheDocument()
    expect(document.querySelector('.animate-spin')).not.toBeNull()
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('NoAccess shows the no-access text and a link back', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<NoAccess />)
    expect(
      await screen.findByText(
        'Only the owner and managers can see the activity.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Back to the household' }),
    ).toBeInTheDocument()
  })

  it('LoadError shows Retry', async () => {
    onTestFinished(cloudRoleStorySetup())
    render(<LoadError />)
    expect(
      await screen.findByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument()
  })
})
