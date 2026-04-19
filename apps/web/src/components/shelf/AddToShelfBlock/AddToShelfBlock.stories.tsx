import type { Meta, StoryObj } from '@storybook/react'
import { AddToShelfBlock } from '.'

const meta: Meta<typeof AddToShelfBlock> = {
  title: 'Components/Shelf/AddToShelfBlock',
  component: AddToShelfBlock,
  parameters: {
    layout: 'padded',
  },
  args: {
    onAdd: () => {},
  },
}

export default meta
type Story = StoryObj<typeof AddToShelfBlock>

export const Default: Story = {
  args: {
    itemName: 'milk',
  },
}

export const CustomLabel: Story = {
  args: {
    itemName: 'eggs',
    label: 'Add to cart',
  },
}

export const MatchesFilter: Story = {
  args: {
    itemName: 'yogurt',
    disabled: true,
  },
}
