import type { Meta, StoryObj } from '@storybook/react'
import { fn } from 'storybook/test'
import { AddLocationPersonDialog } from '.'

// The REAL dialog (households H5c, task H.5). The page passes the household
// members with no role here, and the roles the caller may give.

const meta = {
  title: 'Components/Location/AddLocationPersonDialog',
  component: AddLocationPersonDialog,
  args: {
    candidates: [
      { userId: 'u-max', displayName: 'Max' },
      { userId: 'u-mia', displayName: 'mia Lin' },
    ],
    onAdd: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof AddLocationPersonDialog>

export default meta
type Story = StoryObj<typeof meta>

/** A household owner or manager may give every role. */
export const OwnerChoices: Story = {
  args: { roles: ['organizer', 'participant', 'viewer'] },
}

/** A location organizer may give participant and viewer only. */
export const OrganizerChoices: Story = {
  args: { roles: ['participant', 'viewer'] },
}
