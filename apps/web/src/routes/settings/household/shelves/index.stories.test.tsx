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

const { Empty, WithShelves, MemberReadOnly } = composeStories(stories)

describe('Settings shelves page stories smoke tests', () => {
  it('Empty renders the shelves settings page heading', async () => {
    render(<Empty />)
    expect(
      await screen.findByRole('heading', { name: /shelves/i }),
    ).toBeInTheDocument()
  })

  it('WithShelves renders a seeded shelf name', async () => {
    render(<WithShelves />)
    expect(await screen.findByText(/fridge/i)).toBeInTheDocument()
  })

  it('WithShelves renders the filter count on filter shelves only', async () => {
    render(<WithShelves />)

    // Fridge selects 2 tags of one type + 1 vendor + 1 recipe = 4 options
    expect(await screen.findByText('4 filters')).toBeInTheDocument()
    // Snacks selects a single vendor — singular
    expect(await screen.findByText('1 filter')).toBeInTheDocument()
    // The selection shelf is the contrast case: no filter count anywhere on it
    expect(screen.getAllByText(/^\d+ filters?$/)).toHaveLength(2)
  })

  it('MemberReadOnly lists the shelves with no write controls', async () => {
    // composeStories does not run a story's `beforeEach`, so it runs here
    onTestFinished(cloudRoleStorySetup())
    render(<MemberReadOnly />)
    const main = await screen.findByRole('main')
    // The row first: the page has its data.
    expect((await within(main).findAllByText(/Fridge/)).length).toBeGreaterThan(
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
    expect((await within(main).findAllByText(/Fridge/)).length).toBeGreaterThan(
      0,
    )
    expect(
      within(main).queryByRole('button', { name: /add shelf/i }),
    ).toBeNull()
    expect(within(main).queryByRole('button', { name: /delete/i })).toBeNull()
    expect(
      within(main).queryByRole('button', { name: /drag to reorder/i }),
    ).toBeNull()
  })
})
