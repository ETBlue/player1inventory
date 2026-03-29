import { MockedProvider } from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { ExportCard } from '.'

// ExportCard uses:
//   - useDataMode() — reads localStorage key 'data-mode'
//   - useApolloClient() — used in cloud mode for imperative queries
//
// Mocking strategy:
//   - localStorage is set in each story's `beforeEach` to control mode
//   - Apollo is mocked with MockedProvider (no specific queries needed for render)

const meta: Meta<typeof ExportCard> = {
  title: 'Components/Settings/ExportCard',
  component: ExportCard,
  decorators: [
    (Story) => (
      <MockedProvider mocks={[]} addTypename={false}>
        <Story />
      </MockedProvider>
    ),
  ],
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof ExportCard>

export const LocalMode: Story = {
  name: 'LocalMode — export local data',
  beforeEach() {
    localStorage.setItem('data-mode', 'local')
    return () => localStorage.removeItem('data-mode')
  },
}

export const CloudMode: Story = {
  name: 'CloudMode — export cloud data',
  beforeEach() {
    localStorage.setItem('data-mode', 'cloud')
    return () => localStorage.removeItem('data-mode')
  },
}

// Keep Default as an alias for LocalMode for backward compatibility
export const Default: Story = {
  beforeEach() {
    localStorage.setItem('data-mode', 'local')
    return () => localStorage.removeItem('data-mode')
  },
}
