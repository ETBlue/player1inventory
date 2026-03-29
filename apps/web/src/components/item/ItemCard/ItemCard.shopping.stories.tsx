// src/components/ItemCard.shopping.stories.tsx
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
  title: 'Components/Item/ItemCard/Shopping',
  component: ItemCard,
  decorators: [sharedDecorator],
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

export const PackageDisplayDualUnit: Story = {
  name: 'Package display — dual-unit (no unpacked)',
  args: {
    item: {
      ...mockDualUnitItem,
      packedQuantity: 1,
      unpackedQuantity: 0,
    },
    tags: [],
    tagTypes: mockTagTypes,
    mode: 'shopping',
    showTags: false,
    showExpiration: false,
    showTagSummary: false,
    isPackageDisplay: true,
    isChecked: false,
    onCheckboxToggle: () => console.log('Toggle cart'),
  },
}

export const PackageDisplayDualUnitWithUnpacked: Story = {
  name: 'Package display — dual-unit (with unpacked)',
  args: {
    item: {
      ...mockDualUnitItem,
      packedQuantity: 1,
      unpackedQuantity: 0.7,
    },
    tags: [],
    tagTypes: mockTagTypes,
    mode: 'shopping',
    showTags: false,
    showExpiration: false,
    showTagSummary: false,
    isPackageDisplay: true,
    isChecked: true,
    controlAmount: 2,
    onCheckboxToggle: () => console.log('Toggle cart'),
    onAmountChange: (delta) => console.log('Amount change:', delta),
  },
}

export const PackageDisplaySingleUnit: Story = {
  name: 'Package display — single-unit',
  args: {
    item: { ...mockItem, packedQuantity: 1, unpackedQuantity: 0 },
    tags: [],
    tagTypes: mockTagTypes,
    mode: 'shopping',
    showTags: false,
    showExpiration: false,
    showTagSummary: false,
    isPackageDisplay: true,
    isChecked: false,
    onCheckboxToggle: () => console.log('Toggle cart'),
  },
}
