import { MockedProvider } from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { screen, userEvent } from 'storybook/test'
import { NoHouseholdScreen } from '.'

// The REAL screen (households H5b, task G.8). `MockedProvider` gives the
// create hook an Apollo client; no story sends the create, so it needs no
// mocks. What happens after a create, after **Switch to offline mode** (it
// reloads the page) and after **Sign in to another account** (it signs out)
// is tested in `NoHouseholdScreen.test.tsx`; no story presses those two.
//
// The account action calls `useClerk()`. Storybook has no `ClerkProvider`,
// but `.storybook/main.ts` swaps `@clerk/react` for the stub in
// `.storybook/mocks/clerk.tsx`, so the story shows the button the way the
// real build does. Only the E2E build leaves it out.

const meta = {
  title: 'Components/Household/NoHouseholdScreen',
  component: NoHouseholdScreen,
  decorators: [
    (Story) => (
      <MockedProvider mocks={[]}>
        <Story />
      </MockedProvider>
    ),
  ],
} satisfies Meta<typeof NoHouseholdScreen>

export default meta
type Story = StoryObj<typeof meta>

/**
 * All three actions (owner decision O19): Create a household, Switch to
 * offline mode, and Sign in to another account.
 */
export const Default: Story = {}

/** The create dialog, open, with the name field empty (the default name). */
export const CreateDialogOpen: Story = {
  play: async () => {
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Create a household' }),
    )
    await screen.findByLabelText('Household name')
  },
}
