// src/components/ItemCard.shopping.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ItemCard } from '.'
import {
  mockItem,
  mockLastPurchase,
  mockTags,
  mockTagTypes,
  sharedDecorator,
} from './ItemCard.stories.fixtures'

const meta: Meta<typeof ItemCard> = {
  title: 'Components/Item/ItemCard/Shopping',
  component: ItemCard,
  decorators: [sharedDecorator],
  // Every story inherits the date; a story that wants another one
  // overrides it in its own `args`.
  args: { lastPurchaseDate: mockLastPurchase },
}

export default meta
type Story = StoryObj<typeof ItemCard>

export const NotInCart: Story = {
  name: 'Not in cart',
  args: {
    item: { ...mockItem, packedQuantity: 1, unpackedQuantity: 0 },
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'shopping',
    showTags: false,
    showExpiration: false,
    showTagSummary: false,
    isChecked: false,
    onCheckboxToggle: () => console.log('Toggle cart'),
  },
}

export const InCart: Story = {
  name: 'In cart (with amount controls)',
  args: {
    item: { ...mockItem, packedQuantity: 1, unpackedQuantity: 0 },
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'shopping',
    showTags: false,
    showExpiration: false,
    showTagSummary: false,
    isChecked: true,
    controlAmount: 3,
    onCheckboxToggle: () => console.log('Toggle cart'),
    onAmountChange: (delta) => console.log('Amount change:', delta),
  },
}

export const CheckboxPendingUnchecked: Story = {
  name: 'Checkbox pending — adding',
  args: {
    ...NotInCart.args,
    isPending: true,
  },
}

export const CheckboxPendingChecked: Story = {
  name: 'Checkbox pending — removing',
  args: {
    ...InCart.args,
    isPending: true,
  },
}
