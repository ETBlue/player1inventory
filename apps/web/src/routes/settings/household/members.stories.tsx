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
  MyOwnershipOffersDocument,
  type MyOwnershipOffersQuery,
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
type Offer = MyOwnershipOffersQuery['myOwnershipOffers'][number]

/** An open offer of the story household to `toUserId`. */
function storyOffer(
  kind: 'transfer' | 'handover',
  toUserId: string,
  toName: string,
  dismissedAt: string | null = null,
): Offer {
  return {
    __typename: 'OwnershipOffer',
    id: `offer-${toUserId}`,
    householdId: 'household-role-story',
    householdName: 'The Lin home',
    kind,
    toUserId,
    toName,
    fromName: kind === 'transfer' ? 'Olive Lin' : null,
    createdAt: '2026-11-20T00:00:00.000Z',
    dismissedAt,
  }
}

/** `withoutLocationRole`: people who joined with no location role (O14-A). */
function people(me: string, withoutLocationRole: string[] = []): Person[] {
  const row = (userId: string, displayName: string, role: HouseholdRole) => ({
    __typename: 'HouseholdPerson' as const,
    userId,
    displayName,
    role,
    joinedAt: '2026-11-01T00:00:00.000Z',
    isMe: userId === me,
    hasLocationRole: !withoutLocationRole.includes(userId),
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
  withoutLocationRole: string[] = [],
  {
    offers = [],
    members = people(me, withoutLocationRole),
  }: { offers?: Offer[]; members?: Person[] } = {},
): NonNullable<MockedProviderProps['mocks']> {
  return [
    {
      request: { query: HouseholdMembersDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: {
        data: { householdMembers: members },
      },
    },
    {
      request: { query: MyOwnershipOffersDocument },
      maxUsageCount: Number.POSITIVE_INFINITY,
      result: { data: { myOwnershipOffers: offers } },
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
              dataUpdatedAt: null,
              lastVisitedAt: null,
            },
            {
              __typename: 'Location',
              id: 'loc-garage',
              name: 'Garage',
              order: 1,
              myRole: null,
              hasOrganizer: true,
              dataUpdatedAt: null,
              lastVisitedAt: null,
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

/**
 * Households H5c task H.6 (owner decision O28-A): the owner, and mia joined
 * with no location role. Her row says "No location roles", with a link,
 * "Give a location role", to Settings › Locations.
 */
export const OwnerSeesNoLocationRoles: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={PATH}
      householdRole="owner"
      mocks={pageMocks('u-olive', [], ['u-mia'])}
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

/**
 * Households H6b task K.7: the owner offered the household to mia. Her row
 * says "Waiting for mia to accept", with Cancel. No row offers a transfer
 * while the offer is open.
 */
export const OwnerWaitingForAccept: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={PATH}
      householdRole="owner"
      ownership={{ pendingTransfer: storyOffer('transfer', 'u-mia', 'mia') }}
      mocks={pageMocks('u-olive', [])}
    />
  ),
}

/**
 * Households H6b task K.7: the owner's account was deleted, so the household
 * has no owner and the owner's row is gone. Mona has a hand-over offer she
 * put off with "Not now" (the banner hides it), so this page still offers
 * **Become the owner** (owner decision O42-A).
 */
export const NoOwnerBecomeOwner: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={PATH}
      householdRole="manager"
      ownership={{ hasOwner: false }}
      mocks={pageMocks('u-mona', [], [], {
        offers: [
          storyOffer('handover', 'u-mona', 'Mona', '2026-11-20T01:00:00.000Z'),
        ],
        members: people('u-mona').filter((p) => p.role !== 'owner'),
      })}
    />
  ),
}

/**
 * Households H6b task K.7, owner decision O37-A: Mona is the last person in
 * a household with no owner. The Leave confirm is open: it says the household
 * and everything in it will be deleted.
 */
export const LastPersonLeaves: Story = {
  beforeEach: cloudRoleStorySetup,
  render: () => (
    <CloudRolePage
      path={PATH}
      householdRole="manager"
      ownership={{ hasOwner: false }}
      mocks={pageMocks('u-mona', [], [], {
        members: people('u-mona').filter((p) => p.userId === 'u-mona'),
      })}
    />
  ),
  play: async () => {
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Leave household' }),
    )
    await screen.findByRole('alertdialog')
  },
}
