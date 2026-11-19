import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useState } from 'react'
import {
  GetHouseholdLocationsDocument,
  GetLocationsDocument,
  HouseholdMembersDocument,
  type HouseholdRole,
  LocationPeopleDocument,
  type LocationRole,
} from '@/generated/graphql'
import { routeTree } from '@/routeTree.gen'
import {
  cloudRoleBaseMocks,
  cloudRoleStorySetup,
  ROLE_STORY_LOCATION,
} from '@/test/cloudRoleStory'

// The REAL people page of one location (households H5c, task H.5), in cloud
// mode. The caller's household role comes through `GetHousehold` and their
// location role through `GetLocations` (`myRole`), the way the app reads
// them, so each story shows what that role really gets.

const meta = {
  title: 'Pages/Settings/Household/LocationPeople',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const KITCHEN = ROLE_STORY_LOCATION

const HOUSEHOLD: [string, string, HouseholdRole][] = [
  ['u-olive', 'Olive Lin', 'owner'],
  ['u-mona', 'Mona', 'manager'],
  ['u-ola', 'Ola Chen', 'member'],
  ['u-oz', 'oz', 'member'],
  ['u-pia', 'Pia', 'member'],
  ['u-vic', 'vic Lin', 'member'],
]

/** Who has which role on the Kitchen, in the server's order. */
const KITCHEN_PEOPLE: [string, LocationRole][] = [
  ['u-ola', 'organizer'],
  ['u-oz', 'organizer'],
  ['u-pia', 'participant'],
  ['u-vic', 'viewer'],
]

function mocks({
  me,
  people,
}: {
  me: string
  people: [string, LocationRole][]
}): NonNullable<MockedProviderProps['mocks']> {
  const householdRole = HOUSEHOLD.find(([id]) => id === me)?.[2] ?? 'member'
  const myRole = people.find(([id]) => id === me)?.[1] ?? null
  const hasOrganizer = people.some(([, r]) => r === 'organizer')
  const nameOf = (id: string) => HOUSEHOLD.find(([u]) => u === id)?.[1] ?? id
  const base = cloudRoleBaseMocks(householdRole).filter(
    (m) => m.request.query !== GetLocationsDocument,
  )
  return [
    ...base,
    {
      request: { query: GetLocationsDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: {
        data: {
          locations: myRole
            ? [
                {
                  __typename: 'Location',
                  id: KITCHEN,
                  name: 'my Kitchen',
                  order: 0,
                  createdAt: '2026-11-01T00:00:00.000Z',
                  updatedAt: '2026-11-01T00:00:00.000Z',
                  myRole,
                },
              ]
            : [],
        },
      },
    },
    {
      request: { query: GetHouseholdLocationsDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: {
        data: {
          householdLocations: [
            {
              __typename: 'Location',
              id: KITCHEN,
              name: 'my Kitchen',
              order: 0,
              myRole,
              hasOrganizer,
            },
          ],
        },
      },
    },
    {
      request: {
        query: LocationPeopleDocument,
        variables: { locationId: KITCHEN },
      },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: {
        data: {
          locationPeople: people.map(([userId, role]) => ({
            __typename: 'LocationPerson',
            userId,
            displayName: nameOf(userId),
            role,
            isMe: userId === me,
          })),
        },
      },
    },
    {
      request: { query: HouseholdMembersDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: {
        data: {
          householdMembers: HOUSEHOLD.map(([userId, displayName, role]) => ({
            __typename: 'HouseholdPerson',
            userId,
            displayName,
            role,
            joinedAt: '2026-11-01T00:00:00.000Z',
            isMe: userId === me,
            hasLocationRole: people.some(([id]) => id === userId),
          })),
        },
      },
    },
  ]
}

/** The page in its own router, with the mocks above (no `GetHousehold` twice). */
function PeoplePage({
  mocks: m,
}: {
  mocks: NonNullable<MockedProviderProps['mocks']>
}) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  const [router] = useState(() =>
    createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: [`/settings/household/locations/${KITCHEN}`],
      }),
      context: { queryClient },
    }),
  )
  return (
    <MockedProvider mocks={m}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MockedProvider>
  )
}

/** A household owner with no role here: every control, Add person. */
export const OwnerView: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <PeoplePage mocks={mocks({ me: 'u-olive', people: KITCHEN_PEOPLE })} />
  ),
}

/** An organizer: participant and viewer only, Rename, Leave. */
export const OrganizerView: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <PeoplePage mocks={mocks({ me: 'u-ola', people: KITCHEN_PEOPLE })} />
  ),
}

/** A participant: the people and Leave location, nothing else. */
export const ParticipantView: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <PeoplePage mocks={mocks({ me: 'u-pia', people: KITCHEN_PEOPLE })} />
  ),
}

/** No organizer, seen by a participant: the note, no action sentence. */
export const NoOrganizer: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <PeoplePage
      mocks={mocks({
        me: 'u-pia',
        people: [
          ['u-pia', 'participant'],
          ['u-vic', 'viewer'],
        ],
      })}
    />
  ),
}

/** Everyone in the household has a role here: no Add person. */
export const NobodyToAdd: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <PeoplePage
      mocks={mocks({
        me: 'u-olive',
        people: [
          ['u-ola', 'organizer'],
          ['u-olive', 'participant'],
          ['u-mona', 'participant'],
          ['u-oz', 'participant'],
          ['u-pia', 'participant'],
          ['u-vic', 'viewer'],
        ],
      })}
    />
  ),
}
