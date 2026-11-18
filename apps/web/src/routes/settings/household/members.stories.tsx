import type { MockedProviderProps } from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { screen, userEvent } from 'storybook/test'
import {
  GetHouseholdLocationsDocument,
  HouseholdInvitesDocument,
  type HouseholdInvitesQuery,
  HouseholdMembersDocument,
  type HouseholdMembersQuery,
  type HouseholdRole,
} from '@/generated/graphql'
import { CloudRolePage, cloudRoleStorySetup } from '@/test/cloudRoleStory'

// The REAL Members page (households H5b, task G.9), in cloud mode, for each
// household role. The role reaches the page through `GetHousehold`
// (`CloudRolePage`); this file answers the page's own three queries.

const meta = {
  title: 'Pages/Settings/Household/Members',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

type Person = HouseholdMembersQuery['householdMembers'][number]
type Invite = HouseholdInvitesQuery['householdInvites'][number]

function people(me: string): Person[] {
  const row = (userId: string, displayName: string, role: HouseholdRole) => ({
    __typename: 'HouseholdPerson' as const,
    userId,
    displayName,
    role,
    joinedAt: '2026-11-01T00:00:00.000Z',
    isMe: userId === me,
  })
  return [
    row('u-olive', 'Olive Lin', 'owner'),
    row('u-mona', 'Mona', 'manager'),
    row('u-mia', 'mia', 'member'),
  ]
}

const openInvites: Invite[] = [
  {
    __typename: 'HouseholdInvite',
    id: 'inv-1',
    token: 'tok-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcd',
    householdRole: 'member',
    locationRoles: [
      {
        __typename: 'InviteLocationRole',
        locationId: 'loc-kitchen',
        locationName: 'my Kitchen',
        role: 'participant',
      },
    ],
    createdByName: 'Mona',
    expiresAt: '2026-11-25T12:00:00.000Z',
  },
  {
    __typename: 'HouseholdInvite',
    id: 'inv-2',
    token: 'tok-ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210-_zyxw',
    householdRole: 'manager',
    locationRoles: [],
    createdByName: 'Olive Lin',
    expiresAt: '2026-11-24T12:00:00.000Z',
  },
]

function pageMocks(
  me: string,
  invites: Invite[],
): NonNullable<MockedProviderProps['mocks']> {
  return [
    {
      request: { query: HouseholdMembersDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: { data: { householdMembers: people(me) } },
    },
    {
      request: { query: HouseholdInvitesDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: { data: { householdInvites: invites } },
    },
    {
      request: { query: GetHouseholdLocationsDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: {
        data: {
          householdLocations: [
            {
              __typename: 'Location',
              id: 'loc-kitchen',
              name: 'my Kitchen',
              order: 0,
              myRole: 'organizer',
              hasOrganizer: true,
            },
            {
              __typename: 'Location',
              id: 'loc-garage',
              name: 'Garage',
              order: 1,
              myRole: null,
              hasOrganizer: true,
            },
          ],
        },
      },
    },
  ]
}

const PATH = '/settings/household/members'

/** The owner: role controls, Remove, Invite, and an empty invites list. */
export const Owner: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={PATH}
      householdRole="owner"
      mocks={pageMocks('u-olive', [])}
    />
  ),
}

/** A manager: Remove on the member row, Leave, Invite (member only). */
export const Manager: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={PATH}
      householdRole="manager"
      mocks={pageMocks('u-mona', [openInvites[0] as Invite])}
    />
  ),
}

/** A member: every name and role, their own Leave, no invites (O13-A). */
export const Member: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={PATH}
      householdRole="member"
      mocks={pageMocks('u-mia', [])}
    />
  ),
}

/** The owner with two open invites, one of them with no location role. */
export const WithOpenInvites: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={PATH}
      householdRole="owner"
      mocks={pageMocks('u-olive', openInvites)}
    />
  ),
}

/** The owner's invite form, open. */
export const InviteDialogOpen: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={PATH}
      householdRole="owner"
      mocks={pageMocks('u-olive', [])}
    />
  ),
  play: async () => {
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Invite someone' }),
    )
    await screen.findByRole('combobox', { name: 'my Kitchen' })
  },
}
