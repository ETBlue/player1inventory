import type { Meta, StoryObj } from '@storybook/react'
import { fn } from 'storybook/test'
import type { InviteFieldsFragment } from '@/generated/graphql'
import { InviteList } from '.'

// The REAL list of open invites (households H5b, task G.9).

const meta = {
  title: 'Components/Household/InviteList',
  component: InviteList,
  args: {
    onCopy: fn(async () => true),
    onRevoke: fn(async () => {}),
  },
} satisfies Meta<typeof InviteList>

export default meta
type Story = StoryObj<typeof meta>

const invites: InviteFieldsFragment[] = [
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
      {
        __typename: 'InviteLocationRole',
        locationId: 'loc-garage',
        locationName: 'Garage',
        role: 'viewer',
      },
    ],
    createdByName: 'Olive Lin',
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

/** The owner: Copy link and Revoke on every invite. */
export const AsOwner: Story = {
  args: { invites, isOwner: true },
}

/** A manager: no Revoke on a manager invite (O15-A). */
export const AsManager: Story = {
  args: { invites, isOwner: false },
}

export const Empty: Story = {
  args: { invites: [], isOwner: true },
}
