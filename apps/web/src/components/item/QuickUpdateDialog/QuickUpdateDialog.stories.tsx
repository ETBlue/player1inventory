import type { Decorator, Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  mockDualUnitItem,
  mockItem,
} from '../ItemCard/ItemCard.stories.fixtures'
import { QuickUpdateDialog } from '.'

const queryClient = new QueryClient()

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={queryClient}>
    <Story />
  </QueryClientProvider>
)

const meta: Meta<typeof QuickUpdateDialog> = {
  title: 'Components/Item/QuickUpdateDialog',
  component: QuickUpdateDialog,
  decorators: [withQueryClient],
  args: {
    onSubmit: async () => {},
    onClose: () => {},
  },
}

export default meta
type Story = StoryObj<typeof QuickUpdateDialog>

export const Default: Story = {
  name: 'Default — Single Unit',
  args: {
    item: {
      ...mockItem,
      packedQuantity: 2,
      unpackedQuantity: 0,
    },
    isOpen: true,
  },
}

export const DualUnit: Story = {
  name: 'Dual Unit — Shows Open Package',
  args: {
    item: mockDualUnitItem,
    isOpen: true,
  },
}

export const AtZero: Story = {
  name: 'At Zero',
  args: {
    item: {
      ...mockItem,
      packedQuantity: 0,
      unpackedQuantity: 0,
    },
    isOpen: true,
  },
}

export const FullStock: Story = {
  name: 'Full Stock',
  args: {
    item: {
      ...mockItem,
      packedQuantity: mockItem.targetQuantity,
      unpackedQuantity: 0,
    },
    isOpen: true,
  },
}
