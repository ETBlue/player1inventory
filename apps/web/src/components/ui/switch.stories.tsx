import type { Meta, StoryObj } from '@storybook/react'
import { Switch } from './switch'

const meta: Meta<typeof Switch> = {
  title: 'UI Library/Switch',
  component: Switch,
}

export default meta
type Story = StoryObj<typeof Switch>

export const Off: Story = {}

export const On: Story = {
  args: { checked: true },
}

export const Disabled: Story = {
  args: { disabled: true },
}

export const DisabledOn: Story = {
  args: { checked: true, disabled: true },
}
