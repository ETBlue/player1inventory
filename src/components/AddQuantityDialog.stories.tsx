import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { AddQuantityDialog } from './AddQuantityDialog'
import { Button } from './ui/button'

const meta: Meta<typeof AddQuantityDialog> = {
  title: 'Components/AddQuantityDialog',
  component: AddQuantityDialog,
}

export default meta
type Story = StoryObj<typeof AddQuantityDialog>

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Add Quantity</Button>
        <AddQuantityDialog
          open={open}
          onOpenChange={setOpen}
          itemName="Milk"
          onConfirm={(quantity, occurredAt) => {
            console.log('Add:', { quantity, occurredAt })
          }}
        />
      </>
    )
  },
}
