import { composeStories } from '@storybook/react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { cloudRoleStorySetup } from '@/test/cloudRoleStory'
import * as stories from './index.stories'

// The real generated hooks and Apollo React hooks, so `CloudOwner`'s
// `MockedProvider` takes effect. `Default` uses the no-op client.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

const { Default, CloudOwner } = composeStories(stories)

describe('Household config page stories smoke tests', () => {
  it('Default renders the title and the export card', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'General' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Download my data')).toBeInTheDocument()
  })

  it('CloudOwner shows the danger zone', async () => {
    // composeStories does not run a story's `beforeEach`
    onTestFinished(cloudRoleStorySetup())
    render(<CloudOwner />)
    const zone = await screen.findByRole('region', { name: 'Danger zone' })
    expect(
      within(zone).getByRole('button', { name: 'Delete household' }),
    ).toBeInTheDocument()
  })
})
