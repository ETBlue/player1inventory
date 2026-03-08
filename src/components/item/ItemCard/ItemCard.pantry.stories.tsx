// src/components/ItemCard.pantry.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ItemCard } from '.'
import {
  mockDualUnitItem,
  mockItem,
  mockTags,
  mockTagTypes,
  sharedDecorator,
} from './ItemCard.stories.fixtures'

const meta: Meta<typeof ItemCard> = {
  title: 'Components/ItemCard/Pantry',
  component: ItemCard,
  decorators: [sharedDecorator],
}

export default meta
type Story = StoryObj<typeof ItemCard>

export const StatusInactive: Story = {
  name: 'Status — Inactive',
  args: {
    item: {
      ...mockItem,
      targetQuantity: 0,
      refillThreshold: 0,
      packedQuantity: 0,
      unpackedQuantity: 0,
    },
    tags: [],
    tagTypes: [],
  },
}

export const StatusInactiveWithThreshold: Story = {
  args: {
    ...StatusInactive.args,
    item: {
      ...StatusInactive.args?.item,
      id: 'inactive-with-threshold',
      refillThreshold: 5, // has a threshold but targetQuantity=0 → inactive
      packedQuantity: 0, // below threshold (would be error if active)
    },
  },
}

export const StatusOK: Story = {
  name: 'Status — OK',
  args: {
    item: {
      ...mockItem,
      packedQuantity: 2,
      unpackedQuantity: 0,
    },
    tags: mockTags,
    tagTypes: mockTagTypes,
  },
}

export const StatusWarning: Story = {
  name: 'Status — Warning',
  args: {
    item: {
      ...mockItem,
      packedQuantity: 1,
      unpackedQuantity: 0,
      refillThreshold: 1,
    }, // packedQuantity equals refillThreshold
    tags: mockTags,
    tagTypes: mockTagTypes,
  },
}

export const StatusError: Story = {
  name: 'Status — Error (out of stock)',
  args: {
    item: { ...mockItem, packedQuantity: 0, unpackedQuantity: 0 }, // 0 < refillThreshold (1) → error
    tags: mockTags,
    tagTypes: mockTagTypes,
  },
}

export const ExpiringSoon: Story = {
  name: 'Expiring — Explicit date',
  args: {
    item: {
      ...mockItem,
      packedQuantity: 1,
      unpackedQuantity: 0,
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    },
    tags: [],
    tagTypes: [],
  },
}

export const ExpiringRelative: Story = {
  name: 'Expiring — Relative (days from purchase)',
  args: {
    item: {
      ...mockDualUnitItem,
      // estimatedDueDays triggers relative display mode ("Expires in X days")
      // dueDate is used as fallback since last-purchase hook has no data in Storybook
      estimatedDueDays: 2,
      dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    },
    tags: [],
    tagTypes: [],
  },
}

export const WithAmountButtons: Story = {
  name: 'With +/- buttons',
  args: {
    item: {
      ...mockItem,
      packedQuantity: 2,
      unpackedQuantity: 0,
    },
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'pantry',
    onAmountChange: (delta) => console.log('Amount change:', delta),
  },
}
