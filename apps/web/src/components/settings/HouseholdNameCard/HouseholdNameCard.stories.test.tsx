import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as stories from './HouseholdNameCard.stories'

// `setup.ts` stubs `useGetHouseholdQuery` with no data, and `MockedProvider`
// takes effect only in real Storybook. So this file gives the hook the role
// and name each story mocks. Each test sets them before it renders.
const { state } = vi.hoisted(() => ({
  state: {
    role: 'owner' as 'owner' | 'manager' | 'member',
    name: "ET's Household",
  },
}))

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
              name: state.name,
              role: state.role,
            },
          },
      loading: false,
      error: undefined,
    }),
  }
})

// composeStories does not run a story's `beforeEach`, so the data mode is set
// here.
const { Owner, Manager, OwnerNameTooLong } = composeStories(stories)

beforeEach(() => {
  localStorage.setItem('data-mode', 'cloud')
  state.name = "ET's Household"
})
afterEach(() => localStorage.removeItem('data-mode'))

describe('HouseholdNameCard stories smoke tests', () => {
  it('Owner renders the name in a field', () => {
    state.role = 'owner'
    render(<Owner />)
    expect(screen.getByRole('textbox', { name: 'Household name' })).toHaveValue(
      "ET's Household",
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('Manager renders the name as text', () => {
    state.role = 'manager'
    render(<Manager />)
    expect(screen.getByText("ET's Household")).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('OwnerNameTooLong renders the length error with Save off', () => {
    state.role = 'owner'
    state.name = 'x'.repeat(120)
    render(<OwnerNameTooLong />)
    expect(
      screen.getByText('Enter a name of 1 to 100 characters.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
