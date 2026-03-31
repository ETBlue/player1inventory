import type { Meta, StoryObj } from '@storybook/react'
import { TemplateVendorRow } from './TemplateVendorRow'

// TemplateVendorRow has no hooks — no provider needed.
const meta: Meta<typeof TemplateVendorRow> = {
  title: 'Components/Onboarding/TemplateVendorRow',
  component: TemplateVendorRow,
  args: {
    name: 'Costco',
    isChecked: false,
    onToggle: () => {},
  },
}

export default meta
type Story = StoryObj<typeof TemplateVendorRow>

export const Unchecked: Story = {}

export const Checked: Story = {
  args: {
    isChecked: true,
  },
}
