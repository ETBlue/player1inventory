import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as stories from './index.stories'

// `setup.ts` stubs `useGetHouseholdQuery` with no data, and `MockedProvider`
// takes effect only in real Storybook. So this file gives the hook the role
// each cloud story mocks.
const { state } = vi.hoisted(() => ({
  state: { role: 'owner' as 'owner' | 'manager' | 'member' },
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
              name: 'The Lins',
              role: state.role,
              hasOwner: true,
              pendingTransfer: null,
            },
          },
      loading: false,
      error: undefined,
    }),
  }
})

const { Default, CloudMember, CloudManager } = composeStories(stories)

// composeStories does not run a story's `beforeEach`, so the data mode is set
// here.
afterEach(() => {
  localStorage.removeItem('data-mode')
})

describe('ImportCard stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument()
  })

  it('CloudMember shows the line and no file button', () => {
    localStorage.setItem('data-mode', 'cloud')
    state.role = 'member'
    render(<CloudMember />)
    expect(
      screen.getByText('Only the owner or a manager can import data.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Import' }),
    ).not.toBeInTheDocument()
  })

  it('CloudManager shows the file button', () => {
    localStorage.setItem('data-mode', 'cloud')
    state.role = 'manager'
    render(<CloudManager />)
    expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled()
  })
})
