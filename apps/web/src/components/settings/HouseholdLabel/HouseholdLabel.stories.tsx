import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { GetHouseholdDocument } from '@/generated/graphql'
import { HouseholdLabel } from '.'

// The label reads `data-mode` from localStorage, so each story sets it in
// `beforeEach`. In cloud mode it reads `GetHousehold`, mocked here through
// `MockedProvider`. Fixtures stay module-local: CSF turns every named export
// into a story.
const household = {
  __typename: 'Household' as const,
  id: 'household-1',
  // Lower case on purpose: the name is shown as stored, never capitalized.
  name: "et's household",
  role: 'owner' as const,
}

const cloudMocks: NonNullable<MockedProviderProps['mocks']> = [
  {
    request: { query: GetHouseholdDocument },
    result: { data: { household } },
    maxUsageCount: Number.POSITIVE_INFINITY,
  },
]

const meta: Meta<typeof HouseholdLabel> = {
  title: 'Components/Settings/HouseholdLabel',
  component: HouseholdLabel,
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof HouseholdLabel>

// Local mode: "My data". No request is sent.
export const LocalMode: Story = {
  decorators: [
    (Story) => (
      <MockedProvider mocks={[]}>
        <Story />
      </MockedProvider>
    ),
  ],
  beforeEach() {
    localStorage.setItem('data-mode', 'local')
    return () => localStorage.removeItem('data-mode')
  },
}

// Cloud mode: the household's name, as stored. "My data" shows for a moment
// while the name loads.
export const CloudMode: Story = {
  decorators: [
    (Story) => (
      <MockedProvider mocks={cloudMocks}>
        <Story />
      </MockedProvider>
    ),
  ],
  beforeEach() {
    localStorage.setItem('data-mode', 'cloud')
    return () => localStorage.removeItem('data-mode')
  },
}
