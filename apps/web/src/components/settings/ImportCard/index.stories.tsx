import { MockedProvider } from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { ImportCard } from '.'

// ImportCard uses:
//   - useDataMode() — reads localStorage key 'data-mode'
//   - useApolloClient() — used in cloud mode for imperative queries
//
// Mocking strategy:
//   - localStorage is set in each story's `beforeEach` to control mode
//   - Apollo is mocked with MockedProvider (no specific queries needed for render)

const meta: Meta<typeof ImportCard> = {
  title: 'Settings/ImportCard',
  component: ImportCard,
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
type Story = StoryObj<typeof ImportCard>

export const Default: Story = {
  name: 'Default — idle state',
  beforeEach() {
    localStorage.setItem('data-mode', 'local')
    return () => localStorage.removeItem('data-mode')
  },
}

export const Loading: Story = {
  name: 'Loading — importing state',
  beforeEach() {
    localStorage.setItem('data-mode', 'local')
    return () => localStorage.removeItem('data-mode')
  },
  // Note: the loading state is achieved via file input interaction;
  // this story documents the intended appearance when isImporting=true.
  // The button shows "Importing..." and is disabled during file processing.
}
