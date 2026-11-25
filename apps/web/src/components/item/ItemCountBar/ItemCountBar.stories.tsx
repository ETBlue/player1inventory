import type { Meta, StoryObj } from '@storybook/react'
import { ItemCountBar } from '.'

const meta: Meta<typeof ItemCountBar> = {
  title: 'Components/Item/ItemCountBar',
  component: ItemCountBar,
  // The bar sits in a card column; a fixed width shows that the squares do
  // not stretch with it.
  decorators: [
    (Story) => (
      <div className="max-w-sm p-4">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ItemCountBar>

export const InStock: Story = {
  args: { current: 4, target: 6, status: 'ok', refillThreshold: 2 },
}

export const LowStock: Story = {
  args: { current: 2, target: 6, status: 'warning', refillThreshold: 2 },
}

export const OutOfStock: Story = {
  args: { current: 0, target: 6, status: 'error', refillThreshold: 2 },
}

export const MoreThanTwenty: Story = {
  args: { current: 18, target: 32, status: 'ok', refillThreshold: 10 },
}

export const AboveTarget: Story = {
  args: { current: 5, target: 3, status: 'ok' },
}
