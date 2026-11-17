import type { Meta, StoryObj } from '@storybook/react'
import { fn } from 'storybook/test'
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

/** The owner: the role control and Remove on every other row. */
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
