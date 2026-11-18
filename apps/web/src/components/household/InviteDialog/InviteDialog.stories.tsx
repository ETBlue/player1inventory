import type { Meta, StoryObj } from '@storybook/react'
import { fn, screen, userEvent } from 'storybook/test'
import type { InviteFieldsFragment } from '@/generated/graphql'
import { InviteDialog } from '.'

// The REAL invite dialog (households H5b, task G.9). `onCreate` answers at
// once with a made-up invite; what the page does with it is tested in
// `routes/settings/household/members.cloud.test.tsx`.

const created: InviteFieldsFragment = {
  __typename: 'HouseholdInvite',
  id: 'inv-new',
  token: 'tok-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcd',
  householdRole: 'member',
  locationRoles: [],
  createdByName: 'Olive Lin',
  expiresAt: '2026-11-25T12:00:00.000Z',
}

const meta = {
  title: 'Components/Household/InviteDialog',
  component: InviteDialog,
  args: {
    onClose: fn(),
    canInviteManager: true,
    locations: [
      { id: 'loc-kitchen', name: 'my Kitchen' },
      { id: 'loc-garage', name: 'Garage' },
    ],
    onCreate: fn(async () => created),
  },
} satisfies Meta<typeof InviteDialog>

export default meta
type Story = StoryObj<typeof meta>

/** The owner's form: every location on "No access". */
export const OwnerForm: Story = {}

/** A manager's form: the household role picker offers `member` only. */
export const ManagerForm: Story = {
  args: { canInviteManager: false },
}

/** After Create invite link: the link, Copy link, and until when it works. */
export const LinkCreated: Story = {
  play: async () => {
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Create invite link' }),
    )
    await screen.findByLabelText('Invite link')
  },
}
