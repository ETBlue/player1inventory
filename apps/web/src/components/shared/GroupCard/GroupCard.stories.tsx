import type { Meta, StoryObj } from '@storybook/react'
import { ChefHat, LayoutGrid, Store } from 'lucide-react'
import { GroupCard } from './GroupCard'

const meta: Meta<typeof GroupCard> = {
  title: 'Components/Shared/GroupCard',
  component: GroupCard,
  parameters: {
    layout: 'padded',
  },
  args: {
    onClick: () => {},
  },
}

export default meta
type Story = StoryObj<typeof GroupCard>

export const Default: Story = {
  args: {
    name: 'Pantry',
    icon: <LayoutGrid size={16} />,
    itemCount: 10,
    totalPackedQuantity: 6,
    totalTargetInPacks: 10,
    totalRefillInPacks: 4,
    activeCount: 10,
  },
}

export const VendorStyle: Story = {
  args: {
    name: 'iHerb',
    icon: <Store size={16} />,
    nameClassName: 'normal-case',
    itemCount: 8,
    totalPackedQuantity: 5,
    totalTargetInPacks: 8,
    totalRefillInPacks: 3,
    activeCount: 8,
  },
}

export const RecipeStyle: Story = {
  args: {
    name: 'Pasta Bolognese',
    icon: <ChefHat size={16} />,
    itemCount: 6,
    totalPackedQuantity: 4,
    totalTargetInPacks: 6,
    totalRefillInPacks: 2,
    activeCount: 6,
  },
}

export const WithFilterSummary: Story = {
  args: {
    name: 'Fridge',
    icon: <LayoutGrid size={16} />,
    itemCount: 7,
    filterSummary: 'Expires this week',
    totalPackedQuantity: 3,
    totalTargetInPacks: 7,
    totalRefillInPacks: 2,
    activeCount: 7,
  },
}

export const OutOfStock: Story = {
  args: {
    name: 'Freezer',
    icon: <LayoutGrid size={16} />,
    itemCount: 5,
    outOfStockCount: 2,
    totalPackedQuantity: 1,
    totalTargetInPacks: 5,
    totalRefillInPacks: 3,
    activeCount: 5,
  },
}

export const LowStock: Story = {
  args: {
    name: 'Snacks',
    icon: <LayoutGrid size={16} />,
    itemCount: 4,
    lowStockCount: 1,
    totalPackedQuantity: 2,
    totalTargetInPacks: 4,
    totalRefillInPacks: 2,
    activeCount: 4,
  },
}

export const Unsorted: Story = {
  args: {
    name: 'Unsorted',
    itemCount: 3,
    totalPackedQuantity: 0,
    totalTargetInPacks: 0,
    totalRefillInPacks: 0,
    activeCount: 3,
  },
}
