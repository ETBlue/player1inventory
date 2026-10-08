import { ApolloProvider } from '@apollo/client/react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { db } from '@/db'
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
// Prompting story: seed db with one item and clear 'migration-prompted'.
//   The hook finds local items → sets state to 'prompting' → dialog opens.

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
      await db.items.add({
        id: 'story-item-1',
        name: 'Milk',
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 1,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
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

export const Prompting: Story = {
  name: 'Prompting — local data found, import dialog open',
  render: () => <PromptingStory />,
}

// Story 3: AutoImporting — stored strategy triggers immediate migration progress dialog
export const AutoImporting: Story = {
  name: 'AutoImporting — stored strategy, progress dialog shown',
  beforeEach() {
    localStorage.setItem('migration-strategy', 'skip')
    localStorage.removeItem('migration-prompted')
    return () => {
      localStorage.removeItem('migration-strategy')
      localStorage.removeItem('migration-prompted')
    }
  },
}
