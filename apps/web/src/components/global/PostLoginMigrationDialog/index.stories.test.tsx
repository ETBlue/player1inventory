import { composeStories } from '@storybook/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as stories from './index.stories'

// Freeze fetchLocalPayload on a never-resolving promise so the 'auto-importing'
// state stays mounted long enough to assert (after Copy here in AskBeforeCopy). Without this, the hook's async
// chain (fetchLocalPayload → importCloudData → 'done') settles in a single tick
// — fetchLocalPayload rejects against the empty test DB and the .catch jumps the
// hook straight to 'done', closing the progress dialog before findByText can
// observe it. Idle returns early (migration-prompted set) and the two Prompting
// stories call getAllItems (not fetchLocalPayload), so none is affected.
// The three cloud stories need a household and a location list. `setup.ts`
// stubs both Apollo hooks with no data, and `MockedProvider` takes effect only
// in real Storybook, so this file answers them. Each test sets the role.
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
              name: 'Our Home',
              role: state.role,
              hasOwner: true,
              pendingTransfer: null,
            },
          },
      loading: false,
      error: undefined,
    }),
    useGetLocationsQuery: (options?: { skip?: boolean }) => ({
      data: options?.skip
        ? undefined
        : {
            locations: [
              {
                __typename: 'Location',
                id: 'location-1',
                name: 'Kitchen',
                order: 0,
                createdAt: '2026-11-01T00:00:00.000Z',
                updatedAt: '2026-11-01T00:00:00.000Z',
                myRole: 'organizer',
              },
            ],
          },
      loading: false,
      error: undefined,
    }),
  }
})

vi.mock('@/lib/exportData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/exportData')>()
  return {
    ...actual,
    fetchLocalPayload: vi.fn(() => new Promise(() => {})),
  }
})

const {
  Idle,
  Prompting,
  PromptingMember,
  AskBeforeCopy,
  AskBeforeClear,
  AskBeforeCopyShared,
  MemberCannotCopy,
} = composeStories(stories)

// composeStories does not run a story's `beforeEach`, so each test sets the
// keys itself.
function storedCopy() {
  localStorage.setItem('data-mode', 'cloud')
  localStorage.setItem('migration-strategy', 'skip')
  localStorage.removeItem('migration-prompted')
}

describe('PostLoginMigrationDialog stories smoke tests', () => {
  describe('Idle', () => {
    beforeEach(() => localStorage.setItem('migration-prompted', '1'))
    afterEach(() => localStorage.removeItem('migration-prompted'))

    it('renders without error — dialog stays hidden', () => {
      const { container } = render(<Idle />)
      expect(container).toBeInTheDocument()
      expect(screen.queryByRole('alertdialog')).toBeNull()
    })
  })

  describe('Prompting', () => {
    beforeEach(() => localStorage.setItem('data-mode', 'cloud'))
    afterEach(() => {
      localStorage.clear()
      state.role = 'owner'
    })

    it('Prompting names the household and offers the copy', async () => {
      state.role = 'owner'
      render(<Prompting />)
      expect(
        await screen.findByRole('heading', {
          name: 'Copy your offline data into Our Home?',
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Copy here' }),
      ).toBeInTheDocument()
    })

    it('PromptingMember names the household and offers no copy', async () => {
      state.role = 'member'
      render(<PromptingMember />)
      expect(
        await screen.findByRole('heading', {
          name: 'Copy your offline data into Our Home?',
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByText(/Only the owner or a manager of this household/),
      ).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Copy here' })).toBeNull()
    })
  })

  describe('the cloud stories', () => {
    beforeEach(storedCopy)
    afterEach(() => {
      localStorage.clear()
      state.role = 'owner'
    })

    it('AskBeforeCopy asks by name, and Copy here starts the copy', async () => {
      state.role = 'owner'
      render(<AskBeforeCopy />)
      expect(
        await screen.findByRole('heading', {
          name: 'Copy your offline data into Our Home?',
        }),
      ).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Copy here' }))
      expect(
        await screen.findByText('Copying local data to cloud…'),
      ).toBeInTheDocument()
    })

    it('AskBeforeClear asks for the household name before a clear copy', async () => {
      state.role = 'owner'
      localStorage.setItem('migration-strategy', 'clear')
      render(<AskBeforeClear />)

      fireEvent.click(await screen.findByRole('button', { name: 'Copy here' }))
      expect(
        await screen.findByLabelText('Type Our Home to confirm'),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Copy here' })).toBeDisabled()
    })

    it('AskBeforeCopyShared says the household is shared', async () => {
      state.role = 'manager'
      render(<AskBeforeCopyShared />)
      expect(
        await screen.findByText(/This household is shared/),
      ).toBeInTheDocument()
    })

    it('MemberCannotCopy offers no copy', async () => {
      state.role = 'member'
      render(<MemberCannotCopy />)
      expect(
        await screen.findByText(/Only the owner or a manager/),
      ).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Copy here' })).toBeNull()
    })
  })
})
