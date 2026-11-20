import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import {
  ClearAllDataDocument,
  DeleteAllLocationsDocument,
} from '@/generated/graphql'
import { cloudRoleBaseMocks, cloudRoleStorySetup } from '@/test/cloudRoleStory'
import { HouseholdDangerZone } from './HouseholdDangerZone'

// The REAL household danger zone (households H6, task J.7), in cloud mode,
// for the household owner. The role and the name ("The Lin home") come
// through `GetHousehold`, the way the app reads them. To try a confirm, type
// the name exactly. Delete household is not answered here: it would move
// the Storybook page.

const meta = {
  title: 'Components/Settings/HouseholdDangerZone',
  component: HouseholdDangerZone,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof HouseholdDangerZone>

export default meta
type Story = StoryObj<typeof meta>

const forbidden = {
  errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
}

function Zone({ mocks }: { mocks: NonNullable<MockedProviderProps['mocks']> }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  return (
    <MockedProvider mocks={[...cloudRoleBaseMocks('owner'), ...mocks]}>
      <QueryClientProvider client={queryClient}>
        <HouseholdDangerZone />
      </QueryClientProvider>
    </MockedProvider>
  )
}

/** The owner: three purges. Clear and Delete all locations answer `true`. */
export const Owner: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <Zone
      mocks={[
        {
          request: { query: ClearAllDataDocument },
          maxUsageCount: Number.POSITIVE_INFINITY,
          delay: 800,
          result: { data: { clearAllData: true } },
        },
        {
          request: { query: DeleteAllLocationsDocument },
          maxUsageCount: Number.POSITIVE_INFINITY,
          delay: 800,
          result: { data: { deleteAllLocations: true } },
        },
      ]}
    />
  ),
}

/** The server refuses Clear household: the dialog stays open with the error. */
export const ClearFails: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <Zone
      mocks={[
        {
          request: { query: ClearAllDataDocument },
          maxUsageCount: Number.POSITIVE_INFINITY,
          result: forbidden,
        },
      ]}
    />
  ),
}
