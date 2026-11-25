import type { Meta, StoryObj } from '@storybook/react'
import {
  mockDualUnitItem,
  mockItem,
} from '@/components/item/ItemCard/ItemCard.stories.fixtures'
import { CartAmountDialog } from '.'

const meta: Meta<typeof CartAmountDialog> = {
  title: 'Components/Shopping/CartAmountDialog',
  component: CartAmountDialog,
  args: {
    onSubmit: async () => {},
    onClose: () => {},
  },
}

export default meta
type Story = StoryObj<typeof CartAmountDialog>

// mockItem: 'Yogurt (plain)', package unit 'gallon', target 2. Here 1 is in
// stock.
const yogurt = { ...mockItem, packedQuantity: 1, unpackedQuantity: 0 }

export const EditAmount: Story = {
  name: 'Edit — an item in the cart',
  args: { item: yogurt, mode: 'edit', initialAmount: 3 },
}

export const AddSuggested: Story = {
  name: 'Add — ticked, with the suggested amount',
  args: { item: yogurt, mode: 'add', initialAmount: 1 },
}

export const AmountZero: Story = {
  name: 'Amount 0 — buy next time',
  args: { item: yogurt, mode: 'edit', initialAmount: 0 },
}

// mockDualUnitItem: 'Purple grapes', 1 L per bottle, target 2 L, 1.7 L in
// stock. The context line is in L; the amount is in bottles.
export const MeasurementItem: Story = {
  name: 'Measurement item — stock in L, amount in bottles',
  args: { item: mockDualUnitItem, mode: 'add', initialAmount: 1 },
}

export const SaveFails: Story = {
  name: 'Save fails — the dialog stays and says so',
  args: {
    item: yogurt,
    mode: 'add',
    initialAmount: 1,
    onSubmit: async () => {
      throw new Error('offline')
    },
  },
}
