import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import {
  GetLocationsDocument,
  RemoveAllLocationItemsDocument,
} from '@/generated/graphql'
import {
  cloudRoleBaseMocks,
  cloudRoleStorySetup,
  ROLE_STORY_LOCATION,
} from '@/test/cloudRoleStory'
import { LocationDangerZone } from './LocationDangerZone'

// The REAL danger zone of one location (households H6, task J.7), in cloud
// mode, for an ORGANIZER of the location (`myRole` through `GetLocations`,
// the way the app reads it). To try the confirm, type "my Kitchen" exactly.

const meta = {
  title: 'Components/Location/LocationDangerZone',
  component: LocationDangerZone,
  parameters: { layout: 'padded' },
  args: { locationId: ROLE_STORY_LOCATION, locationName: 'my Kitchen' },
} satisfies Meta<typeof LocationDangerZone>

export default meta
type Story = StoryObj<typeof meta>

function Zone({ mocks }: { mocks: NonNullable<MockedProviderProps['mocks']> }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  const base = cloudRoleBaseMocks('member').filter(
    (m) => m.request.query !== GetLocationsDocument,
  )
  return (
    <MockedProvider
      mocks={[
        ...base,
        {
          request: { query: GetLocationsDocument },
          maxUsageCount: Number.POSITIVE_INFINITY,
          result: {
            data: {
              locations: [
                {
                  __typename: 'Location',
                  id: ROLE_STORY_LOCATION,
                  name: 'my Kitchen',
                  order: 0,
                  createdAt: '2026-11-01T00:00:00.000Z',
                  updatedAt: '2026-11-01T00:00:00.000Z',
                  myRole: 'organizer',
                },
              ],
            },
          },
        },
        ...mocks,
      ]}
    >
      <QueryClientProvider client={queryClient}>
        <LocationDangerZone
          locationId={ROLE_STORY_LOCATION}
          locationName="my Kitchen"
        />
      </QueryClientProvider>
    </MockedProvider>
  )
}

/** An organizer: Remove all items, which answers `true`. */
export const Organizer: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <Zone
      mocks={[
        {
          request: {
            query: RemoveAllLocationItemsDocument,
            variables: { locationId: ROLE_STORY_LOCATION },
          },
          maxUsageCount: Number.POSITIVE_INFINITY,
          delay: 800,
          result: { data: { removeAllLocationItems: true } },
        },
      ]}
    />
  ),
}

/** The server refuses: the dialog stays open with the error. */
export const RemoveFails: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <Zone
      mocks={[
        {
          request: {
            query: RemoveAllLocationItemsDocument,
            variables: { locationId: ROLE_STORY_LOCATION },
          },
          maxUsageCount: Number.POSITIVE_INFINITY,
          result: {
            errors: [
              { message: 'Forbidden', extensions: { code: 'FORBIDDEN' } },
            ],
          },
        },
      ]}
    />
  ),
}
