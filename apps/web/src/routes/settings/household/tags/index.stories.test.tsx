import { composeStories } from '@storybook/react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { cloudRoleStorySetup } from '@/test/cloudRoleStory'
import * as stories from './index.stories'

// The real generated hooks and Apollo React hooks, so the `MockedProvider`
// of `MemberReadOnly` takes effect. `setup.ts` stubs both for every other
// test. The local stories read Dexie, and their Apollo hooks skip.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

const {
  Default,
  WithNestedTags,
  WithParentSelector,
  WithNewTagTypeDialog,
  MemberReadOnly,
} = composeStories(stories)

describe('Settings tags index stories smoke tests', () => {
  it('Default renders without error', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('heading', { name: /tags/i }),
    ).toBeInTheDocument()
  })

  it('WithNestedTags renders nested tag hierarchy', async () => {
    render(<WithNestedTags />)
    // The page heading ("Tags") should be visible
    expect(
      await screen.findByRole('heading', { name: /tags/i }),
    ).toBeInTheDocument()
    // The "New Tag Type" button should be visible in the toolbar
    expect(
      await screen.findByRole('button', { name: /new tag type/i }),
    ).toBeInTheDocument()
  })

  it('WithParentSelector renders tag list with sibling tags', async () => {
    render(<WithParentSelector />)
    expect(
      await screen.findByRole('heading', { name: /tags/i }),
    ).toBeInTheDocument()
    // "New Tag" button should be visible inside a tag type card
    expect(
      await screen.findByRole('button', { name: /new tag/i }),
    ).toBeInTheDocument()
  })

  it('WithNewTagTypeDialog renders tag list page with New Tag Type button', async () => {
    render(<WithNewTagTypeDialog />)
    // The page heading should be visible
    expect(
      await screen.findByRole('heading', { name: /tags/i }),
    ).toBeInTheDocument()
    // The "New Tag Type" button in the toolbar should be visible
    expect(
      await screen.findByRole('button', { name: /new tag type/i }),
    ).toBeInTheDocument()
  })

  it('MemberReadOnly lists the tags with no write controls', async () => {
    // composeStories does not run a story's `beforeEach`, so it runs here
    onTestFinished(cloudRoleStorySetup())
    render(<MemberReadOnly />)
    const main = await screen.findByRole('main')
    // The row first: the page has its data.
    expect((await within(main).findAllByText(/Dairy/)).length).toBeGreaterThan(
      0,
    )
    // The read-only note first. It shows only once the household role has
    // loaded as `member`. Before that every write control is hidden for any
    // role (loading), so the absences below would prove nothing.
    expect(
      await within(main).findByText(
        'Only a household owner or manager can add or change these.',
      ),
    ).toBeInTheDocument()
    // Present first, then the absences
    expect((await within(main).findAllByText(/Dairy/)).length).toBeGreaterThan(
      0,
    )
    expect(within(main).queryByRole('button', { name: /new tag/i })).toBeNull()
    expect(within(main).queryByRole('button', { name: /^edit$/i })).toBeNull()
    expect(within(main).queryByRole('button', { name: /delete/i })).toBeNull()
  })
})
