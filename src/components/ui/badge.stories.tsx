import type { Meta, StoryObj } from '@storybook/react'
import { Badge } from './badge'

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Badge>

export const Default: Story = {
  args: {
    children: 'Badge',
  },
}

export const Variants: Story = {
  render: () => (
    <div className="flex gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
}

export const CustomColors: Story = {
  render: () => (
    <div className="flex gap-2">
      <Badge style={{ backgroundColor: '#22c55e', color: 'white' }}>
        Green
      </Badge>
      <Badge style={{ backgroundColor: '#3b82f6', color: 'white' }}>Blue</Badge>
      <Badge style={{ backgroundColor: '#f59e0b', color: 'black' }}>
        Amber
      </Badge>
    </div>
  ),
}
