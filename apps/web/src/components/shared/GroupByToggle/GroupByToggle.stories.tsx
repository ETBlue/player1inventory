import type { Meta, StoryObj } from '@storybook/react'
import { GroupByToggle } from './GroupByToggle'

const meta: Meta<typeof GroupByToggle> = {
  title: 'Components/GroupByToggle',
  component: GroupByToggle,
  parameters: {
    layout: 'padded',
  },
  args: {
    onChange: () => {},
  },
}

export default meta
type Story = StoryObj<typeof GroupByToggle>

export const Default: Story = {
  args: {
    current: 'shelf',
  },
}

export const VendorActive: Story = {
  args: {
    current: 'vendor',
  },
}

export const RecipeActive: Story = {
  args: {
    current: 'recipe',
  },
}
