import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import type { Vendor } from '@/types'
import { Button } from './ui/button'
import { VendorFormDialog } from './VendorFormDialog'

const meta: Meta<typeof VendorFormDialog> = {
  title: 'Components/VendorFormDialog',
  component: VendorFormDialog,
}

export default meta
type Story = StoryObj<typeof VendorFormDialog>

export const CreateMode: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Add Vendor</Button>
        <VendorFormDialog
          open={open}
          onOpenChange={setOpen}
          onSave={(name) => {
            console.log('Create:', name)
          }}
        />
      </>
    )
  },
}

const existingVendor: Vendor = {
  id: '1',
  name: 'Costco',
  createdAt: new Date(),
}

export const EditMode: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Edit Vendor</Button>
        <VendorFormDialog
          open={open}
          onOpenChange={setOpen}
          vendor={existingVendor}
          onSave={(name) => {
            console.log('Save:', name)
          }}
        />
      </>
    )
  },
}
