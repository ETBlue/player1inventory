import type { Meta, StoryObj } from '@storybook/react'
import { TemplateVendorsBrowser } from '.'

// TemplateVendorRow has no hooks — no provider needed.
const meta: Meta<typeof TemplateVendorsBrowser> = {
  title: 'Components/Onboarding/TemplateVendorsBrowser',
  component: TemplateVendorsBrowser,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onSelectionChange: () => {},
    onBack: () => {},
  },
}

export default meta
type Story = StoryObj<typeof TemplateVendorsBrowser>

export const AllVendors: Story = {
  args: {
    selectedKeys: new Set(),
  },
}

export const WithSelections: Story = {
  args: {
    selectedKeys: new Set(['costco', 'family-mart', '7-eleven', 'watsons']),
  },
}
