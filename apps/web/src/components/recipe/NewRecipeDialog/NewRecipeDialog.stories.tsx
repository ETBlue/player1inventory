import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { NewRecipeDialog } from './NewRecipeDialog'

function WithQueryClient({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const meta: Meta<typeof NewRecipeDialog> = {
  title: 'Components/Recipe/NewRecipeDialog',
  component: NewRecipeDialog,
  decorators: [
    (Story) => (
      <WithQueryClient>
        <Story />
      </WithQueryClient>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof NewRecipeDialog>

export const Default: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    onSuccess: (recipe) => console.log('Created recipe:', recipe),
  },
}

export const WithInitialName: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    initialName: 'Pasta',
    onSuccess: (recipe) => console.log('Created recipe:', recipe),
  },
}

export const WithoutSuccessCallback: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
  },
}
