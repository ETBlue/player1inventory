import { MockedProvider } from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { screen, userEvent } from 'storybook/test'
import { NoHouseholdScreen } from '.'

// The REAL screen (households H5b, task G.8). `MockedProvider` gives the
// create hook an Apollo client; no story sends the create, so it needs no
// mocks. What happens after a create is tested in
// `NoHouseholdScreen.test.tsx`.

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
