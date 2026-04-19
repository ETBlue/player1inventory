import type { Meta, StoryObj } from '@storybook/react'
import { ViewToggle } from './ViewToggle'

const meta: Meta<typeof ViewToggle> = {
  title: 'Components/ViewToggle',
  component: ViewToggle,
  parameters: {
    layout: 'padded',
  },
  args: {
    onChange: () => {},
  },
}

export default meta
type Story = StoryObj<typeof ViewToggle>

export const ListActive: Story = {
  args: {
    current: 'list',
  },
}

export const ShelfActive: Story = {
  args: {
    current: 'shelf',
  },
}
