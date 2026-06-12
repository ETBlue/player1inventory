import { MockedProvider } from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { DataModeCard } from '.'

// DataModeCard uses:
//   - useDataMode() — reads localStorage key 'data-mode'
//   - useUser() from @clerk/react — shown in CloudMode only (email display)
//   - useClerk() from @clerk/react — signOut, used in sign-out flow
//   - useApolloClient() — used in switch/sign-out flows for fetchCloudPayload
//
// Mocking strategy:
//   - localStorage is set in each story's `beforeEach` to control mode
//   - Apollo is mocked with MockedProvider (no operations are issued on render)
//   - Clerk: CloudModeSection renders CloudModeSectionWithUser or E2E shim.
//     In tests/stories without a real Clerk context, useUser/useClerk from
//     the global vi.mock stub (setup.ts) are used — Storybook will log a
//     warning but will not throw.

const apolloMocks: never[] = []

const meta: Meta<typeof DataModeCard> = {
  title: 'Components/Settings/DataModeCard',
  component: DataModeCard,
  decorators: [
    (Story) => (
      <MockedProvider mocks={apolloMocks} addTypename={false}>
        <Story />
      </MockedProvider>
    ),
  ],
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof DataModeCard>

export const LocalMode: Story = {
  name: 'LocalMode — login-free',
  beforeEach() {
    localStorage.setItem('data-mode', 'local')
    return () => localStorage.removeItem('data-mode')
  },
}

export const CloudMode: Story = {
  name: 'CloudMode — sharing enabled',
  decorators: [
    (Story) => (
      <MockedProvider mocks={apolloMocks} addTypename={false}>
        <Story />
      </MockedProvider>
    ),
  ],
  beforeEach() {
    localStorage.setItem('data-mode', 'cloud')
    return () => localStorage.removeItem('data-mode')
  },
}

export const EnableSharingDialog: Story = {
  name: 'LocalMode — enable sharing dialog open',
  // The dialog opens when the user clicks "Switch...".
  // Use a play function to trigger it after render.
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector(
      'button',
    ) as HTMLButtonElement | null
    button?.click()
  },
  beforeEach() {
    localStorage.setItem('data-mode', 'local')
    return () => localStorage.removeItem('data-mode')
  },
}

export const SignOutDialog: Story = {
  name: 'CloudMode — sign out dialog open',
  decorators: [
    (Story) => (
      <MockedProvider mocks={apolloMocks} addTypename={false}>
        <Story />
      </MockedProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    // Click the "Sign Out" button (ghost variant, smaller)
    const buttons = canvasElement.querySelectorAll('button')
    const signOutBtn = Array.from(buttons).find(
      (b) => b.textContent?.trim() === 'Sign Out',
    ) as HTMLButtonElement | undefined
    signOutBtn?.click()
  },
  beforeEach() {
    localStorage.setItem('data-mode', 'cloud')
    return () => localStorage.removeItem('data-mode')
  },
}
