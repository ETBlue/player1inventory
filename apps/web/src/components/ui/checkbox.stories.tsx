import type { Meta, StoryObj } from '@storybook/react'
import { Checkbox } from './checkbox'

const meta: Meta<typeof Checkbox> = {
  title: 'UI/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Checkbox>

export const Unchecked: Story = {}

export const Checked: Story = {
  args: { checked: true },
}

export const Indeterminate: Story = {
  args: { checked: 'indeterminate' },
}

export const Disabled: Story = {
  args: { disabled: true },
}

export const DisabledChecked: Story = {
  args: { checked: true, disabled: true },
}
