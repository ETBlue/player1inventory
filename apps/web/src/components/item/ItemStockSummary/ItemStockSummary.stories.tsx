import type { Meta, StoryObj } from '@storybook/react'
import {
  mockDualUnitItem,
  mockItem,
} from '@/components/item/ItemCard/ItemCard.stories.fixtures'
import { ItemStockSummary } from '.'

const meta: Meta<typeof ItemStockSummary> = {
  title: 'Components/Item/ItemStockSummary',
  component: ItemStockSummary,
  // The caller gives the wrapper; the card's column is about this wide.
  decorators: [
    (Story) => (
      <div className="max-w-sm p-4">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ItemStockSummary>

// mockItem: 'Yogurt (plain)', target 2 gallon. Here 1 is in stock.
export const Consumable: Story = {
  args: { item: { ...mockItem, packedQuantity: 1, unpackedQuantity: 0 } },
}

// 1 bottle (1 L) and 0.7 L open, target 2 L
export const MeasurementWithOpenPack: Story = {
  args: { item: mockDualUnitItem },
}

export const NonConsumable: Story = {
  args: {
    item: {
      ...mockItem,
      name: 'Paper cups',
      packageUnit: 'cup',
      consumable: false,
      targetQuantity: 6,
      packedQuantity: 2,
      unpackedQuantity: 0,
    },
  },
}

// No quantity and no bar, as on the Settings assignment tabs
export const NameOnly: Story = {
  args: { item: mockItem, showStock: false },
}

// As in CartAmountDialog: the name is a <span>, not a heading
export const NameAsSpan: Story = {
  args: {
    item: { ...mockItem, packedQuantity: 1, unpackedQuantity: 0 },
    nameAs: 'span',
  },
}
