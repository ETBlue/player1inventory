import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { AddNameDialog } from './AddNameDialog'
import { Button } from './ui/button'

const meta: Meta<typeof AddNameDialog> = {
  title: 'Components/AddNameDialog',
  component: AddNameDialog,
}

export default meta
type Story = StoryObj<typeof AddNameDialog>

export const AddTag: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    const [name, setName] = useState('')
    return (
      <>
        <Button onClick={() => setOpen(true)}>Add Tag</Button>
        <AddNameDialog
          open={open}
          title="Add Tag"
          submitLabel="Add Tag"
          name={name}
          placeholder="e.g., Dairy, Frozen"
          onNameChange={setName}
          onAdd={() => {
            console.log('Add:', name)
            setOpen(false)
            setName('')
          }}
          onClose={() => setOpen(false)}
        />
      </>
    )
  },
}

export const AddVendor: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    const [name, setName] = useState('')
    return (
      <>
        <Button onClick={() => setOpen(true)}>New Vendor</Button>
        <AddNameDialog
          open={open}
          title="New Vendor"
          submitLabel="Add Vendor"
          name={name}
          placeholder="e.g., Costco, iHerb"
          onNameChange={setName}
          onAdd={() => {
            console.log('Add:', name)
            setOpen(false)
            setName('')
          }}
          onClose={() => setOpen(false)}
        />
      </>
    )
  },
}

export const AddRecipe: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    const [name, setName] = useState('')
    return (
      <>
        <Button onClick={() => setOpen(true)}>New Recipe</Button>
        <AddNameDialog
          open={open}
          title="New Recipe"
          submitLabel="Add Recipe"
          name={name}
          placeholder="e.g., Pasta Sauce, Smoothie"
          onNameChange={setName}
          onAdd={() => {
            console.log('Add:', name)
            setOpen(false)
            setName('')
          }}
          onClose={() => setOpen(false)}
        />
      </>
    )
  },
}
