import { composeStories } from '@storybook/react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { cloudRoleStorySetup } from '@/test/cloudRoleStory'
import * as stories from './index.stories'

// The real generated hooks and Apollo React hooks, so the `MockedProvider`
// of `MemberReadOnly` takes effect. `setup.ts` stubs both for every other
// test. The two local stories read Dexie, and their Apollo hooks skip.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

const { Default, WithVendors, MemberReadOnly } = composeStories(stories)

describe('Settings vendors list stories smoke tests', () => {
  it('Default renders the vendors list page', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('button', { name: /new vendor/i }),
    ).toBeInTheDocument()
  })

  it('WithVendors renders a seeded vendor name', async () => {
    render(<WithVendors />)
    expect(await screen.findByText(/costco/i)).toBeInTheDocument()
  })

  it('MemberReadOnly lists the vendors with no New Vendor and no Delete', async () => {
    // composeStories does not run a story's `beforeEach`, so it runs here
    onTestFinished(cloudRoleStorySetup())
    render(<MemberReadOnly />)
    const main = await screen.findByRole('main')
    // The row first: the page has its data.
    expect((await within(main).findAllByText(/iHerb/)).length).toBeGreaterThan(
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
    expect(await within(main).findByText('iHerb')).toBeInTheDocument()
    expect(
      within(main).queryByRole('button', { name: /new vendor/i }),
    ).toBeNull()
    expect(within(main).queryByRole('button', { name: /delete/i })).toBeNull()
  })
})
