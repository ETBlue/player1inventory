import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { AddTagDialog } from './AddTagDialog'
import { Button } from './ui/button'

const meta: Meta<typeof AddTagDialog> = {
  title: 'Components/AddTagDialog',
  component: AddTagDialog,
}

export default meta
type Story = StoryObj<typeof AddTagDialog>

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    const [tagName, setTagName] = useState('')
    return (
      <>
        <Button onClick={() => setOpen(true)}>Add Tag</Button>
        <AddTagDialog
          open={open}
          tagName={tagName}
          onTagNameChange={setTagName}
          onAdd={() => {
            console.log('Add:', tagName)
            setOpen(false)
            setTagName('')
          }}
          onClose={() => setOpen(false)}
        />
      </>
    )
  },
}
