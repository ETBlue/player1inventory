import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { NewItemDialog } from './NewItemDialog'

function WithQueryClient({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const meta: Meta<typeof NewItemDialog> = {
  title: 'Components/Item/NewItemDialog',
  component: NewItemDialog,
  decorators: [
    (Story) => (
      <WithQueryClient>
        <Story />
      </WithQueryClient>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof NewItemDialog>

export const Default: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    onSuccess: (item) => console.log('Created item:', item),
  },
}

export const WithInitialName: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    initialName: 'Milk',
    onSuccess: (item) => console.log('Created item:', item),
  },
}

export const WithoutSuccessCallback: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
  },
}
