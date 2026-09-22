// src/components/ItemCard.pantry.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ItemCard } from '.'
import {
  mockDualUnitItem,
  mockItem,
  mockLastPurchase,
  mockTags,
  mockTagTypes,
  sharedDecorator,
} from './ItemCard.stories.fixtures'

const meta: Meta<typeof ItemCard> = {
  title: 'Components/Item/ItemCard/Pantry',
  component: ItemCard,
  decorators: [sharedDecorator],
  // Every story inherits the date; a story that wants another one
  // overrides it in its own `args`.
  args: { lastPurchaseDate: mockLastPurchase },
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
      // `estimatedDueDays` selects the relative mode ("Expires in X days").
      // The chip counts from `lastPurchaseDate`, overridden here to 2 days ago
      // so 5 days are left. `dueDate` is ignored in this mode.
      estimatedDueDays: 7,
    },
    lastPurchaseDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    tags: [],
    tagTypes: [],
  },
}

// The container has no date for this item — a search-tail row that is not
// stocked in the active location, or `purchaseDates` before it resolves. In
// the relative mode there is nothing to count from, so the chip is absent.
// Compare with `ExpiringRelative` above: same item, only the prop changed.
export const ExpiringRelativeNoPurchaseDate: Story = {
  name: 'Expiring — Relative, no purchase date (no chip)',
  args: {
    ...ExpiringRelative.args,
    lastPurchaseDate: null,
  },
}

export const WithQuickUpdate: Story = {
  name: 'With Quick Update button',
  args: {
    item: {
      ...mockItem,
      packedQuantity: 2,
      unpackedQuantity: 0,
    },
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'pantry',
    onQuickUpdate: () => console.log('Quick update clicked'),
  },
}

export const WithQuickUpdatePending: Story = {
  name: 'With Quick Update button — pending',
  args: {
    ...WithQuickUpdate.args,
    isPending: true,
  },
}
