import type { Meta, StoryObj } from '@storybook/react'
import type { Vendor } from '@/types'
import { VendorInfoForm } from '.'

const meta: Meta<typeof VendorInfoForm> = {
  title: 'Components/VendorInfoForm',
  component: VendorInfoForm,
}
export default meta
type Story = StoryObj<typeof VendorInfoForm>

const defaultVendor: Vendor = {
  id: 'vendor-1',
  name: 'Costco',
  createdAt: new Date('2024-01-01'),
}

const emptyVendor: Vendor = {
  id: 'vendor-2',
  name: '',
  createdAt: new Date('2024-01-01'),
}

export const Default: Story = {
  args: {
    vendor: defaultVendor,
    onSave: (data) => console.log('save', data),
  },
}

export const WithValidationError: Story = {
  args: {
    vendor: emptyVendor,
    onSave: (data) => console.log('save', data),
  },
}

export const Dirty: Story = {
  render: () => {
    // Pre-render with a vendor whose stored name differs from what's shown
    // by using a vendor with name 'Costco' and simulating user has typed something new
    // We can only show the initial state; dirtiness comes from user interaction
    return (
      <VendorInfoForm
        vendor={{ ...defaultVendor, name: 'Costco' }}
        onSave={(data) => console.log('save', data)}
        onDirtyChange={(dirty) => console.log('dirty', dirty)}
      />
    )
  },
}

export const Saving: Story = {
  args: {
    vendor: defaultVendor,
    onSave: (data) => console.log('save', data),
    isPending: true,
  },
}
