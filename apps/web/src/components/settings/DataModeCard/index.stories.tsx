import { MockedProvider } from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { MyFamilyGroupDocument } from '@/generated/graphql'
import { DataModeCard } from '.'

// DataModeCard uses:
//   - useDataMode() — reads localStorage key 'data-mode'
//   - useUser() from @clerk/react — shown in CloudMode only
//   - useClerk() from @clerk/react — signOut, used in CloudDisableFlow
//   - useMyFamilyGroupQuery() — Apollo, used in CloudDisableFlow
//
// Mocking strategy:
//   - localStorage is set in each story's `beforeEach` to control mode
//   - Apollo is mocked with MockedProvider
//   - Clerk: DataModeCard only calls useUser/useClerk inside <CloudDisableFlow>,
//     which renders only when mode='cloud'. In LocalMode the Clerk hooks are
//     never reached, so no Clerk mock is needed.
//   - For CloudMode we need a Clerk mock. We use a thin decorator that
//     intercepts the module via a global window shim injected before render.
//     Because @clerk/react reads from React context internally, the cleanest
//     Storybook-safe approach is to note that the component will render with
//     "Signed in as undefined" when no Clerk context is present — which is
//     acceptable for story purposes. Clerk will log a warning but will not throw.

const apolloMocks = [
  {
    request: { query: MyFamilyGroupDocument },
    result: { data: { myFamilyGroup: null } },
  },
]

const apolloMocksWithGroup = [
  {
    request: { query: MyFamilyGroupDocument },
    result: {
      data: {
        myFamilyGroup: {
          __typename: 'FamilyGroup',
          id: 'group-1',
          name: 'The Smiths',
          code: 'ABC123',
          ownerUserId: 'user-owner-1',
          memberUserIds: ['user-owner-1', 'user-member-2'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    },
  },
]

const meta: Meta<typeof DataModeCard> = {
  title: 'Settings/DataModeCard',
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

export const CloudModeInGroup: Story = {
  name: 'CloudMode — sharing enabled, in family group',
  decorators: [
    (Story) => (
      <MockedProvider mocks={apolloMocksWithGroup} addTypename={false}>
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
  // The dialog opens when the user clicks "Enable sharing →".
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
