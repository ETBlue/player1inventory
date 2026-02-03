import type { Meta, StoryObj } from '@storybook/react'
import { ShoppingItemCard } from './ShoppingItemCard'

const meta: Meta<typeof ShoppingItemCard> = {
  title: 'Components/ShoppingItemCard',
  component: ShoppingItemCard,
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ShoppingItemCard>

const mockItem = {
  id: '1',
  name: 'Milk',
  unit: 'gallons',
  tagIds: [],
  targetQuantity: 2,
  refillThreshold: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
}

export const NotInCart: Story = {
  args: {
    item: mockItem,
    currentQuantity: 0,
    onAddToCart: () => console.log('Add to cart'),
    onUpdateQuantity: (qty) => console.log('Update:', qty),
    onRemove: () => console.log('Remove'),
  },
}

export const InCart: Story = {
  args: {
    item: mockItem,
    currentQuantity: 0,
    cartItem: { id: 'cart-1', cartId: 'cart', itemId: '1', quantity: 2 },
    onAddToCart: () => console.log('Add to cart'),
    onUpdateQuantity: (qty) => console.log('Update:', qty),
    onRemove: () => console.log('Remove'),
  },
}
