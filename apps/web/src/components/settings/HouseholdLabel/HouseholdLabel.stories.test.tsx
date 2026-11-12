import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as stories from './HouseholdLabel.stories'

// `setup.ts` stubs `useGetHouseholdQuery` with no data, and `MockedProvider`
// takes effect only in real Storybook. So this file gives the hook the same
// household the CloudMode story mocks, and honours `skip` the way Apollo does,
// so the local story still gets no data.
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
              name: "et's household",
              role: 'owner',
            },
          },
      loading: false,
      error: undefined,
    }),
  }
})

// composeStories does not run a story's `beforeEach`, so each test sets the
// data mode itself.
const { LocalMode, CloudMode } = composeStories(stories)

afterEach(() => localStorage.removeItem('data-mode'))

describe('HouseholdLabel stories smoke tests', () => {
  it('LocalMode renders "My data"', () => {
    localStorage.setItem('data-mode', 'local')
    render(<LocalMode />)
    expect(screen.getByText('My data')).toBeInTheDocument()
  })

  it('CloudMode renders the household name as stored', () => {
    localStorage.setItem('data-mode', 'cloud')
    render(<CloudMode />)
    expect(screen.getByText("et's household")).toBeInTheDocument()
  })
})
