import type { Meta, StoryObj } from '@storybook/react'
import { fn } from 'storybook/test'
import { WithRouterContext } from '@/test/routerContext'
import { MemberList, type MemberRow } from '.'

// The REAL list (households H5b, task G.9). Which buttons each row gets is
// decided by `memberActions` from the caller's role and the row's role.

const meta = {
  title: 'Components/Household/MemberList',
  component: MemberList,
  args: {
    onSetRole: fn(),
    onRemove: fn(async () => {}),
    onLeave: fn(async () => {}),
    householdName: 'The Lin home',
    onTransfer: fn(async () => {}),
    onCancelTransfer: fn(async () => {}),
  },
} satisfies Meta<typeof MemberList>

export default meta
type Story = StoryObj<typeof meta>

function people(me: string): MemberRow[] {
  return [
    {
      userId: 'u-olive',
      displayName: 'Olive Lin',
      role: 'owner',
      isMe: me === 'u-olive',
    },
    {
      userId: 'u-mona',
      displayName: 'Mona',
      role: 'manager',
      isMe: me === 'u-mona',
    },
    {
      userId: 'u-mia',
      displayName: 'mia',
      role: 'member',
      isMe: me === 'u-mia',
    },
  ]
}

/**
 * The owner: the role control, Remove and Transfer ownership on every other
 * row. Their own row says why they cannot leave.
 */
export const AsOwner: Story = {
  args: { members: people('u-olive'), callerRole: 'owner' },
}

/** A manager: Remove on member rows only, and their own Leave. */
export const AsManager: Story = {
  args: { members: people('u-mona'), callerRole: 'manager' },
}

/** A member: every name and role, and their own Leave. */
export const AsMember: Story = {
  args: { members: people('u-mia'), callerRole: 'member' },
}

/**
 * Households H5c task H.6 (owner decision O28-A): the owner, and Mia joined
 * with no location role. Her row says "No location roles" with a link,
 * "Give a location role", to Settings › Locations. The page shows the mark to
 * an owner or manager only (`showLocationRoleMarks`).
 */
export const AsOwnerWithNoLocationRoles: Story = {
  decorators: [
    (Story) => (
      <WithRouterContext initialPath="/settings/household/members">
        <Story />
      </WithRouterContext>
    ),
  ],
  args: {
    members: people('u-olive').map((p) => ({
      ...p,
      hasLocationRole: p.userId !== 'u-mia',
    })),
    callerRole: 'owner',
    showLocationRoleMarks: true,
  },
}

/**
 * Households H6b task K.7: the owner offered the household to Mona. Her row
 * waits for her, with Cancel, and no row offers a transfer (one at a time).
 */
export const AsOwnerWaitingForAccept: Story = {
  args: {
    members: people('u-olive'),
    callerRole: 'owner',
    pendingTransfer: { toUserId: 'u-mona', toName: 'Mona' },
  },
}

/**
 * Households H6b task K.7, owner decision O37-A: Mona is the last person
 * left. Her Leave confirm says the household and everything in it will be
 * deleted.
 */
export const AsLastPerson: Story = {
  args: {
    members: [
      {
        userId: 'u-mona',
        displayName: 'Mona',
        role: 'manager',
        isMe: true,
      },
    ],
    callerRole: 'manager',
    lastPerson: true,
  },
}

/**
 * Households H6b task K.7b, owner decision O48: the list shown is still the
 * cached copy, and the server has not answered yet. Leave shows but cannot be
 * pressed, so a stale list cannot hide the last-person warning.
 */
export const AsMemberLeaveWaitsForServer: Story = {
  args: {
    members: people('u-mia'),
    callerRole: 'member',
    leaveDisabled: true,
  },
}
