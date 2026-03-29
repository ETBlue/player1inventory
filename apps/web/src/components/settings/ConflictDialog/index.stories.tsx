import type { Meta, StoryObj } from '@storybook/react'
import type { ConflictSummary } from '@/lib/importData'
import { ConflictDialog } from '.'

const meta: Meta<typeof ConflictDialog> = {
  title: 'Components/Settings/ConflictDialog',
  component: ConflictDialog,
  parameters: {
    layout: 'padded',
  },
  args: {
    open: true,
    onSkip: () => {},
    onReplace: () => {},
    onClear: () => {},
    onClose: () => {},
  },
}

export default meta
type Story = StoryObj<typeof ConflictDialog>

const emptyConflicts: ConflictSummary = {
  items: [],
  tags: [],
  tagTypes: [],
  vendors: [],
  recipes: [],
  inventoryLogs: [],
  shoppingCarts: [],
  cartItems: [],
}

export const FewConflicts: Story = {
  args: {
    conflicts: {
      ...emptyConflicts,
      items: [
        { id: 'item-1', name: 'Milk', matchReasons: ['id'] },
        { id: 'item-2', name: 'Eggs', matchReasons: ['name'] },
      ],
      vendors: [
        { id: 'vendor-1', name: 'Costco', matchReasons: ['id', 'name'] },
      ],
    },
  },
}

export const ManyConflicts: Story = {
  args: {
    conflicts: {
      items: [
        { id: 'item-1', name: 'Milk', matchReasons: ['id'] },
        { id: 'item-2', name: 'Eggs', matchReasons: ['name'] },
        { id: 'item-3', name: 'Butter', matchReasons: ['id', 'name'] },
      ],
      tags: [
        { id: 'tag-1', name: 'Dairy', matchReasons: ['name'] },
        { id: 'tag-2', name: 'Frozen', matchReasons: ['id'] },
      ],
      tagTypes: [
        { id: 'tagtype-1', name: 'Storage', matchReasons: ['id', 'name'] },
      ],
      vendors: [
        { id: 'vendor-1', name: 'Costco', matchReasons: ['id'] },
        { id: 'vendor-2', name: 'Trader Joes', matchReasons: ['name'] },
      ],
      recipes: [
        { id: 'recipe-1', name: 'Pancakes', matchReasons: ['id', 'name'] },
      ],
      inventoryLogs: [
        { id: 'log-1', name: 'log-1', matchReasons: ['id'] },
        { id: 'log-2', name: 'log-2', matchReasons: ['id'] },
      ],
      shoppingCarts: [{ id: 'cart-1', name: 'cart-1', matchReasons: ['id'] }],
      cartItems: [{ id: 'ci-1', name: 'ci-1', matchReasons: ['id'] }],
    },
  },
}

export const MixedMatchReasons: Story = {
  args: {
    conflicts: {
      ...emptyConflicts,
      items: [
        { id: 'item-1', name: 'Milk', matchReasons: ['id'] },
        { id: 'item-2', name: 'Eggs', matchReasons: ['name'] },
        { id: 'item-3', name: 'Butter', matchReasons: ['id', 'name'] },
        { id: 'item-4', name: 'Cheese', matchReasons: ['id'] },
        { id: 'item-5', name: 'Yogurt', matchReasons: ['name'] },
      ],
      recipes: [
        { id: 'recipe-1', name: 'Pancakes', matchReasons: ['id', 'name'] },
        { id: 'recipe-2', name: 'Smoothie', matchReasons: ['name'] },
      ],
    },
  },
}
