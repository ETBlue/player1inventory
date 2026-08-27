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

export const WithUnpacked: Story = {
  name: 'With Unpacked — Pack Button Enabled',
  args: {
    item: {
      ...mockItem,
      packedQuantity: 1,
      unpackedQuantity: 2,
    },
    isOpen: true,
  },
}

export const Inactive: Story = {
  name: 'Inactive — Target 0',
  args: {
    item: {
      ...mockItem,
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 1,
      unpackedQuantity: 0,
    },
    isOpen: true,
  },
}

export const NearRefillThreshold: Story = {
  name: 'Near Refill Threshold — Fractional Steps',
  args: {
    // Measurement item with consumeAmount 0.25: the Target and Refill steppers
    // move in fractions of a litre, not whole bottles.
    item: {
      ...mockDualUnitItem,
      packedQuantity: 0,
      unpackedQuantity: 0.5,
    },
    isOpen: true,
  },
}

export const WithExpirationDate: Story = {
  name: 'Date Mode — Expires On Field',
  args: {
    // expirationMode: 'date' is the only thing that renders the full-width
    // "Expires on" field, last, after the stepper grid — see the item detail
    // Stock tab's identical gate in ItemForm.
    item: {
      ...mockItem,
      packedQuantity: 2,
      unpackedQuantity: 0,
      expirationMode: 'date',
      dueDate: new Date('2026-09-15'),
    },
    isOpen: true,
  },
}
