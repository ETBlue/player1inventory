import type { Meta, StoryObj } from '@storybook/react'
import { EmptyState } from '.'

const meta = {
  title: 'Components/Shared/EmptyState',
  component: EmptyState,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    title: 'No items found',
    description: 'Add an item to get started.',
  },
}

export const WithCustomClassName: Story = {
  args: {
    title: 'Nothing here yet',
    description: 'Try adjusting your filters or adding new content.',
    className: 'py-24 bg-background-surface rounded-lg',
  },
}
