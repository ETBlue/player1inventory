import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as stories from './HouseholdSidebar.stories'

// `setup.ts` stubs `useGetHouseholdQuery` with no data, and `MockedProvider`
// takes effect only in real Storybook. So this file gives the hook the name
// the CloudHouseholdName story mocks, and honours `skip` the way Apollo does,
// so the local stories still say "My data".
vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetHouseholdQuery: (options?: { skip?: boolean }) => ({
      data: options?.skip
        ? undefined
        : {
            household: {
              __typename: 'Household',
              id: 'household-1',
              name: 'The Lin family household on Roosevelt Road',
              role: 'owner',
            },
          },
      loading: false,
      error: undefined,
    }),
  }
})

const { General, TagsActive, CloudHouseholdName } = composeStories(stories)

afterEach(() => localStorage.removeItem('data-mode'))

describe('HouseholdSidebar stories smoke tests', () => {
  it('General renders with General marked active', async () => {
    render(<General />)
    expect(
      await screen.findByRole('heading', { name: 'My data' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'General' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('TagsActive renders with Tags marked active', async () => {
    render(<TagsActive />)
    expect(
      await screen.findByRole('button', { name: 'Back' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tags' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('CloudHouseholdName renders the household name as the heading', async () => {
    // composeStories does not run a story's `beforeEach`
    localStorage.setItem('data-mode', 'cloud')
    render(<CloudHouseholdName />)
    expect(
      await screen.findByRole('heading', {
        name: 'The Lin family household on Roosevelt Road',
      }),
    ).toBeInTheDocument()
  })
})
