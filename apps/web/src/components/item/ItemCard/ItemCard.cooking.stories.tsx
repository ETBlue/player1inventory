// src/components/ItemCard.cooking.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ItemCard } from '.'
import {
  mockItem,
  mockTags,
  mockTagTypes,
  sharedDecorator,
} from './ItemCard.stories.fixtures'

const meta: Meta<typeof ItemCard> = {
  title: 'Components/Item/ItemCard/Cooking',
  component: ItemCard,
  decorators: [sharedDecorator],
}

export default meta
type Story = StoryObj<typeof ItemCard>

export const ItemIncluded: Story = {
  name: 'Item included (amount controls visible)',
  args: {
    item: { ...mockItem, name: 'Flour', packageUnit: 'kg' },
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'cooking',
    showTags: false,
    showTagSummary: false,
    showExpiration: true,
    isChecked: true,
    controlAmount: 4,
    onCheckboxToggle: () => console.log('Toggle item'),
    onAmountChange: (delta) => console.log('Amount change:', delta),
  },
}

export const ItemExcluded: Story = {
  name: 'Item excluded (optional)',
  args: {
    item: { ...mockItem, name: 'Bacon', packageUnit: 'pack' },
    tags: mockTags,
    tagTypes: mockTagTypes,
    mode: 'cooking',
    showTags: false,
    showTagSummary: false,
    showExpiration: true,
    isChecked: false,
    controlAmount: 2,
    onCheckboxToggle: () => console.log('Toggle item'),
    onAmountChange: (delta) => console.log('Amount change:', delta),
  },
}
