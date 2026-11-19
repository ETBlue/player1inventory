import { canChangeLocationRole } from '@p1i/types'
import type { Meta, StoryObj } from '@storybook/react'
import { fn } from 'storybook/test'
import type { HouseholdRole, LocationRole } from '@/generated/graphql'
import {
  type CanChangeRole,
  LocationPeopleList,
  type LocationPersonRow,
} from '.'

// The REAL list (households H5c, task H.5). Which control each row gets comes
// from the shared role rule (`canChangeLocationRole`), the same rule the page
// passes through `usePermissions().canChangeRole`.

const meta = {
  title: 'Components/Location/LocationPeopleList',
  component: LocationPeopleList,
  args: {
    locationName: 'my Kitchen',
    onSetRole: fn(),
    onRemove: fn(async () => {}),
  },
} satisfies Meta<typeof LocationPeopleList>

export default meta
type Story = StoryObj<typeof meta>

function rule(
  householdRole: HouseholdRole,
  callerRole: LocationRole | null,
): CanChangeRole {
  return (from, to) =>
    canChangeLocationRole({ householdRole, callerRole, from, to })
}

function people(me: string): LocationPersonRow[] {
  return [
    {
      userId: 'u-ola',
      displayName: 'Ola Chen',
      role: 'organizer',
      isMe: me === 'u-ola',
    },
    {
      userId: 'u-oz',
      displayName: 'oz',
      role: 'organizer',
      isMe: me === 'u-oz',
    },
    {
      userId: 'u-pia',
      displayName: 'Pia',
      role: 'participant',
      isMe: me === 'u-pia',
    },
    {
      userId: 'u-vic',
      displayName: 'vic Lin',
      role: 'viewer',
      isMe: me === 'u-vic',
    },
  ]
}

/** A household owner with no role here: every role, Remove on every row. */
export const AsOwner: Story = {
  args: { people: people('none'), canChange: rule('owner', null) },
}

/** An organizer: participant and viewer only, nothing on organizer rows. */
export const AsOrganizer: Story = {
  args: { people: people('u-ola'), canChange: rule('member', 'organizer') },
}

/** A participant: names and roles only. */
export const AsParticipant: Story = {
  args: { people: people('u-pia'), canChange: rule('member', 'participant') },
}

/** A removal is running on one row. */
export const Removing: Story = {
  args: {
    people: people('u-ola'),
    canChange: rule('member', 'organizer'),
    removingUserIds: new Set(['u-vic']),
  },
}

/** Nobody has a role on the location. */
export const Nobody: Story = {
  args: { people: [], canChange: rule('owner', null) },
}
