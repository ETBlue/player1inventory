import type { Meta, StoryObj } from '@storybook/react'
import { UnitInline } from './UnitInline'

const meta: Meta<typeof UnitInline> = {
  title: 'Components/Shared/UnitInline',
  component: UnitInline,
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof UnitInline>

export const Default: Story = {}

export const WithUnit: Story = {
  args: {
    unit: 'kg',
  },
}

export const WithPlaceholder: Story = {
  args: {
    placeholder: '?',
  },
}
