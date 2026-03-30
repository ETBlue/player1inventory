import type { Meta, StoryObj } from '@storybook/react'
import { TemplateOverview } from '.'

const meta: Meta<typeof TemplateOverview> = {
  title: 'Components/Onboarding/TemplateOverview',
  component: TemplateOverview,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    totalItemCount: 20,
    totalVendorCount: 19,
    onEditItems: () => {},
    onEditVendors: () => {},
    onBack: () => {},
    onConfirm: () => {},
  },
}

export default meta
type Story = StoryObj<typeof TemplateOverview>

export const NothingSelected: Story = {
  args: {
    selectedItemCount: 0,
    selectedVendorCount: 0,
  },
}

export const SomeSelected: Story = {
  args: {
    selectedItemCount: 12,
    selectedVendorCount: 4,
  },
}

export const Loading: Story = {
  args: {
    selectedItemCount: 12,
    selectedVendorCount: 4,
    isLoading: true,
  },
}

export const WithError: Story = {
  args: {
    selectedItemCount: 12,
    selectedVendorCount: 4,
    error: new Error('Import failed'),
  },
}
