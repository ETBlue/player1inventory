import { ApolloProvider } from '@apollo/client/react'
import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { db } from '@/db'
import { GetHouseholdDocument, GetLocationsDocument } from '@/generated/graphql'
import { noopApolloClient } from '@/test/apolloStub'
import { PostLoginMigrationDialog } from '.'

// PostLoginMigrationDialog uses:
//   - useAuth() from @clerk/react, in its own non-E2E branch
//     (mocked in Storybook via .storybook/mocks/clerk.tsx — always returns isSignedIn: true).
//     The hook itself no longer calls Clerk: the component reads isLoaded and
//     isSignedIn and passes them in. Storybook has no VITE_E2E_TEST_USER_ID, so
//     these stories always render the Clerk branch.
//   - getAllItems() from db — async Dexie call
//   - usePostLoginMigration(auth) → useLocations(), which is dual-mode: its LOCAL
//     branch is a TanStack Query read (hence the QueryClientProvider
//     decorator), and its cloud branch calls useGetLocationsQuery with
//     skip:true — even a skipped Apollo hook needs a client in context (hence
//     the ApolloProvider decorator).
//
// The dialog itself reads no locations at all. It used to run its own
// TanStack Query over the LOCAL locations table to build the multi-location
// copy warning; cloud locations PR 4b deleted that warning, because the copy
// keeps every location.
//
// Idle story: set 'migration-prompted' in localStorage so the hook returns early.
//   No db access occurs. Dialog stays closed.
//
// Prompting stories: seed db with one item and clear 'migration-prompted'.
//   The hook finds local items → sets state to 'prompting' → dialog opens.
//   They run in cloud mode with a household (`MockedProvider`), because the
//   question names the household and reads the role, and waits until it has
//   loaded (docs/global/bugs/2026-11-19-bug-manual-import-names-no-household.md).

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const meta: Meta<typeof PostLoginMigrationDialog> = {
  title: 'Components/Global/PostLoginMigrationDialog',
  component: PostLoginMigrationDialog,
  decorators: [
    (Story) => (
      <ApolloProvider client={noopApolloClient}>
        <QueryClientProvider client={queryClient}>
          <Story />
        </QueryClientProvider>
      </ApolloProvider>
    ),
  ],
  parameters: {
    layout: 'centered',
  },
}

export default meta
type Story = StoryObj<typeof PostLoginMigrationDialog>

// Story 1: Idle — migration already prompted, dialog stays hidden
export const Idle: Story = {
  name: 'Idle — already prompted, dialog hidden',
  beforeEach() {
    localStorage.setItem('migration-prompted', '1')
    return () => localStorage.removeItem('migration-prompted')
  },
}

// Story 2: Prompting — user has local data, dialog asks to import
function PromptingStory() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function init() {
      await db.delete()
      await db.open()
      // The four quantity fields (targetQuantity, refillThreshold,
      // packedQuantity, unpackedQuantity) used to sit here. Since v15 they
      // belong to `ItemStock`, not `Item`. No `ItemStock` row is added either:
      // `usePostLoginMigration` reads only `items.length`
      // (src/hooks/usePostLoginMigration.ts:149-154), so the dialog never
      // reads a quantity and the story renders the same thing without one.
      await db.items.add({
        id: 'story-item-1',
        name: 'Milk',
        tagIds: [],
        targetUnit: 'package',
        consumeAmount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      localStorage.removeItem('migration-prompted')
      setReady(true)
    }
    init()
  }, [])

  if (!ready) return <div>Loading...</div>

  return <PostLoginMigrationDialog />
}

// The owner: "Copy your offline data into Our Home?" with Copy here.
export const Prompting: Story = {
  name: 'Prompting — owner, local data found, copy question open',
  decorators: [
    (Story) => (
      <MockedProvider mocks={cloudMocks('owner')}>
        <Story />
      </MockedProvider>
    ),
  ],
  beforeEach: cloudMode,
  render: () => <PromptingStory />,
}

// A member: the same question names the household, says who can copy, and
// offers only Done. The location question never opens.
export const PromptingMember: Story = {
  name: 'PromptingMember — member, told up front, only Done',
  decorators: [
    (Story) => (
      <MockedProvider mocks={cloudMocks('member')}>
        <Story />
      </MockedProvider>
    ),
  ],
  beforeEach: cloudMode,
  render: () => <PromptingStory />,
}

// Stories 3 to 5: a stored copy asks first (owner decision O22-A).
//
// `DataModeCard` stored a copy strategy before the switch to cloud. The hook
// waits for the household and the location list, then asks
// "Copy your offline data into {household}?". These run in cloud mode, so
// `GetHousehold` and `GetLocations` are answered by `MockedProvider` (in real
// Storybook only; the smoke test stubs the two hooks itself, because
// `src/test/setup.ts` replaces every generated Apollo hook).
function cloudMocks(role: 'owner' | 'manager' | 'member') {
  const mocks: NonNullable<MockedProviderProps['mocks']> = [
    {
      request: { query: GetHouseholdDocument },
      result: {
        data: {
          household: {
            __typename: 'Household',
            id: 'household-1',
            name: 'Our Home',
            role,
          },
        },
      },
      maxUsageCount: Number.POSITIVE_INFINITY,
    },
    {
      request: { query: GetLocationsDocument },
      result: {
        data: {
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
      },
      maxUsageCount: Number.POSITIVE_INFINITY,
    },
  ]
  return mocks
}

function cloudMode() {
  localStorage.setItem('data-mode', 'cloud')
  return () => localStorage.removeItem('data-mode')
}

function storedCopy(strategy: 'skip' | 'clear') {
  return () => {
    localStorage.setItem('data-mode', 'cloud')
    localStorage.setItem('migration-strategy', strategy)
    localStorage.removeItem('migration-prompted')
    return () => {
      localStorage.removeItem('data-mode')
      localStorage.removeItem('migration-strategy')
      localStorage.removeItem('migration-prompted')
    }
  }
}

// The owner of the household: the question with Copy here and Don't copy.
export const AskBeforeCopy: Story = {
  name: 'AskBeforeCopy — owner, stored copy waits for Copy here',
  decorators: [
    (Story) => (
      <MockedProvider mocks={cloudMocks('owner')}>
        <Story />
      </MockedProvider>
    ),
  ],
  beforeEach: storedCopy('skip'),
}

// A manager: the same question, plus the line that the household is shared.
export const AskBeforeCopyShared: Story = {
  name: 'AskBeforeCopyShared — manager, the household is shared',
  decorators: [
    (Story) => (
      <MockedProvider mocks={cloudMocks('manager')}>
        <Story />
      </MockedProvider>
    ),
  ],
  beforeEach: storedCopy('skip'),
}

// A member cannot import (decision O1): no Copy here, one button.
export const MemberCannotCopy: Story = {
  name: 'MemberCannotCopy — member, only Done',
  decorators: [
    (Story) => (
      <MockedProvider mocks={cloudMocks('member')}>
        <Story />
      </MockedProvider>
    ),
  ],
  beforeEach: storedCopy('skip'),
}
