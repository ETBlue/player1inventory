import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FamilyGroupCard } from '.'

vi.mock('@clerk/react', () => ({
  useUser: vi.fn(() => ({
    user: {
      id: 'user_123',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
    },
  })),
  useClerk: vi.fn(() => ({ signOut: vi.fn() })),
}))

// Override the global mock with vi.fn() so we can control return values per-test
const mockUseMyFamilyGroupQuery = vi.fn()
const mockUseCreateFamilyGroupMutation = vi.fn(() => [vi.fn(), {}])
const mockUseJoinFamilyGroupMutation = vi.fn(() => [vi.fn(), {}])
const mockUseLeaveFamilyGroupMutation = vi.fn(() => [vi.fn(), {}])
const mockUseDisbandFamilyGroupMutation = vi.fn(() => [vi.fn(), {}])

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useMyFamilyGroupQuery: () => mockUseMyFamilyGroupQuery(),
    useCreateFamilyGroupMutation: (opts: unknown) =>
      mockUseCreateFamilyGroupMutation(opts),
    useJoinFamilyGroupMutation: (opts: unknown) =>
      mockUseJoinFamilyGroupMutation(opts),
    useLeaveFamilyGroupMutation: (opts: unknown) =>
      mockUseLeaveFamilyGroupMutation(opts),
    useDisbandFamilyGroupMutation: (opts: unknown) =>
      mockUseDisbandFamilyGroupMutation(opts),
  }
})

const mockGroupBase = {
  id: 'group_1',
  name: 'The Smiths',
  code: 'PX7K2M',
  ownerUserId: 'other_user',
  memberUserIds: ['other_user', 'user_123'],
}

describe('FamilyGroupCard', () => {
  it('shows create/join buttons when not in a group', () => {
    // Given useMyFamilyGroupQuery returns no group
    mockUseMyFamilyGroupQuery.mockReturnValue({
      data: { myFamilyGroup: null },
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    // When FamilyGroupCard is rendered
    render(<FamilyGroupCard />)

    // Then "Family group" title is shown
    expect(screen.getByText('Family group')).toBeInTheDocument()

    // And "Create group" and "Join with code" buttons are shown
    expect(
      screen.getByRole('button', { name: 'Create group' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Join with code' }),
    ).toBeInTheDocument()
  })

  it('shows group name and code when in a group as member', () => {
    // Given useMyFamilyGroupQuery returns a group the current user is a member of (not owner)
    mockUseMyFamilyGroupQuery.mockReturnValue({
      data: { myFamilyGroup: mockGroupBase },
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    // When FamilyGroupCard is rendered
    render(<FamilyGroupCard />)

    // Then "Family group · The Smiths" is shown
    expect(screen.getByText('Family group · The Smiths')).toBeInTheDocument()

    // And the group code is shown
    expect(screen.getByText(/Group code: PX7K2M/)).toBeInTheDocument()

    // And "Leave group" button is shown
    expect(
      screen.getByRole('button', { name: 'Leave group' }),
    ).toBeInTheDocument()

    // And "Disband group" button is NOT shown
    expect(
      screen.queryByRole('button', { name: 'Disband group' }),
    ).not.toBeInTheDocument()
  })

  it('shows disband button when user is the owner', () => {
    // Given group where ownerUserId matches the current user (user_123)
    mockUseMyFamilyGroupQuery.mockReturnValue({
      data: {
        myFamilyGroup: {
          ...mockGroupBase,
          ownerUserId: 'user_123',
        },
      },
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    // When FamilyGroupCard is rendered
    render(<FamilyGroupCard />)

    // Then "Disband group" button is shown
    expect(
      screen.getByRole('button', { name: 'Disband group' }),
    ).toBeInTheDocument()

    // And "Leave group" button is NOT shown
    expect(
      screen.queryByRole('button', { name: 'Leave group' }),
    ).not.toBeInTheDocument()
  })

  it('opens create dialog when Create group is clicked', async () => {
    // Given no group
    mockUseMyFamilyGroupQuery.mockReturnValue({
      data: { myFamilyGroup: null },
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    const user = userEvent.setup()
    render(<FamilyGroupCard />)

    // When user clicks "Create group"
    await user.click(screen.getByRole('button', { name: 'Create group' }))

    // Then dialog with "Create a family group" title appears
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Create a family group' }),
    ).toBeInTheDocument()
  })
})
