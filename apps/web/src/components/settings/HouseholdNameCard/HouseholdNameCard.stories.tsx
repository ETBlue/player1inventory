import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { GetHouseholdDocument } from '@/generated/graphql'
import { HouseholdNameCard } from '.'

// The card shows in cloud mode only, so every story sets `data-mode` to
// `cloud` in `beforeEach`. `GetHousehold` is mocked through `MockedProvider`.
// Saving in Storybook sends a `RenameHousehold` that no mock answers, so it
// shows the general error toast. Fixtures stay module-local: CSF turns every
// named export into a story.
function mocksFor(role: 'owner' | 'manager' | 'member') {
  const mocks: NonNullable<MockedProviderProps['mocks']> = [
    {
      request: { query: GetHouseholdDocument },
      result: {
        data: {
          household: {
            __typename: 'Household',
            id: 'household-1',
            name: "ET's Household",
            role,
          },
        },
      },
      maxUsageCount: Number.POSITIVE_INFINITY,
    },
  ]
  return mocks
}

function cloudMode() {
  localStorage.setItem('data-mode', 'cloud')
  return () => localStorage.removeItem('data-mode')
}

const meta: Meta<typeof HouseholdNameCard> = {
  title: 'Components/Settings/HouseholdNameCard',
  component: HouseholdNameCard,
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof HouseholdNameCard>

// The owner: a name field with Save. Save stays off until the name changes.
export const Owner: Story = {
  decorators: [
    (Story) => (
      <MockedProvider mocks={mocksFor('owner')}>
        <Story />
      </MockedProvider>
    ),
  ],
  beforeEach: cloudMode,
}

// A manager (a member looks the same): the name as text, and who can change it.
export const Manager: Story = {
  decorators: [
    (Story) => (
      <MockedProvider mocks={mocksFor('manager')}>
        <Story />
      </MockedProvider>
    ),
  ],
  beforeEach: cloudMode,
}
