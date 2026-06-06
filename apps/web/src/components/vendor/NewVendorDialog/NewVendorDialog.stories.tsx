import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { NewVendorDialog } from './NewVendorDialog'

function WithQueryClient({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const meta: Meta<typeof NewVendorDialog> = {
  title: 'Components/Vendor/NewVendorDialog',
  component: NewVendorDialog,
  decorators: [
    (Story) => (
      <WithQueryClient>
        <Story />
      </WithQueryClient>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof NewVendorDialog>

export const Default: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    onSuccess: (vendor) => console.log('Created vendor:', vendor),
  },
}

export const WithoutSuccessCallback: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
  },
}
