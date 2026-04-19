import { ApolloProvider } from '@apollo/client/react'
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { noopApolloClient } from '@/test/apolloStub'
import { AddShelfDialog } from './AddShelfDialog'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const meta: Meta<typeof AddShelfDialog> = {
  title: 'Components/Shelf/AddShelfDialog',
  component: AddShelfDialog,
  decorators: [
    (Story) => (
      <ApolloProvider client={noopApolloClient}>
        <QueryClientProvider client={queryClient}>
          <Story />
        </QueryClientProvider>
      </ApolloProvider>
    ),
  ],
  args: {
    open: true,
    onOpenChange: () => {},
    onSubmit: () => {},
  },
}

export default meta
type Story = StoryObj<typeof AddShelfDialog>

export const FilterType: Story = {
  name: 'Filter type (default)',
}

export const SelectionType: Story = {
  name: 'Selection type',
}
