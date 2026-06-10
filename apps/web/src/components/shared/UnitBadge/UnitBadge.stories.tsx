import type { Meta, StoryObj } from '@storybook/react'
import { UnitBadge } from './UnitBadge'

const meta: Meta<typeof UnitBadge> = {
  title: 'Components/Shared/UnitBadge',
  component: UnitBadge,
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof UnitBadge>

export const Default: Story = {}

export const WithUnit: Story = {
  args: {
    unit: 'bottle',
  },
}

export const WithLongUnit: Story = {
  args: {
    unit: 'tablespoon',
  },
}
