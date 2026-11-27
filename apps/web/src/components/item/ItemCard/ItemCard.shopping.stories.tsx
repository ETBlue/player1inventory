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

// The cart page's shape since 2026-11-25: ONE amount button that opens
// `CartAmountDialog`, not `− n +`.
export const InCart: Story = {
  name: 'In cart (amount button)',
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
    amountUnit: 'gallon',
    onCheckboxToggle: () => console.log('Toggle cart'),
    onAmountEdit: () => console.log('Edit amount'),
  },
}

export const InCartAmountZero: Story = {
  name: 'In cart, amount 0 (buy next time)',
  args: {
    ...InCart.args,
    controlAmount: 0,
  },
}

// The unit is not on the button; it is only in the accessible name.
export const InCartLongUnit: Story = {
  name: 'In cart, long unit (in the name only)',
  args: {
    ...InCart.args,
    controlAmount: 12,
    amountUnit: 'family-size bottle',
  },
}

// A 4-digit amount still fits the 3rem button at `text-sm`.
export const InCartLargeAmount: Story = {
  name: 'In cart, 4-digit amount',
  args: {
    ...InCart.args,
    controlAmount: 1000,
  },
}

export const InCartViewOnly: Story = {
  name: 'In cart, location viewer (disabled)',
  args: {
    ...InCart.args,
    disabled: true,
  },
}

// The `− n +` group, which the cooking page and the recipe items tab still
// use. Shown here so the two shapes can be compared.
// The same args as InCart, without `onAmountEdit` (a key set to undefined
// is a type error under `exactOptionalPropertyTypes`).
const { onAmountEdit: _edit, ...inCartWithoutEdit } = InCart.args ?? {}

export const InCartStepper: Story = {
  name: 'In cart with − n + (not the cart page any more)',
  args: {
    ...inCartWithoutEdit,
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
